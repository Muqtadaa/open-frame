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
  /*
   * Also wait for the toolbar. A visible canvas only means React rendered;
   * `useKeyboardShortcuts` attaches its listener in an effect, which runs after
   * paint, so a keystroke sent on the canvas alone can land in the gap and be
   * dropped. That showed up as a rare, unexplained tool-selection failure.
   */
  await expect(page.getByTestId("tool-select")).toBeVisible()
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

  // Drawing a connector leaves it selected, which opens the inspector over part
  // of the canvas. Clear the selection first so this tests hit testing rather
  // than which pixels a panel happens to cover.
  await page.locator(CANVAS).click({ position: { x: 1120, y: 150 } })
  await expect(page.getByTestId('selection-overlay')).toHaveCount(0)

  // Inside the bounding rectangle of the diagonal, nowhere near the line.
  await page.locator(CANVAS).click({ position: { x: B_AT.x - 40, y: A_AT.y + 20 } })
  await expect(page.getByTestId('selection-overlay')).toHaveCount(0)
})

/**
 * Re-attaching an existing connector by dragging its ends.
 *
 * The handles come from the registry rather than from a check for a connector,
 * so what this really exercises is that a type can declare draggable ends and
 * get the whole gesture — preview, target highlight, undo — without the canvas
 * knowing what it is looking at.
 */
test.describe('dragging an existing endpoint', () => {
  const C_AT = { x: 320, y: 620 }

  async function pairPlusSpare(page: Page): Promise<void> {
    await connectedPair(page)
    await sticky(page, C_AT.x, C_AT.y, 'C')
    await page.keyboard.press('v')
  }

  /**
   * Selects the connector by clicking the line ITSELF.
   *
   * Not a fixed midpoint: re-attaching an end moves the line, so a coordinate
   * captured beforehand lands on empty canvas afterwards and silently
   * deselects. Playwright clicks the centre of the element's box, which for a
   * straight run between two points is a point on the line.
   */
  async function selectConnector(page: Page): Promise<void> {
    await page.locator('.of-connector__line').click({ force: true })
    await expect(page.getByTestId('endpoint-from')).toBeVisible()
  }

  /** Clicks empty canvas well clear of every object. */
  async function deselect(page: Page): Promise<void> {
    await page.locator(CANVAS).click({ position: { x: 1120, y: 150 } })
  }

  test('shows a handle on each end only while the connector is selected', async ({ page }) => {
    // Drawing one leaves it selected, so deselect before claiming the handles
    // are absent — otherwise the assertion passes for the wrong reason.
    await connectedPair(page)
    await deselect(page)
    await expect(page.getByTestId('endpoint-from')).toHaveCount(0)

    await selectConnector(page)
    await expect(page.getByTestId('endpoint-to')).toBeVisible()

    await deselect(page)
    await expect(page.getByTestId('endpoint-from')).toHaveCount(0)
  })

  test('moves the line when an end is dragged onto another object', async ({ page }) => {
    await pairPlusSpare(page)
    await selectConnector(page)

    const handle = await page.getByTestId('endpoint-to').boundingBox()
    if (handle === null) throw new Error('no endpoint handle')
    const before = await page.locator('.of-connector__line').getAttribute('d')

    await drag(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: C_AT.x + 40, y: C_AT.y + 40 },
    )

    expect(await page.locator('.of-connector__line').getAttribute('d')).not.toBe(before)
    // Still one connector, and still attached at both ends.
    await expect(page.locator('[data-object-type="connector"]')).toHaveCount(1)
    await selectConnector(page)
    await expect(page.getByTestId('endpoint-to')).toHaveClass(/of-endpoint--attached/)
  })

  test('detaches an end dropped on empty canvas', async ({ page }) => {
    await connectedPair(page)
    await selectConnector(page)

    const handle = await page.getByTestId('endpoint-to').boundingBox()
    if (handle === null) throw new Error('no endpoint handle')

    await drag(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: 1050, y: 250 },
    )

    await expect(page.locator('[data-object-type="connector"]')).toHaveCount(1)
    await selectConnector(page)
    // A hollow dot: this end is now a free point rather than an attachment.
    await expect(page.getByTestId('endpoint-to')).not.toHaveClass(/of-endpoint--attached/)
  })

  test('re-attaching is one undoable action', async ({ page }) => {
    await pairPlusSpare(page)
    await selectConnector(page)
    const before = await page.locator('.of-connector__line').getAttribute('d')

    const handle = await page.getByTestId('endpoint-to').boundingBox()
    if (handle === null) throw new Error('no endpoint handle')
    await drag(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: C_AT.x + 40, y: C_AT.y + 40 },
    )
    expect(await page.locator('.of-connector__line').getAttribute('d')).not.toBe(before)

    await page.keyboard.press(`${MOD}+z`)
    expect(await page.locator('.of-connector__line').getAttribute('d')).toBe(before)
  })

  test('does not offer a plain object any endpoint handles', async ({ page }) => {
    await connectedPair(page)
    await page.locator('[data-object-type="sticky"]').first().click()
    await expect(page.getByTestId('endpoint-from')).toHaveCount(0)
  })
})
