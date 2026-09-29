import type { DiscussionSlice, Slice } from './state.js'

/**
 * Comments being written and read, and what this client has said.
 */
export const discussionSlice: Slice<DiscussionSlice> = (set) => ({
  commentsOpen: false,
  composing: null,
  openThreadId: null,
  said: 0,
  setCommentsOpen: (commentsOpen) => set({ commentsOpen }),
  // Writing a new one closes whatever was being read, and vice versa: two
  // panels over the same pin is two places to type into.
  startComment: (at) => set({ composing: at, openThreadId: null }),
  openThread: (id) => set({ openThreadId: id, composing: null }),
  noteSaid: () => {
    set((state) => ({ said: state.said + 1 }))
  },
})
