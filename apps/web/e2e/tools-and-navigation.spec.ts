import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

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

  /**
   * A frame's NAME at every zoom.
   *
   * It is drawn above the frame and counter-scaled to stay a constant size on
   * screen, which is two transforms that have to cancel exactly. They did not:
   * the band was ALSO divided by the zoom, applying the counter-scale twice, so
   * it halved with every doubling — 18px at 100%, 9 at 200%, 4.5 at 400% — and
   * the 15px name inside it was clipped away entirely. Zooming in made the name
   * disappear.
   *
   * Measured rather than eyeballed, and at three zooms rather than two: a
   * single comparison passes against a band that is merely wrong by a constant.
   */
  test('keeps a frame name the same size at every zoom', async ({ page }) => {
    await page.getByTestId('tool-frame').click()
    await page.locator(CANVAS).click({ position: { x: 400, y: 300 } })
    await page.keyboard.press('Escape')
    await page.keyboard.press('v')

    const title = page.locator('.of-frame__title')
    const heightAt = async (percent: string): Promise<number> => {
      await page.getByTestId('zoom-percent').click()
      await page.getByTestId('zoom-input').fill(percent)
      await page.getByTestId('zoom-input').press('Enter')
      await expect(zoomPercent(page)).resolves.toBe(Number(percent))
      const box = await title.boundingBox()
      if (box === null) throw new Error(`the frame name is not on screen at ${percent}%`)
      return box.height
    }

    const at100 = await heightAt('100')
    // Tall enough to hold the type it is set in, or it is clipped whatever the
    // arithmetic says.
    expect(at100).toBeGreaterThan(15)
    expect(await heightAt('200')).toBeCloseTo(at100, 1)
    expect(await heightAt('400')).toBeCloseTo(at100, 1)
  })

  /**
   * A table's colour bar is CHROME, so it is the same size on screen at 25% as
   * at 400%.
   *
   * It renders inside the object's editor, which lives in world space — so
   * without a counter-scale everything in it is multiplied by the zoom, and it
   * was the size of a dialog at 400% and a stamp at 25%. Measured at three
   * zooms rather than two: one comparison passes against a bar that is merely
   * wrong by a constant.
   */
  test('keeps a table colour bar the same size at every zoom', async ({ page }) => {
    await page.getByTestId('tool-table').click()
    await page.locator(CANVAS).click({ position: { x: 420, y: 320 } })
    await page.keyboard.press('Escape')
    await page.keyboard.press('v')

    const sizeAt = async (percent: string): Promise<{ w: number; h: number }> => {
      await page.getByTestId('zoom-percent').click()
      await page.getByTestId('zoom-input').fill(percent)
      await page.getByTestId('zoom-input').press('Enter')
      await expect(zoomPercent(page)).resolves.toBe(Number(percent))
      await page.locator('[data-object-id]').first().dblclick()
      // The bar arrives on an animation that carries its own transform, so a
      // box read on the same tick is the animation's, not the layout's.
      await expect(page.getByTestId('table-cell-style')).toBeVisible()
      await page.waitForTimeout(250)
      const box = await page.getByTestId('table-cell-style').boundingBox()
      if (box === null) throw new Error(`no colour bar at ${percent}%`)
      await page.keyboard.press('Escape')
      return { w: box.width, h: box.height }
    }

    const at100 = await sizeAt('100')
    expect(at100.h).toBeGreaterThan(40)
    for (const percent of ['50', '400']) {
      const other = await sizeAt(percent)
      expect(other.w).toBeCloseTo(at100.w, 0)
      expect(other.h).toBeCloseTo(at100.h, 0)
    }
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
