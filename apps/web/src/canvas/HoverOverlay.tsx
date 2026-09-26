import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { worldRectToScreen } from '@openframe/core'

/**
 * A quiet outline round the object under the pointer, before it is pressed.
 *
 * An unselected object said nothing under the pointer, so what a press would
 * take — which note of three overlapping, the frame or the note on it — was
 * only found out by pressing (C3 #7). Only while the select tool is idle and
 * only for what is not already selected, which has its own box.
 *
 * On the apparatus layer like the rest, so it is a hairline at every zoom
 * (rule 24), and oriented like the selection box on a turned object.
 */
export function HoverOverlay() {
  const { runtime } = useOpenFrame()
  const hoveredId = useInteractionStore((state) => state.hoveredId)
  const selected = useInteractionStore((state) =>
    state.hoveredId === null ? false : state.selection.has(state.hoveredId),
  )
  const idle = useInteractionStore((state) => state.drag.kind === 'idle')
  const selecting = useInteractionStore((state) => state.tool === 'select')
  const editing = useInteractionStore((state) => state.editingId !== null)
  const viewport = useInteractionStore((state) => state.viewport)
  const document = useBoardDocument()
  const object = hoveredId === null ? undefined : document.objects.get(hoveredId)

  if (object === undefined || selected || !idle || !selecting || editing) return null

  const turned = object.frame.width > 0 && object.frame.height > 0
  const rotation = turned ? object.frame.rotation : 0
  const screen = worldRectToScreen(
    viewport,
    turned ? object.frame : runtime.registry.boundsOf(object, document),
  )
  return (
    <div
      className="of-hover"
      data-testid="hover-outline"
      aria-hidden="true"
      style={{
        transform: `translate(${String(screen.x)}px, ${String(screen.y)}px) rotate(${String(rotation)}rad)`,
        width: `${String(screen.width)}px`,
        height: `${String(screen.height)}px`,
      }}
    />
  )
}
