import { readableTypeName, type UnknownData } from '@openframe/core'

import { defineObjectView, type ObjectViewProps } from './registry.js'

/**
 * How an object this build cannot interpret appears.
 *
 * Named in words and by where it came from. It read "Unsupported / kanban-card
 * / Open in a newer version of OpenFrame to edit" — an identifier, and a word
 * that sounds like a refusal, for an object that is perfectly safe.
 *
 * It is visible, positioned correctly, movable and deletable — but plainly
 * marked as not editable here. The alternative, dropping it, would silently
 * destroy a collaborator's work every time someone opened a board in an older
 * client.
 */
function UnknownRenderer({ object }: ObjectViewProps<UnknownData>) {
  const name = readableTypeName(object.data.originalType)
  return (
    <div
      className="of-unknown"
      role="group"
      aria-label={`${name} from a newer version of OpenFrame. It can be moved or deleted here.`}
    >
      <span className="of-unknown__badge">{name}</span>
      <span className="of-unknown__hint">From a newer version of OpenFrame</span>
    </div>
  )
}

export const unknownView = defineObjectView<UnknownData>({
  type: 'unknown',
  Renderer: UnknownRenderer,
})
