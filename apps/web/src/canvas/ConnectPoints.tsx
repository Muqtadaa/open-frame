import type { Anchor } from '@openframe/core'

import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import {
  CONNECT_OUTSET_PX,
  CONNECT_TARGET_PX,
  SIDES,
  connectPointAt,
} from '../scene/connect-points.js'

/** Drawn small; the hit area around it is much larger — see `.of-connect-point`. */
const POINT_PX = 8

/**
 * The four places a connector can be started from, on a selected object.
 *
 * The connector tool still exists, but reaching for a tool to join two things
 * that are already in front of you is a detour — every board tool offers this,
 * and its absence was the single most-mentioned thing missing.
 *
 * Offered only by types that declare `connectable`, so a type that cannot be
 * joined to anything never grows handles nobody can use. A frame declares it;
 * a relation is not even on the board.
 *
 * Each point carries the SIDE it sits on, so the connector attaches there
 * rather than at `auto`. Starting a line from the right edge and having it
 * leave from the left is the kind of thing that makes a tool feel like it is
 * arguing with you.
 */
export function ConnectPoints() {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const zoom = useInteractionStore((state) => state.viewport.zoom)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)

  // Hidden mid-gesture and while editing, like every other piece of chrome.
  if (selection.size !== 1 || editingId !== null || dragKind !== 'idle') return null

  const [id] = [...selection]
  const object = id === undefined ? undefined : document.objects.get(id)
  if (object === undefined || object.locked) return null

  const definition = runtime.registry.get(object.type)
  if (definition?.capabilities.connectable !== true) return null
  // A type with its own draggable ends has those instead; a connector does not
  // sprout connection points of its own.
  if (runtime.registry.endpointsOf(object, document).length > 0) return null

  const bounds = runtime.registry.boundsOf(object, document)
  const size = POINT_PX / zoom
  /*
   * Pushed clear of the edge, because the `n`, `e`, `s` and `w` resize handles
   * are centred on exactly these four points. Drawn on the edge, the two
   * fought over every press — resizing an object horizontally grabbed a
   * connector instead.
   */
  const outset = CONNECT_OUTSET_PX / zoom

  return (
    <>
      {SIDES.map((side) => {
        const at = connectPointAt(bounds, side, outset)
        return (
          <div
            key={side}
            className="of-connect-point"
            // Read back by the gesture, which does not otherwise know what was
            // grabbed — the same channel the endpoint handles use.
            data-handle="connect"
            data-connect-side={side}
            data-testid={`connect-${side}`}
            style={{
              transform: `translate(${String(at.x - size / 2)}px, ${String(at.y - size / 2)}px)`,
              width: `${String(size)}px`,
              height: `${String(size)}px`,
              borderWidth: `${String(1.5 / zoom)}px`,
            }}
          >
            {/*
              * The target, as a real element, for the same reason the resize
              * handles have one: the drawn dot is a design decision and the
              * 24px pointer target is an accessibility one.
              */}
            <span
              className="of-connect-point__target"
              aria-hidden="true"
              style={{ inset: `${String(-(CONNECT_TARGET_PX - POINT_PX) / 2 / zoom)}px` }}
            />
          </div>
        )
      })}
    </>
  )
}

export function anchorForSide(side: string): Anchor {
  return SIDES.includes(side as (typeof SIDES)[number])
    ? { kind: 'side', side: side as (typeof SIDES)[number] }
    : { kind: 'auto' }
}

