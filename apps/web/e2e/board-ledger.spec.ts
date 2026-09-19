import { expect, test } from '@playwright/test'

import { HOME_URL } from './routes.js'
import { seedLocalBoard } from './seed.js'
import { signedIn } from './signed-in.js'

/**
 * The board list as a LEDGER: a thing you read down.
 *
 * Two defects shipped here on 2026-09-19 and both were invisible to every test
 * in the suite, because a list with the wrong columns still contains all its
 * rows and every assertion about content passes.
 */

const LONG = 'Pricing comprehension study'

test('lists a board that lives only in this browser exactly once', async ({ page }) => {
  await signedIn(page, [{ id: 'brd_aaaaaaaa11111111', title: 'Pricing research', role: 'owner' }])
  await seedLocalBoard(page, 'strayone', 'Competitor teardown')

  await page.goto(HOME_URL)
  await expect(page.getByTestId('claim-local')).toBeVisible()

  /*
   * THE REGRESSION. The offer to move local boards used to name every one of
   * them in a bulleted list — directly under a ledger that had just listed the
   * same rows. Five boards appeared ten times on one screen, under two
   * headings, for one set of boards.
   */
  await expect(page.getByText('Competitor teardown', { exact: true })).toHaveCount(1)
})

test('keeps the columns in line down the page', async ({ page }) => {
  await signedIn(page, [
    { id: 'brd_aaaaaaaa11111111', title: LONG, role: 'owner', pinned: true },
    // Deliberately the LONGEST tag. With per-row `auto` columns this row is
    // what pulled its own name in while leaving the others alone.
    { id: 'brd_bbbbbbbb22222222', title: 'Onboarding drop-off', role: 'editor' },
    { id: 'brd_cccccccc33333333', title: 'Checkout readout', role: 'viewer' },
  ])

  await page.goto(HOME_URL)
  await expect(page.getByTestId('home-boards').locator('li')).toHaveCount(3)

  const lefts = await page.evaluate(() =>
    [...document.querySelectorAll('.of-home__board-tag')].map((tag) =>
      Math.round(tag.getBoundingClientRect().left),
    ),
  )

  // Every row is its OWN grid, so `auto` columns size to that row's content and
  // the tags land wherever their own name ends. Four tags at four different x
  // positions is not a column.
  //
  // The row actions are the second way to break this, and the reason the roles
  // above differ: only the OWNER row offers a view-only link, so its action
  // block is one button wider. Sized to its contents, that shifts its tag and
  // nothing else's — this asserted exactly two distinct x positions when the
  // action was added, before the block got a fixed width.
  expect(lefts.length).toBe(3)
  expect(new Set(lefts).size).toBe(1)
})

/**
 * A name that fits must not be cut.
 *
 * The first fix for the alignment above reserved the tag column in `ch`, which
 * resolves against the 15px body face while the tags are set in 12px mono — so
 * it took about eighty pixels from the name and EVERY row read "Pricing co…".
 */
test('shows a board name in full when there is room for it', async ({ page }) => {
  await signedIn(page, [{ id: 'brd_aaaaaaaa11111111', title: LONG, role: 'owner' }])

  await page.goto(HOME_URL)
  const title = page.locator('.of-home__board-title').first()
  await expect(title).toHaveText(LONG)

  const clipped = await title.evaluate((node) => node.scrollWidth > node.clientWidth + 1)
  expect(clipped).toBe(false)
})

/** On a phone the name takes its own line rather than shrinking to one letter. */
test('stacks the row on a narrow screen instead of crushing the name', async ({ page }) => {
  await page.setViewportSize({ width: 420, height: 900 })
  await signedIn(page, [{ id: 'brd_aaaaaaaa11111111', title: LONG, role: 'owner' }])

  await page.goto(HOME_URL)
  const title = page.locator('.of-home__board-title').first()
  await expect(title).toHaveText(LONG)

  const { titleTop, tagTop } = await page.evaluate(() => {
    const t = document.querySelector('.of-home__board-title')
    const g = document.querySelector('.of-home__board-tag')
    return {
      titleTop: Math.round(t?.getBoundingClientRect().top ?? 0),
      tagTop: Math.round(g?.getBoundingClientRect().top ?? 0),
    }
  })

  // Below the name, not beside it: three columns across a phone left the name
  // showing a single character while the readouts kept their full width.
  expect(tagTop).toBeGreaterThan(titleTop)
})

/**
 * Opening somebody's board keeps it, without being asked.
 *
 * Two defects in one gesture, both reported from production. Reaching a shared
 * board left NOTHING you could get back to it by — the link in the original
 * message was the only route — while the local cache of it appeared in the
 * list as "Untitled board" tagged `this browser`, pointing at a board that was
 * neither untitled nor yours. So the choice on offer was a nameless row or no
 * row, and the control that would have fixed it had to be found first.
 */
test('keeps a shared board on arrival, and leaves no phantom row', async ({ page }) => {
  const joined: { id: string | null; key: string | null } = { id: null, key: null }

  await signedIn(page, [])
  // Watched rather than stubbed blind: the assertion is that the app redeems
  // the key it arrived on, which a bare "no row appeared" could not tell.
  await page.route('**/rest/v1/rpc/join_board', async (route) => {
    const body = route.request().postDataJSON() as { p_id?: string; p_key?: string }
    joined.id = body.p_id ?? null
    joined.key = body.p_key ?? null
    await route.fulfill({ status: 200, contentType: 'application/json', body: '"editor"' })
  })

  const key = 'e'.repeat(32)
  await page.goto(`/?room=brd_abcdefgh12345678&k=${key}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect.poll(() => joined.id).toBe('brd_abcdefgh12345678')
  expect(joined.key).toBe(key)

  /*
   * EDIT IT. This is what writes the local cache — autosave subscribes to the
   * command stream, so a board merely opened is never persisted. Without this
   * the test passed with the fix removed, which is worth more than the test
   * was: the phantom row only exists once something has been saved.
   */
  await page.keyboard.press('s')
  await page.locator('[data-testid="canvas"]').click({ position: { x: 200, y: 200 } })
  await expect(page.locator('[data-object-id]')).toHaveCount(1)
  await page.getByTestId('board-exit').click()

  // The board is now the server's to list. What must NOT be here is the local
  // cache of it wearing a placeholder name.
  await page.waitForSelector('[data-testid="home"]')
  await expect(page.getByText('Untitled board')).toHaveCount(0)
})

/**
 * Getting the view-only link back.
 *
 * Both links were visible exactly once, in the panel that appears the moment a
 * board is shared. After that the weaker one was unreachable — `my_boards()`
 * returned one key per role and an owner's is the editor key — so the only
 * link you could ever send again was the one that lets people change the
 * board. That is half of the feature this was built for.
 */
test('offers the view-only link for a board you own, and for nobody else’s', async ({
  page,
  context,
}) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await signedIn(page, [
    { id: 'brd_aaaaaaaa11111111', title: 'Mine', role: 'owner' },
    { id: 'brd_bbbbbbbb22222222', title: 'Theirs', role: 'editor' },
  ])

  await page.goto(HOME_URL)
  const rows = page.getByTestId('home-boards').locator('li')
  await expect(rows).toHaveCount(2)

  const mine = rows.filter({ hasText: 'Mine' })
  const theirs = rows.filter({ hasText: 'Theirs' })

  // The database withholds the second key from a member, and the row must not
  // offer a control for a link it does not have.
  await expect(theirs.getByTestId('copy-view-link')).toHaveCount(0)

  await mine.getByTestId('copy-view-link').click()
  await expect(page.getByText('View-only link copied')).toBeVisible()

  const copied = await page.evaluate(() => navigator.clipboard.readText())
  expect(copied).toContain('?room=brd_aaaaaaaa11111111')
  // The VIEW key, not the edit key the row also holds.
  expect(copied).toContain(`k=${'b'.repeat(32)}`)
  expect(copied).not.toContain('a'.repeat(32))
})

/**
 * The row's actions must fit the box reserved for them.
 *
 * The block is right-aligned with a fixed width, so actions too wide for it do
 * not clip — they spill LEFTWARD, over the column beside them. A row you own
 * carries four of them and a member's carries two, so the reserved width is
 * sized for four, and adding a fifth without widening it would put a button on
 * top of the board's tag.
 *
 * Asserted separately from the column alignment because the two are different
 * properties, and a comment here once claimed they were the same one: the
 * alignment test passes at any fixed width, including one far too small.
 */
test('keeps a row’s actions inside the space reserved for them', async ({ page }) => {
  await signedIn(page, [
    // An owner's row, which carries the most: view link, password, rename,
    // delete.
    { id: 'brd_aaaaaaaa11111111', title: 'Mine', role: 'owner' },
  ])

  await page.goto(HOME_URL)
  await expect(page.getByTestId('home-boards').locator('li')).toHaveCount(1)

  const overflow = await page.evaluate(() => {
    const box = document.querySelector('.of-home__row-actions')
    if (box === null) return 'no actions block'
    const bounds = box.getBoundingClientRect()
    const spilling = [...box.children]
      .map((child) => ({
        name: child.getAttribute('data-testid') ?? 'unnamed',
        rect: child.getBoundingClientRect(),
      }))
      // A half-pixel of rounding is not a spill.
      .filter(({ rect }) => rect.left < bounds.left - 0.5 || rect.right > bounds.right + 0.5)
      .map(({ name }) => name)
    return spilling.length === 0 ? null : `spilling: ${spilling.join(', ')}`
  })

  expect(overflow).toBeNull()
})
