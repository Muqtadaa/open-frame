import { attachmentAnchor, worldRectToScreen, type Anchor } from '@openframe/core'

import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import {
  anchorReach,
  CONNECT_OUTSET_PX,
  CONNECT_TARGET_PX,
  SIDES,
  connectPointAt,
} from '../scene/connect-points.js'

/** Drawn small; the hit area around it is much larger — see `.of-connect-point`. */
const POINT_PX = 8

/**
 * The four places a connector can be started from — or aimed AT.
 *
 * The connector tool still exists, but reaching for a tool to join two things
 * that are already in front of you is a detour — every board tool offers this,
 * and its absence was the single most-mentioned thing missing.
 *
 * Shown on a selected object, and on whatever a line is currently being
 * dragged over. The second is not decoration: dropping on an anchor now pins
 * that side for good, and an aim you cannot see is an aim nobody takes. The
 * one under the pointer is marked, and it is marked by asking the connector
 * type the same question the drop will ask — a highlight worked out separately
 * is a highlight that can promise a side the drop does not deliver.
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
  const viewport = useInteractionStore((state) => state.viewport)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)
  const croppingId = useInteractionStore((state) => state.croppingId)
  /*
   * What a line in flight is over, and where its loose end is. Primitives
   * only — rule 9: a selector building a fresh point never compares equal and
   * re-renders for ever.
   */
  const over = useInteractionStore((state) =>
    state.drag.kind === 'connect' ? state.drag.over : null,
  )
  const toX = useInteractionStore((state) => (state.drag.kind === 'connect' ? state.drag.to.x : 0))
  const toY = useInteractionStore((state) => (state.drag.kind === 'connect' ? state.drag.to.y : 0))

  /*
   * Hidden while cropping, like everything else that offers a grip. Crop mode
   * covers the object's edges with brackets, and a connection point sitting
   * among them is both clutter and one more press to lose.
   */
  if (editingId !== null || croppingId !== null) return null
  // Hidden mid-gesture, like every other piece of chrome — except the gesture
  // these exist to serve, which is the one that needs them visible.
  if (dragKind !== 'idle' && over === null) return null

  const [selected] = [...selection]
  const id = over ?? (dragKind === 'idle' && selection.size === 1 ? selected : undefined)
  const object = id === undefined ? undefined : document.objects.get(id)
  if (object === undefined || object.locked) return null

  const definition = runtime.registry.get(object.type)
  if (definition?.capabilities.connectable !== true) return null
  // A type with its own draggable ends has those instead; a connector does not
  // sprout connection points of its own.
  if (runtime.registry.endpointsOf(object, document).length > 0) return null

  /*
   * The object's bounds ON SCREEN, which is where these are drawn: the layer
   * is outside the world transform, so the outset and the dot are screen
   * pixels and stay the same distance apart at every zoom. Divided by the zoom
   * inside the transform they did not — see `.of-apparatus`.
   */
  const world = runtime.registry.boundsOf(object, document)
  const bounds = worldRectToScreen(viewport, world)
  /*
   * WHICH ONE the drop would take, asked of the type rather than worked out
   * here. `auto` means no anchor is being aimed at and nothing is marked.
   */
  const aimed =
    over === null
      ? null
      : (() => {
          const anchor = attachmentAnchor(
            object,
            { x: toX, y: toY },
            anchorReach(viewport.zoom),
            (other) => runtime.registry.boundsOf(other, document),
          )
          return anchor.kind === 'side' ? anchor.side : null
        })()
  /*
   * Pushed clear of the edge, because the `n`, `e`, `s` and `w` resize handles
   * are centred on exactly these four points. Drawn on the edge, the two
   * fought over every press — resizing an object horizontally grabbed a
   * connector instead.
   */
  const outset = CONNECT_OUTSET_PX

  return (
    <>
      {SIDES.map((side) => {
        const at = connectPointAt(bounds, side, outset)
        const size = POINT_PX
        return (
          <div
            key={side}
            className={side === aimed ? 'of-connect-point is-aimed' : 'of-connect-point'}
            // Read back by the gesture, which does not otherwise know what was
            // grabbed — the same channel the endpoint handles use.
            data-handle="connect"
            data-connect-side={side}
            data-testid={`connect-${side}`}
            style={{
              transform: `translate(${String(at.x - size / 2)}px, ${String(at.y - size / 2)}px)`,
              width: `${String(size)}px`,
              height: `${String(size)}px`,
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
              style={{ inset: `${String(-(CONNECT_TARGET_PX - POINT_PX) / 2)}px` }}
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
