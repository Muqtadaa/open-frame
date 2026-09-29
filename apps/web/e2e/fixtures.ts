import { test as base, expect, type Locator, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * What most specs need before their first line, and the gestures they repeat.
 *
 * `freshBoard` was copied into twelve specs and `board` into twelve more, and
 * the copies had begun to drift: one of them had lost the wait for the rail,
 * which is the wait that keeps a spec's first keystroke from landing before
 * the shortcut listener exists. A spec now states which board it wants with
 * `test.use({ board: 'fresh' })` and gets the same opening as every other.
 */

export { expect }

export const CANVAS = '[data-testid="canvas"]'

/**
 * Whatever is currently editable in place.
 *
 * Body text is a `contenteditable` since rich text (ADR 0012); a frame's title
 * and an image's alt text are labels and stay plain textareas. A spec should
 * not have to know which it is about to type into.
 */
export const EDITOR = 'textarea, [contenteditable="true"]'

export interface Point {
  readonly x: number
  readonly y: number
}

/**
 * - `none`: the spec opens what it needs itself (the front door, a room).
 * - `open`: the local board, as it was left.
 * - `fresh`: the local board with nothing stored, so no test sees another's work.
 */
export type BoardState = 'none' | 'open' | 'fresh'

async function waitForBoard(page: Page): Promise<void> {
  await expect(page.locator(CANVAS)).toBeVisible()
  /*
   * Also wait for the rail. A visible canvas only means React rendered;
   * `useKeyboardShortcuts` attaches its listener in an effect, which runs after
   * paint, so a keystroke sent on the canvas alone can land in the gap and be
   * dropped. That showed up as a rare, unexplained tool-selection failure.
   */
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

/** Opens the local board as it was left. */
export async function openBoard(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await waitForBoard(page)
}

/** Opens the local board with nothing stored. */
export async function openFreshBoard(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('openframe')
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
      }),
  )
  await page.reload()
  await waitForBoard(page)
}

export const test = base.extend<{ board: BoardState; openedBoard: undefined }>({
  board: ['none', { option: true }],
  openedBoard: [
    async ({ page, board }, use) => {
      if (board === 'open') await openBoard(page)
      if (board === 'fresh') await openFreshBoard(page)
      await use(undefined)
    },
    { auto: true },
  ],
})

/**
 * Presses, moves in eight steps, releases.
 *
 * Steps rather than a jump because a gesture decides what it is from the
 * pointer's travel — a jump would be a click at the far end. `midway` runs
 * while the button is still down, for what a preview shows before commit.
 */
export async function drag(
  page: Page,
  from: Point,
  to: Point,
  midway?: () => Promise<void>,
): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
  }
  if (midway !== undefined) await midway()
  await page.mouse.up()
}

/**
 * Where an element is on screen — or a failure saying it is not there.
 *
 * `boundingBox()` answers null for an element that is missing or hidden, and
 * a test that returned early on null passed without asserting anything: 58
 * places did, and a missing handle read as a working one.
 */
export async function boxOf(
  locator: Locator,
): Promise<{ x: number; y: number; width: number; height: number }> {
  const box = await locator.boundingBox()
  if (box === null) throw new Error(`no bounding box for ${locator.toString()}`)
  return box
}

/** The window's size, or a failure: a spec that measures against it must not skip. */
export function viewportOf(page: Page): { width: number; height: number } {
  const size = page.viewportSize()
  if (size === null) throw new Error('the page has no viewport')
  return size
}

/**
 * Makes an object with a tool's key and, if given, types into it.
 *
 * The sequence every spec used: press the key, click where it goes, wait for
 * the editor, type, click `away` to finish, wait for the editor to close, and
 * go back to the select tool so the next click selects instead of placing.
 */
export async function place(
  page: Page,
  key: string,
  at: Point,
  text = '',
  away: Point = { x: 1100, y: 180 },
): Promise<void> {
  await page.keyboard.press(key)
  await page.locator(CANVAS).click({ position: at })
  await expect(page.locator(EDITOR)).toBeFocused()
  if (text !== '') await page.locator(EDITOR).fill(text)
  await page.locator(CANVAS).click({ position: away })
  await expect(page.locator(EDITOR)).toHaveCount(0)
  await page.keyboard.press('v')
}

export async function undo(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+z')
}

export async function redo(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+Shift+z')
}
