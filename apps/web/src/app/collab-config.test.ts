import { asBoardId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { claimUrl, roomSocketUrl, shareLink } from './collab-config.js'

/**
 * The two ways one server has to be addressed.
 *
 * This file exists because of a bug that reached production and could not have
 * been caught anywhere else. `VITE_COLLAB_URL` is a single value used both to
 * open a socket and to POST a claim, and the platform will not accept one
 * scheme for both: `new WebSocket()` throws on anything but ws/wss, `fetch()`
 * refuses those two outright. Configured as `wss://…`, every press of Share
 * called `fetch('wss://…/claim')` and the browser rejected it before a packet
 * moved — reported to the user as "the room server could not be reached".
 *
 * The room suite did not see it because it claims rooms by writing the URL out
 * by hand. A test that rebuilds the thing it is checking cannot fail with it.
 *
 * The suite runs with `ws://127.0.0.1:8787` (see `vitest.config.ts`), so these
 * assert the CONVERSION rather than a literal.
 */

const BOARD = asBoardId('brd_abcdefgh12345678')

describe('addressing the room server', () => {
  it('claims over http, never over a websocket scheme', () => {
    const url = claimUrl(BOARD)

    // The assertion that was missing. `fetch` rejects ws: and wss: outright,
    // so this is the whole bug in one line.
    expect(url.startsWith('ws')).toBe(false)
    expect(url).toMatch(/^https?:\/\//)
    expect(url).toContain(`/room/${BOARD}/claim`)
  })

  it('opens the socket over a websocket scheme, never over http', () => {
    const url = roomSocketUrl(BOARD)

    // The mirror image: `new WebSocket('https://…')` throws.
    expect(url).toMatch(/^wss?:\/\//)
    expect(url).toContain(`/room/${BOARD}`)
  })

  it('points both at the same host', () => {
    const claim = new URL(claimUrl(BOARD))
    const socket = new URL(roomSocketUrl(BOARD))

    // A conversion that changed the host would be a far worse bug than the one
    // it replaced, and a regex over schemes would not notice.
    expect(claim.host).toBe(socket.host)
  })

  it('carries the key on the socket, where the room reads it', () => {
    expect(roomSocketUrl(BOARD, 'a'.repeat(32))).toContain(`?k=${'a'.repeat(32)}`)
    expect(roomSocketUrl(BOARD, null)).not.toContain('?k=')
  })

  it('carries the key on a share link, where a person pastes it', () => {
    expect(shareLink(BOARD, 'https://example.test', 'b'.repeat(32))).toBe(
      `https://example.test/?room=${BOARD}&k=${'b'.repeat(32)}`,
    )
    expect(shareLink(BOARD, 'https://example.test', null)).toBe(
      `https://example.test/?room=${BOARD}`,
    )
  })
})
