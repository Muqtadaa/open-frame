import { expect, test, type Page } from '@playwright/test'

/**
 * Direct manipulation: resize, rotate, z-order, clipboard, lock.
 *
 * Browser-level because all of it depends on pointer capture, hit testing
 * against what is actually painted, and DOM transforms — none of which a unit
 * test can observe.
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

async function create(page: Page, tool: string, x: number, y: number, text = ''): Promise<void> {
  await page.keyboard.press(tool)
  await page.locator(CANVAS).click({ position: { x, y } })
  await expect(page.locator('textarea')).toBeFocused()
  if (text !== '') await page.locator('textarea').fill(text)
  await page.locator(CANVAS).click({ position: { x: 1100, y: 180 } })
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

test.beforeEach(async ({ page }) => {
  await freshBoard(page)
})

test.describe('resize', () => {
  test('shows handles for a selected object and hides them otherwise', async ({ page }) => {
    await create(page, 's', 400, 300, 'Resize me')
    await expect(page.getByTestId('selection-overlay')).toHaveCount(0)

    await page.locator('[data-object-type="sticky"]').click()
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await expect(page.getByTestId('handle-se')).toBeVisible()
    await expect(page.getByTestId('handle-n')).toBeVisible()
  })

  test('resizes from the south-east corner', async ({ page }) => {
    await create(page, 's', 400, 300, 'Resize me')
    await page.locator('[data-object-type="sticky"]').click()

    const before = await page.locator('[data-object-type="sticky"]').boundingBox()
    const handle = await page.getByTestId('handle-se').boundingBox()
    expect(before).not.toBeNull()
    expect(handle).not.toBeNull()
    if (before === null || handle === null) return

    await drag(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: handle.x + 120, y: handle.y + 120 },
    )

    const after = await page.locator('[data-object-type="sticky"]').boundingBox()
    expect(after).not.toBeNull()
    if (after === null) return
    expect(after.width).toBeGreaterThan(before.width + 80)
  })

  /** A resize drag must be ONE undo entry, like every other gesture. */
  test('a resize is a single undoable action', async ({ page }) => {
    await create(page, 's', 400, 300, 'Resize me')
    await page.locator('[data-object-type="sticky"]').click()

    const before = await page.locator('[data-object-type="sticky"]').boundingBox()
    const handle = await page.getByTestId('handle-se').boundingBox()
    if (before === null || handle === null) return

    await drag(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: handle.x + 140, y: handle.y + 100 },
    )
    await page.keyboard.press(`${MOD}+z`)

    const restored = await page.locator('[data-object-type="sticky"]').boundingBox()
    expect(restored).not.toBeNull()
    if (restored === null) return
    expect(Math.round(restored.width)).toBe(Math.round(before.width))
  })

  /** The registry decides: a sticky declares itself non-rotatable. */
  test('offers a rotate grip only for rotatable types', async ({ page }) => {
    await create(page, 's', 400, 300, 'Sticky')
    await page.locator('[data-object-type="sticky"]').click()
    await expect(page.getByTestId('handle-rotate')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await create(page, 'u', 800, 400)
    await page.locator('[data-object-type="shape"]').click()
    await expect(page.getByTestId('handle-rotate')).toBeVisible()
  })

  test('rotates a shape', async ({ page }) => {
    await create(page, 'u', 600, 400)
    await page.locator('[data-object-type="shape"]').click()

    const grip = await page.getByTestId('handle-rotate').boundingBox()
    const box = await page.locator('[data-object-type="shape"]').boundingBox()
    expect(grip).not.toBeNull()
    expect(box).not.toBeNull()
    if (grip === null || box === null) return

    await drag(
      page,
      { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
      { x: box.x + box.width + 90, y: box.y + box.height / 2 },
    )

    const transform = await page
      .locator('[data-object-type="shape"]')
      .evaluate((el) => getComputedStyle(el).transform)
    expect(transform).not.toBe('none')
    // A rotated matrix has non-zero off-diagonal terms.
    const parts = /matrix\(([^)]+)\)/.exec(transform)?.[1]?.split(',').map(Number) ?? []
    expect(Math.abs(parts[1] ?? 0)).toBeGreaterThan(0.05)
  })
})

test.describe('clipboard and ordering', () => {
  test('copies and pastes', async ({ page }) => {
    await create(page, 's', 400, 300, 'Original')
    await page.locator('[data-object-type="sticky"]').click()

    await page.keyboard.press(`${MOD}+c`)
    await page.keyboard.press(`${MOD}+v`)

    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
    await expect(page.locator('[data-object-type="sticky"]').nth(1)).toContainText('Original')
  })

  test('cuts', async ({ page }) => {
    await create(page, 's', 400, 300, 'Cut me')
    await page.locator('[data-object-type="sticky"]').click()

    await page.keyboard.press(`${MOD}+x`)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)

    await page.keyboard.press(`${MOD}+v`)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
  })

  test('reorders with bracket keys', async ({ page }) => {
    // Placed apart: overlapping notes make `.first()` ambiguous to click,
    // and paint order is what this test is about, not geometry.
    await create(page, 's', 320, 300, 'First')
    await create(page, 's', 760, 300, 'Second')

    const ids = async () =>
      page
        .locator('[data-object-type="sticky"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-object-id')))
    const original = await ids()

    await page.locator('[data-object-type="sticky"]').first().click()
    await page.keyboard.press('Shift+]')

    const reordered = await ids()
    expect(reordered).not.toEqual(original)
    expect(reordered[reordered.length - 1]).toBe(original[0])
  })
})

test.describe('context menu', () => {
  test('opens on right click and acts on the object under the pointer', async ({ page }) => {
    await create(page, 's', 400, 300, 'Target')

    await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
    await expect(page.getByTestId('context-menu')).toBeVisible()

    await page.getByTestId('menu-duplicate').click()
    await expect(page.getByTestId('context-menu')).toHaveCount(0)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
  })

  test('locks, which blocks further edits until unlocked', async ({ page }) => {
    await create(page, 's', 400, 300, 'Locked')

    await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
    await page.getByTestId('menu-lock').click()

    await page.locator('[data-object-type="sticky"]').click()
    await expect(page.getByTestId('handle-se')).toHaveCount(0)

    await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
    await page.getByTestId('menu-unlock').click()
    await page.locator('[data-object-type="sticky"]').click()
    await expect(page.getByTestId('handle-se')).toBeVisible()
  })

  test('dismisses on outside press', async ({ page }) => {
    await create(page, 's', 400, 300, 'Target')
    await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
    await expect(page.getByTestId('context-menu')).toBeVisible()
    await page.locator(CANVAS).click({ position: { x: 1000, y: 600 } })
    await expect(page.getByTestId('context-menu')).toHaveCount(0)
  })
})

test.describe('frames', () => {
  test('creates a frame and renames it', async ({ page }) => {
    await page.keyboard.press('f')
    await page.locator(CANVAS).click({ position: { x: 500, y: 350 } })
    await expect(page.locator('textarea')).toBeFocused()
    await page.locator('textarea').fill('Discovery')
    await page.locator(CANVAS).click({ position: { x: 1150, y: 130 } })
    await page.keyboard.press('v')

    await expect(page.locator('[data-object-type="frame"]')).toHaveCount(1)
    await expect(page.locator('.of-frame__title')).toContainText('Discovery')
  })

  /**
   * The behaviour frames exist for: dropping a note onto one makes it a member,
   * and the frame then carries it. Membership is set by the drop, not by
   * geometry alone.
   */
  test('a note dropped on a frame moves with it afterwards', async ({ page }) => {
    await page.keyboard.press('f')
    await page.locator(CANVAS).click({ position: { x: 700, y: 400 } })
    await page.locator(CANVAS).click({ position: { x: 1150, y: 130 } })
    await page.keyboard.press('v')

    await create(page, 's', 200, 200, 'Inside')

    const note = page.locator('[data-object-type="sticky"]')
    const before = await note.boundingBox()
    if (before === null) return

    // Drag the note onto the frame.
    await drag(page, { x: before.x + 40, y: before.y + 40 }, { x: 700, y: 400 })

    const inFrame = await note.boundingBox()
    if (inFrame === null) return

    // Now drag the FRAME by its title and confirm the note travels with it.
    const title = await page.locator('.of-frame__title').boundingBox()
    if (title === null) return
    await drag(page, { x: title.x + 10, y: title.y + 5 }, { x: title.x + 10, y: title.y - 120 })

    const after = await note.boundingBox()
    if (after === null) return
    expect(Math.round(after.y - inFrame.y)).toBeLessThan(-80)
  })

  test('undo returns a nested note to the board', async ({ page }) => {
    await page.keyboard.press('f')
    await page.locator(CANVAS).click({ position: { x: 700, y: 400 } })
    await page.locator(CANVAS).click({ position: { x: 1150, y: 130 } })
    await page.keyboard.press('v')

    await create(page, 's', 200, 200, 'Note')
    const note = page.locator('[data-object-type="sticky"]')
    const start = await note.boundingBox()
    if (start === null) return

    await drag(page, { x: start.x + 40, y: start.y + 40 }, { x: 700, y: 400 })
    await page.keyboard.press(`${MOD}+z`)

    const restored = await note.boundingBox()
    if (restored === null) return
    expect(Math.round(restored.x)).toBe(Math.round(start.x))
  })

  test('deleting a frame removes its contents, and undo restores both', async ({ page }) => {
    await page.keyboard.press('f')
    await page.locator(CANVAS).click({ position: { x: 700, y: 400 } })
    await page.locator(CANVAS).click({ position: { x: 1150, y: 130 } })
    await page.keyboard.press('v')

    await create(page, 's', 200, 200, 'Doomed')
    const note = page.locator('[data-object-type="sticky"]')
    const start = await note.boundingBox()
    if (start === null) return
    await drag(page, { x: start.x + 40, y: start.y + 40 }, { x: 700, y: 400 })

    await page.locator('.of-frame__title').click()
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-object-type="frame"]')).toHaveCount(0)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)

    await page.keyboard.press(`${MOD}+z`)
    await expect(page.locator('[data-object-type="frame"]')).toHaveCount(1)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
  })
})
