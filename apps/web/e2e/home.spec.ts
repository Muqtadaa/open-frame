import { expect, test } from '@playwright/test'

import { BOARD_URL, HOME_URL } from './routes.js'
import { seedLocalBoard } from './seed.js'

/**
 * The front door.
 *
 * `/` used to be a board and is now a surface that offers two ways in, which
 * makes this the one change in the application capable of breaking every link
 * anybody has ever been sent. Most of what follows is about that.
 */

const CANVAS = '[data-testid="canvas"]'
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

  test('says so when there are no boards yet', async ({ page }) => {
    await page.goto(HOME_URL)

    await expect(page.getByTestId('home-empty')).toBeVisible()
    await expect(page.getByTestId('home-boards')).toHaveCount(0)
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
  test('opens by id and is listed when you come back', async ({ page }) => {
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
