import { visibleWorldRect, worldToScreen, type Rect } from '@openframe/core'

import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { alignmentTargets, exactlyAligned, guidesAround } from '../scene/alignment.js'
import { cullToViewport } from '../scene/culling.js'
import {
  distancesBetween,
  gapsWithin,
  matchesBetween,
  nearestDistances,
  type MeasureMatch,
  type MeasureSegment,
} from '../scene/measure.js'

/**
 * What Alt shows: how far the selection is from the object under the pointer,
 * and where their edges and centres line up — or, with several things selected
 * and nothing else pointed at, the gaps between them.
 *
 * The board only said how far apart two things were while one was being
 * dragged into line with the other, so checking a layout meant moving it.
 *
 * Mounted always, but it reads the document only while Alt is held: the part
 * that does is a component of its own, so a board nobody is measuring pays
 * nothing for it per change (rule 10).
 */
export function MeasureOverlay() {
  const measuring = useInteractionStore((state) => state.measuring)
  const nudging = useInteractionStore((state) => state.nudging)
  const anything = useInteractionStore((state) => state.selection.size > 0)
  const idle = useInteractionStore((state) => state.drag.kind === 'idle')
  const selecting = useInteractionStore((state) => state.tool === 'select')
  const editing = useInteractionStore((state) => state.editingId !== null)

  if (!(measuring || nudging) || !anything || !idle || !selecting || editing) return null
  return <Measurements measuring={measuring} nudging={nudging} />
}

function union(rects: readonly Rect[]): Rect | null {
  if (rects.length === 0) return null
  let left = Infinity
  let top = Infinity
  let right = -Infinity
  let bottom = -Infinity
  for (const r of rects) {
    left = Math.min(left, r.x)
    top = Math.min(top, r.y)
    right = Math.max(right, r.x + r.width)
    bottom = Math.max(bottom, r.y + r.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

function Measurements({
  measuring,
  nudging,
}: {
  readonly measuring: boolean
  readonly nudging: boolean
}) {
  const { runtime } = useOpenFrame()
  const selection = useInteractionStore((state) => state.selection)
  const hoveredId = useInteractionStore((state) => state.hoveredId)
  const viewport = useInteractionStore((state) => state.viewport)
  const canvasSize = useInteractionStore((state) => state.canvasSize)
  const document = useBoardDocument()

  // Bounds, never `.frame` (rule 16): a group's frame is nothing, and a
  // connector's is not where it is drawn.
  const members: Rect[] = []
  for (const id of selection) {
    const object = document.objects.get(id)
    if (object === undefined || object.hidden === true) continue
    members.push(runtime.registry.boundsOf(object, document))
  }
  const selected = union(members)
  if (selected === null) return null

  const hovered =
    !measuring || hoveredId === null || selection.has(hoveredId)
      ? undefined
      : document.objects.get(hoveredId)
  const target = hovered === undefined ? null : runtime.registry.boundsOf(hovered, document)

  let segments: readonly MeasureSegment[]
  let matches: readonly MeasureMatch[]
  if (target !== null) {
    // One box against what is pointed at.
    segments = distancesBetween(selected, target)
    matches = matchesBetween(selected, target)
  } else if (nudging) {
    /*
     * Walked by the arrows: how far it is from what is in line with it on each
     * side, and a line wherever an edge or centre now lines up exactly. Only
     * what is on screen counts, as for a drag (rule 10), and only on a press —
     * never per frame.
     */
    const others = alignmentTargets(
      document,
      runtime.registry,
      cullToViewport(
        document,
        runtime.registry,
        visibleWorldRect(viewport, canvasSize.width, canvasSize.height),
      ),
      selection,
    )
    segments = nearestDistances(selected, others)
    matches = guidesAround(selected, others, exactlyAligned(selected, others)).map((guide) => ({
      axis: guide.axis,
      position: guide.position,
      start: guide.start,
      end: guide.end,
    }))
  } else {
    // Nothing pointed at: the spacing inside the selection — which is how an
    // even row is checked.
    segments = gapsWithin(members)
    matches = []
  }

  return (
    <>
      {matches.map((match) => {
        const vertical = match.axis === 'x'
        const from = worldToScreen(
          viewport,
          vertical ? { x: match.position, y: match.start } : { x: match.start, y: match.position },
        )
        const length = (match.end - match.start) * viewport.zoom
        return (
          <div
            key={`match:${match.axis}:${String(match.position)}`}
            className={`of-measure__match of-measure__match--${match.axis}`}
            data-testid={`measure-match-${match.axis}`}
            aria-hidden="true"
            style={{
              transform: `translate(${String(from.x)}px, ${String(from.y)}px)`,
              [vertical ? 'height' : 'width']: `${String(length)}px`,
            }}
          />
        )
      })}
      {segments.map((segment) => {
        const across = segment.axis === 'x'
        const from = worldToScreen(
          viewport,
          across ? { x: segment.from, y: segment.at } : { x: segment.at, y: segment.from },
        )
        const length = (segment.to - segment.from) * viewport.zoom
        return (
          <div
            key={`line:${segment.axis}:${String(segment.from)}:${String(segment.to)}:${String(segment.at)}`}
            className="of-guide"
            data-testid={`measure-line-${segment.axis}`}
            aria-hidden="true"
            style={{
              transform: `translate(${String(from.x)}px, ${String(from.y)}px)`,
              width: `${String(across ? length : 1)}px`,
              height: `${String(across ? 1 : length)}px`,
            }}
          />
        )
      })}
      {/* After the lines, so no number is struck through by its own line. */}
      {segments.map((segment) => {
        const across = segment.axis === 'x'
        const middle = (segment.from + segment.to) / 2
        const at = worldToScreen(
          viewport,
          across ? { x: middle, y: segment.at } : { x: segment.at, y: middle },
        )
        return (
          <span
            key={`gap:${segment.axis}:${String(segment.from)}:${String(segment.to)}:${String(segment.at)}`}
            className="of-guide__gap"
            data-testid={`measure-gap-${segment.axis}`}
            aria-hidden="true"
            style={{
              transform: `translate(${String(at.x)}px, ${String(at.y)}px) translate(-50%, -50%)`,
            }}
          >
            {/* Board units, which is what the record panel's sizes are in. */}
            {String(Math.round(segment.to - segment.from))}
          </span>
        )
      })}
    </>
  )
}
