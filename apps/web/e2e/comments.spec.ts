import { expect, test, type Page } from '@playwright/test'

import { HOME_URL } from './routes.js'
import { signedIn } from './signed-in.js'

const BOARD = 'brd_abcdefgh12345678'
const KEY = 'e'.repeat(32)

/**
 * Comments, the Figma way: a mode, a click, a pin where you clicked.
 *
 * They are NOT canvas objects and never touch the document — a comment in the
 * layer tree would be in undo, in export, in search and in the registry, and
 * deleting the element it was dropped on would delete the discussion about
 * that element.
 */
async function openBoard(page: Page): Promise<void> {
  // A room the app believes in, refused quietly, so the board opens offline
  // and the test is about comments rather than about sockets.
  await page.routeWebSocket(/\/room\//, () => undefined)
  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await page.waitForSelector('[data-testid="status-bar"]')
}

test('drops a comment where you click, and shows it as a pin', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  // Nothing before anybody says anything.
  await expect(page.getByTestId('comment-panel')).toHaveCount(0)

  await page.getByRole('button', { name: /comment/i }).first().click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 240 } })

  // The composer opens where the click landed, with a pin marking the spot.
  await expect(page.getByTestId('comment-panel')).toBeVisible()
  await expect(page.getByTestId('comment-pin-new')).toBeVisible()

  await page.getByTestId('comment-input').fill('Is this the right framing?')
  await page.getByTestId('comment-post').click()

  // It becomes a pin on the board.
  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1)
})

test('replies count on the pin, and resolving takes it off the board', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByRole('button', { name: /comment/i }).first().click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 300, y: 200 } })
  await page.getByTestId('comment-input').fill('First thought')
  await page.getByTestId('comment-post').click()

  const pin = page.locator('[data-testid^="comment-pin-cmt_"]').first()
  await expect(pin).toBeVisible()

  await pin.click()
  await page.getByTestId('comment-input').fill('And a second')
  await page.getByTestId('comment-post').click()

  // Two remarks in the thread: the pin counts them.
  await expect(pin).toHaveText('2')

  /*
   * The thread is still open — replying leaves you where you are, and clicking
   * the pin again would TOGGLE it shut. That toggle is why this test read the
   * resolve button as missing once.
   *
   * RESOLVED THREADS ARE HIDDEN, not greyed. A board that keeps every finished
   * discussion pinned accumulates them until nobody reads any of them.
   */
  await expect(page.getByTestId('comment-panel')).toBeVisible()
  await page.getByTestId('comment-resolve').click()
  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(0)
})

/**
 * What happens when the thing a comment was about is deleted.
 *
 * The comment stays, and says so. Its coordinates never depended on the
 * object — the point is what pins it and the object is an association — so
 * there is nothing to recover and nothing to move.
 */
test('keeps a comment whose element was deleted, and says what happened', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  // Something to comment on.
  await page.keyboard.press('s')
  await page.locator('[data-testid="canvas"]').click({ position: { x: 400, y: 300 } })
  await expect(page.locator('[data-object-id]')).toHaveCount(1)
  await page.keyboard.press('Escape')

  // Comment ON it, rather than on empty board.
  await page.getByRole('button', { name: /comment/i }).first().click()
  await page.locator('[data-object-id]').first().click()
  await page.getByTestId('comment-input').fill('This note is wrong')
  await page.getByTestId('comment-post').click()

  const pin = page.locator('[data-testid^="comment-pin-cmt_"]').first()
  await expect(pin).toBeVisible()

  // Delete the note the comment was attached to.
  await page.keyboard.press('v')
  await page.locator('[data-object-id]').first().click()
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-object-id]')).toHaveCount(0)

  // The comment survives it, and the panel says what happened.
  await expect(pin).toBeVisible()

  /*
   * Clicked in SELECT mode, deliberately. A pin was once clickable only while
   * the comment tool was active — the canvas took pointer capture for a
   * marquee and swallowed the click — which is the one mode you are least
   * likely to be in when you want to read a comment.
   */
  await pin.click()
  await expect(page.getByTestId('comment-panel')).toBeVisible()
  await expect(page.getByTestId('comment-orphaned')).toBeVisible()
})

/**
 * A mention is a notification, and one that was never sent looks exactly like
 * one that was from the outside. The only way to tell is to ask what reached
 * the server.
 */
test('sends a mention for a name that is on the board', async ({ page }) => {
  const account = await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByRole('button', { name: /comment/i }).first().click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 280, y: 220 } })
  await page.getByTestId('comment-input').fill('@Rowan does this look right to you?')
  await page.getByTestId('comment-post').click()

  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1)
  expect(account.mentioned).toEqual(['00000000-0000-4000-8000-000000000002'])
})

/**
 * The notification surface, on the front door.
 *
 * A mention that only appears once you are already on the board it was left on
 * is not a notification — so the bell is tested where it lives, on the board
 * list, rather than anywhere near a canvas.
 */
test('shows a mention on the board list, and links to the board it names', async ({ page }) => {
  const account = await signedIn(
    page,
    [{ id: BOARD, title: 'Shared', role: 'owner' }],
    'Muqtadaa Miandara',
    {
      mentions: [
        {
          commentId: 'cmt_m1',
          boardId: BOARD,
          boardTitle: 'Shared',
          authorName: 'Rowan',
          body: 'Muqtadaa Miandara what do you think of this?',
        },
      ],
    },
  )
  await page.goto(HOME_URL)

  const bell = page.getByTestId('mentions-button')
  await expect(bell).toHaveText(/1 mention/)

  await bell.click()
  const item = page.getByTestId('mention-cmt_m1')
  await expect(item).toContainText('Rowan')
  await expect(item).toContainText('what do you think of this?')

  /*
   * The KEY, not just the board id. A claimed room refuses a bare id, so a
   * link without one leads to a board that will not open — which looks exactly
   * like a working link until it is followed.
   */
  const href = await item.getAttribute('href')
  expect(href).toContain(`room=${BOARD}`)
  expect(href).toContain(`k=${'a'.repeat(32)}`)

  // And following it says so, so the same mention is not shown again.
  await item.click()
  await expect.poll(() => account.read).toContain('cmt_m1')
})

test('says nothing when nobody has mentioned you', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await page.goto(HOME_URL)

  // The board list is up, so this is an absent bell rather than an empty page.
  await expect(page.getByText('Shared').first()).toBeVisible()
  await expect(page.getByTestId('mentions-button')).toHaveCount(0)
})

/**
 * A pin rides the thing it is about.
 *
 * The position is read off the ELEMENT rather than compared to a constant:
 * where the note lands after a drag is the browser's business, and a test
 * asserting exact pixels would fail for reasons that have nothing to do with
 * comments. What must hold is that the pin moved with it.
 */
async function pinCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('[data-testid^="comment-pin-cmt_"]').first().boundingBox()
  if (box === null) throw new Error('the pin is not on screen')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

async function noteCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('[data-object-id]').first().boundingBox()
  if (box === null) throw new Error('the note is not on screen')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

test('a pin follows the element it was dropped on', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.keyboard.press('s')
  await page.locator('[data-testid="canvas"]').click({ position: { x: 300, y: 240 } })
  await expect(page.locator('[data-object-id]')).toHaveCount(1)
  await page.keyboard.press('Escape')

  await page.getByRole('button', { name: /comment/i }).first().click()
  await page.locator('[data-object-id]').first().click()
  await page.getByTestId('comment-input').fill('About this note')
  await page.getByTestId('comment-post').click()
  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1)

  const pinBefore = await pinCentre(page)
  const noteBefore = await noteCentre(page)

  // Drag the note a long way, in select mode.
  await page.keyboard.press('v')
  await page.mouse.move(noteBefore.x, noteBefore.y)
  await page.mouse.down()
  await page.mouse.move(noteBefore.x + 180, noteBefore.y + 120, { steps: 10 })

  /*
   * MID-GESTURE, before the button comes up. Nothing is written to the
   * document until a drag commits, so a pin reading the document alone sits
   * still here and jumps on release. This assertion is the one that fails if
   * the layer ignores the drag in flight.
   */
  const pinMoving = await pinCentre(page)
  expect(pinMoving.x).toBeGreaterThan(pinBefore.x + 100)

  await page.mouse.up()

  const pinAfter = await pinCentre(page)
  const noteAfter = await noteCentre(page)

  // The pin travelled the same distance the note did, give or take rounding.
  expect(pinAfter.x - pinBefore.x).toBeCloseTo(noteAfter.x - noteBefore.x, 0)
  expect(pinAfter.y - pinBefore.y).toBeCloseTo(noteAfter.y - noteBefore.y, 0)
  // And it actually went somewhere, so the test cannot pass by nothing moving.
  expect(Math.abs(noteAfter.x - noteBefore.x)).toBeGreaterThan(100)
})

/**
 * Typing a name at somebody who is not on the board.
 *
 * There is no directory to search — a lookup across every account would let
 * anybody holding a board enumerate the whole user list — so the offer is the
 * board's own link, which is how somebody gets onto a board in the first place.
 */
test('offers the board link when you name somebody who is not here', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'])
  await openBoard(page)

  await page.getByRole('button', { name: /comment/i }).first().click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 240 } })

  // Somebody who IS here raises nothing.
  await page.getByTestId('comment-input').fill('@Rowan what do you think')
  await expect(page.getByTestId('comment-stranger')).toHaveCount(0)

  // Somebody who is not does.
  await page.getByTestId('comment-input').fill('@Jordan what do you think')
  await expect(page.getByTestId('comment-stranger')).toContainText('Jordan')

  /*
   * And the link carries the KEY. A claimed room refuses a bare board id, so
   * an invite without one is an invitation to a board that will not open —
   * which looks exactly like a working link until somebody follows it.
   */
  await page.getByTestId('comment-invite').click()
  await expect(page.getByTestId('comment-invite')).toHaveText(/copied/i)
  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain(`room=${BOARD}`)
  expect(copied).toContain(`k=${KEY}`)

  // Correcting the name puts the offer away again.
  await page.getByTestId('comment-input').fill('@Rowan what do you think')
  await expect(page.getByTestId('comment-stranger')).toHaveCount(0)
})

/**
 * Half a name is somebody still typing, not a stranger.
 *
 * A warning that flashes on the way to a name that IS on the board is noise
 * you learn to ignore, which costs the feature the one moment it is useful.
 */
test('stays quiet while a name that is here is still being typed', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByRole('button', { name: /comment/i }).first().click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 240 } })

  const input = page.getByTestId('comment-input')
  for (const partial of ['@R', '@Ro', '@Row', '@Rowa', '@Rowan']) {
    await input.fill(partial)
    await expect(page.getByTestId('comment-stranger'), partial).toHaveCount(0)
  }
})
