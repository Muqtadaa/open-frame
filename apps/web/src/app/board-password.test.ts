import { asBoardId } from '@openframe/core'
import { beforeEach, describe, expect, it } from 'vitest'

import type { RemoteBoard } from '../runtime/services.js'
import {
  forgetToken,
  heldOwnerKey,
  heldToken,
  ownedKeys,
  recoverOwnerKey,
  rememberOwnerKey,
  setBoardPassword,
  unlockBoard,
  type PasswordDeps,
} from './board-password.js'
import { fakeRemoteBoards, fakeRooms } from './services.fake.js'

/**
 * A board's password, from this browser's side.
 *
 * Untested until the room became a port: every branch here was a raw `fetch`
 * that only a replaced global could answer. What matters is what is REMEMBERED
 * — a token after an unlock, an owner key once it exists — and what each
 * refusal says, because "wrong link" and "wrong password" must read the same.
 */

const BOARD = asBoardId('brd_abcdefgh12345678')

let rooms = fakeRooms()
let remote = fakeRemoteBoards()
const deps = (): PasswordDeps => ({ rooms, remoteBoards: remote })

const row = (extra: Partial<RemoteBoard> = {}): RemoteBoard => ({
  boardId: BOARD,
  title: 'Pricing',
  role: 'owner',
  accessKey: 'e'.repeat(32),
  viewKey: 'v'.repeat(32),
  ownerKey: 'o'.repeat(32),
  updatedAt: 0,
  pinned: false,
  openedAt: 0,
  workspaceId: 'ws',
  workspaceName: 'Mine',
  ...extra,
})

beforeEach(() => {
  rooms = fakeRooms()
  remote = fakeRemoteBoards()
  localStorage.clear()
})

describe('unlocking a board', () => {
  it('remembers the token the room hands back', async () => {
    rooms.unlock.mockResolvedValue({ ok: true, token: 'tok' })
    expect(await unlockBoard(deps(), BOARD, 'k', 'pw')).toEqual({ ok: true })
    expect(rooms.unlock).toHaveBeenCalledWith(BOARD, 'k', 'pw')
    expect(heldToken(BOARD)).toBe('tok')
  })

  /** Wrong link and wrong password read the same, so probing learns nothing. */
  it('says one thing for every refusal, and remembers nothing', async () => {
    rooms.unlock.mockResolvedValue({ ok: false, reason: 'refused' })
    expect(await unlockBoard(deps(), BOARD, 'k', 'pw')).toEqual({
      ok: false,
      reason: 'That is not the password.',
    })
    expect(heldToken(BOARD)).toBeNull()
  })

  it('says how long to wait, and not that the password was wrong, when rationed', async () => {
    rooms.unlock.mockResolvedValue({ ok: false, reason: 'throttled', retryAfterSeconds: 8 })
    expect(await unlockBoard(deps(), BOARD, 'k', 'pw')).toEqual({
      ok: false,
      reason: 'Too many attempts. Try again in 8 seconds.',
    })
  })

  it('tells an unreachable server and a garbled answer apart from a refusal', async () => {
    rooms.unlock.mockResolvedValue({ ok: false, reason: 'unreachable' })
    expect(await unlockBoard(deps(), BOARD, 'k', 'pw')).toMatchObject({
      reason: expect.stringMatching(/could not be reached/),
    })
    rooms.unlock.mockResolvedValue({ ok: false, reason: 'unreadable' })
    expect(await unlockBoard(deps(), BOARD, 'k', 'pw')).toMatchObject({
      reason: expect.stringMatching(/did not answer as expected/),
    })
  })
})

describe('setting a password', () => {
  it('asks the room with the owner key, and drops the stale token', async () => {
    localStorage.setItem(`openframe:unlock:${BOARD}`, 'old')
    const outcome = await setBoardPassword(deps(), BOARD, { owner: 'owner', editor: 'edit' }, 'pw')
    expect(outcome).toEqual({ ok: true })
    expect(rooms.setPassword).toHaveBeenCalledWith(BOARD, 'owner', 'pw')
    expect(rooms.adoptOwnerKey).not.toHaveBeenCalled()
    expect(heldToken(BOARD)).toBeNull()
  })

  it("passes on the room's reason, or a plain one when it gave none", async () => {
    rooms.setPassword.mockResolvedValue({ ok: false, reason: 'refused', message: 'Too short.' })
    expect(await setBoardPassword(deps(), BOARD, { owner: 'owner', editor: 'edit' }, 'pw')).toEqual(
      { ok: false, reason: 'Too short.' },
    )

    rooms.setPassword.mockResolvedValue({ ok: false, reason: 'refused', message: null })
    expect(await setBoardPassword(deps(), BOARD, { owner: 'owner', editor: 'edit' }, 'pw')).toEqual(
      { ok: false, reason: 'That could not be changed.' },
    )
  })

  /** Nothing changed on the server, so the token held here is still good. */
  it('keeps the token when the server could not be reached', async () => {
    localStorage.setItem(`openframe:unlock:${BOARD}`, 'still-good')
    rooms.setPassword.mockResolvedValue({ ok: false, reason: 'unreachable' })
    const outcome = await setBoardPassword(deps(), BOARD, { owner: 'owner', editor: 'edit' }, 'pw')
    expect(outcome.ok).toBe(false)
    expect(heldToken(BOARD)).toBe('still-good')
  })

  /**
   * A board claimed before owner keys existed adopts one, once — and only if
   * it can be WRITTEN DOWN, because the room mints a key exactly once.
   */
  it('adopts an owner key for an old board, records it, then uses it', async () => {
    rooms.adoptOwnerKey.mockResolvedValue('minted')
    const outcome = await setBoardPassword(deps(), BOARD, { owner: null, editor: 'edit' }, 'pw')
    expect(outcome).toEqual({ ok: true })
    expect(rooms.adoptOwnerKey).toHaveBeenCalledWith(BOARD, 'edit')
    expect(remote.recordOwnerKey).toHaveBeenCalledWith(BOARD, 'minted')
    expect(rooms.setPassword).toHaveBeenCalledWith(BOARD, 'minted', 'pw')
    expect(heldOwnerKey(BOARD)).toBe('minted')
  })

  /**
   * The room mints an owner key ONCE, and from then on refuses to hand it to
   * the edit link. So a key it has minted is kept in this browser before the
   * database is asked to record it: drop it because that write failed and the
   * board has an owner key nobody holds, for ever.
   */
  it('refuses, but keeps the key, when the owner key cannot be recorded', async () => {
    rooms.adoptOwnerKey.mockResolvedValue('minted')
    remote.recordOwnerKey.mockResolvedValue(false)
    expect(await setBoardPassword(deps(), BOARD, { owner: null, editor: 'edit' }, 'pw')).toEqual({
      ok: false,
      reason: 'This board could not be given an owner key.',
    })
    expect(rooms.setPassword).not.toHaveBeenCalled()
    expect(heldOwnerKey(BOARD)).toBe('minted')
  })
})

describe("an owner's keys", () => {
  it('uses the key cached on this browser without asking', async () => {
    rememberOwnerKey(BOARD, 'cached')
    expect(await recoverOwnerKey(deps(), BOARD)).toBe('cached')
    expect(remote.listMine).not.toHaveBeenCalled()
  })

  it("finds it in the account's boards, and remembers it", async () => {
    remote.listMine.mockResolvedValue([row()])
    expect(await recoverOwnerKey(deps(), BOARD)).toBe('o'.repeat(32))
    expect(heldOwnerKey(BOARD)).toBe('o'.repeat(32))
  })

  it('answers null for somebody who is not the owner, or with no network', async () => {
    remote.listMine.mockResolvedValue([row({ ownerKey: null, role: 'editor' })])
    expect(await recoverOwnerKey(deps(), BOARD)).toBeNull()
    remote.listMine.mockRejectedValue(new Error('offline'))
    expect(await recoverOwnerKey(deps(), BOARD)).toBeNull()
  })

  it('hands an owner both links and the owner key, and anybody else nothing', async () => {
    remote.listMine.mockResolvedValue([row()])
    expect(await ownedKeys(deps(), BOARD)).toEqual({
      edit: 'e'.repeat(32),
      view: 'v'.repeat(32),
      owner: 'o'.repeat(32),
    })
    remote.listMine.mockResolvedValue([row({ viewKey: null })])
    expect(await ownedKeys(deps(), BOARD)).toBeNull()
  })

  it('forgets a token on request', () => {
    localStorage.setItem(`openframe:unlock:${BOARD}`, 'tok')
    forgetToken(BOARD)
    expect(heldToken(BOARD)).toBeNull()
  })
})
