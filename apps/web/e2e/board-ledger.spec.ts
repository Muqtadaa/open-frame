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
