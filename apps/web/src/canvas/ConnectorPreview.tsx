import { resolveEndpoints, worldToScreen } from '@openframe/core'

import { useOpenFrame } from '../runtime/context.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { connectorPath } from '../scene/connector-path.js'

/**
 * The line that follows the pointer while a connector is being drawn.
 *
 * Pure interaction state — nothing is written to the document until the gesture
 * commits, exactly as with dragging, resizing and rotating.
 */
export function ConnectorPreview() {
  const drag = useInteractionStore((state) => state.drag)
  const viewport = useInteractionStore((state) => state.viewport)
  const { runtime } = useOpenFrame()

  if (drag.kind !== 'connect') return null

  const document = runtime.store.getDocument()
  const { start } = resolveEndpoints(
    document,
    drag.from,
    { kind: 'point', x: drag.to.x, y: drag.to.y },
    (other) => runtime.registry.boundsOf(other, document),
  )

  /*
   * Both ends converted, because the preview is drawn on the apparatus layer
   * rather than in the world: the line stays two pixels thick with the same
   * dashes at every zoom, where a world-space stroke was thirty-two at 1600%.
   * The finished connector is an OBJECT and keeps its world-space stroke.
   */
  const from = worldToScreen(viewport, start)
  const to = worldToScreen(viewport, drag.to)

  return (
    <svg className="of-connector of-connector--preview" aria-hidden="true">
      <path
        d={connectorPath(from, to, 'straight')}
        fill="none"
        stroke="var(--of-accent)"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      {drag.over !== null && <circle cx={to.x} cy={to.y} r={6} fill="var(--of-accent)" />}
    </svg>
  )
}
