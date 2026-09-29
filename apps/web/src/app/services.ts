import type { BoardId, BoardRepository } from '@openframe/core'

import { forgetCrdt } from '../adapters/indexeddb/crdt-store.js'
import { createRoomClient } from '../adapters/room/room-client.js'
import {
  supabaseAccounts,
  supabaseDiscussion,
  supabaseRemoteBoards,
  supabaseWorkspaces,
} from '../adapters/supabase/services.js'
import type { RoomService, Services } from '../runtime/services.js'
import {
  deleteBoardEverywhere,
  forgetDeletedBoard,
  leaveBoard,
  renameBoard,
  type LifecycleDeps,
} from './board-lifecycle.js'
import {
  ownedKeys,
  recoverOwnerKey,
  rememberOwnerKey,
  setBoardPassword,
  unlockBoard,
  type PasswordDeps,
} from './board-password.js'
import { createLocalBoard, keepCopy, listAllBoards } from './boards.js'
import { roomHttpBase } from './collab-config.js'
import { claimLocalBoard, createOwnedBoard, shareCurrentBoard, type ShareDeps } from './share.js'

/**
 * A build with no room server: every request answers that it could not be
 * made, which is what each use case already said when the URL it built threw.
 */
const NO_ROOM_SERVER: RoomService = {
  claim: () => Promise.resolve({ ok: false, reason: 'unreachable' }),
  adoptOwnerKey: () => Promise.resolve(null),
  unlock: () => Promise.resolve({ ok: false, reason: 'unreachable' }),
  setPassword: () => Promise.resolve({ ok: false, reason: 'unreachable' }),
  destroy: () => Promise.resolve('unreachable'),
}

/**
 * Wires the services the interface is given. The one place that knows which
 * adapter backs which port — built once in `main.tsx` and provided around
 * both routes.
 */
export function createServices(options: {
  readonly repository: BoardRepository
  /** Injected for tests; the browser's own otherwise. */
  readonly fetch?: typeof globalThis.fetch
  readonly origin?: () => string
}): Services {
  const { repository } = options
  const base = roomHttpBase()
  const rooms =
    base === null
      ? NO_ROOM_SERVER
      : createRoomClient({
          base,
          // Bound late, so it is whatever `fetch` is when the request is made.
          fetch: options.fetch ?? ((input, init) => globalThis.fetch(input, init)),
        })
  const accounts = supabaseAccounts()
  const remoteBoards = supabaseRemoteBoards()
  const origin = options.origin ?? (() => window.location.origin)

  const share: ShareDeps = { repository, rooms, accounts, remoteBoards, origin }
  const passwords: PasswordDeps = { rooms, remoteBoards }
  const lifecycle: LifecycleDeps = {
    repository,
    rooms,
    remoteBoards,
    forgetCrdt,
    // Loaded only when needed, like the rest of collaboration: the list must
    // not pay for Yjs to render.
    renameInRoom: async (boardId: BoardId, key: string | null, title: string) =>
      (await import('./collaboration.js')).renameInRoom(boardId, key, title),
  }

  return {
    repository,
    rooms,
    accounts,
    remoteBoards,
    discussion: supabaseDiscussion(),
    workspaces: supabaseWorkspaces(),
    boards: {
      listAll: (signedIn) =>
        listAllBoards({ repository, remoteBoards, accountsEnabled: accounts.enabled }, signedIn),
      createLocal: (title) => createLocalBoard(repository, title),
      createOwned: (title, workspaceId) => createOwnedBoard(share, title, workspaceId),
      shareCurrent: (runtime) => shareCurrentBoard(share, runtime),
      claimLocal: (boardId) => claimLocalBoard(share, boardId),
      deleteEverywhere: (board) => deleteBoardEverywhere(lifecycle, board),
      leave: (boardId) => leaveBoard(lifecycle, boardId),
      forgetDeleted: (boardId) => forgetDeletedBoard(lifecycle, boardId),
      rename: (board, title) => renameBoard(lifecycle, board, title),
      keepCopy: (document) => keepCopy(repository, document),
    },
    passwords: {
      unlock: (boardId, key, password) => unlockBoard(passwords, boardId, key, password),
      set: (boardId, keys, password) => setBoardPassword(passwords, boardId, keys, password),
      recoverOwnerKey: (boardId) => recoverOwnerKey(passwords, boardId),
      ownedKeys: (boardId) => ownedKeys(passwords, boardId),
      rememberOwnerKey,
    },
  }
}
