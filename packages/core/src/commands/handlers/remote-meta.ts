import type { Patch } from '../../domain/patch.js'
import { MAX_TITLE } from './set-board-title.js'

/**
 * A change to the board's own fields arriving from another client, checked
 * before it is believed.
 *
 * `meta` is a flat map in the shared document, and anyone holding the edit
 * link can write any key into it with any value. Until this existed every such
 * write was applied: a title that is an object reaches every place a title is
 * shown, and an unknown key rides along in the document from then on.
 *
 * What a peer can legitimately change is exactly what a command can: the title,
 * through `SetBoardTitle`, under that command's rules. `createdAt` is set once
 * where a board is made and never sent, so a change to it is refused too, as is
 * clearing the title, which no command can do.
 *
 * DROPPED, NOT REPAIRED, like an object (`readRemoteObject`): a title cut to
 * length would be a name nobody chose.
 */
export function isAcceptableRemoteMeta(patch: Extract<Patch, { op: 'meta' }>): boolean {
  const [key] = patch.path
  if (key !== 'title') return false
  const title = patch.value
  // Equal to its own trim, because `SetBoardTitle` trims before it writes:
  // a title with a line break at either end is one no rename produced.
  return (
    typeof title === 'string' &&
    title.length > 0 &&
    title === title.trim() &&
    title.length <= MAX_TITLE
  )
}
