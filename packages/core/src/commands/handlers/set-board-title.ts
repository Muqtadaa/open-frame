import type { BoardDocument } from '../../domain/document.js'
import type { Patch } from '../../domain/patch.js'
import { CommandError } from '../errors.js'
import type { Command } from '../types.js'

type SetBoardTitle = Extract<Command, { kind: 'SetBoardTitle' }>

/**
 * The board's own name.
 *
 * Validated here rather than at the input, because this is the boundary a
 * title can also arrive at from an import, the API or a rename made by
 * somebody else — and a handler is the one place all of those meet.
 */
const MAX_TITLE = 200

export function setBoardTitle(doc: BoardDocument, command: SetBoardTitle): Patch[] {
  const title = command.title.trim()

  if (title.length === 0) {
    // A board with no name is a row in the list nobody can tell apart, and the
    // empty string is what an emptied input produces — so it is refused rather
    // than stored, and the caller keeps the name it had.
    throw new CommandError('invalid-input', 'A board needs a name')
  }
  if (title.length > MAX_TITLE) {
    throw new CommandError('invalid-input', `A board name is at most ${String(MAX_TITLE)} characters`)
  }

  // No change is no patch: renaming a board to what it is already called must
  // not produce an undo step that appears to do nothing.
  if (title === doc.meta.title) return []

  return [{ op: 'meta', path: ['title'], value: title }]
}
