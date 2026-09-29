import type { BoardId } from '@openframe/core'

import type { RoomFailure, RoomKeys, RoomService } from '../../runtime/services.js'

/**
 * The rooms worker's HTTP half: claiming a room, its password, destroying it.
 *
 * These requests used to be raw `fetch` calls inside the use cases, so the
 * one way to test a refusal was to replace the global. Here `fetch` is handed
 * in — the same shape `RoomAssetStore` already had — and each status the
 * worker gives a meaning to becomes a named outcome. What those outcomes SAY
 * to a person is the use case's business, not the transport's.
 */

export interface RoomClientOptions {
  /** The room server's http(s) base, no trailing slash. */
  readonly base: string
  readonly fetch: typeof globalThis.fetch
}

export function createRoomClient(options: RoomClientOptions): RoomService {
  const url = (boardId: BoardId, action: string): string =>
    `${options.base}/room/${boardId}/${action}`

  /** A POST, or `null` when the network never answered. */
  const post = async (address: string, body?: unknown): Promise<Response | null> => {
    try {
      return await options.fetch(
        address,
        body === undefined
          ? { method: 'POST' }
          : {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: JSON.stringify(body),
            },
      )
    } catch {
      return null
    }
  }

  const json = async (response: Response): Promise<Record<string, unknown> | null> => {
    const body: unknown = await response.json().catch(() => null)
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
  }

  return {
    async claim(boardId) {
      const response = await post(url(boardId, 'claim'))
      if (response === null) return { ok: false, reason: 'unreachable' }
      if (!response.ok) return { ok: false, reason: 'refused' }
      const keys = await json(response)
      if (typeof keys?.editor !== 'string' || typeof keys.viewer !== 'string') {
        return { ok: false, reason: 'unreadable' }
      }
      return {
        ok: true,
        keys: {
          editor: keys.editor,
          viewer: keys.viewer,
          ...(typeof keys.owner === 'string' ? { owner: keys.owner } : {}),
        } satisfies RoomKeys,
      }
    },

    async adoptOwnerKey(boardId, editorKey) {
      const response = await post(url(boardId, 'owner'), { key: editorKey })
      if (!response?.ok) return null
      const owner = (await json(response))?.owner
      return typeof owner === 'string' ? owner : null
    },

    async unlock(boardId, key, password) {
      const response = await post(url(boardId, 'unlock'), { key, password })
      if (response === null) return { ok: false, reason: 'unreachable' satisfies RoomFailure }
      if (!response.ok) return { ok: false, reason: 'refused' }
      const token = (await json(response))?.token
      return typeof token === 'string' ? { ok: true, token } : { ok: false, reason: 'unreadable' }
    },

    async setPassword(boardId, ownerKey, password) {
      const response = await post(url(boardId, 'password'), { key: ownerKey, password })
      if (response === null) return { ok: false, reason: 'unreachable' }
      if (response.ok) return { ok: true }
      const error = (await json(response))?.error
      return { ok: false, reason: 'refused', message: typeof error === 'string' ? error : null }
    },

    async destroy(boardId, editorKey) {
      const response = await post(url(boardId, 'destroy'), { key: editorKey })
      if (response === null) return 'unreachable'
      // Already gone. Deleting twice is not an error, and refusing here would
      // strand a row whose room a previous attempt already destroyed.
      if (response.status === 410) return 'gone'
      // Shared before links had roles: the room keeps no key it could trust.
      if (response.status === 409) return 'legacy'
      return response.ok ? 'destroyed' : 'refused'
    },
  }
}
