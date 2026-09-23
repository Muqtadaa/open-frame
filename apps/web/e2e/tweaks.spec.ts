import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * Three things that were each telling a small lie about what the board does.
 */
const CANVAS = '[data-testid="canvas"]'

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

async function note(page: Page, at: { x: number; y: number }, text: string): Promise<void> {
  await page.getByTestId('tool-sticky').click()
  await page.locator(CANVAS).click({ position: at })
  await page.keyboard.type(text)
  await page.locator(CANVAS).click({ position: { x: 1180, y: 150 } })
  await page.keyboard.press('v')
}

/**
 * The cursor over an object.
 *
 * There was no cursor rule on `.of-object` at all, so it fell through to
 * `auto` — and `auto` over selectable text is an I-beam. Every note and label
 * promised typing on hover and gave a selection on click.
 */
test('an object does not promise a caret it will not give you', async ({ page }) => {
  await board(page)
  await note(page, { x: 500, y: 300 }, 'hello')

  const object = page.locator('[data-object-id]').first()
  await expect(object).toHaveCSS('cursor', 'default')

  // Selected and draggable, so the cursor says what the next press does.
  await object.click()
  await expect(object).toHaveCSS('cursor', 'move')

  /*
   * And the caret appears exactly where typing happens, which is the one place
   * an I-beam is the truth.
   */
  await object.dblclick()
  await expect(page.locator('[contenteditable="true"]').first()).toHaveCSS('cursor', 'text')
})

test.describe('a locked object', () => {
  async function lock(page: Page): Promise<void> {
    await note(page, { x: 500, y: 300 }, 'pinned')
    await page.locator('[data-object-id]').first().click()
    await page.locator(CANVAS).click({ position: { x: 500, y: 300 }, button: 'right' })
    await expect(page.getByTestId('context-menu')).toBeVisible()
    await page.getByTestId('menu-lock').click()
  }

  test('does not follow the pointer and snap back', async ({ page }) => {
    await board(page)
    await lock(page)

    const before = await page.locator('[data-object-id]').first().boundingBox()
    if (before === null) throw new Error('no object')

    /*
     * The command has always refused this — `requireUnlocked` is in the
     * handler — but by the time it did, the gesture had run: the object
     * followed the pointer across the board and snapped back on release,
     * which reads as the app dropping a change rather than as the object
     * being held in place.
     *
     * Asserted MID-DRAG, because that is the only moment the old behaviour
     * was visible; checking the final position passes either way.
     */
    await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
    await page.mouse.down()
    await page.mouse.move(before.x + 200, before.y + 150, { steps: 8 })
    const during = await page.locator('[data-object-id]').first().boundingBox()
    expect(during?.x).toBeCloseTo(before.x, 0)
    expect(during?.y).toBeCloseTo(before.y, 0)
    await page.mouse.up()

    const after = await page.locator('[data-object-id]').first().boundingBox()
    expect(after?.x).toBeCloseTo(before.x, 0)
  })

  test('says why its handles are missing', async ({ page }) => {
    await board(page)
    await lock(page)
    await page.locator('[data-object-id]').first().click()

    // A selected object with no grips and no explanation reads as a bug.
    await expect(page.getByTestId('selection-lock')).toBeVisible()
    await expect(page.getByTestId('handle-se')).toHaveCount(0)
  })

  test('can still be selected, because that is how you unlock it', async ({ page }) => {
    await board(page)
    await lock(page)
    await page.locator(CANVAS).click({ position: { x: 1180, y: 150 } })
    await page.locator('[data-object-id]').first().click()
    await expect(page.getByTestId('selection-lock')).toBeVisible()
  })
})

/**
 * Commenting is the one tool you aim AT something.
 *
 * Every other placing tool only ever acts on empty board, so painting the
 * cursor on the canvas was enough for them. An object answers for its own
 * cursor — `default` at rest, `move` when selected — so the mode that is
 * entirely about objects was the one mode where the cursor was wrong over
 * everything worth using it on. The canvas half of this passed on its own;
 * the object half is the half that was broken.
 */
test.describe('the comment tool', () => {
  test('is reached by the key the button says it is', async ({ page }) => {
    await board(page)
    await page.keyboard.press('m')
    await expect(page.getByTestId('tool-comment')).toHaveAttribute('aria-pressed', 'true')
  })

  test('shows its cursor over an object, not only over empty board', async ({ page }) => {
    await board(page)
    await note(page, { x: 500, y: 300 }, 'about this')

    const object = page.locator('[data-object-id]').first()
    await expect(object).toHaveCSS('cursor', 'default')

    await page.keyboard.press('m')
    const armed = await page.locator(CANVAS).evaluate((el) => getComputedStyle(el).cursor)
    expect(armed, 'the canvas is not showing a tool cursor').toContain('data:image/svg+xml')
    await expect(object).toHaveCSS('cursor', armed)
  })

  test('keeps the comment cursor over something already selected', async ({ page }) => {
    await board(page)
    await note(page, { x: 500, y: 300 }, 'about this')

    const object = page.locator('[data-object-id]').first()
    await object.click()
    await expect(object).toHaveCSS('cursor', 'move')

    // `move` is a stronger claim than `default` and beat the canvas too.
    await page.keyboard.press('m')
    const armed = await page.locator(CANVAS).evaluate((el) => getComputedStyle(el).cursor)
    await expect(object).toHaveCSS('cursor', armed)
  })

  /**
   * The point of a tool cursor, and the thing `crosshair` could never say.
   *
   * Every placing tool painted the same plus sign, so the pointer answered
   * "you are about to put something down" and never which thing — and the
   * rail is at the edge of the screen while the pointer is where you are
   * looking.
   */
  test('says WHICH tool is armed, not merely that one is', async ({ page }) => {
    await board(page)
    const cursor = async (): Promise<string> =>
      await page.locator(CANVAS).evaluate((el) => getComputedStyle(el).cursor)

    await page.keyboard.press('m')
    const comment = await cursor()
    await page.keyboard.press('s')
    const sticky = await cursor()
    await page.keyboard.press('g')
    const table = await cursor()

    for (const [name, value] of [
      ['comment', comment],
      ['sticky', sticky],
      ['table', table],
    ] as const) {
      expect(value, `${name} has no mark of its own`).toContain('data:image/svg+xml')
      // The keyword after the image: a data URI cursor is refused outright on
      // some platforms, and a declaration with no fallback is dropped whole.
      expect(value).toMatch(/,\s*crosshair$/)
    }

    expect(new Set([comment, sticky, table]).size, 'two tools share a cursor').toBe(3)

    // And select goes back to the arrow, because it aims at nothing.
    await page.keyboard.press('v')
    await expect(page.locator(CANVAS)).toHaveCSS('cursor', 'auto')
  })
})

/**
 * The zoom was in both bottom bars at once — the same number a few hundred
 * pixels apart, one of them next to nothing that changes it.
 */
test('shows the zoom once, beside the control that changes it', async ({ page }) => {
  await board(page)

  await expect(page.getByTestId('zoom-percent')).toBeVisible()
  await expect(page.getByTestId('zoom-percent')).toHaveText('100%')

  // The status bar keeps what only it can say, and drops the repeat.
  const status = page.getByTestId('status-bar')
  await expect(status).toContainText('objects')
  await expect(status).not.toContainText('100%')

  // And the one that is left is still live.
  await page.getByTestId('zoom-in').click()
  await expect(page.getByTestId('zoom-percent')).toHaveText('200%')
  await expect(status).not.toContainText('200%')
})
