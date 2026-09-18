import { expect, test, type Page } from '@playwright/test'

/**
 * The record panel.
 *
 * Its fields come from the registry's `styleProps`, so what this really tests is
 * that a type's declared capabilities reach the interface. Before it existed,
 * six types declared fill, stroke, font, align and opacity between them and none
 * of the five could be set by anyone.
 */

const CANVAS = '[data-testid="canvas"]'
const EMPTY = { x: 1120, y: 150 }

async function freshBoard(page: Page): Promise<void> {
  await page.goto('/')
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
  await expect(page.locator('textarea')).toBeFocused()
  await page.locator('textarea').fill(text)
  await page.locator(CANVAS).click({ position: EMPTY })
  await expect(page.locator('textarea')).toHaveCount(0)
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
