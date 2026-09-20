import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * The record panel.
 *
 * Its fields come from the registry's `styleProps`, so what this really tests is
 * that a type's declared capabilities reach the interface. Before it existed,
 * six types declared fill, stroke, font, align and opacity between them and none
 * of the five could be set by anyone.
 */

const CANVAS = '[data-testid="canvas"]'
/*
 * Whatever is currently editable in place.
 *
 * Body text is a `contenteditable` since rich text (ADR 0012); a frame's title
 * and an image's alt text are labels and stay plain textareas. A spec should
 * not have to know which it is about to type into.
 */
const EDITOR = 'textarea, [contenteditable="true"]'
const EMPTY = { x: 1120, y: 150 }

async function freshBoard(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase('openframe')
        r.onsuccess = () => resolve()
        r.onerror = () => resolve()
        r.onblocked = () => resolve()
      }),
  )
  await page.reload()
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

async function place(page: Page, tool: string, x: number, y: number, text: string): Promise<void> {
  await page.keyboard.press(tool)
  await page.locator(CANVAS).click({ position: { x, y } })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.locator(EDITOR).fill(text)
  await page.locator(CANVAS).click({ position: EMPTY })
  await expect(page.locator(EDITOR)).toHaveCount(0)
  await page.keyboard.press('v')
}

test.describe('inspector', () => {
  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
  })

  test('appears with a selection and leaves with it', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await expect(page.getByTestId('inspector')).toHaveCount(0)

    await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
    await expect(page.getByTestId('inspector')).toBeVisible()

    await page.locator(CANVAS).click({ position: EMPTY })
    await expect(page.getByTestId('inspector')).toHaveCount(0)
  })

  /**
   * A sticky declares neither `fill` nor `stroke`; a shape declares both. The
   * panel must differ between them, or it is rendering a hardcoded list rather
   * than each type's own capabilities.
   */
  test('shows only the properties the selected type declares', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
    await expect(page.getByTestId('swatch-blue')).toBeVisible()
    await expect(page.getByTestId('fill-solid')).toHaveCount(0)
    await expect(page.getByTestId('stroke-thick')).toHaveCount(0)

    await page.locator(CANVAS).click({ position: EMPTY })
    await place(page, 'u', 340, 560, 'Box')
    await page.locator(CANVAS).click({ position: { x: 340, y: 560 } })
    await expect(page.getByTestId('fill-solid')).toBeVisible()
    await expect(page.getByTestId('stroke-thick')).toBeVisible()
  })

  test('sets fill on a shape, which nothing could reach before', async ({ page }) => {
    await place(page, 'u', 340, 300, 'Box')
    await page.locator(CANVAS).click({ position: { x: 340, y: 300 } })

    await page.getByTestId('fill-none').click()
    await expect(page.locator('.of-shape__svg path')).toHaveAttribute('fill', 'transparent')
  })

  test('sets opacity', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })

    await page.getByTestId('opacity').fill('50')
    await expect(page.locator('.of-sticky')).toHaveCSS('opacity', '0.5')
  })

  test('a style change is one undoable action', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
    await page.getByTestId('swatch-green').click()
    await expect(page.locator('.of-sticky')).toHaveCSS('background-color', 'rgb(191, 240, 212)')

    await page.getByTestId('undo').click()
    await expect(page.locator('.of-sticky')).toHaveCSS('background-color', 'rgb(255, 233, 163)')
  })

  /**
   * TEXT COLOUR, on the thing it colours.
   *
   * The ink is set on the note and inherited by the words, so this reads the
   * computed colour off the element the text is actually in — a capability
   * nothing in the UI consumes is untested, and one the UI sets without the
   * view honouring it is worse, because the panel then lies.
   */
  test('inks a note without touching its paper', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })

    const paper = await page.locator('.of-sticky').evaluate(
      (note) => getComputedStyle(note).backgroundColor,
    )

    await page.getByTestId('ink-red').click()
    await expect(page.locator('.of-sticky')).toHaveCSS('color', 'rgb(138, 64, 56)')
    // The note is still the colour it was: two controls, two properties.
    await expect(page.locator('.of-sticky')).toHaveCSS('background-color', paper)
  })

  /**
   * A text object's colour IS its ink, so it offers `textColor` and NOT
   * `color` — otherwise selecting it alongside a sticky intersects on `color`
   * and one swatch sets paper on one and ink on the other.
   */
  test('a text object offers ink and no paper', async ({ page }) => {
    await place(page, 't', 340, 260, 'Words')
    await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })

    await expect(page.getByTestId('ink-blue')).toBeVisible()
    await expect(page.getByTestId('swatch-blue')).toHaveCount(0)

    await page.getByTestId('ink-blue').click()
    await expect(page.locator('.of-text')).toHaveCSS('color', 'rgb(23, 82, 158)')
  })

  /**
   * And the point of the split: a sticky and a text together now share ONE
   * meaning for the ink swatch, where before they shared a swatch and not a
   * meaning.
   */
  test('inks a sticky and a text together', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await place(page, 't', 640, 260, 'Words')
    await page.keyboard.press('Control+a')

    await page.getByTestId('ink-green').click()
    await expect(page.locator('.of-sticky')).toHaveCSS('color', 'rgb(20, 96, 69)')
    await expect(page.locator('.of-text')).toHaveCSS('color', 'rgb(20, 96, 69)')
  })

  /**
   * A colour that is not in the palette.
   *
   * The wheel writes a LITERAL, which the document model now allows beside a
   * token — and the whole point is that what lands on the board is the exact
   * value picked, so this reads it back off the element rather than trusting
   * the field.
   */
  test('paints a colour typed into the picker', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })

    await page.getByTestId('ink-custom').click()
    await expect(page.getByTestId('color-picker')).toBeVisible()

    await page.getByTestId('picker-hex').fill('#3a7bd5')
    await expect(page.locator('.of-sticky')).toHaveCSS('color', 'rgb(58, 123, 213)')

    /*
     * The custom swatch now shows what it holds, so the row still answers
     * "what is this set to" when the answer is not in the palette.
     */
    await expect(page.getByTestId('ink-custom')).toHaveCSS(
      'background-color',
      'rgb(58, 123, 213)',
    )
  })

  /**
   * Three digits are what people write, and a half-typed colour is not one.
   */
  test('takes a short hex and ignores an unfinished one', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
    await page.getByTestId('ink-custom').click()

    await page.getByTestId('picker-hex').fill('#0a0')
    await expect(page.locator('.of-sticky')).toHaveCSS('color', 'rgb(0, 170, 0)')

    // `#0a` is on the way to somewhere; the board must not flicker through it.
    await page.getByTestId('picker-hex').fill('#0a')
    await expect(page.locator('.of-sticky')).toHaveCSS('color', 'rgb(0, 170, 0)')
  })

  /**
   * The contrast is SAID, not enforced. A warning that blocked the choice
   * would be the panel overruling somebody matching a brand colour.
   */
  test('warns when a colour will be hard to read, without refusing it', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
    await page.getByTestId('ink-custom').click()

    // Pale yellow ink on the default yellow slip.
    await page.getByTestId('picker-hex').fill('#ffe9a3')
    await expect(page.getByTestId('picker-contrast')).toContainText('Hard to read')
    await expect(page.locator('.of-sticky')).toHaveCSS('color', 'rgb(255, 233, 163)')

    await page.getByTestId('picker-hex').fill('#7a5c00')
    await expect(page.getByTestId('picker-contrast')).toContainText('Readable')
  })

  /**
   * One control must mean one thing, so a mixed selection offers only what every
   * member honours. A shape has `stroke`; a sticky does not.
   */
  test('a mixed selection offers the intersection', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await place(page, 'u', 640, 260, 'Box')
    await page.keyboard.press('Control+a')

    await expect(page.getByTestId('inspector')).toBeVisible()
    await expect(page.getByTestId('swatch-blue')).toBeVisible()
    await expect(page.getByTestId('stroke-thick')).toHaveCount(0)
  })

  /** The panel is chrome; it must never land on the tool rail. */
  test('stays clear of the rail even when the selection spans the board', async ({ page }) => {
    await place(page, 's', 200, 240, 'Left')
    await place(page, 's', 1150, 640, 'Right')
    await page.keyboard.press('Control+a')

    const panel = await page.getByTestId('inspector').boundingBox()
    const rail = await page.locator('.of-rail').boundingBox()
    if (panel === null || rail === null) throw new Error('missing geometry')
    expect(panel.x).toBeGreaterThan(rail.x + rail.width)
  })

  test('deletes the selection', async ({ page }) => {
    await place(page, 's', 340, 260, 'Note')
    await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })

    await page.getByTestId('inspector-delete').click()
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)
  })
})
