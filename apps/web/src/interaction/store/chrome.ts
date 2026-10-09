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
  sessionOpen: false,
  accountOpen: false,
  reactionPicker: null,
  votingSetup: null,
  clusterReview: null,
  summaryReview: null,

  showToast: (toast, action) => set({ toast, toastAction: action ?? null }),
  announce: (text) =>
    set((state) => ({ announcement: { text, serial: (state.announcement?.serial ?? 0) + 1 } })),

  setClipboard: (clipboard) => set({ clipboard }),
  openContextMenu: (contextMenu) => set({ contextMenu }),
  closeContextMenu: () => set({ contextMenu: null }),
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setOverviewOpen: (overviewOpen) => set({ overviewOpen }),
  setSessionOpen: (sessionOpen) => set({ sessionOpen }),
  setAccountOpen: (accountOpen) => set({ accountOpen }),
  openReactionPicker: (reactionPicker) => set({ reactionPicker }),
  closeReactionPicker: () => set({ reactionPicker: null }),
  openVotingSetup: (votingSetup) => set({ votingSetup }),
  closeVotingSetup: () => set({ votingSetup: null }),
  // One AI sheet at a time: they sit in the same place, about the same notes.
  openClusterReview: (ids) => set({ clusterReview: [...ids], summaryReview: null }),
  closeClusterReview: () => set({ clusterReview: null }),
  openSummaryReview: (ids) => set({ summaryReview: [...ids], clusterReview: null }),
  closeSummaryReview: () => set({ summaryReview: null }),
})
