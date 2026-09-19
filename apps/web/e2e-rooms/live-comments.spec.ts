import { expect, test, type Browser, type Page } from '@playwright/test'

import { signedIn, BOB, type StubbedServer } from '../e2e/signed-in.js'

/**
 * A comment reaching the other person while they are looking at the board.
 *
 * Only a real socket can answer this, which is why it lives here. Comments are
 * NOT in the CRDT — a remark in the document would be in undo, in export, in
 * search and in the registry — so they do not arrive the way a note does. What
 * crosses the room is a counter in presence saying "there is something new";
 * the comment itself is re-read from the database.
 *
 * The two pages share ONE stubbed server. Routed separately they would be two
 * independent databases, and this test would fail no matter what the app did —
 * for the wrong reason, which is worse than failing.
 */

function newRoomId(): string {
  return `brd_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`
}

async function join(
  browser: Browser,
  room: string,
  name: string,
  server?: StubbedServer,
): Promise<{ page: Page; server: StubbedServer }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const account = await signedIn(
    page,
    [{ id: room, title: 'Shared', role: 'owner' }],
    name,
    // The second person has to be somebody else, or both pages are one author
    // and "did it reach the OTHER window" is not a question the test can ask.
    server === undefined ? {} : { server, userId: BOB },
  )
  await page.goto(`/?room=${room}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect(page.locator('[data-testid="room-status"]')).toHaveAttribute(
    'data-status',
    'connected',
    { timeout: 20_000 },
  )
  return { page, server: account.server }
}

test('a comment reaches the other window without it being tabbed away and back', async ({
  browser,
}) => {
  const room = newRoomId()
  const alice = await join(browser, room, 'Muqtadaa Miandara')
  const bob = await join(browser, room, 'Rowan', alice.server)

  // Nothing on either board yet.
  await expect(bob.page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(0)

  await alice.page.getByRole('button', { name: /comment/i }).first().click()
  await alice.page.locator('[data-testid="canvas"]').click({ position: { x: 300, y: 220 } })
  await alice.page.getByTestId('comment-input').fill('Does this read from the back of the room?')
  await alice.page.getByTestId('comment-post').click()

  // Alice sees her own immediately, which she would with or without a room.
  await expect(alice.page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1)

  /*
   * And so does Bob — the whole point. Nothing touches Bob's window between
   * the post and this assertion: no click, no keystroke, no tab away and
   * back. Before the nudge existed this waited out the timeout.
   */
  await expect(bob.page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1, {
    timeout: 20_000,
  })
  await expect(bob.page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveAttribute(
    'title',
    /Does this read from the back of the room\?/,
  )
})

test('resolving a thread takes it off the other window too', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room, 'Muqtadaa Miandara')
  const bob = await join(browser, room, 'Rowan', alice.server)

  await alice.page.getByRole('button', { name: /comment/i }).first().click()
  await alice.page.locator('[data-testid="canvas"]').click({ position: { x: 300, y: 220 } })
  await alice.page.getByTestId('comment-input').fill('Settled?')
  await alice.page.getByTestId('comment-post').click()
  await expect(bob.page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1, {
    timeout: 20_000,
  })

  // Resolving is a change to the discussion like any other, so it travels the
  // same way. A pin that stayed on one window would be two people disagreeing
  // about what is still open.
  await alice.page.locator('[data-testid^="comment-pin-cmt_"]').click()
  await alice.page.getByTestId('comment-resolve').click()

  await expect(bob.page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(0, {
    timeout: 20_000,
  })
})

/**
 * The counter is a COUNT, not a flag.
 *
 * Two comments in a row from the same person raise it twice. A boolean would
 * be set on an already-set value the second time and the second comment would
 * reach nobody — which is the bug this test exists to catch, and it is
 * invisible if you only ever post once.
 */
test('a second comment from the same person travels as well as the first', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room, 'Muqtadaa Miandara')
  const bob = await join(browser, room, 'Rowan', alice.server)

  for (const [index, text] of ['first thing', 'second thing'].entries()) {
    await alice.page.getByRole('button', { name: /comment/i }).first().click()
    await alice.page
      .locator('[data-testid="canvas"]')
      .click({ position: { x: 200 + index * 160, y: 200 } })
    await alice.page.getByTestId('comment-input').fill(text)
    await alice.page.getByTestId('comment-post').click()
    await expect(alice.page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(index + 1)
  }

  await expect(bob.page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(2, {
    timeout: 20_000,
  })
})
