import type { UnknownData } from '@openframe/core'

import { defineObjectView, type ObjectViewProps } from './registry.js'

/**
 * How an object this build cannot interpret appears.
 *
 * It is visible, positioned correctly, movable and deletable — but plainly
 * marked as not editable here. The alternative, dropping it, would silently
 * destroy a collaborator's work every time someone opened a board in an older
 * client.
 */
function UnknownRenderer({ object }: ObjectViewProps<UnknownData>) {
  return (
    <div
      className="of-unknown"
      role="group"
      aria-label={`Unsupported object of type ${object.data.originalType}`}
    >
      <span className="of-unknown__badge">Unsupported</span>
      <span className="of-unknown__type">{object.data.originalType}</span>
      <span className="of-unknown__hint">Open in a newer version of OpenFrame to edit</span>
    </div>
  )
}

export const unknownView = defineObjectView<UnknownData>({
  type: 'unknown',
  Renderer: UnknownRenderer,
})
