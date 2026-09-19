import { createContext, useContext } from 'react'

import type { BoardComment, BoardPerson, NewComment } from './discussion.js'

/**
 * One copy of the discussion, for the two halves that show it.
 *
 * The pins are drawn INSIDE the world layer, so they track the board under pan
 * and zoom; the panel is outside it, because text that scales with the board
 * is text you cannot read at 25%. Two components in two places, one fetch —
 * loading it twice would be two requests and two answers that can disagree.
 *
 * A context rather than a store, unlike the remote drag offsets: that changes
 * twenty times a second and would re-render every consumer, while this changes
 * when somebody says something.
 */
export interface Discussion {
  readonly comments: readonly BoardComment[]
  readonly people: readonly BoardPerson[]
  readonly replyCounts: ReadonlyMap<string, number>
  readonly refresh: () => void
  readonly post: (comment: NewComment) => Promise<boolean>
  readonly resolve: (id: string, resolved: boolean) => Promise<boolean>
  /** False for a board that is nobody else's, or for somebody not signed in. */
  readonly enabled: boolean
}

const NOTHING: Discussion = {
  comments: [],
  people: [],
  replyCounts: new Map(),
  refresh: () => undefined,
  post: () => Promise.resolve(false),
  resolve: () => Promise.resolve(false),
  enabled: false,
}

export const CommentsContext = createContext<Discussion>(NOTHING)

/**
 * Answers "no discussion" rather than throwing when there is no provider.
 *
 * Deliberate: the canvas renders in tests and in a board with no room at all,
 * and a layer that cannot render without a provider would make every one of
 * those a setup step for a feature they do not use.
 */
export function useDiscussion(): Discussion {
  return useContext(CommentsContext)
}
