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

export async function signedIn(
  page: Page,
  boards: readonly StubbedBoard[],
  displayName = 'Muqtadaa Miandara',
): Promise<void> {
  const rows: {
    id: string
    title: string
    role: string
    access_key: string
    view_key: string | null
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
        updated_at: when,
        pinned: false,
        opened_at: when,
      })
      return json({})
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
}
