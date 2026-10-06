import { describe, expect, it } from 'vitest'

import {
  DAY_MS,
  LOCAL_RETENTION,
  MAX_INTERVAL_MS,
  ROOM_RETENTION,
  SETTLE_MS,
  nextThinningAt,
  versionDueAt,
  versionsToDrop,
  type VersionEntry,
} from './version-policy.js'

const MINUTE = 60_000
const T0 = Date.UTC(2026, 9, 6, 9, 0, 0)

describe('versionDueAt', () => {
  it('is never due on a board nobody has changed since its last version', () => {
    expect(versionDueAt({ dirtySince: null, lastEditAt: null, lastVersionAt: T0 })).toBeNull()
  })

  it('is due once editing has been quiet for the settle window', () => {
    const due = versionDueAt({
      dirtySince: T0,
      lastEditAt: T0 + MINUTE,
      lastVersionAt: null,
    })
    expect(due).toBe(T0 + MINUTE + SETTLE_MS)
  })

  it('does not wait for quiet past the interval while somebody keeps editing', () => {
    // Edits every few seconds for half an hour never settle; the cap is what
    // makes sure an hour of continuous work is not one version.
    const due = versionDueAt({
      dirtySince: T0,
      lastEditAt: T0 + 30 * MINUTE,
      lastVersionAt: null,
    })
    expect(due).toBe(T0 + MAX_INTERVAL_MS)
  })

  it('never takes two within the interval, however soon editing settles', () => {
    const due = versionDueAt({
      dirtySince: T0 + MINUTE,
      lastEditAt: T0 + MINUTE,
      lastVersionAt: T0,
    })
    expect(due).toBe(T0 + MAX_INTERVAL_MS)
  })

  it('counts the cap from the version, not the first edit, after a version', () => {
    // Dirty since long after the last version: settle decides.
    const due = versionDueAt({
      dirtySince: T0 + 60 * MINUTE,
      lastEditAt: T0 + 60 * MINUTE,
      lastVersionAt: T0,
    })
    expect(due).toBe(T0 + 60 * MINUTE + SETTLE_MS)
  })
})

function auto(at: number, id = `a${String(at)}`): VersionEntry {
  return { id, at, kind: 'auto' }
}

describe('versionsToDrop (room retention)', () => {
  const now = T0

  it('keeps every automatic version younger than thirty days', () => {
    const versions = [auto(now - MINUTE), auto(now - 2 * MINUTE), auto(now - 29 * DAY_MS)]
    expect(versionsToDrop(versions, now, ROOM_RETENTION)).toEqual([])
  })

  it('keeps one a day between thirty and ninety days: the last of that day', () => {
    const day = Math.floor((now - 40 * DAY_MS) / DAY_MS) * DAY_MS
    const morning = auto(day + 9 * 60 * MINUTE, 'morning')
    const noon = auto(day + 12 * 60 * MINUTE, 'noon')
    const evening = auto(day + 18 * 60 * MINUTE, 'evening')
    expect(versionsToDrop([noon, evening, morning], now, ROOM_RETENTION).sort()).toEqual([
      'morning',
      'noon',
    ])
  })

  it('drops automatic versions older than ninety days', () => {
    expect(versionsToDrop([auto(now - 91 * DAY_MS, 'old')], now, ROOM_RETENTION)).toEqual(['old'])
  })

  it('never drops a named version, however old', () => {
    const named: VersionEntry = { id: 'n', at: now - 400 * DAY_MS, kind: 'named', name: 'Kickoff' }
    expect(versionsToDrop([named], now, ROOM_RETENTION)).toEqual([])
  })

  it('does not let a named version stand in for the day it shares', () => {
    const day = Math.floor((now - 40 * DAY_MS) / DAY_MS) * DAY_MS
    const named: VersionEntry = { id: 'n', at: day + 20 * 60 * MINUTE, kind: 'named', name: 'x' }
    const autoOne = auto(day + 9 * 60 * MINUTE, 'a')
    expect(versionsToDrop([named, autoOne], now, ROOM_RETENTION)).toEqual([])
  })

  it('starts each band at its boundary', () => {
    // Exactly thirty days old is the daily band, alone in its day: kept.
    // Exactly ninety days old is gone.
    const atThirty = auto(now - 30 * DAY_MS, 'thirty')
    const atNinety = auto(now - 90 * DAY_MS, 'ninety')
    expect(versionsToDrop([atThirty, atNinety], now, ROOM_RETENTION)).toEqual(['ninety'])
  })
})

describe('versionsToDrop (local retention)', () => {
  it('keeps everything for fourteen days and nothing automatic after', () => {
    const now = T0
    const young = auto(now - 13 * DAY_MS, 'young')
    const old = auto(now - 15 * DAY_MS, 'old')
    const named: VersionEntry = { id: 'n', at: now - 60 * DAY_MS, kind: 'named', name: 'x' }
    expect(versionsToDrop([young, old, named], now, LOCAL_RETENTION)).toEqual(['old'])
  })
})

describe('nextThinningAt', () => {
  it('has nothing to wait for when only named versions are kept', () => {
    const named: VersionEntry = { id: 'n', at: T0, kind: 'named', name: 'x' }
    expect(nextThinningAt([named], T0, null, ROOM_RETENTION)).toBeNull()
  })

  it('is when the oldest automatic version next crosses a boundary', () => {
    const young = auto(T0 - DAY_MS)
    // Crosses into the daily band 29 days from now.
    expect(nextThinningAt([young], T0, null, ROOM_RETENTION)).toBe(T0 - DAY_MS + 30 * DAY_MS)
  })

  it('looks at the outer boundary for a version already in the daily band', () => {
    const daily = auto(T0 - 40 * DAY_MS)
    expect(nextThinningAt([daily], T0, null, ROOM_RETENTION)).toBe(T0 - 40 * DAY_MS + 90 * DAY_MS)
  })

  it('thins at most once a day, so a busy board does not wake for every version', () => {
    const versions = [auto(T0 - 30 * DAY_MS + MINUTE), auto(T0 - 30 * DAY_MS + 2 * MINUTE)]
    expect(nextThinningAt(versions, T0, T0 - MINUTE, ROOM_RETENTION)).toBe(T0 - MINUTE + DAY_MS)
  })

  it('is due now for a version already past a boundary', () => {
    const overdue = auto(T0 - 100 * DAY_MS)
    expect(nextThinningAt([overdue], T0, null, ROOM_RETENTION)).toBe(T0)
  })

  it('has nothing to wait for when the local band has one boundary', () => {
    expect(nextThinningAt([auto(T0)], T0, null, LOCAL_RETENTION)).toBe(T0 + 14 * DAY_MS)
  })
})
