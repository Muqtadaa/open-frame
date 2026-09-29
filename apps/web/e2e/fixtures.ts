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
 * A point a given fraction of the way along the DRAWN line, on screen.
 *
 * Asked of the path itself rather than worked out from the two ends: a curve's
 * middle is nowhere near the middle of the straight line between them, and a
 * test that aimed there would miss the handle it is reaching for — and then
 * pass or fail for the wrong reason.
 */
export async function alongTheLine(page: Page, fraction = 0.5): Promise<{ x: number; y: number }> {
  return page.locator('.of-connector__line').evaluate((element, at: number) => {
    const path = element as unknown as SVGPathElement
    const point = path.getPointAtLength(path.getTotalLength() * at)
    const matrix = path.getScreenCTM()
    if (matrix === null) throw new Error('the line is not on screen')
    const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
    return { x: screen.x, y: screen.y }
  }, fraction)
}

/**
 * Clicks the line where a person would: on a point of the drawn stroke.
 *
 * Playwright's own click aims at the centre of the element's box, which for a
 * curve or an elbow is empty canvas, and whose hit target check the specs
 * used to switch off with `force` — clicking through whatever was on top.
 */
export async function clickLine(page: Page, fraction = 0.5): Promise<void> {
  const at = await alongTheLine(page, fraction)
  await page.mouse.click(at.x, at.y)
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
 * A value a spec needs to exist, or a failure saying what was missing.
 *
 * For reading an index or a match out of something the page drew, where the
 * compiler cannot know it is there. A branch in the test body to check it
 * was one more place an assertion could be skipped.
 */
export function defined<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) throw new Error(`missing: ${what}`)
  return value
}

interface Rect {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/** Whether two boxes share any area. Touching edges do not count. */
export function overlaps(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Each item with the one after it: `[a, b, c]` gives `[a, b]` and `[b, c]`. */
export function pairs<T>(items: readonly T[]): (readonly [T, T])[] {
  return items.slice(1).map((item, i) => [items[i] as T, item] as const)
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

/**
 * Waits until the board has been written, which is what a reload or a trip to
 * the front door needs. An edit sets the state to `pending` synchronously, so
 * this cannot pass on the state from before the edit. It replaced a fixed
 * 800ms sleep in nine specs, which was a guess at the autosave debounce.
 */
export async function saved(page: Page): Promise<void> {
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved')
}

export async function undo(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+z')
}

export async function redo(page: Page): Promise<void> {
  await page.keyboard.press('ControlOrMeta+Shift+z')
}
