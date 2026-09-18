import { expect, test, type Page } from '@playwright/test'

/**
 * Tools, shortcuts and viewport navigation.
 *
 * These live in the browser suite because every one of them is about real
 * input: keyboard focus routing, wheel event defaults and pointer capture are
 * exactly what unit tests cannot observe.
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
  /*
   * Also wait for the toolbar. A visible canvas only means React rendered;
   * `useKeyboardShortcuts` attaches its listener in an effect, which runs after
   * paint, so a keystroke sent on the canvas alone can land in the gap and be
   * dropped. That showed up as a rare, unexplained tool-selection failure.
   */
  await expect(page.getByTestId("tool-select")).toBeVisible()
}

async function zoomPercent(page: Page): Promise<number> {
  return Number((await page.getByTestId('zoom-percent').textContent())?.replace('%', '') ?? '0')
}

test.beforeEach(async ({ page }) => {
  await freshBoard(page)
})

test.describe('keyboard tool selection', () => {
  test('V, S, T and H select their tools', async ({ page }) => {
    await page.keyboard.press('s')
    await expect(page.getByTestId('tool-sticky')).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('t')
    await expect(page.getByTestId('tool-text')).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('h')
    await expect(page.getByTestId('tool-pan')).toHaveAttribute('aria-pressed', 'true')

    await page.keyboard.press('v')
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')
  })

  test('U selects the shape tool and cycles its variant', async ({ page }) => {
    await page.keyboard.press('u')
    await expect(page.getByTestId('tool-shape')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('shape-menu').click()
    await expect(page.getByTestId('shape-rectangle')).toHaveAttribute('aria-checked', 'true')
    await page.getByTestId('shape-menu').click()

    await page.keyboard.press('u')
    await page.getByTestId('shape-menu').click()
    await expect(page.getByTestId('shape-ellipse')).toHaveAttribute('aria-checked', 'true')
  })

  /** A 'v' typed into a note must stay a 'v', not switch tools. */
  test('shortcuts do not fire while typing in an object', async ({ page }) => {
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 400, y: 300 } })
    await page.locator(EDITOR).fill('vsth')
    await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')
    await page.locator(CANVAS).click({ position: { x: 800, y: 500 } })
    await expect(page.locator('[data-object-type="sticky"]')).toContainText('vsth')
  })
})

test.describe('creating each object type', () => {
  test('creates text', async ({ page }) => {
    await page.keyboard.press('t')
    await page.locator(CANVAS).click({ position: { x: 400, y: 300 } })
    await page.locator(EDITOR).fill('A heading')
    await page.locator(CANVAS).click({ position: { x: 800, y: 500 } })
    await expect(page.locator('[data-object-type="text"]')).toContainText('A heading')
  })

  test('creates a shape with a label', async ({ page }) => {
    await page.keyboard.press('u')
    await page.locator(CANVAS).click({ position: { x: 400, y: 300 } })
    await page.locator(EDITOR).fill('Process')
    await page.locator(CANVAS).click({ position: { x: 800, y: 500 } })
    await expect(page.locator('[data-object-type="shape"]')).toContainText('Process')
    await expect(page.locator('.of-shape__svg')).toBeVisible()
  })
})

test.describe('zoom', () => {
  test('zooms with the toolbar buttons and resets', async ({ page }) => {
    await expect(zoomPercent(page)).resolves.toBe(100)
    await page.getByTestId('zoom-in').click()
    // Round percentages only: 100 → 200, never 150. The readout shows this
    // number directly, and 75% reads as having landed somewhere by accident.
    await expect(zoomPercent(page)).resolves.toBe(200)
    await page.getByTestId('zoom-out').click()
    await page.getByTestId('zoom-out').click()
    await expect(zoomPercent(page)).resolves.toBe(50)
  })

  test('accepts a typed percentage', async ({ page }) => {
    await page.getByTestId('zoom-percent').click()
    await page.getByTestId('zoom-input').fill('250')
    await page.getByTestId('zoom-input').press('Enter')
    await expect(zoomPercent(page)).resolves.toBe(250)
  })

  /**
   * The reported bug: Ctrl/Cmd +/- drove the browser's zoom as well as the
   * canvas. The fix is that the keymap claims these and the handler calls
   * preventDefault, so the canvas percentage changes and the page does not.
   */
  test('claims Mod+plus, Mod+minus and Mod+0 instead of the browser', async ({ page }) => {
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

    await page.keyboard.press(`${mod}+=`)
    await expect(zoomPercent(page)).resolves.toBe(200)

    await page.keyboard.press(`${mod}+-`)
    await expect(zoomPercent(page)).resolves.toBe(100)

    await page.keyboard.press(`${mod}+=`)
    await page.keyboard.press(`${mod}+0`)
    await expect(zoomPercent(page)).resolves.toBe(100)

    // The page itself must not have scaled.
    await expect(page.evaluate(() => window.devicePixelRatio)).resolves.toBeGreaterThan(0)
    await expect(page.evaluate(() => window.visualViewport?.scale ?? 1)).resolves.toBe(1)
  })

  test('scroll zooms by default and the preference can be switched', async ({ page }) => {
    await expect(page.getByTestId('wheel-mode')).toHaveAttribute('data-mode', 'zoom')

    await page.mouse.move(600, 400)
    await page.mouse.wheel(0, -240)
    await expect(zoomPercent(page)).resolves.toBeGreaterThan(100)

    await page.getByTestId('wheel-mode').click()
    await expect(page.getByTestId('wheel-mode')).toHaveAttribute('data-mode', 'pan')

    const before = await zoomPercent(page)
    await page.mouse.move(600, 400)
    await page.mouse.wheel(0, -240)
    await expect(zoomPercent(page)).resolves.toBe(before)
  })

  test('zoom to fit frames the content', async ({ page }) => {
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 300, y: 250 } })
    await page.locator(CANVAS).click({ position: { x: 900, y: 550 } })
    await page.keyboard.press('v')

    await page.getByTestId('zoom-fit').click()
    await expect(zoomPercent(page)).resolves.toBeGreaterThan(0)
  })
})

test.describe('selection shortcuts', () => {
  test('select all, duplicate, then undo', async ({ page }) => {
    const mod = process.platform === 'darwin' ? 'Meta' : 'Control'

    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 400, y: 300 } })
    await page.locator(CANVAS).click({ position: { x: 900, y: 500 } })
    await page.keyboard.press('v')

    await page.keyboard.press(`${mod}+a`)
    await expect(page.locator('.of-object--selected')).toHaveCount(1)

    await page.keyboard.press(`${mod}+d`)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)

    await page.keyboard.press(`${mod}+z`)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
  })

  test('arrow keys nudge the selection', async ({ page }) => {
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: { x: 400, y: 300 } })
    await page.locator(CANVAS).click({ position: { x: 900, y: 500 } })
    await page.keyboard.press('v')

    await page.locator('[data-object-type="sticky"]').click()
    const before = await page.locator('[data-object-type="sticky"]').boundingBox()
    expect(before).not.toBeNull()
    if (before === null) return

    for (let i = 0; i < 5; i++) await page.keyboard.press('Shift+ArrowRight')

    const after = await page.locator('[data-object-type="sticky"]').boundingBox()
    expect(after).not.toBeNull()
    if (after === null) return
    expect(Math.round(after.x - before.x)).toBe(50)
  })
})
