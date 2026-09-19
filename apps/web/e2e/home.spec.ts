import { expect, test } from '@playwright/test'

import { BOARD_URL, HOME_URL } from './routes.js'

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
   * The two handles, asserted as two. A front door that only offered sign-in
   * would repeal PRODUCT.md's fourth principle, and it would do it silently —
   * nothing would fail, people would just have to make an account.
   */
  test('offers signing in and starting without an account', async ({ page }) => {
    await page.goto(HOME_URL)

    await expect(page.getByTestId('home-start')).toBeVisible()
    await expect(page.getByLabel('Email')).toBeVisible()
    await expect(page.getByLabel('Password')).toBeVisible()
  })

  test('says so when there are no boards yet', async ({ page }) => {
    await page.goto(HOME_URL)

    await expect(page.getByTestId('home-empty')).toBeVisible()
    await expect(page.getByTestId('home-boards')).toHaveCount(0)
  })
})

test.describe('starting a board', () => {
  test('opens a canvas with no account anywhere in the way', async ({ page }) => {
    await page.goto(HOME_URL)
    await page.getByTestId('home-start').click()

    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 15_000 })
    // The board it opened is a real, addressable one — not the old single
    // board wearing a new URL.
    expect(new URL(page.url()).searchParams.get('board')).toMatch(/^board_[a-z0-9]{8}$/)
  })

  test('is listed when you come back', async ({ page }) => {
    await page.goto(HOME_URL)
    await page.getByTestId('home-start').click()
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 15_000 })

    await page.goto(HOME_URL)

    const boards = page.getByTestId('home-boards')
    await expect(boards).toBeVisible()
    await expect(boards.locator('li')).toHaveCount(1)
  })

  test('starts a second board rather than reopening the first', async ({ page }) => {
    await page.goto(HOME_URL)
    await page.getByTestId('home-start').click()
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 15_000 })
    const first = new URL(page.url()).searchParams.get('board')

    await page.goto(HOME_URL)
    await page.getByTestId('home-start').click()
    await expect(page.locator(CANVAS)).toBeVisible({ timeout: 15_000 })

    expect(new URL(page.url()).searchParams.get('board')).not.toBe(first)
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
