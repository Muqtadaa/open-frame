import type { Page } from '@playwright/test'

/**
 * A signed-in dashboard, without an account.
 *
 * The identity service is stubbed at the network rather than in the app: no
 * test hook is added to production code, the real components run, and the real
 * `listMyBoards` narrowing decides what reaches the list. What is faked is
 * exactly the thing this suite has no business reaching — somebody else's
 * server.
 *
 * `supabase-js` restores its session from `localStorage` before it makes any
 * request, so seeding that key is what makes the app believe it is signed in;
 * the routes then answer the calls it makes as a result.
 */

const REF = 'nayxpmxpornsjmmmedmh'

export interface StubbedBoard {
  readonly id: string
  readonly title: string
  readonly role: 'owner' | 'editor' | 'viewer'
  readonly pinned?: boolean
  readonly agoMs?: number
  /** Which workspace it sits in. Defaults to the person's own. */
  readonly workspaceId?: string
}

/** Something somebody said that named you, waiting on the front door. */
export interface StubbedMention {
  readonly commentId: string
  readonly boardId: string
  readonly boardTitle: string
  readonly authorName: string
  readonly body: string
}

/**
 * The double's memory, which two pages may SHARE.
 *
 * Each `signedIn` call routes one page, so by default two pages get two
 * independent servers — and a test where one person comments and the other
 * waits to see it would fail whatever the app did, because the comment was
 * never written anywhere the second page could read. Passing one of these to
 * both calls is what makes them the same board on the same server.
 */
export interface StubbedServer {
  readonly rows: BoardRow[]
  readonly workspaces: WorkspaceRow[]
  readonly comments: CommentRow[]
  readonly people: { user_id: string; display_name: string; hue: number }[]
  readonly mentions: StubbedMention[]
  readonly mentioned: string[]
  readonly read: string[]
}

/** A workspace, with the links only an admin is given. */
interface WorkspaceRow {
  id: string
  name: string
  personal: boolean
  role: 'admin' | 'editor' | 'viewer'
  editor_key: string | null
  viewer_key: string | null
  boards: number
}

export const PERSONAL_WORKSPACE = '00000000-0000-4000-8000-000000000010'
export const SHARED_WORKSPACE = '00000000-0000-4000-8000-000000000011'

interface BoardRow {
  id: string
  title: string
  role: string
  access_key: string
  view_key: string | null
  owner_key: string | null
  updated_at: string
  pinned: boolean
  opened_at: string
  /* Every board has a workspace, so every row the double invents has one. */
  workspace_id: string
  workspace_name: string
}

interface CommentRow {
  id: string
  parent_id: string | null
  author_id: string
  author_name: string
  author_hue: number
  body: string
  x: number | null
  y: number | null
  object_id: string | null
  resolved_at: string | null
  created_at: string
  /*
   * The anchor, which the double has to remember for the same reason it
   * remembers everything else: a stub that dropped it would answer every
   * comment as if it were anchored the old way, and a pin that does not ride
   * its element would look exactly like one that does.
   */
  fx: number | null
  fy: number | null
}

/** Who each stubbed person is. The second exists so two pages can differ. */
export const ALICE = '00000000-0000-4000-8000-000000000001'
export const BOB = '00000000-0000-4000-8000-000000000002'

export function stubbedServer(
  boards: readonly StubbedBoard[],
  displayName = 'Muqtadaa Miandara',
  mentions: readonly StubbedMention[] = [],
): StubbedServer {
  return {
    rows: boards.map((board) => {
      const when = new Date(Date.now() - (board.agoMs ?? 3_600_000)).toISOString()
      return {
        id: board.id,
        title: board.title,
        role: board.role,
        access_key: 'a'.repeat(32),
        // Only an owner gets the second key back, exactly as `my_boards()` does.
        view_key: board.role === 'owner' ? 'b'.repeat(32) : null,
        // And the third, which is not a link at all.
        owner_key: board.role === 'owner' ? 'd'.repeat(32) : null,
        updated_at: when,
        pinned: board.pinned ?? false,
        opened_at: when,
        workspace_id: board.workspaceId ?? PERSONAL_WORKSPACE,
        workspace_name:
          (board.workspaceId ?? PERSONAL_WORKSPACE) === PERSONAL_WORKSPACE
            ? displayName
            : 'Research',
      }
    }),
    workspaces: [
      {
        id: PERSONAL_WORKSPACE,
        name: displayName,
        personal: true,
        role: 'admin',
        // A personal workspace is never shared, so it has no links even for
        // its admin — which is what the interface reads to hide Invite.
        editor_key: null,
        viewer_key: null,
        boards: boards.filter((b) => (b.workspaceId ?? PERSONAL_WORKSPACE) === PERSONAL_WORKSPACE)
          .length,
      },
    ],
    comments: [],
    /*
     * Six, because the composer's hint now shows four and counts the rest —
     * a list that fits cannot tell a capped hint from an uncapped one.
     *
     * They are the board's WORKSPACE, not its members: `board_people` widened
     * to everybody in the workspace, which is the pool a mention always
     * wanted and the reason the composer no longer has to offer a link first.
     */
    people: [
      { user_id: ALICE, display_name: displayName, hue: 3 },
      { user_id: BOB, display_name: 'Rowan', hue: 1 },
      { user_id: '00000000-0000-4000-8000-000000000003', display_name: 'Wren', hue: 2 },
      { user_id: '00000000-0000-4000-8000-000000000004', display_name: 'Ash', hue: 4 },
      { user_id: '00000000-0000-4000-8000-000000000005', display_name: 'Juno', hue: 5 },
      { user_id: '00000000-0000-4000-8000-000000000006', display_name: 'Tam', hue: 0 },
    ],
    mentions: [...mentions],
    mentioned: [],
    read: [],
  }
}

export interface SignedInOptions {
  /** Mentions waiting for this person on the front door. */
  readonly mentions?: readonly StubbedMention[]
  /** Which stubbed person this page is. Defaults to `ALICE`. */
  readonly userId?: string
  /** An existing server, so this page sees what another page wrote. */
  readonly server?: StubbedServer
}

export async function signedIn(
  page: Page,
  boards: readonly StubbedBoard[],
  displayName = 'Muqtadaa Miandara',
  options: SignedInOptions = {},
): Promise<StubbedAccount> {
  const server = options.server ?? stubbedServer(boards, displayName, options.mentions)
  const me = options.userId ?? ALICE
  const myHue = server.people.find((person) => person.user_id === me)?.hue ?? 3
  /*
   * `record_shared_board` WRITES, so the double has to remember it. A stub
   * that answered `my_boards` from a fixed list would report an empty account
   * one line after the app recorded a board into it, and the test would then
   * be asserting against the double rather than against the app.
   *
   * All of that memory lives on `server`, which a second page may be handed —
   * that is what makes two windows the same board rather than two boards that
   * happen to share an id.
   */
  const { rows, comments, people, mentioned, read } = server

  await page.route(`**/${REF}.supabase.co/**`, (route) => {
    const url = route.request().url()
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (url.includes('rpc/record_shared_board')) {
      const body = route.request().postDataJSON() as {
        p_id?: string
        p_title?: string
        p_workspace_id?: string | null
      }
      const when = new Date().toISOString()
      /*
       * A recorded board lands in a workspace, because every board does. The
       * double left this off at first and the app dropped the row on the way
       * back in — a board that had just been shared vanished from the list,
       * which is exactly the bug this test exists to catch, arriving from the
       * wrong direction.
       */
      const home = body.p_workspace_id ?? PERSONAL_WORKSPACE
      rows.push({
        id: body.p_id ?? '',
        title: body.p_title ?? '',
        role: 'owner',
        access_key: 'a'.repeat(32),
        view_key: 'b'.repeat(32),
        owner_key: 'd'.repeat(32),
        updated_at: when,
        pinned: false,
        opened_at: when,
        workspace_id: home,
        workspace_name: home === PERSONAL_WORKSPACE ? displayName : 'Research',
      })
      return json({})
    }

    /*
     * COMMENTS, remembered for the same reason boards are: the app posts one
     * and immediately re-reads the list, so a double answering from a fixed
     * fixture would show an empty board one line after something was written
     * into it — and the test would be asserting against the double.
     */
    if (url.includes('rpc/board_comments_for')) return json(comments)

    if (url.includes('rpc/post_comment')) {
      const body = route.request().postDataJSON() as {
        p_body?: string
        p_parent_id?: string | null
        p_x?: number | null
        p_y?: number | null
        p_object_id?: string | null
        p_mentions?: string[]
        p_fx?: number | null
        p_fy?: number | null
      }
      const id = `cmt_${String(comments.length + 1)}`
      mentioned.push(...(body.p_mentions ?? []))
      comments.push({
        id,
        parent_id: body.p_parent_id ?? null,
        author_id: me,
        author_name: displayName,
        author_hue: myHue,
        body: body.p_body ?? '',
        x: body.p_x ?? null,
        y: body.p_y ?? null,
        object_id: body.p_object_id ?? null,
        resolved_at: null,
        created_at: new Date().toISOString(),
        fx: body.p_fx ?? null,
        fy: body.p_fy ?? null,
      })
      return json(id)
    }

    if (url.includes('rpc/resolve_comment')) {
      const body = route.request().postDataJSON() as { p_id?: string; p_resolved?: boolean }
      for (const comment of comments) {
        if (comment.id === body.p_id) {
          comment.resolved_at = body.p_resolved === true ? new Date().toISOString() : null
        }
      }
      return json(true)
    }

    if (url.includes('rpc/board_people')) return json(people)

    /*
     * `markMentionsRead` is a PATCH on the table rather than an RPC, so it
     * would otherwise fall through to the catch-all and look identical to
     * never having been sent. Reading a notification is the whole point of
     * one; a test has to be able to see it happen.
     */
    if (url.includes('/comment_mentions')) {
      const body = route.request().postDataJSON() as { read_at?: string } | null
      if (route.request().method() === 'PATCH' && typeof body?.read_at === 'string') {
        // Decoded first: PostgREST sends `in.%28a,b%29`, so a pattern written
        // against the readable `in.(a,b)` matches nothing and the test then
        // reports a notification that was never read as one that was.
        const match = /comment_id=in\.\(([^)]*)\)/.exec(decodeURIComponent(url))
        for (const id of (match?.[1] ?? '').split(',')) {
          if (id !== '') read.push(id.replace(/^"|"$/g, ''))
        }
      }
      return json({})
    }

    if (url.includes('rpc/my_mentions')) {
      /*
       * Read ones come back too, carrying `read_at`. The function used to
       * filter them out, which made following a notification the last time it
       * could ever be found — so a double that still dropped them would let
       * that bug back in without failing anything.
       */
      return json(
        server.mentions.map((mention) => ({
          comment_id: mention.commentId,
          board_id: mention.boardId,
          board_title: mention.boardTitle,
          author_name: mention.authorName,
          body: mention.body,
          created_at: new Date().toISOString(),
          read_at: read.includes(mention.commentId) ? new Date().toISOString() : null,
        })),
      )
    }

    /*
     * WORKSPACES, remembered like everything else: the app creates one and
     * immediately re-reads the list, so a fixed fixture would show it missing
     * one line after it was made.
     */
    if (url.includes('rpc/my_workspaces')) return json(server.workspaces)

    if (url.includes('rpc/create_workspace')) {
      const body = route.request().postDataJSON() as { p_name?: string }
      server.workspaces.push({
        id: SHARED_WORKSPACE,
        name: body.p_name ?? 'Untitled',
        personal: false,
        role: 'admin',
        editor_key: null,
        viewer_key: null,
        boards: 0,
      })
      return json(SHARED_WORKSPACE)
    }

    if (url.includes('rpc/share_workspace')) {
      const body = route.request().postDataJSON() as { p_id?: string }
      const workspace = server.workspaces.find((w) => w.id === body.p_id)
      if (workspace === undefined) return json([])
      // Minted once and then stable, exactly as the database does it: a second
      // share must not rotate a link already sent to somebody.
      workspace.editor_key ??= 'e'.repeat(32)
      workspace.viewer_key ??= 'f'.repeat(32)
      return json([{ editor_key: workspace.editor_key, viewer_key: workspace.viewer_key }])
    }

    /*
     * Joining does NOT require the workspace to be in your list already — the
     * whole point of an invitation is that it is for one you are not in yet.
     * The double had that backwards, which made the redeeming test fail for a
     * reason that had nothing to do with the app.
     *
     * On success it appears in the list, which is what really happens.
     */
    if (url.includes('rpc/join_workspace')) {
      const body = route.request().postDataJSON() as { p_id?: string; p_key?: string }
      const role =
        body.p_key === 'e'.repeat(32) ? 'editor' : body.p_key === 'f'.repeat(32) ? 'viewer' : null
      if (role === null || body.p_id === undefined) return json(null)

      const held = server.workspaces.find((w) => w.id === body.p_id)
      if (held === undefined) {
        server.workspaces.push({
          id: body.p_id,
          name: 'Research',
          personal: false,
          role,
          editor_key: null,
          viewer_key: null,
          boards: 0,
        })
      }
      return json(role)
    }

    if (url.includes('rpc/my_boards')) return json(rows)
    if (url.includes('/profiles')) return json({ display_name: displayName, hue: myHue })
    return json({})
  })

  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  await page.addInitScript(
    ([ref, name, exp, uid]) => {
      window.localStorage.setItem('openframe:splash-hold', 'off')
      window.localStorage.setItem(
        `sb-${String(ref)}-auth-token`,
        JSON.stringify({
          access_token: 'stub',
          refresh_token: 'stub',
          token_type: 'bearer',
          expires_in: 3600,
          expires_at: exp,
          user: {
            id: String(uid),
            email: `${String(name)}@example.test`,
            aud: 'authenticated',
            role: 'authenticated',
            app_metadata: {},
            user_metadata: {},
            created_at: new Date().toISOString(),
          },
        }),
      )
    },
    [REF, 'someone', expiresAt, me] as const,
  )

  return {
    mentioned,
    read,
    server,
    people: people.map((person) => person.display_name),
  }
}

/**
 * What the double recorded, for a test to assert against.
 *
 * `mentioned` in particular: a mention is a notification, and a notification
 * that was never sent looks exactly like one that was, from the outside. The
 * only way to tell is to ask what reached the server.
 */
export interface StubbedAccount {
  readonly mentioned: readonly string[]
  /** Mentions this browser marked read, for the same reason. */
  readonly read: readonly string[]
  /** Pass to a second `signedIn` so both pages share one server. */
  readonly server: StubbedServer
  readonly people: readonly string[]
}
