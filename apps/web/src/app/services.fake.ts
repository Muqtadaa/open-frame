import type { Catalogue } from '@openframe/core/facilitation'
import { vi } from 'vitest'

import type {
  AccountService,
  AiService,
  ClusterOutcome,
  Identity,
  MusicService,
  RemoteBoardService,
  RoomService,
} from '../runtime/services.js'

/*
 * Fakes for the ports, for tests. Each method is a `vi.fn` with a sensible
 * default — the room claims, the account is signed in, the database agrees —
 * so a test states only the one answer it is about.
 *
 * These replace `vi.mock` of modules and `vi.stubGlobal('fetch')`: a use case
 * is handed its dependencies now, so a test hands it these.
 */

export const SOMEBODY: Identity = {
  userId: 'u1',
  email: 'someone@example.test',
  displayName: 'Someone',
  hue: 0,
  accessToken: 't',
}

export function fakeRooms() {
  return {
    claim: vi.fn<RoomService['claim']>(() =>
      Promise.resolve({ ok: true, keys: { editor: 'e'.repeat(32), viewer: 'v'.repeat(32) } }),
    ),
    adoptOwnerKey: vi.fn<RoomService['adoptOwnerKey']>(() => Promise.resolve('o'.repeat(32))),
    unlock: vi.fn<RoomService['unlock']>(() => Promise.resolve({ ok: true, token: 'token' })),
    setPassword: vi.fn<RoomService['setPassword']>(() => Promise.resolve({ ok: true })),
    destroy: vi.fn<RoomService['destroy']>(() => Promise.resolve('destroyed')),
    hasPassword: vi.fn<RoomService['hasPassword']>(() => Promise.resolve(false)),
  } satisfies RoomService
}

export function fakeAccounts(identity: Identity | null = SOMEBODY) {
  return {
    enabled: true,
    current: vi.fn<AccountService['current']>(() => Promise.resolve(identity)),
    onChange: vi.fn<AccountService['onChange']>(() => () => undefined),
    signIn: vi.fn<AccountService['signIn']>(() => Promise.resolve({ ok: true })),
    signUp: vi.fn<AccountService['signUp']>(() => Promise.resolve({ ok: true })),
    signOut: vi.fn<AccountService['signOut']>(() => Promise.resolve()),
  } satisfies AccountService
}

export function fakeRemoteBoards() {
  return {
    listMine: vi.fn<RemoteBoardService['listMine']>(() => Promise.resolve([])),
    recordShared: vi.fn<RemoteBoardService['recordShared']>(() => Promise.resolve(true)),
    recordOwnerKey: vi.fn<RemoteBoardService['recordOwnerKey']>(() => Promise.resolve(true)),
    join: vi.fn<RemoteBoardService['join']>(() => Promise.resolve(null)),
    setPinned: vi.fn<RemoteBoardService['setPinned']>(() => Promise.resolve(true)),
    touchOpened: vi.fn<RemoteBoardService['touchOpened']>(() => Promise.resolve()),
    remove: vi.fn<RemoteBoardService['remove']>(() => Promise.resolve(true)),
    leave: vi.fn<RemoteBoardService['leave']>(() => Promise.resolve(true)),
    rename: vi.fn<RemoteBoardService['rename']>(() => Promise.resolve(true)),
  } satisfies RemoteBoardService
}

/** A music library holding the given catalogue, for a test that needs one. */
export function fakeMusic(catalogue: Catalogue | null = null): MusicService {
  return {
    catalogue: vi.fn(() => Promise.resolve(catalogue)),
    trackUrl: (trackId: string) => `https://rooms.test/music/track/${trackId}`,
  }
}

/** An AI that answers with the given outcome, for a test that needs one. */
export function fakeAi(outcome: ClusterOutcome = { kind: 'refused', why: 'unconfigured' }) {
  return {
    enabled: true,
    cluster: vi.fn<AiService['cluster']>(() => Promise.resolve(outcome)),
  } satisfies AiService
}
