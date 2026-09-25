import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { asBoardId } from '@openframe/core'
import { describe, expect, it, vi } from 'vitest'

import { SUPABASE_URL } from '../project.js'
import { readSession, sessionPath, writeSession } from '../session-store.js'
import { resume, signIn, signOut, SignInError } from './account.js'
import type { AuthClient } from './client.js'

/**
 * Signing in as the person, and what is kept afterwards.
 *
 * The client is a fake and the filesystem is real: what these are about is the
 * credential — where it goes, what replaces it, and what is never sent — and a
 * mocked `fs` could not get any of that wrong.
 */

function somewhere(): NodeJS.ProcessEnv {
  const root = mkdtempSync(join(tmpdir(), 'openframe-account-'))
  return { XDG_CONFIG_HOME: root, HOME: join(root, 'home') }
}

const ACCESS_TOKEN = 'access-token-that-expires-in-an-hour'
const REFRESH_TOKEN = 'refresh-token-the-first'

function sessionOf(refresh: string) {
  return {
    access_token: ACCESS_TOKEN,
    refresh_token: refresh,
    user: { id: 'user-1', email: 'someone@example.com' },
  }
}

const GOOD_ROW = {
  id: 'brd_abcdefgh12345678',
  title: 'Pricing research',
  role: 'editor',
  access_key: 'a'.repeat(32),
}

/** Everything the account module asks a client for, and nothing else. */
function fakeClient(answers: {
  signIn?: { data: unknown; error: unknown }
  refresh?: { data: unknown; error: unknown }
  rows?: unknown
} = {}) {
  let changed: ((event: string, session: unknown) => void) | null = null
  const signInWithPassword = vi.fn(() =>
    Promise.resolve(answers.signIn ?? { data: { session: sessionOf(REFRESH_TOKEN) }, error: null }),
  )
  const refreshSession = vi.fn(() =>
    Promise.resolve(
      answers.refresh ?? { data: { session: sessionOf('refresh-token-the-second') }, error: null },
    ),
  )
  const rpc = vi.fn(() => Promise.resolve({ data: answers.rows ?? [GOOD_ROW], error: null }))

  const client = {
    auth: {
      signInWithPassword,
      refreshSession,
      signOut: vi.fn(() => Promise.resolve({ error: null })),
      onAuthStateChange: (listener: (event: string, session: unknown) => void) => {
        changed = listener
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => Promise.resolve({ data: { display_name: 'Someone' } }) }),
      }),
    }),
    rpc,
  }

  return {
    client: client as unknown as AuthClient,
    signInWithPassword,
    refreshSession,
    rpc,
    /** As the client does by itself, on a timer, for as long as this runs. */
    refreshInTheBackground: (token: string) => {
      changed?.('TOKEN_REFRESHED', sessionOf(token))
    },
  }
}

describe('signing in', () => {
  it('keeps the refresh token and never the access token', async () => {
    const env = somewhere()
    const fake = fakeClient()

    await signIn('someone@example.com', 'a password', { client: fake.client, env })

    expect(readSession(env)?.refreshToken).toBe(REFRESH_TOKEN)
    /*
     * The access token lasts an hour, so a copy in the file is stale long
     * before anything reads it — and it is a bearer credential sitting on disk
     * for no gain.
     */
    expect(readFileSync(sessionPath(env), 'utf8')).not.toContain(ACCESS_TOKEN)
  })

  /**
   * The provider's own wording tells whoever reads the scrollback whether an
   * address has an account here. A terminal is a worse place for that than a
   * form, because the answer stays on screen.
   */
  it('says nothing about whether the account exists', async () => {
    const env = somewhere()
    const fake = fakeClient({
      signIn: { data: { session: null }, error: { message: 'Invalid login credentials' } },
    })

    await expect(
      signIn('someone@example.com', 'wrong', { client: fake.client, env }),
    ).rejects.toBeInstanceOf(SignInError)
    await expect(
      signIn('someone@example.com', 'wrong', { client: fake.client, env }),
    ).rejects.toThrow(/do not match an account/)
    expect(readSession(env)).toBeNull()
  })

  /**
   * A refusal that never reached the service.
   *
   * Found for real: a proxy that will not resolve the host answers with HTML,
   * the library tries to parse it and throws about JSON, and the first version
   * of this mapping reported it as a wrong password — sending somebody to
   * check a credential that was never consulted.
   */
  it('says the service could not be reached when the answer was not from it', async () => {
    const env = somewhere()
    const blocked = fakeClient({
      signIn: {
        data: { session: null },
        error: { message: `Unexpected token 'H', "Host not i"... is not valid JSON` },
      },
    })

    await expect(
      signIn('someone@example.com', 'a password', { client: blocked.client, env }),
    ).rejects.toThrow(/could not reach the sign-in service/i)
  })
})

describe('resuming a session', () => {
  it('writes back the token the service rotated to', async () => {
    const env = somewhere()
    writeSession(
      { project: SUPABASE_URL, userId: 'user-1', email: 'someone@example.com', refreshToken: REFRESH_TOKEN },
      env,
    )
    const fake = fakeClient()

    const signedIn = await resume({ client: fake.client, env })

    expect(signedIn).not.toBeNull()
    expect(fake.refreshSession).toHaveBeenCalledWith({ refresh_token: REFRESH_TOKEN })
    // Rotated on use: keeping the old one means the next start signs in from
    // nothing, having done everything right.
    expect(readSession(env)?.refreshToken).toBe('refresh-token-the-second')
  })

  /** The client refreshes by itself while the process runs, and rotates again. */
  it('follows a refresh that happens while it is running', async () => {
    const env = somewhere()
    const fake = fakeClient()
    await signIn('someone@example.com', 'a password', { client: fake.client, env })

    fake.refreshInTheBackground('refresh-token-the-third')

    expect(readSession(env)?.refreshToken).toBe('refresh-token-the-third')
  })

  /**
   * A token issued by another deployment is not sent anywhere — not merely
   * refused. Refresh tokens carry no note of where they came from, so asking
   * a service that never issued one is handing a credential to somebody with
   * no business holding it, for an answer that was going to be "no" regardless.
   */
  it('never offers a token to a project that did not issue it', async () => {
    const env = somewhere()
    writeSession(
      { project: 'https://somewhere-else.supabase.co', userId: 'user-1', email: null, refreshToken: REFRESH_TOKEN },
      env,
    )
    const fake = fakeClient()

    expect(await resume({ client: fake.client, env })).toBeNull()
    expect(fake.refreshSession).not.toHaveBeenCalled()
  })

  it('is signed out when the token has been revoked', async () => {
    const env = somewhere()
    writeSession(
      { project: SUPABASE_URL, userId: 'user-1', email: null, refreshToken: REFRESH_TOKEN },
      env,
    )
    const fake = fakeClient({ refresh: { data: { session: null }, error: { message: 'refused' } } })

    expect(await resume({ client: fake.client, env })).toBeNull()
  })

  it('is signed out when nobody ever signed in', async () => {
    expect(await resume({ client: fakeClient().client, env: somewhere() })).toBeNull()
  })
})

describe('the boards behind an account', () => {
  it('asks the database function, and keeps the key it hands back', async () => {
    const env = somewhere()
    const fake = fakeClient()
    const signedIn = await signIn('someone@example.com', 'a password', { client: fake.client, env })

    const boards = await signedIn.boards()

    expect(fake.rpc).toHaveBeenCalledWith('my_boards')
    expect(boards).toEqual([
      {
        boardId: asBoardId('brd_abcdefgh12345678'),
        title: 'Pricing research',
        role: 'editor',
        accessKey: 'a'.repeat(32),
      },
    ])
  })

  it('drops a row this version cannot read rather than answering with a broken board', async () => {
    const env = somewhere()
    const fake = fakeClient({
      rows: [{ title: 'No id at all', role: 'owner' }, { ...GOOD_ROW, role: 'archivist' }, GOOD_ROW],
    })
    const signedIn = await signIn('someone@example.com', 'a password', { client: fake.client, env })

    expect(await signedIn.boards()).toHaveLength(1)
  })

  it('answers for one board the same way it would for none', async () => {
    const env = somewhere()
    const fake = fakeClient()
    const signedIn = await signIn('someone@example.com', 'a password', { client: fake.client, env })

    expect(await signedIn.board(asBoardId('brd_abcdefgh12345678'))).not.toBeNull()
    expect(await signedIn.board(asBoardId('brd_somebodyelses123'))).toBeNull()
  })
})

describe('signing out', () => {
  /**
   * The file goes first and whatever the service says. A revocation that
   * failed because the network was down must not leave a refresh token on
   * disk that the person believes they have removed.
   */
  it('takes the token off the machine even when the service cannot be reached', async () => {
    const env = somewhere()
    writeSession(
      { project: SUPABASE_URL, userId: 'user-1', email: null, refreshToken: REFRESH_TOKEN },
      env,
    )
    const fake = fakeClient()
    fake.refreshSession.mockImplementation(() => Promise.reject(new Error('offline')))

    await signOut({ client: fake.client, env })

    expect(readSession(env)).toBeNull()
  })
})
