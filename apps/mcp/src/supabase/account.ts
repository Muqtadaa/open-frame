import { asBoardId, type BoardId } from '@openframe/core'
import { SUPABASE_URL } from '../project.js'
import { clearSession, readSession, writeSession } from '../session-store.js'
import { createAuthClient, type AuthClient } from './client.js'

/**
 * Who this server is acting as, and which boards that entitles it to.
 *
 * Signed in as the PERSON, through the same service their browser signs into.
 * Not a key pasted into a config and not a token type of its own: the room
 * authorizes by key and has never heard of Supabase, so the web app reads the
 * board row — key included — through row-level security and connects with
 * what it finds. This does exactly the same thing, which is why `apps/rooms`
 * did not change to make an agent a participant.
 *
 * What that buys is the sentence the phase is built on: **the agent's reach is
 * precisely the set of boards row-level security says that person may reach.**
 * Revoking their access revokes the agent, with nothing to remember to do.
 */

export interface Account {
  readonly userId: string
  readonly email: string | null
  readonly displayName: string
}

/** One board this person may open, and the key that opens it for their role. */
export interface BoardAccess {
  readonly boardId: BoardId
  readonly title: string
  readonly role: 'owner' | 'editor' | 'viewer'
  /**
   * `null` for a board shared before roles existed, whose room takes no key.
   *
   * Never printed, never logged, never put in a tool response. It is the whole
   * of a link's authority.
   */
  readonly accessKey: string | null
}

export interface NewComment {
  readonly boardId: BoardId
  readonly body: string
  /** Where the pin goes, in board coordinates. */
  readonly at?: { readonly x: number; readonly y: number } | undefined
  /** What it is about, if it is about an object. */
  readonly objectId?: string | undefined
  /** Where on that object, as a fraction of its box. */
  readonly on?: { readonly fx: number; readonly fy: number } | undefined
}

export interface SignedIn {
  readonly account: Account
  /** Every board this person may reach, as the database computes it. */
  boards(): Promise<readonly BoardAccess[]>
  /** One of them, or `null` — which is the same answer as "there is no such board". */
  board(id: BoardId): Promise<BoardAccess | null>
  /**
   * Says something on a board. The comment's id, or `null` if it was refused.
   *
   * NOT through the dispatcher, and that is not an exception to rule 3: a
   * remark is not part of the document. A comment in the CRDT would be in
   * undo, in export, in search and in the registry — so comments live in the
   * database, and what crosses the room is only a nudge saying there is
   * something new.
   */
  comment(comment: NewComment): Promise<string | null>
  close(): void
}

export interface AccountDeps {
  /** Injected by tests. Everything else gets the one real client. */
  readonly client?: AuthClient
  readonly env?: NodeJS.ProcessEnv
}

/** Sign-in failed, with a message written for the person who hit it. */
export class SignInError extends Error {}

/**
 * The provider's own wording says things a terminal should not.
 *
 * "Invalid login credentials" and "User already registered" tell whoever is
 * watching whether an address has an account here, and a CLI's output is a
 * scrollback buffer somebody else can read. One message covers both halves of
 * a wrong sign-in, the same way the web app's does — written out again rather
 * than imported, because `apps/mcp` may not reach into the web app and because
 * a terminal and a form do not need the same words.
 */
function readable(message: string): string {
  const text = message.toLowerCase()
  /*
   * Unreachable FIRST, and it earns the place twice over.
   *
   * The web app learned this once — its fallback answered "something went
   * wrong signing in" when the service could not be reached at all, which
   * sends somebody to check a password that was never the problem. This one
   * learned it again in a different disguise: a proxy that refuses the host
   * answers with HTML, so the library throws `Unexpected token 'H', "Host not
   * i"... is not valid JSON` and nothing about that says "network". Anything
   * that is not JSON is not an answer from the service.
   */
  if (
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('fetch') ||
    text.includes('is not valid json') ||
    text.includes('unexpected token')
  ) {
    return 'Could not reach the sign-in service. Check your connection and try again.'
  }
  if (text.includes('invalid login') || text.includes('credentials')) {
    return 'That email and password do not match an account.'
  }
  if (text.includes('email not confirmed')) {
    return 'That account has not confirmed its email address yet.'
  }
  return 'Could not sign in. Try again in a moment.'
}

const BOARD_ID = /^brd_[A-Za-z0-9]{8,48}$/
const ACCESS_KEY = /^[0-9a-f]{32}$/
const ROLES = new Set(['owner', 'editor', 'viewer'])

/**
 * Narrowed at the boundary, because this is one (rule 8).
 *
 * A narrower read than the web app's of the same `my_boards()` rows: a tool
 * needs a board's id, its name and the key that opens it, and has nothing to
 * do with pins, workspaces or when somebody last looked at it. A row this
 * version does not recognise is dropped — a board briefly missing from a list
 * is recoverable, and a board with no id is not a board.
 */
function readBoard(row: unknown): BoardAccess | null {
  if (typeof row !== 'object' || row === null) return null
  const {
    id,
    title,
    role,
    access_key: key,
  } = row as { id?: unknown; title?: unknown; role?: unknown; access_key?: unknown }

  if (typeof id !== 'string' || !BOARD_ID.test(id)) return null
  if (typeof role !== 'string' || !ROLES.has(role)) return null
  return {
    boardId: asBoardId(id),
    title: typeof title === 'string' && title !== '' ? title : 'Untitled board',
    role: role as BoardAccess['role'],
    accessKey: typeof key === 'string' && ACCESS_KEY.test(key) ? key : null,
  }
}

async function displayNameOf(
  client: AuthClient,
  userId: string,
  email: string | null,
): Promise<string> {
  const fallback = email?.split('@')[0] ?? 'Someone'
  const { data } = await client
    .from('profiles')
    .select('display_name')
    .eq('id', userId)
    .maybeSingle()
  const row = data as { display_name?: unknown } | null
  // A missing profile is not an error: the trigger creates one, and a row can
  // be absent for a few milliseconds after sign-up.
  return typeof row?.display_name === 'string' && row.display_name !== ''
    ? row.display_name
    : fallback
}

function handle(
  client: AuthClient,
  account: Account,
  detach: () => void,
): SignedIn {
  const list = async (): Promise<readonly BoardAccess[]> => {
    /*
     * The rows come back through a database function rather than a table read,
     * because a board's access keys are revoked at the COLUMN level: no client
     * can select them, and `my_boards()` is the one door that hands back the
     * key a person's role entitles them to.
     */
    const response = (await client.rpc('my_boards')) as { data: unknown; error: unknown }
    if (response.error !== null || !Array.isArray(response.data)) return []

    const boards: BoardAccess[] = []
    for (const row of response.data as readonly unknown[]) {
      const board = readBoard(row)
      if (board !== null) boards.push(board)
    }
    return boards
  }

  return {
    account,
    boards: list,
    async board(id) {
      return (await list()).find((candidate) => candidate.boardId === id) ?? null
    },
    async comment(comment) {
      /*
       * The same database function the web app's composer calls. Who may say
       * something on which board is decided there, by the same policy, for
       * an agent as for a person — and a viewer may comment, which is what
       * `readOnlyCapabilities` has always said.
       */
      const response = (await client.rpc('post_comment', {
        p_board_id: comment.boardId,
        p_body: comment.body,
        p_parent_id: null,
        p_x: comment.at?.x ?? null,
        p_y: comment.at?.y ?? null,
        p_object_id: comment.objectId ?? null,
        p_mentions: [],
        p_fx: comment.on?.fx ?? null,
        p_fy: comment.on?.fy ?? null,
      })) as { data: unknown; error: unknown }
      return response.error === null && typeof response.data === 'string' ? response.data : null
    },
    close: detach,
  }
}

/**
 * Keeps the stored token current.
 *
 * Supabase rotates a refresh token every time it is used, so the one in the
 * file is spent the moment the session refreshes — which it does by itself,
 * on a timer, for as long as this process runs. Left unwritten, a server that
 * had been up for an hour would leave behind a token that signs nobody in, and
 * the next start would report the person as signed out for no visible reason.
 */
function keepStored(
  client: AuthClient,
  userId: string,
  email: string | null,
  env: NodeJS.ProcessEnv,
): () => void {
  const { data } = client.auth.onAuthStateChange((_event, session) => {
    if (session === null || session.refresh_token === '') return
    writeSession(
      { project: SUPABASE_URL, userId, email, refreshToken: session.refresh_token },
      env,
    )
  })
  return () => {
    data.subscription.unsubscribe()
  }
}

/** Signs in and remembers it, or throws something a person can act on. */
export async function signIn(
  email: string,
  password: string,
  deps: AccountDeps = {},
): Promise<SignedIn> {
  const client = deps.client ?? createAuthClient()
  const env = deps.env ?? process.env

  const { data, error } = await client.auth.signInWithPassword({ email, password })
  if (error !== null) throw new SignInError(readable(error.message))

  const session = data.session
  if (session === null) throw new SignInError('Could not sign in. Try again in a moment.')

  const userId = session.user.id
  const address = session.user.email ?? null
  writeSession(
    { project: SUPABASE_URL, userId, email: address, refreshToken: session.refresh_token },
    env,
  )
  const detach = keepStored(client, userId, address, env)

  return handle(client, { userId, email: address, displayName: await displayNameOf(client, userId, address) }, detach)
}

/**
 * The session from last time, or `null` for signed out.
 *
 * `null` is a FIRST-CLASS answer rather than an error: not being signed in is
 * the state every machine starts in, and a tool that threw would make "you
 * have not signed in yet" indistinguishable from a service that is down.
 */
export async function resume(deps: AccountDeps = {}): Promise<SignedIn | null> {
  const env = deps.env ?? process.env
  const stored = readSession(env)
  if (stored === null) return null

  /*
   * A token from another project is not sent anywhere. Refresh tokens do not
   * say where they came from, so handing this one to a service that never
   * issued it would leak a credential to a deployment it has no business
   * reaching — and get "signed out" back either way.
   */
  if (stored.project !== SUPABASE_URL) return null

  const client = deps.client ?? createAuthClient()
  const { data, error } = await client.auth.refreshSession({
    refresh_token: stored.refreshToken,
  })
  const session = data.session ?? null
  // Expired, revoked, or the account is gone. All of them mean signed out.
  if (error !== null || session === null) return null

  const userId = session.user.id
  const address = session.user.email ?? stored.email
  writeSession({ project: SUPABASE_URL, userId, email: address, refreshToken: session.refresh_token }, env)
  const detach = keepStored(client, userId, address, env)

  return handle(client, { userId, email: address, displayName: await displayNameOf(client, userId, address) }, detach)
}

/**
 * Signs out on this machine.
 *
 * The file goes FIRST and whatever the service says. A revocation that failed
 * because the network was down must not leave a refresh token on disk that the
 * person believes they have removed.
 */
export async function signOut(deps: AccountDeps = {}): Promise<void> {
  const env = deps.env ?? process.env
  const stored = readSession(env)
  clearSession(env)
  if (stored === null) return

  try {
    const client = deps.client ?? createAuthClient()
    await client.auth.refreshSession({ refresh_token: stored.refreshToken })
    await client.auth.signOut()
  } catch {
    // Best effort: the token is off this machine either way, and it expires.
  }
}
