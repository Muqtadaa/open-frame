import { resolveEndpoints } from '@openframe/core'

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
  const { runtime } = useOpenFrame()

  if (drag.kind !== 'connect') return null

  const { start } = resolveEndpoints(runtime.store.getDocument(), drag.from, {
    kind: 'point',
    x: drag.to.x,
    y: drag.to.y,
  })

  return (
    <svg className="of-connector of-connector--preview" aria-hidden="true">
      <path
        d={connectorPath(start, drag.to, 'straight')}
        fill="none"
        stroke="var(--of-accent)"
        strokeWidth={2}
        strokeDasharray="6 4"
      />
      {drag.over !== null && <circle cx={drag.to.x} cy={drag.to.y} r={6} fill="var(--of-accent)" />}
    </svg>
  )
}
