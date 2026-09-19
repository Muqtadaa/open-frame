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
}

/** Something somebody said that named you, waiting on the front door. */
export interface StubbedMention {
  readonly commentId: string
  readonly boardId: string
  readonly boardTitle: string
  readonly authorName: string
  readonly body: string
}

export async function signedIn(
  page: Page,
  boards: readonly StubbedBoard[],
  displayName = 'Muqtadaa Miandara',
  mentions: readonly StubbedMention[] = [],
): Promise<StubbedAccount> {
  const rows: {
    id: string
    title: string
    role: string
    access_key: string
    view_key: string | null
    owner_key: string | null
    updated_at: string
    pinned: boolean
    opened_at: string
  }[] = boards.map((board) => {
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
    }
  })

  /*
   * `record_shared_board` WRITES, so the double has to remember it. A stub
   * that answered `my_boards` from a fixed list would report an empty account
   * one line after the app recorded a board into it, and the test would then
   * be asserting against the double rather than against the app.
   */
  /** What has been said on the board, and who is on it to say it. */
  const comments: {
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
  }[] = []
  const people = [
    { user_id: '00000000-0000-4000-8000-000000000001', display_name: displayName, hue: 3 },
    { user_id: '00000000-0000-4000-8000-000000000002', display_name: 'Rowan', hue: 1 },
  ]
  const mentioned: string[] = []
  const read: string[] = []

  await page.route(`**/${REF}.supabase.co/**`, (route) => {
    const url = route.request().url()
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })

    if (url.includes('rpc/record_shared_board')) {
      const body = route.request().postDataJSON() as { p_id?: string; p_title?: string }
      const when = new Date().toISOString()
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
      }
      const id = `cmt_${String(comments.length + 1)}`
      mentioned.push(...(body.p_mentions ?? []))
      comments.push({
        id,
        parent_id: body.p_parent_id ?? null,
        author_id: '00000000-0000-4000-8000-000000000001',
        author_name: displayName,
        author_hue: 3,
        body: body.p_body ?? '',
        x: body.p_x ?? null,
        y: body.p_y ?? null,
        object_id: body.p_object_id ?? null,
        resolved_at: null,
        created_at: new Date().toISOString(),
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
      return json(
        mentions.map((mention) => ({
          comment_id: mention.commentId,
          board_id: mention.boardId,
          board_title: mention.boardTitle,
          author_name: mention.authorName,
          body: mention.body,
          created_at: new Date().toISOString(),
        })),
      )
    }

    if (url.includes('rpc/my_boards')) return json(rows)
    if (url.includes('/profiles')) return json({ display_name: displayName, hue: 3 })
    return json({})
  })

  const expiresAt = Math.floor(Date.now() / 1000) + 3600
  await page.addInitScript(
    ([ref, name, exp]) => {
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
            id: '00000000-0000-4000-8000-000000000001',
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
    [REF, 'someone', expiresAt] as const,
  )

  return {
    mentioned,
    read,
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
  readonly people: readonly string[]
}
