import type { BoardId, ObjectTypeRegistry } from '@openframe/core'

import { createRoomHistory } from '../adapters/room/history-client.js'
import { indexedDbVersionStore } from '../adapters/indexeddb/version-store.js'
import type { BoardHistory } from '../runtime/board-history.js'
import { heldOwnerKey, heldToken } from './board-password.js'
import { accessKey, COLLAB_ENABLED, versionsBase } from './collab-config.js'
import { localBoardHistory } from './local-board-history.js'
import type { LocalHistory } from './local-history.js'

/**
 * Which history a board has, chosen once (ADR 0019): its room's for a shared
 * board, this browser's for a local one. `null` for a shared board in a build
 * with no room server, which has nowhere to read one from.
 */
export function boardHistoryFor(options: {
  readonly boardId: BoardId
  readonly shared: boolean
  readonly registry: ObjectTypeRegistry
  readonly keeper: LocalHistory | null
}): BoardHistory | null {
  if (!options.shared) {
    return localBoardHistory({
      boardId: options.boardId,
      versions: indexedDbVersionStore,
      keeper: options.keeper,
      registry: options.registry,
    })
  }
  if (!COLLAB_ENABLED) return null
  const boardId = options.boardId
  return createRoomHistory({
    base: versionsBase(),
    boardId,
    // Read at call time, as for images: a board can be unlocked, or adopt an
    // owner key, after this is built.
    credentials: () => ({
      key: accessKey(window.location.search),
      owner: heldOwnerKey(boardId),
      token: heldToken(boardId),
    }),
    // Yjs stays out of the entry chunk: a shared board has already loaded it.
    decode: async (bytes) => (await import('./collaboration.js')).decodeVersion(bytes),
    fetch: (input, init) => globalThis.fetch(input, init),
  })
}
