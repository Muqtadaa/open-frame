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

  await page.getByTestId('tool-comment').click()
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

  await page.getByTestId('tool-comment').click()
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
  await page.getByTestId('tool-comment').click()
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

  await page.getByTestId('tool-comment').click()
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

  await page.getByTestId('tool-comment').click()
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

  await page.getByTestId('tool-comment').click()
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

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 240 } })

  const input = page.getByTestId('comment-input')
  for (const partial of ['@R', '@Ro', '@Row', '@Rowa', '@Rowan']) {
    await input.fill(partial)
    await expect(page.getByTestId('comment-stranger'), partial).toHaveCount(0)
  }
})

/**
 * The mention hint, once a workspace supplies the names.
 *
 * It used to list everybody joined with commas, which was fine when only a
 * board's own members were offered. A workspace can hold a great many, and a
 * hint that becomes a paragraph is one nobody reads — including the part that
 * says what to type.
 */
test('names a few people and counts the rest', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 240 } })

  const hint = page.getByTestId('comment-people-hint')
  await expect(hint).toContainText('and 2 more')
  // The two it did not name are counted rather than listed.
  await expect(hint).not.toContainText('Juno')
  await expect(hint).not.toContainText('Tam')

  // And somebody the hint did not have room for is still mentionable, because
  // the cap is a display decision and nothing more.
  await page.getByTestId('comment-input').fill('@Tam can you look at this')
  await expect(page.getByTestId('comment-stranger')).toHaveCount(0)
})

const ROWAN = '00000000-0000-4000-8000-000000000002'

/**
 * The menu that makes a mention something you PICK rather than something you
 * spell correctly.
 *
 * The hint it replaces asked people to type a name exactly, and nothing told
 * them whether it had matched until the notification silently failed to
 * arrive. What this proves is the whole path: the menu names real people, the
 * choice writes a token, and the token reaches the server as an id.
 */
test('offers the people on the board when you type @, and mentions the one you pick', async ({
  page,
}) => {
  const account = await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 280, y: 220 } })

  const input = page.getByTestId('comment-input')
  await input.pressSequentially('@Ro')

  const menu = page.getByTestId('mention-menu')
  await expect(menu).toBeVisible()
  await expect(menu).toContainText('Rowan')
  // Somebody who does not match is not offered.
  await expect(menu).not.toContainText('Wren')

  await page.getByTestId(`mention-option-${ROWAN}`).click()

  /*
   * A NAME in the box. A textarea lays out its whole value even where the
   * glyphs are hidden, so a token here could not be painted over — it would
   * take up its full width whatever was drawn on top. The id is added on the
   * way out instead, which is what the server assertion below checks.
   */
  await expect(input).toHaveValue('@Rowan ')
  await expect(input).not.toHaveValue(/\]\(/)

  await input.pressSequentially('does this look right?')
  await page.getByTestId('comment-post').click()

  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1)
  expect(account.mentioned).toEqual([ROWAN])
})

/**
 * The token is storage, not writing. A reader must never see one.
 */
test('shows a picked mention as a name, never as the token it is stored as', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 300, y: 240 } })

  const input = page.getByTestId('comment-input')
  await input.pressSequentially('@Ro')
  await page.getByTestId(`mention-option-${ROWAN}`).click()
  await input.pressSequentially('have a look')
  await page.getByTestId('comment-post').click()

  await page.locator('[data-testid^="comment-pin-cmt_"]').first().click()

  const said = page.locator('.of-comment__text').first()
  await expect(said).toContainText('@Rowan')
  await expect(said).toContainText('have a look')
  // The two halves of the token, neither of which is for reading.
  await expect(said).not.toContainText(ROWAN)
  await expect(said).not.toContainText('](')
  await expect(page.getByTestId('mention-chip').first()).toBeVisible()
})

/**
 * Both keys already meant something in this composer: Enter is a newline,
 * because a comment is prose, and Escape closes the panel. The menu borrows
 * them while it is open and has to give them back when it is not.
 */
test('the menu takes Enter and Escape only while it is open', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 260, y: 200 } })

  const input = page.getByTestId('comment-input')
  await input.pressSequentially('@Ro')
  await expect(page.getByTestId('mention-menu')).toBeVisible()

  // Enter chooses rather than breaking the line.
  await input.press('Enter')
  await expect(input).toHaveValue('@Rowan ')
  await expect(page.getByTestId('mention-menu')).toHaveCount(0)

  // Escape now closes the panel, because there is no menu to close instead.
  await input.pressSequentially('@Wr')
  await expect(page.getByTestId('mention-menu')).toBeVisible()
  await input.press('Escape')
  await expect(page.getByTestId('mention-menu')).toHaveCount(0)
  await expect(page.getByTestId('comment-panel')).toBeVisible()

  await input.press('Escape')
  await expect(page.getByTestId('comment-panel')).toHaveCount(0)
})

/**
 * Where the notification actually has to arrive.
 *
 * The bell lived on the front door alone — the one screen you are not on
 * while you work — so being named on another board waited until you happened
 * to go home. This is the same bell, on a canvas.
 */
test('carries the bell onto the board, not just the front door', async ({ page }) => {
  await signedIn(
    page,
    [{ id: BOARD, title: 'Shared', role: 'owner' }],
    'Muqtadaa Miandara',
    {
      mentions: [
        {
          commentId: 'cmt_elsewhere',
          boardId: BOARD,
          boardTitle: 'Another board',
          authorName: 'Rowan',
          body: `@[Muqtadaa Miandara](${'0'.repeat(8)}-0000-4000-8000-000000000001) come and look`,
        },
      ],
    },
  )
  await openBoard(page)

  const bell = page.getByTestId('mentions-button')
  await expect(bell).toHaveText(/1 mention/)

  await bell.click()
  const item = page.getByTestId('mention-cmt_elsewhere')
  await expect(item).toContainText('come and look')
  // A preview is a place a token would show through just as badly.
  await expect(item).not.toContainText('](')
})

/**
 * The bell's list, placed rather than pointed.
 *
 * Reported from a screenshot: the status bar sits on the bottom edge, the list
 * opened downward from it, and all but the first row was below the window
 * where nothing could reach it. The assertion is deliberately about the
 * RECTANGLE rather than about which side was chosen — "opens upward" would
 * pass on the front door with the bug still present, and the thing that was
 * actually wrong is that part of it was off the screen.
 */
test('keeps the mentions list on screen when the bell is on the bottom edge', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }], 'Muqtadaa Miandara', {
    mentions: Array.from({ length: 5 }, (_, index) => ({
      commentId: `cmt_${String(index)}`,
      boardId: BOARD,
      boardTitle: 'Another board',
      authorName: 'Rowan',
      body: 'have a look at this when you get a chance',
    })),
  })
  await openBoard(page)

  const bell = page.getByTestId('mentions-button')
  await expect(bell).toHaveText(/5 mentions/)
  await bell.click()

  const list = page.getByTestId('mentions-list')
  await expect(list).toBeVisible()

  const box = await list.boundingBox()
  const window = page.viewportSize()
  expect(box).not.toBeNull()
  expect(window).not.toBeNull()
  if (box === null || window === null) return

  expect(box.y, 'ran off the top').toBeGreaterThanOrEqual(0)
  expect(box.x, 'ran off the left').toBeGreaterThanOrEqual(0)
  expect(box.y + box.height, 'ran off the bottom').toBeLessThanOrEqual(window.height)
  expect(box.x + box.width, 'ran off the right').toBeLessThanOrEqual(window.width)

  // And every row is reachable, not just the rectangle being nominally inside.
  await expect(page.getByTestId('mention-cmt_4')).toBeVisible()
})

/** The same list, from the front door, where it has room to open downward. */
test('still opens the mentions list on the front door', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }], 'Muqtadaa Miandara', {
    mentions: [
      {
        commentId: 'cmt_home',
        boardId: BOARD,
        boardTitle: 'Shared',
        authorName: 'Rowan',
        body: 'what do you think of this?',
      },
    ],
  })
  await page.goto(HOME_URL)

  await page.getByTestId('mentions-button').click()

  // The front door is a separate render root, so it needed its own chrome
  // layer — without one the surface portals into nothing and shows nothing.
  await expect(page.getByTestId('mentions-list')).toBeVisible()
  await expect(page.getByTestId('mention-cmt_home')).toContainText('what do you think')

  const box = await page.getByTestId('mentions-list').boundingBox()
  const window = page.viewportSize()
  if (box === null || window === null) return
  expect(box.y).toBeGreaterThanOrEqual(0)
  expect(box.y + box.height).toBeLessThanOrEqual(window.height)
})

/**
 * Picking settles the mention, and editing it reopens the offer.
 *
 * This only became a question when the composer started holding names: a
 * token contains a bracket and `activeMentionQuery` refuses one, so the menu
 * shut by accident. "@Rowan " is a perfectly good query that matches Rowan,
 * so choosing him re-offered him on top of the name just written.
 */
test('shuts the menu when you choose, and offers it again if you edit', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 300, y: 260 } })

  const input = page.getByTestId('comment-input')
  await input.pressSequentially('@Ro')
  await page.getByTestId(`mention-option-${ROWAN}`).click()

  await expect(input).toHaveValue('@Rowan ')
  await expect(page.getByTestId('mention-menu')).toHaveCount(0)

  // Backspacing into the name you just chose is how you change your mind.
  await input.press('Backspace')
  await input.press('Backspace')
  await expect(page.getByTestId('mention-menu')).toBeVisible()
})

/**
 * Following a notification has to land on the REMARK.
 *
 * The bell's href was the plain share link — board id and access key, nothing
 * about which remark was being pointed at — so it reopened the board at its
 * default view with no thread open and no pin marked. Indistinguishable from
 * clicking the board in the list, and no answer at all to "somebody mentioned
 * you HERE".
 */
test('a mention link opens the thread it names, not just the board', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  // A real remark, so the id is one the board actually holds.
  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 300, y: 240 } })
  await page.getByTestId('comment-input').fill('the bit I wanted you to see')
  await page.getByTestId('comment-post').click()
  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1)

  const id = await page
    .locator('[data-testid^="comment-pin-cmt_"]')
    .first()
    .getAttribute('data-testid')
  const commentId = (id ?? '').replace('comment-pin-', '')
  expect(commentId).not.toBe('')

  // Arrive as somebody following the notification would.
  await page.goto(`/?room=${BOARD}&k=${KEY}&c=${commentId}`)
  await page.waitForSelector('[data-testid="status-bar"]')

  const panel = page.getByTestId('comment-panel')
  await expect(panel).toBeVisible()
  await expect(panel).toContainText('the bit I wanted you to see')

  /*
   * And the anchor is consumed. It describes an ARRIVAL, not a location —
   * left in the address bar, every later reload drags you back to a remark
   * you have already read, and so does every copy of the URL.
   */
  await expect.poll(() => new URL(page.url()).searchParams.get('c')).toBeNull()
})

test('a mention link for a remark that is gone still opens the board', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await page.routeWebSocket(/\/room\//, () => undefined)
  await page.goto(`/?room=${BOARD}&k=${KEY}&c=cmt_nothing`)

  // The board is open, which is most of what was asked for. A notice about a
  // remark nobody can see any more is not worth the interruption.
  await expect(page.locator('[data-testid="status-bar"]')).toBeVisible()
  await expect(page.getByTestId('comment-panel')).toHaveCount(0)
})

/**
 * Read and GONE are two different states.
 *
 * `my_mentions()` filtered on `read_at is null`, so following a notification
 * was the last time you could ever find it — the thing somebody wanted you to
 * see disappeared at the moment you looked at it, taking the only link back
 * with it.
 */
test('reading a mention keeps it, quietened, rather than destroying it', async ({ page }) => {
  const account = await signedIn(
    page,
    [{ id: BOARD, title: 'Shared', role: 'owner' }],
    'Muqtadaa Miandara',
    {
      mentions: [
        {
          commentId: 'cmt_kept',
          boardId: BOARD,
          boardTitle: 'Shared',
          authorName: 'Rowan',
          body: 'the thing I wanted you to see',
        },
      ],
    },
  )
  await page.goto(HOME_URL)

  const bell = page.getByTestId('mentions-button')
  await expect(bell).toHaveText('1 mention')

  await bell.click()
  const item = page.getByTestId('mention-cmt_kept')
  await expect(item).toHaveAttribute('data-unread', 'true')

  // The link carries the remark now, not just the board.
  const href = await item.getAttribute('href')
  expect(href).toContain('c=cmt_kept')

  await item.click()
  await expect.poll(() => account.read).toContain('cmt_kept')
  await page.waitForSelector('[data-testid="status-bar"]')

  /*
   * The bell is still there, and still reaches it. It used to vanish the
   * moment you had read everything — which is exactly when somebody goes
   * looking for the notification they followed ten minutes ago.
   */
  const onBoard = page.getByTestId('mentions-button')
  await expect(onBoard).toHaveText('Mentions')
  await onBoard.click()
  const kept = page.getByTestId('mention-cmt_kept')
  await expect(kept).toBeVisible()
  await expect(kept).toContainText('the thing I wanted you to see')
  await expect(kept).toHaveAttribute('data-unread', 'false')
})

/**
 * Where "take me to the comment" actually puts you.
 *
 * The first attempt used `panToReveal`, which moves as LITTLE as possible —
 * so an off-screen pin landed at the very edge of the window and one already
 * in view did not move at all. Both read as the link not having worked. A
 * notification needs the remark in the middle, with the board around it.
 */
test('arriving from a link puts the remark in the middle, not at the edge', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  /*
   * Low and to the left, but CLEAR OF THE RAIL — a press at x=60 lands on the
   * toolbar, which the table suite learned the same way. Far enough from the
   * middle that a centring pan and a minimal one cannot agree: reopening puts
   * the board back at its default view, where this pin is already visible, so
   * `panToReveal` would not move at all.
   */
  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 240, y: 560 } })
  await page.getByTestId('comment-input').fill('over here')
  await page.getByTestId('comment-post').click()

  const pin = page.locator('[data-testid^="comment-pin-cmt_"]').first()
  await expect(pin).toBeVisible()
  const commentId = ((await pin.getAttribute('data-testid')) ?? '').replace('comment-pin-', '')

  await page.goto(`/?room=${BOARD}&k=${KEY}&c=${commentId}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect(page.getByTestId('comment-panel')).toBeVisible()

  const box = await page.locator('[data-testid^="comment-pin-cmt_"]').first().boundingBox()
  const canvas = await page.locator('[data-testid="canvas"]').boundingBox()
  expect(box).not.toBeNull()
  expect(canvas).not.toBeNull()
  if (box === null || canvas === null) return

  /*
   * Within a quarter of the window of the middle. Loose enough not to care
   * about the pin's own size or the panel's exact width, tight enough that
   * "clamped to an edge" — which is what the reveal did — cannot pass.
   */
  const dx = Math.abs(box.x + box.width / 2 - (canvas.x + canvas.width / 2))
  const dy = Math.abs(box.y + box.height / 2 - (canvas.y + canvas.height / 2))
  expect(dx, 'not horizontally central').toBeLessThan(canvas.width / 4)
  expect(dy, 'not vertically central').toBeLessThan(canvas.height / 4)
})

/**
 * And clicking one for the board you are ALREADY on does not reload it.
 *
 * A full page load throws away the socket, the document and the view for a
 * board the browser already has open, and the only thing it achieves is
 * arriving at the same place slower.
 */
test('a notification for this board goes to the remark without reloading', async ({ page }) => {
  const account = await signedIn(
    page,
    [{ id: BOARD, title: 'Shared', role: 'owner' }],
    'Muqtadaa Miandara',
  )
  await openBoard(page)

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 240, y: 560 } })
  await page.getByTestId('comment-input').fill('the one you were sent')
  await page.getByTestId('comment-post').click()
  const pin = page.locator('[data-testid^="comment-pin-cmt_"]').first()
  await expect(pin).toBeVisible()
  const commentId = ((await pin.getAttribute('data-testid')) ?? '').replace('comment-pin-', '')

  // A mention for that remark, on this board, delivered live.
  account.server.mentions.push({
    commentId,
    boardId: BOARD,
    boardTitle: 'Shared',
    authorName: 'Rowan',
    body: 'the one you were sent',
  })
  await page.getByTestId('comment-close').click()
  await page.reload()
  await page.waitForSelector('[data-testid="status-bar"]')

  // A mark this page load owns. It does not survive a navigation.
  await page.evaluate(() => {
    ;(window as unknown as { __stillHere?: boolean }).__stillHere = true
  })

  await page.getByTestId('mentions-button').click()
  const item = page.getByTestId(`mention-${commentId}`)
  await expect(item).toHaveAttribute('data-here', 'true')
  await item.click()

  await expect(page.getByTestId('comment-panel')).toContainText('the one you were sent')
  expect(
    await page.evaluate(() => (window as unknown as { __stillHere?: boolean }).__stillHere),
    'the page reloaded instead of going to the comment',
  ).toBe(true)

  // Marked read all the same, which the navigation used to be doing for it.
  await expect.poll(() => account.read).toContain(commentId)
})

/**
 * A prevented click that does nothing is worse than the reload it saved.
 *
 * The discussion loads asynchronously, so a notification clicked in the first
 * moment of a board finds no comment to go to. Taking the click anyway would
 * leave the notification looking broken; the link still works, and the fresh
 * page honours `?c=` on the way in.
 */
test('falls back to the link when the discussion is not loaded yet', async ({ page }) => {
  const account = await signedIn(
    page,
    [{ id: BOARD, title: 'Shared', role: 'owner' }],
    'Muqtadaa Miandara',
    {
      mentions: [
        {
          commentId: 'cmt_unknown',
          boardId: BOARD,
          boardTitle: 'Shared',
          authorName: 'Rowan',
          body: 'a remark this page has not read yet',
        },
      ],
    },
  )
  await openBoard(page)

  // This board's discussion holds nothing, so there is nowhere to go in page.
  await page.getByTestId('mentions-button').click()
  const item = page.getByTestId('mention-cmt_unknown')
  await expect(item).toHaveAttribute('data-here', 'true')

  await page.evaluate(() => {
    ;(window as unknown as { __stillHere?: boolean }).__stillHere = true
  })
  await item.click()

  // It navigated rather than silently doing nothing.
  await page.waitForSelector('[data-testid="status-bar"]')
  expect(
    await page.evaluate(() => (window as unknown as { __stillHere?: boolean }).__stillHere),
    'the click was swallowed instead of following the link',
  ).toBeUndefined()
  await expect.poll(() => account.read).toContain('cmt_unknown')
})

/**
 * Resolving is not deleting.
 *
 * A resolved thread loses its pin — deliberately, because a board that keeps
 * every finished discussion pinned accumulates them until nobody reads any —
 * and it also left the panel's list, which left nowhere at all to read back
 * what had been agreed.
 */
test('keeps a resolved thread findable, and lets it be reopened', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 260 } })
  await page.getByTestId('comment-input').fill('are we agreed on this?')
  await page.getByTestId('comment-post').click()

  const pin = page.locator('[data-testid^="comment-pin-cmt_"]').first()
  await expect(pin).toBeVisible()
  const id = ((await pin.getAttribute('data-testid')) ?? '').replace('comment-pin-', '')

  await pin.click()
  await page.getByTestId('comment-resolve').click()

  // Off the board, as before. That part was never the complaint.
  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(0)

  await page.getByTestId('tool-comment').click()
  await expect(page.getByTestId('comment-list')).toBeVisible()
  await expect(page.getByTestId(`comment-entry-${id}`)).toHaveCount(0)

  // But reachable, and the control says how many are behind it.
  const toggle = page.getByTestId('comment-show-resolved')
  await expect(toggle).toHaveText('Show 1 resolved')
  await toggle.click()

  const entry = page.getByTestId(`comment-entry-${id}`)
  await expect(entry).toBeVisible()
  await expect(entry).toHaveAttribute('data-resolved', 'true')
  await expect(entry).toContainText('are we agreed on this?')

  // And opening one offers to reopen it, which is what finding it is for.
  await entry.click()
  await expect(page.getByTestId('comment-resolve')).toHaveText('Reopen')
  await page.getByTestId('comment-resolve').click()
  await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1)
})

test('offers nothing to reveal when nothing has been resolved', async ({ page }) => {
  await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
  await openBoard(page)

  await page.getByTestId('tool-comment').click()
  await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 260 } })
  await page.getByTestId('comment-input').fill('still open')
  await page.getByTestId('comment-post').click()

  // Off the tool and back on, so the press below selects it rather than
  // toggling off the one that is already active.
  await page.keyboard.press('v')
  /*
   * The TOOL, by its id. This was `getByRole('button', { name: /comment/i })
   * .first()`, and the comment just posted puts a pin named "Comment from …"
   * ahead of the rail in the page — so whether this pressed the tool or the
   * pin depended on whether the pin had rendered yet. It was the suite's
   * known flake, and became a steady failure once the pin was always there.
   */
  await page.getByTestId('tool-comment').click()
  await expect(page.getByTestId('comment-list')).toBeVisible()
  // A control that reveals nothing is one people press once and distrust.
  await expect(page.getByTestId('comment-show-resolved')).toHaveCount(0)
})

/*
 * No key and no click throws words away. Escape — or a click on another spot
 * or pin — remounted the panel and the draft went with it; C3 #4 removed that
 * failure from every other editor, and a comment is the most considered thing
 * anybody types here.
 */
test.describe('drafts', () => {
  test('Escape keeps a new comment as a draft on the board', async ({ page }) => {
    await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
    await openBoard(page)
    await page.getByTestId('tool-comment').click()
    await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 260 } })
    await page.getByTestId('comment-input').fill('A long considered thought')
    await page.getByTestId('comment-input').press('Escape')
    await expect(page.getByTestId('comment-panel')).toHaveCount(0)

    const draft = page.getByTestId('comment-pin-draft')
    await expect(draft).toHaveCount(1)
    await draft.click()
    await expect(page.getByTestId('comment-input')).toHaveValue('A long considered thought')
    await expect(page.getByTestId('comment-draft-kept')).toBeVisible()

    await page.getByTestId('comment-post').click()
    await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1)
    await expect(page.getByTestId('comment-pin-draft')).toHaveCount(0)
  })

  test('starting a comment somewhere else keeps the first one', async ({ page }) => {
    await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
    await openBoard(page)
    await page.getByTestId('tool-comment').click()
    await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 260 } })
    await page.getByTestId('comment-input').fill('First spot')
    await page.locator('[data-testid="canvas"]').click({ position: { x: 620, y: 420 } })
    await expect(page.getByTestId('comment-input')).toHaveValue('')
    await expect(page.getByTestId('comment-pin-draft')).toHaveCount(1)
  })

  test('a half-typed reply survives closing its thread', async ({ page }) => {
    await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
    await openBoard(page)
    await page.getByTestId('tool-comment').click()
    await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 260 } })
    await page.getByTestId('comment-input').fill('Thread')
    await page.getByTestId('comment-post').click()

    const pin = page.locator('[data-testid^="comment-pin-cmt_"]').first()
    await pin.click()
    await page.getByTestId('comment-input').fill('Half a reply')
    await page.getByTestId('comment-input').press('Escape')
    await expect(page.getByTestId('comment-panel')).toHaveCount(0)
    await pin.click()
    await expect(page.getByTestId('comment-input')).toHaveValue('Half a reply')
  })
})

test.describe('by keyboard', () => {
  /*
   * A comment could only be dropped with a pointer. M with something selected
   * starts one on it; the keyboard is handed back whenever the panel closes.
   */
  test('M comments on the selection, and closing hands focus back', async ({ page }) => {
    await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
    await openBoard(page)
    await page.keyboard.press('s')
    await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 260 } })
    await page.keyboard.type('A note')
    await page.keyboard.press('Escape')
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
    await expect(page.getByTestId('selection-count')).toContainText('1')

    await page.keyboard.press('m')
    await expect(page.getByTestId('comment-pin-new')).toBeVisible()
    await expect(page.getByTestId('comment-input')).toBeFocused()
    await page.keyboard.type('Said without a mouse')
    await page.keyboard.press('Control+Enter')

    // Posted: the list, with the keyboard at its heading rather than lost.
    await expect(page.locator('[data-testid^="comment-pin-cmt_"]')).toHaveCount(1)
    await expect(page.getByRole('heading', { name: 'Comments' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('comment-panel')).toHaveCount(0)
    await expect(page.getByTestId('tool-comment')).toBeFocused()
  })

  test('a pin that opened a thread gets the keyboard back', async ({ page }) => {
    await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }])
    await openBoard(page)
    await page.getByTestId('tool-comment').click()
    await page.locator('[data-testid="canvas"]').click({ position: { x: 320, y: 260 } })
    await page.getByTestId('comment-input').fill('Thread')
    await page.getByTestId('comment-post').click()
    await page.keyboard.press('Escape')

    const pin = page.locator('[data-testid^="comment-pin-cmt_"]').first()
    await pin.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('comment-panel')).toBeVisible()
    await page.getByTestId('comment-close').click()
    await expect(pin).toBeFocused()
  })

  test('the mentions list is a sheet: in, along, and out again', async ({ page }) => {
    await signedIn(page, [{ id: BOARD, title: 'Shared', role: 'owner' }], 'Muqtadaa Miandara', {
      mentions: [
        { commentId: 'cmt_m1', boardId: BOARD, boardTitle: 'Shared', authorName: 'Rowan', body: 'first' },
        { commentId: 'cmt_m2', boardId: BOARD, boardTitle: 'Shared', authorName: 'Wren', body: 'second' },
      ],
    })
    await page.goto(HOME_URL)
    const bell = page.getByTestId('mentions-button')
    await bell.focus()
    await page.keyboard.press('Enter')
    await expect(page.getByRole('dialog', { name: 'Mentions' })).toBeVisible()
    await expect(page.getByTestId('mention-cmt_m1')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('mention-cmt_m2')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('mentions-list')).toHaveCount(0)
    await expect(bell).toBeFocused()

    await bell.click()
    await expect(page.getByTestId('mentions-list')).toBeVisible()
    await page.mouse.click(5, 700)
    await expect(page.getByTestId('mentions-list')).toHaveCount(0)
  })
})
