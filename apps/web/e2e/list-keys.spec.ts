import { richFromPlain } from '@openframe/core'
import type { Page } from '@playwright/test'

import { buildBoard } from './boards.js'
import { boxOf, CANVAS, expect, goto, reload, seedBoard, test } from './fixtures.js'
import { library, TRACKS } from './music.js'
import { BOARD_URL } from './routes.js'
import { signedIn } from './signed-in.js'

/**
 * Lists walked by keys, on the surfaces that had no keyboard test of their own.
 *
 * Every list here once walked itself by hand, and each did it a little
 * differently: some took the arrow from the board and some left it to nudge
 * whatever was selected underneath. They now share `controls/roving.ts`, and
 * these hold what each one does, so the move onto it changes nothing a person
 * can feel except the faults named below.
 */

const NOTE = { x: 340, y: 520 }

async function oneNote(page: Page): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Note', NOTE)
    }),
  )
}

/** The selected note's place on screen, to say it did not move. */
async function selectNote(page: Page) {
  await page.locator(CANVAS).click({ position: NOTE })
  const note = page.locator('[data-object-type="sticky"]')
  await expect(note).toHaveAttribute('data-selected', 'true')
  return { note, at: await boxOf(note) }
}

test.describe('the genres', () => {
  test.use({ board: 'fresh' })

  /*
   * A radio group's arrows choose; the board's arrows nudge. The genres let
   * the press go on to the board, so walking them walked the selected note
   * across the board as well.
   */
  test('an arrow on the genres does not nudge the selected note', async ({ page }) => {
    await library(page, TRACKS)
    await reload(page)
    await oneNote(page)
    const { note, at } = await selectNote(page)
    await page.getByTestId('session-button').click()
    const sheet = page.getByRole('dialog', { name: 'Session' })
    await sheet.getByRole('radio', { name: 'Jazz lounge' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(sheet.getByRole('radio', { name: 'Ambient' })).toBeFocused()
    expect((await boxOf(note)).x).toBeCloseTo(at.x, 0)
    // Home and End reach either end, as every radio group here does.
    await page.keyboard.press('Home')
    await expect(sheet.getByRole('radio', { name: 'Jazz lounge' })).toBeFocused()
    await page.keyboard.press('End')
    await expect(sheet.getByRole('radio', { name: 'Ambient' })).toBeFocused()
  })
})

test.describe('the inbox', () => {
  const mention = (id: string, body: string) => ({
    commentId: id,
    boardId: 'brd_elsewhere12345678',
    boardTitle: 'Another board',
    authorName: 'Rowan',
    body,
  })

  /*
   * Up and down its rows, wrapping. It let the press go on to the board too,
   * so a person reading their mentions moved the note they had selected.
   */
  test('walks its rows with the arrows, and leaves the board alone', async ({ page }) => {
    await signedIn(page, [], 'Muqtadaa Miandara', {
      mentions: [mention('cmt_one', 'first'), mention('cmt_two', 'second')],
    })
    await goto(page, BOARD_URL)
    await oneNote(page)
    const { note, at } = await selectNote(page)
    await page.getByTestId('inbox').click()
    await page.getByTestId('mention-cmt_one').focus()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('mention-cmt_two')).toBeFocused()
    await page.keyboard.press('ArrowDown')
    await expect(page.getByTestId('mention-cmt_one')).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(page.getByTestId('mention-cmt_two')).toBeFocused()
    expect((await boxOf(note)).y).toBeCloseTo(at.y, 0)
  })
})

test.describe('the rail flyouts', () => {
  test.use({ board: 'open' })

  /*
   * A menu Tab leaves is a menu Tab closes. The flyout let Tab walk out of
   * it and stayed open behind, over the board, with nothing focused in it.
   */
  test('Tab closes the flyout and gives the keyboard back to its tool', async ({ page }) => {
    await page.getByTestId('tool-shape').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('shape-flyout')).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('shape-flyout')).toHaveCount(0)
    await expect(page.getByTestId('tool-shape')).toBeFocused()
  })

  test('Tab closes the table size grid the same way', async ({ page }) => {
    await page.getByTestId('tool-table').focus()
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('table-size-flyout')).toBeVisible()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('table-size-flyout')).toHaveCount(0)
    await expect(page.getByTestId('tool-table')).toBeFocused()
  })
})

test.describe('the board overview', () => {
  test.use({ board: 'fresh' })

  test('walks its rows, back to a frame, and to either end', async ({ page }) => {
    await seedBoard(
      page,
      buildBoard((board) => {
        const frame = board.add('frame', { x: 500, y: 300 })
        board.add('sticky', { x: 480, y: 320 }, { text: richFromPlain('Inside') }, undefined, frame)
        board.note('Second', { x: 1000, y: 300 })
        board.note('Third', { x: 1000, y: 600 })
      }),
    )
    await page.locator(CANVAS).focus()
    await page.keyboard.press('Alt+s')
    const tree = page.getByRole('tree', { name: 'Objects' })
    await expect(tree).toBeFocused()
    const current = async () =>
      tree.evaluate((element) => {
        const id = element.getAttribute('aria-activedescendant')
        return id === null ? '' : (document.getElementById(id)?.textContent ?? '')
      })
    const first = await current()
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    expect(await current()).toContain('Inside')
    // Left from a member goes back to the frame that holds it.
    await page.keyboard.press('ArrowLeft')
    expect(await current()).toBe(first)
    await page.keyboard.press('End')
    const last = await current()
    expect(last).not.toBe(first)
    await page.keyboard.press('ArrowUp')
    expect(await current()).not.toBe(last)
    await page.keyboard.press('Home')
    expect(await current()).toBe(first)
  })
})

test.describe('the emoji library', () => {
  test.use({ board: 'fresh' })

  test('is walked as a grid, and Up from its top row goes back to search', async ({ page }) => {
    await oneNote(page)
    await selectNote(page)
    await page.getByTestId('react-more').click()
    const search = page.getByRole('searchbox', { name: 'Search emoji' })
    await expect(search).toBeFocused()
    const cells = page.getByRole('dialog', { name: 'Emoji' }).locator('button[data-emoji-cell]')
    await expect(cells.nth(9)).toBeAttached()
    await page.keyboard.press('ArrowDown')
    await expect(cells.nth(0)).toBeFocused()
    await page.keyboard.press('ArrowRight')
    await expect(cells.nth(1)).toBeFocused()
    // Eight to a row.
    await page.keyboard.press('ArrowDown')
    await expect(cells.nth(9)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(cells.nth(1)).toBeFocused()
    await page.keyboard.press('ArrowLeft')
    await expect(cells.nth(0)).toBeFocused()
    await page.keyboard.press('ArrowUp')
    await expect(search).toBeFocused()
  })
})

test.describe('the mention picker', () => {
  test('moves its highlight with the arrows, and wraps', async ({ page }) => {
    await signedIn(page, [{ id: 'brd_abcdefgh12345678', title: 'Shared', role: 'owner' }])
    await page.routeWebSocket(/\/room\//, () => undefined)
    await goto(page, `/?room=brd_abcdefgh12345678&k=${'e'.repeat(32)}`)
    await page.getByTestId('tool-comment').click()
    await page.locator(CANVAS).click({ position: { x: 280, y: 220 } })
    const input = page.getByTestId('comment-input')
    await input.pressSequentially('@')
    const options = page.getByTestId('mention-menu').getByRole('option')
    const count = await options.count()
    expect(count).toBeGreaterThan(1)
    const highlighted = async () =>
      input.evaluate((element) => element.getAttribute('aria-activedescendant'))
    const start = await highlighted()
    await page.keyboard.press('ArrowDown')
    expect(await highlighted()).not.toBe(start)
    await page.keyboard.press('ArrowUp')
    expect(await highlighted()).toBe(start)
    await page.keyboard.press('ArrowUp')
    expect(await highlighted()).toBe(`of-mention-menu-${String(count - 1)}`)
  })
})
