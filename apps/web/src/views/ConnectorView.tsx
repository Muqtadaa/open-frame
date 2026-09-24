import { useLayoutEffect, useRef, useState } from 'react'

import { resolveEndpoints, type ConnectorData } from '@openframe/core'

import { connectorPath, pathMidpoint, routeAngles } from '../scene/connector-path.js'
import { capPath } from '../scene/connector-caps.js'
import {
  dashArray,
  inkColor,
  inkOf,
  strokeWidth,
  surfaceColor,
  textSizePx,
} from '../scene/style-tokens.js'
import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'


/** How far a label's plate stands clear of the text on it, in screen pixels. */
const PLATE_PAD = 4

/**
 * A connector draws itself in ABSOLUTE world coordinates.
 *
 * Unlike every other view, it ignores the positioning its wrapper applies: its
 * geometry comes from wherever its endpoints resolve to, not from a frame. The
 * wrapper compensates by placing connectors at the origin — see `ObjectView`.
 */
function ConnectorRenderer({
  object,
  document: doc,
  zoom,
  boundsOf,
}: ObjectViewProps<ConnectorData>) {
  /*
   * `boundsOf`, never `other.frame` — a group's frame is 0x0 and its extent is
   * its children's, so a line joined to a group used to run to the group's
   * origin instead of to its edge (rule 16).
   */
  const ends = resolveEndpoints(doc, object.data.from, object.data.to, boundsOf)
  const { start, end, startNormal, endNormal } = ends
  /*
   * WHICH WAY each end faces, carried into the route so the line leaves and
   * arrives perpendicular to whatever it is attached to. The caps are oriented
   * by the route's own first and last segments, so they follow for free — and
   * without this they pointed along the object rather than into it.
   */
  const normals = { start: startNormal, end: endNormal }
  /*
   * And the two shapes it joins, so the route can get round them. The same
   * list the domain uses to decide the bounds and the hit test — a view that
   * worked its own out would draw a line somewhere it cannot be clicked.
   */
  const avoiding = [ends.startBox, ends.endBox].filter((box) => box !== null)
  const stroke = inkOf(object.style.strokeColor ?? object.style.color)
  const width = strokeWidth(object.style.stroke, 'medium')
  const held = object.data.points
  const path = connectorPath(start, end, object.data.routing, held, normals, avoiding)
  const { departure, arrival } = routeAngles(
    start,
    end,
    object.data.routing,
    held,
    normals,
    avoiding,
  )
  const label = object.data.text
  const mid = pathMidpoint(start, end, object.data.routing, held, normals, avoiding, object.data.label)

  // `none` is a colour property's way of saying there is nothing there, which
  // is how a background that has been turned off is stored (see `sanitizeStyle`).
  const chosen = object.style.labelFill
  const ground = chosen === undefined || chosen === 'none' ? undefined : surfaceColor(chosen)
  /*
   * The label's own box, MEASURED.
   *
   * A plate has to be the size of the text on it, and only the browser knows
   * that: it depends on the face, the size, the weight and the string. Taken
   * in a layout effect so the rect is drawn on the frame after the text
   * appears — one frame without a background is not worth the arithmetic of
   * predicting glyph widths, which is wrong for every font.
   *
   * Guarded, because `getBBox` is SVG's and jsdom has no layout: under test
   * the plate is simply absent rather than the view throwing.
   */
  const text = useRef<SVGTextElement | null>(null)
  const [plate, setPlate] = useState<{
    x: number
    y: number
    width: number
    height: number
  } | null>(null)
  useLayoutEffect(() => {
    const element = text.current
    if (element === null || typeof element.getBBox !== 'function') return
    const box = element.getBBox()
    setPlate((was) =>
      was !== null &&
      was.x === box.x &&
      was.y === box.y &&
      was.width === box.width &&
      was.height === box.height
        ? was
        : { x: box.x, y: box.y, width: box.width, height: box.height },
    )
    /*
     * NOT on the zoom. The group this sits in is counter-scaled, so the box is
     * the same at every zoom — re-measuring on each wheel notch would be a
     * layout read per frame for an answer that never changes.
     */
  }, [label, object.style.textSize, object.style.bold, object.style.italic, object.style.font])

  // Both ends, resolved once. `angle` is the direction of travel as the line
  // arrives, so the near end is the same angle turned around.
  const caps = [
    { key: 'end', cap: capPath(object.data.endArrow, end, arrival) },
    // Turned around, so it faces back out of the line exactly as the end cap
    // faces into it.
    { key: 'start', cap: capPath(object.data.startArrow, start, departure + Math.PI) },
  ]

  return (
    <svg
      className="of-connector"
      aria-label={label.trim() === '' ? 'Connector' : `Connector: ${label}`}
      role="group"
      style={{ opacity: object.style.opacity ?? 1 }}
    >
      {/* Invisible fat stroke so a thin line is still comfortably clickable. */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={Math.max(12, width * 4)} />
      <path
        className="of-connector__line"
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dashArray(object.style.dash, width)}
      />

      {/*
       * Caps are NOT dashed. The pattern says something about the relationship
       * the line represents; a broken-up arrowhead just looks like a rendering
       * fault.
       *
       * A filled cap takes the line's colour as its fill and draws no stroke:
       * stroking a solid shape as well thickens it by the stroke width, so a
       * thick connector would end in a blob noticeably bigger than a thin one.
       */}
      {caps.map(({ key, cap }) =>
        cap === null ? null : (
          <path
            key={key}
            d={cap.d}
            fill={cap.filled ? stroke : 'none'}
            stroke={cap.filled ? 'none' : stroke}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}

      {label.trim() !== '' && (
        <g transform={`translate(${String(mid.x)} ${String(mid.y)}) scale(${String(1 / zoom)})`}>
          {/*
           * The PLATE, when one has been asked for. Sized from the text it
           * covers rather than guessed at from the character count, because a
           * guess is wrong for every face and every size — and drawn first,
           * since SVG paints in document order and a background drawn after
           * its text is not a background.
           */}
          {ground !== undefined && plate !== null && (
            <rect
              x={plate.x - PLATE_PAD}
              y={plate.y - PLATE_PAD}
              width={plate.width + PLATE_PAD * 2}
              height={plate.height + PLATE_PAD * 2}
              rx={3}
              fill={ground}
            />
          )}
          <text
            ref={text}
            className={`of-connector__label${ground === undefined ? '' : ' of-connector__label--plated'}`}
            textAnchor="middle"
            dominantBaseline="middle"
            // `fill`, not `color`: an SVG glyph is painted, not inked.
            fill={inkColor(object.style.textColor)}
            style={{
              fontSize: `${String(textSizePx(object.style.textSize))}px`,
              ...(object.style.bold === true ? { fontWeight: 700 } : {}),
              ...(object.style.italic === true ? { fontStyle: 'italic' } : {}),
              ...(object.style.underline === true ? { textDecoration: 'underline' } : {}),
            }}
          >
            {label}
          </text>
        </g>
      )}
    </svg>
  )
}

function ConnectorEditor({
  object,
  document: doc,
  boundsOf,
  onCommit,
  onCancel,
}: ObjectEditorProps<ConnectorData>) {
  // The label's place is the middle of the DRAWN route, which now depends on
  // which way each end leaves — same call as the renderer, same answer.
  const ends = resolveEndpoints(doc, object.data.from, object.data.to, boundsOf)
  const { start, end, startNormal, endNormal } = ends
  const mid = pathMidpoint(
    start,
    end,
    object.data.routing,
    object.data.points,
    { start: startNormal, end: endNormal },
    [ends.startBox, ends.endBox].filter((box) => box !== null),
    object.data.label,
  )
  return (
    <div
      className="of-connector__editor-wrap"
      style={{ transform: `translate(${String(mid.x)}px, ${String(mid.y)}px)` }}
    >
      <InlineTextEditor
        initialText={object.data.text}
        className="of-connector__editor"
        ariaLabel="Edit connector label"
        onCommit={(text) => onCommit({ text })}
        onCancel={onCancel}
      />
    </div>
  )
}

export const connectorView = defineObjectView<ConnectorData>({
  type: 'connector',
  Renderer: ConnectorRenderer,
  InlineEditor: ConnectorEditor,
})
