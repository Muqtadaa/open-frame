import { create } from 'zustand'

import type { ComposingComment } from './interaction-store.js'

/** Somebody chosen from the mention menu, as the draft remembers them. */
export interface DraftPerson {
  readonly userId: string
  readonly displayName: string
  readonly hue: number
}

/**
 * Words typed into a comment or a reply that has not been posted.
 *
 * `at` is set for a NEW comment — where it was started — so the board can
 * show a draft pin there and reopen it. A reply's draft belongs to its
 * thread and needs no place of its own.
 */
export interface CommentDraft {
  readonly body: string
  readonly picked: readonly DraftPerson[]
  readonly at: ComposingComment | null
}

/**
 * Unposted comments, kept OUTSIDE the panel.
 *
 * The panel is keyed on what is being written into and remounts when that
 * changes, which is right for everything else it holds — and was how a draft
 * vanished: Escape, or a click on another spot or pin, changed the key and
 * the new panel started empty. No key and no click throws words away (C3 #4);
 * posting is what clears a draft, and nothing else.
 *
 * Local and transient, like the rest of interaction state: a draft is not a
 * comment until it is posted, and it never reaches the room.
 */
interface CommentDraftState {
  readonly drafts: ReadonlyMap<string, CommentDraft>
  readonly keep: (key: string, draft: CommentDraft) => void
  readonly drop: (key: string) => void
}

export const useCommentDrafts = create<CommentDraftState>((set) => ({
  drafts: new Map(),
  keep: (key, draft) => {
    set((state) => {
      const next = new Map(state.drafts)
      if (draft.body.trim() === '') next.delete(key)
      else next.set(key, draft)
      return { drafts: next }
    })
  },
  drop: (key) => {
    set((state) => {
      if (!state.drafts.has(key)) return state
      const next = new Map(state.drafts)
      next.delete(key)
      return { drafts: next }
    })
  },
}))

/** What a panel is writing into, as a draft's key. */
export function draftKey(
  openThreadId: string | null,
  composing: ComposingComment | null,
): string | null {
  if (openThreadId !== null) return `thread:${openThreadId}`
  if (composing !== null) return `new:${String(composing.x)},${String(composing.y)}`
  return null
}
