import { expect, test } from '@playwright/test'

import { boxOf, CANVAS, overlaps } from './fixtures.js'
import { BOARD_URL, HOME_URL } from './routes.js'
import { seedLocalBoard } from './seed.js'
import { signedIn } from './signed-in.js'

/**
 * The front door.
 *
 * `/` used to be a board and is now a surface that offers two ways in, which
 * makes this the one change in the application capable of breaking every link
 * anybody has ever been sent. Most of what follows is about that.
 */

const HOME = '[data-testid="home"]'

test.describe('arriving with nothing', () => {
  test('lands on the front door rather than a board', async ({ page }) => {
    await page.goto(HOME_URL)

    await expect(page.locator(HOME)).toBeVisible()
    await expect(page.locator(CANVAS)).toHaveCount(0)
  })

  /**
   * ONE handle, since 2026-09-19. This assertion is the exact inverse of the
   * one it replaces, and that is deliberate rather than a test bent to fit:
   * the door used to offer "start without an account" as an equal, and
   * creating a board now takes one. PRODUCT.md's fourth principle was
   * rewritten in the same change.
   *
   * What must NOT have changed is that a link still opens a board for
   * anybody — covered below, under "links that already exist".
   */
  test('offers signing in, and no way to start a board without doing so', async ({ page }) => {
    await page.goto(HOME_URL)

    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
    await expect(page.getByTestId('home-start')).toHaveCount(0)
  })

  /**
   * The ledger is absent, not empty.
   *
   * A guest with no boards has no list to show and no button to press, and the
   * one line that was left — "sign in to start a board" — was the heading of
   * the form directly below it, said twice. A section with nothing in it is
   * not an empty state, it is a gap.
   */
  test('shows no board list at all, rather than an empty one', async ({ page }) => {
    await page.goto(HOME_URL)

    await expect(page.getByTestId('home-boards')).toHaveCount(0)
    await expect(page.getByTestId('home-empty')).toHaveCount(0)
    await expect(page.getByText('your boards')).toHaveCount(0)
    // The form is the door for somebody with no account.
    await expect(page.getByLabel('Email')).toBeVisible()
  })
})

/**
 * Boards that were made before an account was needed.
 *
 * They are still in this browser, they still open, and they still appear in
 * the list — which is the compatibility promise the account change had to
 * keep. It could not be tested by pressing "Start a board", because that
 * button now needs an account; addressing the board directly is how those
 * boards are reached anyway.
 */
test.describe('boards already in this browser', () => {
  test('opens by id and is listed when you come back', { tag: '@smoke' }, async ({ page }) => {
    await seedLocalBoard(page, 'one')

    await page.goto(HOME_URL)

    const boards = page.getByTestId('home-boards')
    await expect(boards).toBeVisible()
    await expect(boards.locator('li')).toHaveCount(1)
  })

  test('lists each of them separately', async ({ page }) => {
    await seedLocalBoard(page, 'one')
    await seedLocalBoard(page, 'two')

    await page.goto(HOME_URL)
    await expect(page.getByTestId('home-boards').locator('li')).toHaveCount(2)
  })
})

test.describe('links that already exist', () => {
  /**
   * The regression this whole file is really for. Every share link in the
   * world is `/?room=<id>`, and a front door that swallowed them would look
   * exactly like the app working.
   */
  test('a room link still opens its board directly', async ({ page }) => {
    await page.goto('/?room=brd_abcdefgh12345678')

    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(HOME)).toHaveCount(0)
  })

  test('a local board link opens its board directly', async ({ page }) => {
    await page.goto(BOARD_URL)

    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 15_000 })
    await expect(page.locator(HOME)).toHaveCount(0)
  })

  /**
   * A truncated link is far likelier than a hostile one, and home is somewhere
   * a person can recover from.
   */
  test('a mangled link lands on the front door instead of failing', async ({ page }) => {
    await page.goto('/?board=not%20a%20board%20id')

    await expect(page.locator(HOME)).toBeVisible()
  })
})

/*
 * The world was chosen only on a board, so the front door — the first thing
 * anybody sees — was always the Notebook, and somebody who works at night met
 * a white page every time they went home.
 */
test.describe('the world, from the front door', () => {
  test('is chosen here, and the board opens in it', async ({ page }) => {
    await page.goto(HOME_URL)
    const toggle = page.getByRole('button', { name: 'After Hours theme' })
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')

    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'after-hours')

    await page.goto(BOARD_URL)
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'after-hours')
    await expect(page.getByTestId('theme-toggle')).toHaveAttribute('aria-pressed', 'true')
  })

  test('sits at the end of the head, clear of the account, at phone width too', async ({
    page,
  }) => {
    await signedIn(page, [])
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(HOME_URL)
      const toggle = await boxOf(page.getByRole('button', { name: 'After Hours theme' }))
      const account = await boxOf(page.getByTestId('home-account'))
      expect(overlaps(toggle, account)).toBe(false)
      expect(toggle.x + toggle.width).toBeLessThanOrEqual(width)
      // A control you press to change what you see, so a full target.
      expect(toggle.width).toBeGreaterThanOrEqual(24)
    }
  })
})
