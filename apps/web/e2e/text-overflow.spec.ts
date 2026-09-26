import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * What text does when there is more of it than there is room.
 *
 * Every assertion here measures the RESULT — where the text sits, how tall it
 * is, whether it stays inside its object. Not one of them checks that a style
 * was written, because that is exactly what the previous suite did: vertical
 * alignment was asserted by reading back the property the panel had just set,
 * which passes whether or not the element it lands on can do anything with it.
 * It could not, on a sticky note or in a table, for as long as the feature had
 * shipped.
 */
const CANVAS = '[data-testid="canvas"]'

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

/** Places an object, types into the editor it opens, and COMMITS. */
async function write(page: Page, tool: string, at: { x: number; y: number }, text: string) {
  await page.getByTestId(`tool-${tool}`).click()
  await page.locator(CANVAS).click({ position: at })
  await page.keyboard.type(text)
  // Clicking away commits (as Escape now does too).
  await page.locator(CANVAS).click({ position: { x: 240, y: 630 } })
  await page.keyboard.press('v')
}

const LONG =
  'one two three four five six seven eight nine ten eleven twelve thirteen fourteen ' +
  'fifteen sixteen seventeen eighteen nineteen twenty twenty-one twenty-two'

test('a sticky note aligns its text down the box', async ({ page }) => {
  await board(page)
  await write(page, 'sticky', { x: 500, y: 300 }, 'short')

  const top = async (): Promise<number> =>
    await page
      .locator('.of-sticky__text')
      .first()
      .evaluate((el) => (el as HTMLElement).getBoundingClientRect().top)

  await page.locator('[data-object-id]').first().click()
  const atTop = await top()

  await page.getByTestId('verticalAlign-bottom').click()
  const atBottom = await top()

  /*
   * MOVED, by most of the height of the note. The element this lands on
   * computed `display: block` until this change, where `justify-content` is
   * inert, so the text did not move a pixel and the old test still passed.
   */
  expect(atBottom).toBeGreaterThan(atTop + 80)

  await page.getByTestId('verticalAlign-middle').click()
  const atMiddle = await top()
  expect(atMiddle).toBeGreaterThan(atTop + 20)
  expect(atMiddle).toBeLessThan(atBottom - 20)
})

test('a table cell aligns its text down', async ({ page }) => {
  await board(page)
  await page.getByTestId('tool-table').click()
  await page.locator(CANVAS).click({ position: { x: 560, y: 300 } })
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')

  await page.locator('[data-object-id]').first().dblclick()
  // A spreadsheet: select the cell, and typing replaces it.
  await page.getByTestId('table-cell-0').click()
  await page.keyboard.type('hello')
  await page.keyboard.press('Enter')
  await page.locator(CANVAS).click({ position: { x: 240, y: 630 } })

  const top = async (): Promise<number> =>
    await page
      .locator('[role="table"] .of-table__cell-text')
      .first()
      .evaluate((el) => (el as HTMLElement).getBoundingClientRect().top)

  await page.locator('[data-object-id]').first().click()
  const atTop = await top()

  await page.getByTestId('verticalAlign-bottom').click()
  /*
   * The table used to set this on ITSELF, which is a grid — where
   * `justify-content` distributes tracks along the inline axis and moves
   * nothing vertically at all.
   */
  expect(await top()).toBeGreaterThan(atTop + 20)
})

test('shape text stays inside the shape', async ({ page }) => {
  await board(page)
  await write(page, 'shape', { x: 560, y: 300 }, LONG)

  const escaped = await page.locator('.of-shape__label-text').first().evaluate((el) => {
    const label = el.closest('.of-shape__label')!
    const text = el.getBoundingClientRect()
    const box = label.getBoundingClientRect()
    return { over: text.bottom - box.bottom, hidden: el.scrollHeight > el.clientHeight }
  })

  /*
   * It used to run straight out of the shape and over whatever was beside it,
   * while a sticky and a text box both clipped — and an object whose text
   * escapes its bounds disagrees with culling, hit testing and marquee
   * selection, every one of which asks the registry for the extent.
   *
   * The CLAMP is what holds it in, not the `overflow: hidden` beside it:
   * removing the overflow rule leaves this passing, and removing the clamp
   * lets 81 pixels of text back out. Worth knowing which line is load-bearing
   * before trusting either.
   */
  expect(escaped.over).toBeLessThanOrEqual(1)
  expect(escaped.hidden).toBe(true)
})

test('hidden text is marked rather than silently cut', async ({ page }) => {
  await board(page)
  await write(page, 'sticky', { x: 500, y: 300 }, LONG)

  const clamp = await page.locator('.of-sticky__text').first().evaluate((el) => {
    const style = getComputedStyle(el)
    const box = el.parentElement!
    return {
      lines: style.webkitLineClamp,
      truncated: el.scrollHeight > el.clientHeight || el.clientHeight < box.clientHeight,
      fits: el.getBoundingClientRect().height <= box.clientHeight + 1,
    }
  })

  /*
   * A real line count, derived in CSS from the box's own height and the text's
   * own line height — no measurement, and no copy of the padding or the font
   * size in JavaScript to drift when the stylesheet moves. `-webkit-line-clamp`
   * is what draws the ellipsis, so a number here IS the mark.
   */
  expect(Number(clamp.lines)).toBeGreaterThan(0)
  expect(Number.isNaN(Number(clamp.lines))).toBe(false)
  expect(clamp.fits).toBe(true)
})

/**
 * Double-clicking a side handle grows the object until its text fits.
 *
 * The same gesture a table's divider answers to, on the handle for the axis
 * you want fitted: the bottom one fits the height, the right one fits the
 * width.
 */
test('double-clicking the bottom handle fits a sticky to its text', async ({ page }) => {
  await board(page)
  await write(page, 'sticky', { x: 500, y: 300 }, LONG)

  const hidden = async (): Promise<boolean> =>
    await page
      .locator('.of-sticky__text')
      .first()
      .evaluate((el) => el.scrollHeight > el.clientHeight + 1)

  await page.locator('[data-object-id]').first().click()
  expect(await hidden()).toBe(true)

  const before = (await page.locator('[data-object-id]').first().boundingBox())?.height ?? 0
  const grip = await page.getByTestId('handle-s').boundingBox()
  if (grip === null) throw new Error('no bottom handle')
  await page.mouse.dblclick(grip.x + grip.width / 2, grip.y + grip.height / 2)

  const after = (await page.locator('[data-object-id]').first().boundingBox())?.height ?? 0
  expect(after).toBeGreaterThan(before)
  // The point of the gesture: NOTHING is hidden any more.
  await expect.poll(hidden).toBe(false)

  // And it is one ordinary resize, so one undo puts it back.
  await page.keyboard.press('ControlOrMeta+z')
  await expect
    .poll(async () => (await page.locator('[data-object-id]').first().boundingBox())?.height ?? 0)
    .toBeCloseTo(before, 0)
})

test('double-clicking the right handle fits a shape to its widest line', async ({ page }) => {
  await board(page)
  await write(page, 'shape', { x: 560, y: 300 }, 'a single line that is wider than this shape is')

  await page.locator('[data-object-id]').first().click()
  const before = (await page.locator('[data-object-id]').first().boundingBox())?.width ?? 0

  const grip = await page.getByTestId('handle-e').boundingBox()
  if (grip === null) throw new Error('no right handle')
  await page.mouse.dblclick(grip.x + grip.width / 2, grip.y + grip.height / 2)

  const after = (await page.locator('[data-object-id]').first().boundingBox())?.width ?? 0
  expect(after).toBeGreaterThan(before)

  /*
   * ON ONE LINE, which is what fitting a WIDTH means.
   *
   * The first version of this asserted that nothing was hidden vertically,
   * which clears itself the moment the box gets any wider — the text rewraps
   * onto fewer lines and the assertion passes however short the fit fell. It
   * passed against a deliberately naive fit that undershoots.
   *
   * A shape's label is inset by a PERCENTAGE of the shape, so the width it
   * needs is not the text plus a fixed surround; it is the text divided by the
   * fraction the label occupies. Subtracting a measured surround — right for a
   * sticky note's fixed padding — lands short here every time.
   */
  const lines = await page
    .locator('.of-shape__label-text')
    .first()
    .evaluate((el) => {
      const lineHeight = Number.parseFloat(window.getComputedStyle(el).lineHeight)
      return Math.round(el.getBoundingClientRect().height / lineHeight)
    })
  expect(lines).toBe(1)
})

/**
 * The eight structured types share one body element, and it had the same
 * defect: the view sets `justify-content` on it and it was a block box.
 * Covered once here rather than eight times, because one element is what they
 * all render through.
 */
test('a structured slip aligns its text down', async ({ page }) => {
  await board(page)
  await write(page, 'sticky', { x: 500, y: 300 }, 'short')

  await page.locator(CANVAS).click({ position: { x: 500, y: 300 } })
  await page.locator(CANVAS).click({ position: { x: 500, y: 300 }, button: 'right' })
  await expect(page.getByTestId('context-menu')).toBeVisible()
  await page.getByTestId('menu-promote-to-evidence').click()
  await expect(page.locator('.of-slip')).toHaveCount(1)

  const top = async (): Promise<number> =>
    await page
      .locator('.of-slip__text')
      .first()
      .evaluate((el) => (el as HTMLElement).getBoundingClientRect().top)

  await page.locator('[data-object-id]').first().click()
  const atTop = await top()

  // A slip carries a record, so its appearance starts folded away.
  await page.getByTestId('inspector-appearance').click()
  await page.getByTestId('verticalAlign-bottom').click()
  expect(await top()).toBeGreaterThan(atTop + 40)
})
