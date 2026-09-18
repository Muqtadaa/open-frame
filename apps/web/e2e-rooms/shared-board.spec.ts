import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * Two people, one board, a real Durable Object.
 *
 * This is the phase's "done when", and the only part of it that a test in one
 * process cannot answer. Everything about the protocol and the room is already
 * covered in `packages/collab`; what is proved here is that the sockets, the
 * Worker and the browser agree with all of it.
 */

/**
 * The debug handle `main.tsx` exposes for exactly this, narrowed to what is
 * used here. Typed locally rather than by augmenting `Window`, which is what
 * the existing suite does: a global augmentation would put a debug surface in
 * the application's own types.
 */
interface DebugWindow {
  readonly __openframe: {
    readonly runtime: {
      readonly dispatcher: {
        dispatch(command: unknown): { readonly ok: boolean; readonly error?: { message: string } }
        undo(): unknown
      }
      readonly store: {
        getDocument(): { objects: ReadonlyMap<string, { style: { color?: string } }> }
      }
    }
  }
}

/*
 * Written inline at each call site, not hoisted into a helper: the body of a
 * `page.evaluate` is serialised and run in the BROWSER, where a function
 * defined out here does not exist. The cast is type-only and erases.
 */

/** A fresh room per test: wrangler keeps local Durable Object state on disk. */
function newRoomId(): string {
  return `brd_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`
}

async function join(browser: Browser, room: string): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`/?room=${room}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect(page.locator('[data-testid="room-status"]')).toHaveAttribute(
    'data-status',
    'connected',
    { timeout: 20_000 },
  )
  return page
}

async function addNote(page: Page, text: string, color: string): Promise<void> {
  await page.evaluate(
    ({ text: body, color: hue }) => {
      const result = (window as unknown as DebugWindow).__openframe.runtime.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [{ type: 'sticky', x: 100, y: 100, data: { text: [{ text: body }] }, style: { color: hue } }],
      })
      if (!result.ok) throw new Error(result.error?.message ?? 'the command was refused')
    },
    { text, color },
  )
}

const colours = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [...(window as unknown as DebugWindow).__openframe.runtime.store.getDocument().objects.values()]
      .map((object) => String(object.style.color))
      .sort(),
  )

test('two windows edit the same board', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  const bob = await join(browser, room)

  await addNote(alice, 'from alice', 'blue')
  await expect.poll(() => colours(bob)).toEqual(['blue'])

  await addNote(bob, 'from bob', 'green')
  await expect.poll(() => colours(alice)).toEqual(['blue', 'green'])
})

test('each window counts everyone in the room, including itself', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  await expect(alice.locator('[data-testid="room-people"]')).toHaveText('1')

  const bob = await join(browser, room)
  await expect(alice.locator('[data-testid="room-people"]')).toHaveText('2')
  await expect(bob.locator('[data-testid="room-people"]')).toHaveText('2')

  await bob.context().close()
  await expect(alice.locator('[data-testid="room-people"]')).toHaveText('1', { timeout: 20_000 })
})

/**
 * Undo reverts YOUR change, not the most recent one — which is the whole reason
 * `origin` and `skipUndo` have been on the command envelope since Phase 1.
 */
test('undo takes back your own change, not the last one made', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  const bob = await join(browser, room)

  await addNote(alice, 'from alice', 'blue')
  await expect.poll(() => colours(bob)).toEqual(['blue'])
  await addNote(bob, 'from bob', 'green')
  await expect.poll(() => colours(alice)).toEqual(['blue', 'green'])

  await alice.evaluate(() => (window as unknown as DebugWindow).__openframe.runtime.dispatcher.undo())

  // Alice's own note is gone. Bob's — the more recent change — is untouched.
  await expect.poll(() => colours(alice)).toEqual(['green'])
  await expect.poll(() => colours(bob)).toEqual(['green'])
})

test('somebody arriving later gets the whole board', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  await addNote(alice, 'first', 'blue')
  await addNote(alice, 'second', 'red')

  const late = await join(browser, room)
  await expect.poll(() => colours(late)).toEqual(['blue', 'red'])
})

/**
 * A board with no link in it is nobody else's. PRODUCT.md's fourth principle —
 * "a board works in one browser with no account and no network" — is repealed
 * the moment every board becomes a room, so this is the test that it has not
 * been.
 */
test('a board opened without a link does not join a room', async ({ browser }) => {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto('/')
  await page.waitForSelector('[data-testid="status-bar"]')

  await expect(page.locator('[data-testid="room-status"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="share-board"]')).toBeVisible()
})
