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
      shared: true,
    })
  })

  it('opens a local board by id', () => {
    expect(readRoute('?board=board_local')).toEqual({
      kind: 'board',
      boardId: asBoardId('board_local'),
      shared: false,
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
      shared: true,
    })
  })
})

describe('writing a route', () => {
  it('round-trips a local board', () => {
    const id = newLocalBoardId()
    expect(readRoute(boardHref(id, false).slice(1))).toEqual({
      kind: 'board',
      boardId: id,
      shared: false,
    })
  })

  it('round-trips a shared board', () => {
    const href = boardHref(asBoardId('brd_abcdefgh12345678'), true)
    expect(href).toBe('/?room=brd_abcdefgh12345678')
    expect(readRoute(href.slice(1))).toEqual({
      kind: 'board',
      boardId: asBoardId('brd_abcdefgh12345678'),
      shared: true,
    })
  })

  it('mints local ids that do not collide', () => {
    const ids = new Set(Array.from({ length: 500 }, () => newLocalBoardId()))
    expect(ids.size).toBe(500)
  })
})
