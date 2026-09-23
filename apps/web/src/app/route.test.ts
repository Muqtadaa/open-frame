import { asBoardId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { boardHref, newLocalBoardId, readRoute } from './route.js'
import { commentLink, shareLink } from './collab-config.js'

/**
 * Two surfaces, decided from a query string.
 *
 * The case that matters most is the one that looks least interesting: a link
 * somebody already has must keep opening the board it opened yesterday.
 * `?room=` predates this module and every share link in existence uses it.
 */

describe('reading a route', () => {
  it('opens a shared board from a link that already exists', () => {
    expect(readRoute('?room=brd_abcdefgh12345678')).toEqual({
      kind: 'board',
      boardId: asBoardId('brd_abcdefgh12345678'),
      shared: true, key: null, commentId: null,
    })
  })

  it('opens a local board by id', () => {
    expect(readRoute('?board=board_local')).toEqual({
      kind: 'board',
      boardId: asBoardId('board_local'),
      shared: false, key: null, commentId: null,
    })
  })

  it('goes home with no parameters at all', () => {
    expect(readRoute('')).toEqual({ kind: 'home' })
    expect(readRoute('?')).toEqual({ kind: 'home' })
  })

  /**
   * A mangled link is a truncated one far more often than a hostile one, and
   * home is somewhere a person can recover from. A 404 is not.
   */
  it('goes home rather than failing on a malformed id', () => {
    expect(readRoute('?board=../../etc/passwd')).toEqual({ kind: 'home' })
    expect(readRoute('?room=brd_short')).toEqual({ kind: 'home' })
    expect(readRoute('?board=')).toEqual({ kind: 'home' })
  })

  /** A shared link wins: it is the more specific thing the person clicked. */
  it('prefers the room when a link carries both', () => {
    const route = readRoute('?board=board_local&room=brd_abcdefgh12345678')
    expect(route).toEqual({
      kind: 'board',
      boardId: asBoardId('brd_abcdefgh12345678'),
      shared: true, key: null, commentId: null,
    })
  })
})

describe('writing a route', () => {
  it('round-trips a local board', () => {
    const id = newLocalBoardId()
    expect(readRoute(boardHref(id, false).slice(1))).toEqual({
      kind: 'board',
      boardId: id,
      shared: false, key: null, commentId: null,
    })
  })

  it('round-trips a shared board', () => {
    const href = boardHref(asBoardId('brd_abcdefgh12345678'), true)
    expect(href).toBe('/?room=brd_abcdefgh12345678')
    expect(readRoute(href.slice(1))).toEqual({
      kind: 'board',
      boardId: asBoardId('brd_abcdefgh12345678'),
      shared: true, key: null, commentId: null,
    })
  })

  it('mints local ids that do not collide', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newLocalBoardId()))
    expect(ids.size).toBe(500)
  })
})

describe('the key on a shared link', () => {
  it('is carried, because it is what the room checks', () => {
    const key = 'a1b2c3d4e5f60718293a4b5c6d7e8f90'
    expect(readRoute(`?room=brd_abcdefgh12345678&k=${key}`)).toEqual({
      kind: 'board',
      boardId: asBoardId('brd_abcdefgh12345678'),
      shared: true,
      key,
      commentId: null,
    })
  })

  /**
   * A board shared before links had roles. The room still admits it, so the
   * client must still open it — dropping the board because the URL lacks a
   * key would break every link already in circulation.
   */
  it('is absent on a link that predates roles, and the board still opens', () => {
    const route = readRoute('?room=brd_abcdefgh12345678')
    expect(route).toEqual({
      kind: 'board',
      boardId: asBoardId('brd_abcdefgh12345678'),
      shared: true,
      key: null,
      commentId: null,
    })
  })

  it('is dropped when it is the wrong shape, rather than sent on', () => {
    for (const bad of ['short', 'NOTHEX' + 'a'.repeat(26), 'a'.repeat(64)]) {
      expect(readRoute(`?room=brd_abcdefgh12345678&k=${bad}`)).toMatchObject({ key: null })
    }
  })

  it('is never attached to a local board', () => {
    expect(readRoute('?board=board_local&k=a1b2c3d4e5f60718293a4b5c6d7e8f90')).toMatchObject({
      shared: false,
      key: null,
    })
  })
})

/**
 * Which remark a notification is pointing at.
 *
 * A mention link used to be the plain share link, so following one reopened
 * the board with no thread open and no pin marked — the same thing clicking
 * the board in the list does, and no answer at all to "somebody mentioned you
 * HERE".
 */
describe('the comment a link points at', () => {
  const ID = '28ee4fc7-08f9-49a2-a591-c65200ecff19'

  it('is carried on a shared link', () => {
    expect(readRoute(`?room=brd_abcdefgh12345678&c=${ID}`).kind).toBe('board')
    expect(
      readRoute(`?room=brd_abcdefgh12345678&c=${ID}`),
    ).toMatchObject({ commentId: ID })
  })

  it('is carried on a local board too, which can also be commented on', () => {
    expect(readRoute(`?board=board_local&c=${ID}`)).toMatchObject({ commentId: ID })
  })

  it('is null when the link does not name one', () => {
    expect(readRoute('?room=brd_abcdefgh12345678')).toMatchObject({ commentId: null })
  })

  /**
   * Checked for SHAPE rather than for being a uuid: the client never
   * interprets the value, it hands it to a lookup and writes it back into the
   * address bar. What must not get through is anything carrying a path, a
   * script or a query of its own.
   */
  it('is dropped when it is not the shape of an id', () => {
    for (const bad of ['', '../../etc', '<script>', 'a'.repeat(200), 'two words', 'a&b=c']) {
      expect(
        readRoute(`?room=brd_abcdefgh12345678&c=${encodeURIComponent(bad)}`),
        bad,
      ).toMatchObject({ commentId: null })
    }
  })

  it('builds a link that reads back as the comment it named', () => {
    const link = commentLink(asBoardId('brd_abcdefgh12345678'), '', 'e'.repeat(32), ID)
    expect(readRoute(link.slice(1))).toMatchObject({
      boardId: asBoardId('brd_abcdefgh12345678'),
      key: 'e'.repeat(32),
      commentId: ID,
    })
  })

  /**
   * Sharing a BOARD and pointing at a REMARK are different acts. A share link
   * that quietly carried whichever thread happened to be open would be a
   * surprise in the one place this product asks people to trust a URL.
   */
  it('is never added by the ordinary share link', () => {
    expect(shareLink(asBoardId('brd_abcdefgh12345678'), '', 'e'.repeat(32))).not.toContain('&c=')
  })
})
