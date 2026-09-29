import type {
  AccountService,
  DiscussionService,
  RemoteBoardService,
  WorkspaceService,
} from '../../runtime/services.js'
import {
  deleteRemoteBoard,
  joinBoard,
  leaveRemoteBoard,
  listMyBoards,
  recordOwnerKey,
  recordSharedBoard,
  renameRemoteBoard,
  setBoardPinned,
  touchBoardOpened,
} from './boards.js'
import {
  boardPeople,
  listComments,
  markMentionsRead,
  myMentions,
  postComment,
  resolveComment,
  watchMyMentions,
} from './comments.js'
import { ACCOUNTS_ENABLED } from './config.js'
import { currentIdentity, onIdentityChange, signIn, signOut, signUp } from './identity.js'
import { createWorkspace, joinWorkspace, listMyWorkspaces, shareWorkspace } from './workspaces.js'

/*
 * The Supabase adapters as the ports the interface is written against.
 *
 * Thin on purpose: every function already degrades to "nothing" with no
 * client, and that behaviour is theirs. What this adds is the one place that
 * says which provider backs which service — so swapping one is a change here
 * and in the composition root, and nowhere a component can see.
 */

export const supabaseAccounts = (): AccountService => ({
  enabled: ACCOUNTS_ENABLED,
  current: currentIdentity,
  onChange: onIdentityChange,
  signIn,
  signUp,
  signOut,
})

export const supabaseRemoteBoards = (): RemoteBoardService => ({
  listMine: listMyBoards,
  recordShared: recordSharedBoard,
  recordOwnerKey,
  join: joinBoard,
  setPinned: setBoardPinned,
  touchOpened: touchBoardOpened,
  remove: deleteRemoteBoard,
  leave: leaveRemoteBoard,
  rename: renameRemoteBoard,
})

export const supabaseDiscussion = (): DiscussionService => ({
  list: listComments,
  people: boardPeople,
  post: postComment,
  resolve: resolveComment,
  mentions: myMentions,
  markRead: markMentionsRead,
  watchMentions: watchMyMentions,
})

export const supabaseWorkspaces = (): WorkspaceService => ({
  listMine: listMyWorkspaces,
  create: createWorkspace,
  share: shareWorkspace,
  join: joinWorkspace,
})
