/**
 * Boards that follow you between browsers, as the rest of the app sees them.
 *
 * A one-file seam over the adapter, the same shape as `identity.ts`:
 * `supabase-lives-only-in-adapters` is a build failure, and this is what makes
 * obeying it painless rather than a nuisance.
 */
export {
  deleteRemoteBoard,
  joinBoard,
  leaveRemoteBoard,
  listMyBoards,
  recordSharedBoard,
  renameRemoteBoard,
  setBoardPinned,
  touchBoardOpened,
  type RemoteBoard,
} from '../adapters/supabase/boards.js'
