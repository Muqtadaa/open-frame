import { expect, test, type Page } from '@playwright/test'

/**
 * Connectors: drawing, following their endpoints, and what happens when the
 * objects they attach to are deleted.
 */

const CANVAS = '[data-testid="canvas"]'
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

async function freshBoard(page: Page): Promise<void> {
  await page.goto('/')
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
  await expect(page.locator(CANVAS)).toBeVisible()
}

async function sticky(page: Page, x: number, y: number, text: string): Promise<void> {
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: { x, y } })
  await expect(page.locator('textarea')).toBeFocused()
  await page.locator('textarea').fill(text)
  await page.locator(CANVAS).click({ position: { x: 1180, y: 120 } })
  await expect(page.locator('textarea')).toHaveCount(0)
  await page.keyboard.press('v')
}

async function drag(page: Page, from: { x: number; y: number }, to: { x: number; y: number }) {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(from.x + ((to.x - from.x) * i) / 8, from.y + ((to.y - from.y) * i) / 8)
  }
  await page.mouse.up()
}

/**
 * Two notes with a connector between them.
 *
 * Deliberately offset on BOTH axes: a perfectly horizontal line has a
 * zero-height bounding box, which Playwright reports as hidden even though it
 * renders correctly.
 */
const A_AT = { x: 280, y: 250 }
const B_AT = { x: 780, y: 470 }

async function connectedPair(page: Page): Promise<void> {
  await sticky(page, A_AT.x, A_AT.y, 'A')
  await sticky(page, B_AT.x, B_AT.y, 'B')
  await page.keyboard.press('c')
  await drag(page, A_AT, B_AT)
  await page.keyboard.press('v')
  await expect(page.locator('[data-object-type="connector"]')).toHaveCount(1)
}

/** Midpoint of the drawn connector, in canvas coordinates. */
const MIDPOINT = { x: (A_AT.x + B_AT.x) / 2, y: (A_AT.y + B_AT.y) / 2 }

test.beforeEach(async ({ page }) => {
  await freshBoard(page)
})

test('draws a connector between two objects', async ({ page }) => {
  await connectedPair(page)
  await expect(page.locator('.of-connector__line')).toBeVisible()
})

test('does not create a connector from a stray click on empty canvas', async ({ page }) => {
  await page.keyboard.press('c')
  await page.locator(CANVAS).click({ position: { x: 500, y: 400 } })
  await expect(page.locator('[data-object-type="connector"]')).toHaveCount(0)
})

/**
 * THE property connectors are built around: the path is derived, so moving an
 * endpoint's object must move the line without ever writing to the connector.
 */
test('follows an endpoint when its object moves', async ({ page }) => {
  await connectedPair(page)

  const pathOf = async () => page.locator('.of-connector__line').getAttribute('d')
  const before = await pathOf()

  await page.locator('[data-object-type="sticky"]').first().click()
  for (let i = 0; i < 12; i++) await page.keyboard.press('Shift+ArrowDown')

  expect(await pathOf()).not.toBe(before)
})

test('converts an orphaned end to a free point and keeps the connector', async ({ page }) => {
  await connectedPair(page)

  await page.locator('[data-object-type="sticky"]').first().click()
  await page.keyboard.press('Delete')

  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
  await expect(page.locator('[data-object-type="connector"]')).toHaveCount(1)
})

test('deletes the connector when both ends are orphaned', async ({ page }) => {
  await connectedPair(page)

  await page.keyboard.press(`${MOD}+a`)
  // Select-all includes the connector; deleting everything must not error.
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-object-type="connector"]')).toHaveCount(0)
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)
})

test('restores the attachment on undo', async ({ page }) => {
  await connectedPair(page)

  await page.locator('[data-object-type="sticky"]').first().click()
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)

  await page.keyboard.press(`${MOD}+z`)
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
  await expect(page.locator('[data-object-type="connector"]')).toHaveCount(1)
})

test('is selectable and labellable', async ({ page }) => {
  await connectedPair(page)

  // Clicked through the canvas rather than the SVG node: selection is decided
  // by geometric hit testing, which is what this is exercising.
  await page.locator(CANVAS).click({ position: MIDPOINT })
  await expect(page.getByTestId('selection-overlay')).toBeVisible()

  await page.locator(CANVAS).dblclick({ position: MIDPOINT })
  await expect(page.locator('textarea')).toBeFocused()
  await page.locator('textarea').fill('depends on')
  await page.locator(CANVAS).click({ position: { x: 1180, y: 120 } })
  await expect(page.locator('.of-connector__label')).toContainText('depends on')
})

test('survives a reload', async ({ page }) => {
  await connectedPair(page)
  await page.waitForTimeout(800)
  await page.reload()
  await expect(page.locator('[data-object-type="connector"]')).toHaveCount(1)
  await expect(page.locator('.of-connector__line')).toBeVisible()
})

/**
 * Bounds containment alone would select the connector from anywhere in the
 * rectangle spanning its endpoints — including the empty space beside the line.
 * The registry's precise hit test is what prevents that.
 */
test('is not selected by a click far from the line but inside its bounds', async ({ page }) => {
  await connectedPair(page)

  // Inside the bounding rectangle of the diagonal, nowhere near the line.
  await page.locator(CANVAS).click({ position: { x: B_AT.x - 40, y: A_AT.y + 20 } })
  await expect(page.getByTestId('selection-overlay')).toHaveCount(0)
})
