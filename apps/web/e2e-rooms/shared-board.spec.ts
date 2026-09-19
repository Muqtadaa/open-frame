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

/**
 * `at` matters: two notes at the same coordinates overlap, and the upper one
 * swallows every click aimed at the lower. That cost a test run.
 */
async function addNote(page: Page, text: string, color: string, at = 100): Promise<void> {
  await page.evaluate(
    ({ text: body, color: hue, x }) => {
      const result = (window as unknown as DebugWindow).__openframe.runtime.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [{ type: 'sticky', x, y: 100, data: { text: [{ text: body }] }, style: { color: hue } }],
      })
      if (!result.ok) throw new Error(result.error?.message ?? 'the command was refused')
    },
    { text, color, x: at },
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
  // The count is an attribute because the element itself is a row of faces.
  await expect(alice.locator('[data-testid="room-people"]')).toHaveAttribute('data-count', '1')

  const bob = await join(browser, room)
  await expect(alice.locator('[data-testid="room-people"]')).toHaveAttribute('data-count', '2')
  await expect(bob.locator('[data-testid="room-people"]')).toHaveAttribute('data-count', '2')

  await bob.context().close()
  await expect(alice.locator('[data-testid="room-people"]')).toHaveAttribute('data-count', '1', {
    timeout: 20_000,
  })
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

/**
 * Presence: where people are, and what they have hold of.
 *
 * All of it rides on awareness rather than the document, so none of it is
 * history — a cursor moving is not an undo step, a save, or anything anyone
 * will ever have to merge.
 *
 * Driven through the real interface rather than through a debug hook: the point
 * is that clicking and double-clicking behave correctly, and a test that
 * reached past them would pass with the pointer handling removed.
 */
const NOTE = '[data-object-id]'
const EDITOR = 'textarea, [contenteditable="true"]'

test.describe('other people', () => {
  test('shows a cursor where somebody else is pointing', async ({ browser }) => {
    const room = newRoomId()
    const alice = await join(browser, room)
    const bob = await join(browser, room)

    await bob.mouse.move(400, 300)
    await bob.mouse.move(420, 320)

    const cursor = alice.locator('.of-presence__cursor')
    await expect(cursor).toHaveCount(1, { timeout: 15_000 })
    // The name travels with the pointer; an unlabelled cursor says who is here
    // but not who they are.
    await expect(cursor).not.toBeEmpty()
  })

  test('outlines what somebody else has selected', async ({ browser }) => {
    const room = newRoomId()
    const alice = await join(browser, room)
    const bob = await join(browser, room)

    await addNote(alice, 'shared', 'blue')
    await expect.poll(() => colours(bob)).toEqual(['blue'])

    await bob.locator(NOTE).first().click()

    await expect(alice.locator('.of-presence__outline')).toHaveCount(1, { timeout: 15_000 })
  })

  /**
   * The advisory lock, and the one case it exists for.
   *
   * Two people dragging the same note is fine — nothing is written until the
   * gesture commits, so the merge picks a winner and the note ends up
   * somewhere. Two people TYPING into one note is the case where a merge
   * genuinely loses words, so the second editor is refused and told who has it.
   *
   * Note the positive control. The first version of this test asserted only
   * that Bob had no editor open, which `toHaveCount(0)` reports as true
   * instantly — before one could have rendered either way. It passed with the
   * guard deleted. Opening the OTHER note proves Bob's double-click works at
   * all, so the zero above it means refusal rather than a broken test.
   *
   * What this still cannot do is tell the two guards apart: refusing to open
   * and closing-on-claim each satisfy it alone, and only removing BOTH makes it
   * fail. `interaction-store.test.ts` isolates them, and each of those tests
   * fails for exactly one of the two.
   */
  test('will not let two people edit the same note at once', async ({ browser }) => {
    const room = newRoomId()
    const alice = await join(browser, room)
    const bob = await join(browser, room)

    await addNote(alice, 'contested', 'blue', 100)
    await addNote(alice, 'free', 'green', 700)
    await expect.poll(() => colours(bob)).toEqual(['blue', 'green'])

    const contested = 0
    const free = 1

    await alice.locator(NOTE).nth(contested).dblclick()
    await expect(alice.locator(EDITOR)).toHaveCount(1)

    // Bob sees it held — solid rather than dashed, and named.
    const held = bob.locator('.of-presence__outline--editing')
    await expect(held).toHaveCount(1, { timeout: 15_000 })
    await expect(held).toContainText('is editing')

    // Bob cannot take it, and it STAYS not taken.
    await bob.locator(NOTE).nth(contested).dblclick()
    await expect(bob.locator(EDITOR)).toHaveCount(0)
    await bob.waitForTimeout(600)
    await expect(bob.locator(EDITOR)).toHaveCount(0)

    /*
     * The control: the same gesture on a note nobody holds opens an editor.
     * Escape first, because the refused double-click still SELECTED the note,
     * and the record panel that appears for a selection sits over the board.
     */
    await bob.keyboard.press('Escape')
    await bob.locator(NOTE).nth(free).dblclick()
    await expect(bob.locator(EDITOR)).toHaveCount(1)
    await bob.keyboard.press('Escape')

    // And when Alice lets go, the contested one is Bob's to take.
    await alice.keyboard.press('Escape')
    await expect(held).toHaveCount(0, { timeout: 15_000 })
    await bob.locator(NOTE).nth(contested).dblclick()
    await expect(bob.locator(EDITOR)).toHaveCount(1)
  })
})
