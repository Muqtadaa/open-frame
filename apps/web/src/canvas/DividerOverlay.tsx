import { useRef } from 'react'

import { setTrackSize, worldRectToScreen, type TableData } from '@openframe/core'

import { useCommands } from '../hooks/use-commands.js'
import { fitColumnWidth, fitRowHeight } from '../scene/fit-track.js'
import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

/** How wide a boundary is to grab, in screen pixels (WCAG 2.5.8). */
const GRAB_PX = 14

/**
 * Grab handles on the divisions INSIDE a selected object — a table's column
 * and row boundaries.
 *
 * Asks the REGISTRY which divisions an object has rather than looking for a
 * table. Every other type answers with none, so this renders nothing for them
 * and needs no knowledge of what a table is; the next type with internal
 * divisions gets handles by declaring them, exactly as `EndpointOverlay` works
 * for types with ends.
 *
 * Only for a single selection, for the same reason: dragging one boundary of
 * one table is the gesture, and with several selected the meaningful action is
 * moving them together.
 */
/** How close two presses must be to count as one gesture. */
const DOUBLE_PRESS_MS = 400

export function DividerOverlay() {
  const { runtime } = useOpenFrame()
  const commands = useCommands()
  /*
   * The last press on a divider, for counting a double. A ref rather than
   * state: nothing renders differently because of it, and a re-render between
   * the two presses would lose the count.
   */
  const pressed = useRef<{ id: string; at: number } | null>(null)
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const viewport = useInteractionStore((state) => state.viewport)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)

  if (selection.size !== 1 || editingId !== null) return null
  // Hidden while the object is being moved or drawn, like every other handle —
  // but NOT while a divider itself is being dragged, which is this gesture.
  if (dragKind === 'marquee' || dragKind === 'translate' || dragKind === 'draw') return null

  const [id] = [...selection]
  const object = id === undefined ? undefined : document.objects.get(id)
  if (object === undefined || object.locked) return null

  const dividers = runtime.registry.dividersOf(object)
  if (dividers.length === 0) return null

  /**
   * Fits the track before a boundary to what is in it.
   *
   * The type still owns the arithmetic — `setTrackSize` keeps every other
   * track exactly as it is and reports the new total, the same contract a drag
   * uses — and this owns only the measurement, which cannot be done without
   * the laid-out DOM.
   *
   * It reads the cells by attribute rather than by knowing what a table is.
   * That is the same fallback rule 15 names: some geometry only exists once
   * the browser has drawn it.
   */
  const fitTrack = (dividerId: string): void => {
    const across = dividerId.startsWith('c')
    const index = Number.parseInt(dividerId.slice(1), 10)
    if (!Number.isInteger(index) || index < 0) return

    const grid = window.document.querySelector(`[data-object-id="${id ?? ''}"] [role="table"]`)
    if (grid === null) return

    const data = object.data as TableData
    const columns = data.columns.length
    const cells = [...grid.children].filter(
      (child): child is HTMLElement => child instanceof HTMLElement,
    )
    const inTrack = cells.filter((_, at) =>
      across ? at % columns === index : Math.floor(at / columns) === index,
    )

    const wanted = across ? fitColumnWidth(inTrack) : fitRowHeight(inTrack)
    if (wanted === null) return

    /*
     * Applied as measured, with NO zoom conversion.
     *
     * The canvas is one `scale(zoom)` on a wrapper, so everything inside it is
     * laid out at world size and only painted larger; the measurement comes
     * back in world units already. Dividing by the zoom here — which this did
     * — halved every column fitted at 200%, which is what "autosize just
     * shrinks it" was.
     */
    const extent = across ? object.frame.width : object.frame.height
    const sized = setTrackSize(across ? data.columns : data.rows, index, wanted, extent)
    if (sized === null) return

    commands.resizeDivider(
      object.id,
      across ? { columns: sized.weights } : { rows: sized.weights },
      {
        ...object.frame,
        ...(across ? { width: sized.total } : { height: sized.total }),
      },
    )
  }

  /*
   * The table ON SCREEN. The grip is a screen measurement — it is a target for
   * a pointer, not part of the table — and on the apparatus layer it can
   * simply be one, with nothing divided by the zoom.
   */
  const bounds = worldRectToScreen(viewport, runtime.registry.boundsOf(object, document))
  const grab = GRAB_PX

  return (
    <>
      {dividers.map((divider) => {
        const across = divider.axis === 'x'
        /*
         * `at` is a FRACTION of the object's extent, so the handle lands in
         * the right place whatever size the object is now — and the type never
         * has to know where on the board it sits.
         */
        const x = across ? bounds.x + bounds.width * divider.at : bounds.x
        const y = across ? bounds.y : bounds.y + bounds.height * divider.at

        return (
          <div
            key={divider.id}
            className={`of-divider of-divider--${divider.axis}`}
            // Read back by the gesture, which does not otherwise know what was
            // grabbed — the same handshake the endpoint handles use.
            data-handle="divider"
            data-divider-id={divider.id}
            data-testid={`divider-${divider.id}`}
            /*
             * DOUBLE-PRESS FITS THE TRACK TO ITS CONTENT, the way a
             * spreadsheet does. The measurement is the DOM's — it depends on
             * the face, the size and where the text breaks — and the
             * arithmetic that follows is the type's, through `setTrackSize`.
             *
             * Counted here rather than taken from `dblclick`, which never
             * arrives: that event targets the nearest common ancestor of its
             * two clicks, and a pair landing on a handle and then on the cell
             * beneath it resolves all the way up to the canvas.
             */
            onPointerDown={(event) => {
              const now = event.timeStamp
              const last = pressed.current
              pressed.current = { id: divider.id, at: now }
              if (last !== null && last.id === divider.id && now - last.at < DOUBLE_PRESS_MS) {
                pressed.current = null
                fitTrack(divider.id)
              }
            }}
            style={{
              transform: `translate(${String(across ? x - grab / 2 : x)}px, ${String(
                across ? y : y - grab / 2,
              )}px)`,
              width: `${String(across ? grab : bounds.width)}px`,
              height: `${String(across ? bounds.height : grab)}px`,
            }}
          />
        )
      })}
    </>
  )
}
