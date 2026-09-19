import { asBoardId } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { boardHref, newLocalBoardId, readRoute } from './route.js'

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
      shared: true, key: null,
    })
  })

  it('opens a local board by id', () => {
    expect(readRoute('?board=board_local')).toEqual({
      kind: 'board',
      boardId: asBoardId('board_local'),
      shared: false, key: null,
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
      shared: true, key: null,
    })
  })
})

describe('writing a route', () => {
  it('round-trips a local board', () => {
    const id = newLocalBoardId()
    expect(readRoute(boardHref(id, false).slice(1))).toEqual({
      kind: 'board',
      boardId: id,
      shared: false, key: null,
    })
  })

  it('round-trips a shared board', () => {
    const href = boardHref(asBoardId('brd_abcdefgh12345678'), true)
    expect(href).toBe('/?room=brd_abcdefgh12345678')
    expect(readRoute(href.slice(1))).toEqual({
      kind: 'board',
      boardId: asBoardId('brd_abcdefgh12345678'),
      shared: true, key: null,
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
