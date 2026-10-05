import type { ChromeSlice, Slice } from './state.js'

/**
 * What the chrome is showing: a toast, an announcement, a menu, search — and the clipboard.
 */
export const chromeSlice: Slice<ChromeSlice> = (set) => ({
  toast: null,
  toastAction: null,
  announcement: null,
  clipboard: null,
  contextMenu: null,
  searchOpen: false,
  overviewOpen: false,
  reactionPicker: null,
  votingSetup: null,
  clusterReview: null,

  showToast: (toast, action) => set({ toast, toastAction: action ?? null }),
  announce: (text) =>
    set((state) => ({ announcement: { text, serial: (state.announcement?.serial ?? 0) + 1 } })),

  setClipboard: (clipboard) => set({ clipboard }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setOverviewOpen: (overviewOpen) => set({ overviewOpen }),
  openReactionPicker: (reactionPicker) => set({ reactionPicker }),
  closeReactionPicker: () => set({ reactionPicker: null }),
  openVotingSetup: (votingSetup) => set({ votingSetup }),
  closeVotingSetup: () => set({ votingSetup: null }),
  openClusterReview: (ids) => set({ clusterReview: [...ids] }),
  closeClusterReview: () => set({ clusterReview: null }),
})
