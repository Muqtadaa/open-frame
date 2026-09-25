import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * Connectors: drawing, following their endpoints, and what happens when the
 * objects they attach to are deleted.
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
const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

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
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

async function sticky(page: Page, x: number, y: number, text: string): Promise<void> {
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: { x, y } })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.locator(EDITOR).fill(text)
  await page.locator(CANVAS).click({ position: { x: 1180, y: 120 } })
  await expect(page.locator(EDITOR)).toHaveCount(0)
  await page.keyboard.press('v')
}

/**
 * A point a given fraction of the way along the DRAWN line, on screen.
 *
 * Asked of the path itself rather than worked out from the two ends: a curve's
 * middle is nowhere near the middle of the straight line between them, and a
 * test that aimed there would miss the handle it is reaching for — and then
 * pass or fail for the wrong reason.
 */
async function alongTheLine(page: Page, fraction = 0.5): Promise<{ x: number; y: number }> {
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
 * The grab bar on the leg nearest a point along the drawn route.
 *
 * A leg only offers itself while the pointer is on it, so reaching for one is
 * part of the gesture rather than setup — and the bar, not the point that
 * revealed it, is what gets pressed: the two are a few pixels apart and a
 * press that misses lands on the line and drags the whole connector.
 */
async function legAt(page: Page, fraction = 0.5): Promise<{ x: number; y: number }> {
  const at = await alongTheLine(page, fraction)
  await page.mouse.move(at.x, at.y)
  const grip = page.locator('[data-testid^="endpoint-leg:"]')
  await expect(grip).toHaveCount(1)
  const box = await grip.boundingBox()
  if (box === null) throw new Error('no leg to grab')
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
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
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.locator(EDITOR).fill('depends on')
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

/**
 * Connection points: dragging a connector straight off a selected object,
 * without reaching for the connector tool.
 *
 * Reported as missing from the deployed build — reaching for a tool to join two
 * things already in front of you is a detour every board tool spares you.
 */
test.describe('connection points', () => {
  const A = { x: 300, y: 250 }
  const B = { x: 300, y: 520 }
  const CLEAR = { x: 1120, y: 140 }

  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
  })

  async function note(page: Page, at: { x: number; y: number }, text: string): Promise<void> {
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: at })
    await page.locator(EDITOR).fill(text)
    await page.locator(CANVAS).click({ position: CLEAR })
    await page.keyboard.press('v')
  }

  test('appear on a selected object and not before', async ({ page }) => {
    await note(page, A, 'one')
    await expect(page.getByTestId('connect-right')).toHaveCount(0)

    await page.locator(CANVAS).click({ position: A })
    for (const side of ['top', 'right', 'bottom', 'left']) {
      await expect(page.getByTestId(`connect-${side}`)).toBeVisible()
    }
  })

  test('dragging from one draws a connector to what it is dropped on', async ({ page }) => {
    await note(page, A, 'one')
    await note(page, B, 'two')
    await page.locator(CANVAS).click({ position: A })

    const from = await page.getByTestId('connect-bottom').boundingBox()
    const canvas = await page.locator(CANVAS).boundingBox()
    await page.mouse.move((from?.x ?? 0) + 4, (from?.y ?? 0) + 4)
    await page.mouse.down()
    await page.mouse.move((canvas?.x ?? 0) + B.x, (canvas?.y ?? 0) + B.y, { steps: 10 })
    await page.mouse.up()

    await expect(page.locator('[data-object-type="connector"]')).toHaveCount(1)
  })

  /** Nothing is written until the pointer comes up — one command, one undo. */
  test('a connector drawn this way is undone in one press', async ({ page }) => {
    await note(page, A, 'one')
    await note(page, B, 'two')
    await page.locator(CANVAS).click({ position: A })

    const from = await page.getByTestId('connect-right').boundingBox()
    const canvas = await page.locator(CANVAS).boundingBox()
    await page.mouse.move((from?.x ?? 0) + 4, (from?.y ?? 0) + 4)
    await page.mouse.down()
    await page.mouse.move((canvas?.x ?? 0) + B.x, (canvas?.y ?? 0) + B.y, { steps: 10 })
    await page.mouse.up()
    await expect(page.locator('[data-object-type="connector"]')).toHaveCount(1)

    await page.locator(CANVAS).click({ position: CLEAR })
    await page.keyboard.press('Control+z')
    await expect(page.locator('[data-object-type="connector"]')).toHaveCount(0)
  })

  /** A connector has its own draggable ends; it must not also sprout these. */
  test('do not appear on a connector', async ({ page }) => {
    await note(page, A, 'one')
    await note(page, B, 'two')
    await page.keyboard.press('c')
    const canvas = await page.locator(CANVAS).boundingBox()
    await page.mouse.move((canvas?.x ?? 0) + A.x, (canvas?.y ?? 0) + A.y)
    await page.mouse.down()
    await page.mouse.move((canvas?.x ?? 0) + B.x, (canvas?.y ?? 0) + B.y, { steps: 10 })
    await page.mouse.up()
    await page.keyboard.press('v')

    await expect(page.locator('[data-object-type="connector"]')).toHaveCount(1)
    await expect(page.getByTestId('connect-right')).toHaveCount(0)
  })
})

/**
 * Bending a connector.
 *
 * A route that turns at the exact middle of its run is rarely where a diagram
 * wants it. The bend is a draggable point like the two ends — declared by the
 * type, drawn by the same overlay, undone by the same command — which is what
 * the endpoint capability's own description anticipated when it named "a curve
 * with control points, a route with stops".
 */
test.describe('bending a route', () => {
  async function bendableConnector(page: Page, routing: 'orthogonal' | 'curved'): Promise<void> {
    await connectedPair(page)
    await page.locator('.of-connector__line').click({ force: true })
    await expect(page.getByTestId('endpoint-from')).toBeVisible()
    await page.getByTestId('field-routing').selectOption(routing)
  }

  test('offers a leg to push on an orthogonal route, and only where you point', async ({
    page,
  }) => {
    await connectedPair(page)
    await page.locator('.of-connector__line').click({ force: true })
    await expect(page.getByTestId('endpoint-from')).toBeVisible()

    await page.getByTestId('field-routing').selectOption('orthogonal')

    /*
     * ONE at a time, and only the run being pointed at. Every leg lit at once
     * turns a staircase into a ladder of bars and hides the line they are
     * there to move.
     */
    const middle = await alongTheLine(page)
    await page.mouse.move(middle.x, middle.y - 200)
    await expect(page.locator('[data-testid^="endpoint-leg:"]')).toHaveCount(0)
    await page.mouse.move(middle.x, middle.y)
    await expect(page.locator('[data-testid^="endpoint-leg:"]')).toHaveCount(1)

    // A bar along the run, not a dot on it: it is grabbed anywhere.
    const grip = await page.locator('[data-testid^="endpoint-leg:"]').boundingBox()
    if (grip === null) throw new Error('no leg')
    expect(Math.max(grip.width, grip.height)).toBeGreaterThan(30)
  })

  test('pushes a leg of an orthogonal route sideways', async ({ page }) => {
    await bendableConnector(page, 'orthogonal')

    const before = await legAt(page)
    await drag(page, before, { x: before.x - 90, y: before.y })

    /*
     * The LINE moved, not just a handle: the crossing now runs down where the
     * pointer left it. Read off the path, because a handle that slides while
     * the route stays put is the shape this bug would take.
     */
    const crossings = await page.locator('.of-connector__line').evaluate((element) => {
      const path = element as unknown as SVGPathElement
      const matrix = path.getScreenCTM()
      if (matrix === null) throw new Error('the line is not on screen')
      const seen: number[] = []
      const total = path.getTotalLength()
      for (let at = 0; at <= total; at += total / 60) {
        const point = new DOMPoint(
          path.getPointAtLength(at).x,
          path.getPointAtLength(at).y,
        ).matrixTransform(matrix)
        seen.push(point.x)
      }
      return seen
    })
    expect(Math.min(...crossings)).toBeLessThan(before.x - 60)
  })

  test('drags the apex of a curve, and one undo puts it back', async ({ page }) => {
    await bendableConnector(page, 'curved')

    /*
     * A curve has no elbow to slide. It has stretches, and the middle of the
     * one you are pointing at can be pulled out into a stop the line then
     * passes through — which is how a curve gets its shape now.
     */
    const from = await alongTheLine(page)
    await page.mouse.move(from.x, from.y)
    await expect(page.getByTestId('endpoint-midpoint:0')).toBeVisible()
    // Drawn as a control rather than an end, so it does not read as a third
    // point the line could detach to.
    await expect(page.getByTestId('endpoint-midpoint:0')).toHaveClass(/of-endpoint--control/)

    await drag(page, from, { x: from.x, y: from.y - 120 })

    const after = await page.getByTestId('endpoint-vertex:0').boundingBox()
    if (after === null) throw new Error('no vertex handle')
    /*
     * The handle ends up under the POINTER, which is the whole test: a curve
     * whose midpoint only moves part of the way slides out from under your
     * hand as you drag it, and reads as broken even though it is responding.
     */
    expect(after.y + after.height / 2).toBeCloseTo(from.y - 120, -1)

    // ONE undo, not one per pointer event: the whole drag is one command.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('endpoint-vertex:0')).toHaveCount(0)
  })
})

test.describe('putting a line back', () => {
  test('offers a reset only once the shape has been changed, and undoes it in one press', async ({
    page,
  }) => {
    await connectedPair(page)
    await page.locator('.of-connector__line').click({ force: true })
    await expect(page.getByTestId('endpoint-from')).toBeVisible()
    await page.getByTestId('field-routing').selectOption('orthogonal')

    /*
     * Nothing to put back yet, so nothing is offered. A button that is always
     * there and usually does nothing teaches people to ignore it.
     */
    await expect(page.getByTestId('action-reset')).toHaveCount(0)

    const before = await page.locator('.of-connector__line').getAttribute('d')
    const leg = await legAt(page)
    await drag(page, leg, { x: leg.x - 90, y: leg.y })
    expect(await page.locator('.of-connector__line').getAttribute('d')).not.toBe(before)

    await expect(page.getByTestId('action-reset')).toBeVisible()
    await page.getByTestId('action-reset').click()

    // Back to the route it draws on its own, and the offer is gone with it.
    expect(await page.locator('.of-connector__line').getAttribute('d')).toBe(before)
    await expect(page.getByTestId('action-reset')).toHaveCount(0)
  })

  test('moves a label to where it is dragged, and puts it back on request', async ({ page }) => {
    await connectedPair(page)
    await page.locator(CANVAS).click({ position: MIDPOINT })
    await page.locator(CANVAS).dblclick({ position: MIDPOINT })
    await expect(page.locator(EDITOR)).toBeFocused()
    await page.locator(EDITOR).fill('depends on')
    await page.locator(CANVAS).click({ position: { x: 1180, y: 120 } })
    await expect(page.locator('.of-connector__label')).toContainText('depends on')

    await page.locator('.of-connector__line').click({ force: true })
    const grip = await page.getByTestId('endpoint-label').boundingBox()
    if (grip === null) throw new Error('no label handle')
    const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }

    const before = await page.locator('.of-connector__label').boundingBox()
    if (before === null) throw new Error('no label')

    /*
     * Dragged ALONG the line and pulled well off it at the same time. The
     * label follows the route and ignores the rest: it belongs to the line,
     * and given a cross-offset it could be dragged anywhere inside the
     * connector's bounds, which on a long line is most of the board.
     */
    await drag(page, from, { x: from.x + 150, y: from.y - 120 })

    const after = await page.locator('.of-connector__label').boundingBox()
    if (after === null) throw new Error('no label')
    expect(Math.abs(after.x - before.x), 'the label did not move along').toBeGreaterThan(40)

    const away = await page.locator('.of-connector__line').evaluate(
      (element, at: number) => {
        const path = element as unknown as SVGPathElement
        const matrix = path.getScreenCTM()
        if (matrix === null) throw new Error('the line is not on screen')
        let nearest = Number.POSITIVE_INFINITY
        const total = path.getTotalLength()
        for (let step = 0; step <= 200; step += 1) {
          const point = path.getPointAtLength((total * step) / 200)
          const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
          nearest = Math.min(nearest, Math.abs(screen.y - at))
        }
        return nearest
      },
      after.y + after.height / 2,
    )
    expect(away, 'the label came off the line').toBeLessThan(8)

    await page.getByTestId('action-centre-label').click()
    const back = await page.locator('.of-connector__label').boundingBox()
    if (back === null) throw new Error('no label')
    expect(Math.hypot(back.x - before.x, back.y - before.y)).toBeLessThan(2)
  })
})

test.describe('formatting a connector label', () => {
  test('takes bold, a size and a background of its own', async ({ page }) => {
    await connectedPair(page)
    await page.locator(CANVAS).click({ position: MIDPOINT })
    await page.locator(CANVAS).dblclick({ position: MIDPOINT })
    await expect(page.locator(EDITOR)).toBeFocused()
    await page.locator(EDITOR).fill('depends on')
    await page.locator(CANVAS).click({ position: { x: 1180, y: 120 } })
    await page.locator('.of-connector__line').click({ force: true })

    const label = page.locator('.of-connector__label')
    await expect(label).toBeVisible()

    await page.getByTestId('mark-bold').click()
    await expect(label).toHaveCSS('font-weight', '700')
    await page.getByTestId('mark-italic').click()
    await expect(label).toHaveCSS('font-style', 'italic')

    await page.getByTestId('size-large').click()
    await expect(label).toHaveCSS('font-size', '16px')

    /*
     * A background is a PLATE behind the text, sized from the text itself —
     * so it only exists once one has been chosen, and it is drawn before the
     * label so it is behind it rather than over it.
     */
    await expect(page.locator('.of-connector svg rect, .of-connector rect')).toHaveCount(0)
    await page.getByTestId('paint-labelFill').click()
    await page.getByTestId('label-white').click()
    await expect(page.locator('.of-connector rect')).toHaveCount(1)

    // And turned off again, because a background is the one colour on this
    // object that can genuinely be nothing.
    await page.getByTestId('label-none').click()
    await expect(page.locator('.of-connector rect')).toHaveCount(0)
  })

  /*
   * The colour was stored and never seen: the stylesheet gave the label a
   * `fill`, and ANY CSS rule outranks an SVG presentation attribute, so every
   * choice rendered as the board's ink. Nothing asserted the label's colour,
   * only that the panel offered one.
   */
  test('takes a text colour', async ({ page }) => {
    await connectedPair(page)
    await page.locator(CANVAS).click({ position: MIDPOINT })
    await page.locator(CANVAS).dblclick({ position: MIDPOINT })
    await page.locator(EDITOR).fill('depends on')
    await page.locator(CANVAS).click({ position: { x: 1180, y: 120 } })
    await page.locator('.of-connector__line').click({ force: true })

    await page.getByTestId('paint-textColor').click()
    await page.getByTestId('ink-red').click()
    await expect(page.locator('.of-connector__label')).toHaveCSS('fill', 'rgb(138, 64, 56)')
  })
})

/**
 * WHERE ON THE TARGET a line attaches, which used to be discarded.
 *
 * Every drop produced the `auto` anchor whatever the pointer was over, so a
 * line dragged deliberately onto an edge came back attached to the middle of
 * the object and left from whichever side happened to face the other end. The
 * arrowhead then pointed along the thing it was joined to rather than into it,
 * because the route took its direction from the run rather than from the edge.
 */
test.describe('aiming at an anchor', () => {
  /** Where the target sticky's four anchors are, on screen. */
  async function anchors(page: Page) {
    const box = await page
      .locator('[data-object-type="sticky"]')
      .filter({ hasText: 'B' })
      .boundingBox()
    if (box === null) throw new Error('no target object')
    return {
      box,
      top: { x: box.x + box.width / 2, y: box.y },
      bottom: { x: box.x + box.width / 2, y: box.y + box.height },
      left: { x: box.x, y: box.y + box.height / 2 },
      right: { x: box.x + box.width, y: box.y + box.height / 2 },
    }
  }

  /** The two ends of the drawn line, read off the path. */
  async function ends(page: Page): Promise<{ from: number[]; to: number[] }> {
    const d = await page.locator('.of-connector__line').getAttribute('d')
    if (d === null) throw new Error('no line')
    const numbers = [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
    return { from: numbers.slice(0, 2), to: numbers.slice(-2) }
  }

  test('attaches to the anchor the line was dropped on, not the nearest side', async ({ page }) => {
    await sticky(page, A_AT.x, A_AT.y, 'A')
    await sticky(page, B_AT.x, B_AT.y, 'B')
    const at = await anchors(page)

    await page.keyboard.press('c')
    /*
     * Onto the FAR side: the bottom of an object that is below and to the
     * right, which is the last side `auto` would ever pick. If the drop is
     * being discarded this lands on the top or the left instead.
     */
    await drag(page, A_AT, { x: at.bottom.x, y: at.bottom.y + 12 })
    await page.keyboard.press('v')

    const { to } = await ends(page)
    expect(to[0]).toBeCloseTo(at.bottom.x, 0)
    expect(to[1]).toBeCloseTo(at.bottom.y, 0)
  })

  test('still takes a drop on the face of an object as "join this"', async ({ page }) => {
    await sticky(page, A_AT.x, A_AT.y, 'A')
    await sticky(page, B_AT.x, B_AT.y, 'B')
    const at = await anchors(page)

    await page.keyboard.press('c')
    await drag(page, A_AT, { x: at.box.x + at.box.width / 2, y: at.box.y + at.box.height / 2 })
    await page.keyboard.press('v')

    /*
     * `auto` faces the other end, and A is up and to the left of B — so the
     * line arrives on the top or the left, never the bottom the previous test
     * pinned. Which of the two it is depends on the fixture's proportions and
     * is not what this is about.
     */
    const { to } = await ends(page)
    const onTop = Math.abs(to[1]! - at.box.y) < 2
    const onLeft = Math.abs(to[0]! - at.box.x) < 2
    expect(onTop || onLeft, 'a drop on the face should face the other end').toBe(true)
  })

  test('shows the anchors on whatever is under the line, and marks the one being aimed at', async ({
    page,
  }) => {
    await sticky(page, A_AT.x, A_AT.y, 'A')
    await sticky(page, B_AT.x, B_AT.y, 'B')
    const at = await anchors(page)

    await page.keyboard.press('c')
    await page.mouse.move(A_AT.x, A_AT.y)
    await page.mouse.down()
    await page.mouse.move(at.left.x - 60, at.left.y, { steps: 6 })
    await page.mouse.move(at.left.x - 10, at.left.y, { steps: 4 })

    // Four anchors on the object being dragged over, and exactly one marked.
    await expect(page.locator('.of-connect-point')).toHaveCount(4)
    await expect(page.locator('.of-connect-point.is-aimed')).toHaveCount(1)

    // Over the FACE instead: still offered, none of them being aimed at.
    await page.mouse.move(at.box.x + at.box.width / 2, at.box.y + at.box.height / 2, { steps: 4 })
    await expect(page.locator('.of-connect-point')).toHaveCount(4)
    await expect(page.locator('.of-connect-point.is-aimed')).toHaveCount(0)
    await page.mouse.up()
  })

  /**
   * The fault in the report: a curve anchored to a bottom edge left sideways,
   * because the control points came from the run's dominant axis. The cap is
   * oriented by the route's own last segment, so the arrowhead pointed along
   * the object rather than into it.
   */
  test('arrives perpendicular to the edge it is attached to', async ({ page }) => {
    await sticky(page, A_AT.x, A_AT.y, 'A')
    await sticky(page, B_AT.x, B_AT.y, 'B')
    const at = await anchors(page)

    await page.keyboard.press('c')
    await drag(page, A_AT, { x: at.bottom.x, y: at.bottom.y + 12 })
    await page.keyboard.press('v')
    await page.locator('.of-connector__line').click({ force: true })
    await page.getByTestId('field-routing').selectOption('curved')

    const d = await page.locator('.of-connector__line').getAttribute('d')
    if (d === null) throw new Error('no line')
    const numbers = [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
    // M x y C c1x c1y, c2x c2y, ex ey
    const [, , , , c2x, c2y, ex, ey] = numbers
    if (c2x === undefined || c2y === undefined || ex === undefined || ey === undefined) {
      throw new Error('a cubic has eight numbers in it')
    }
    // The last control point sits directly BELOW the end, so the line arrives
    // travelling upward into the bottom edge it is attached to.
    expect(c2x).toBeCloseTo(ex, 0)
    expect(c2y).toBeGreaterThan(ey)
  })
})

/**
 * A CONTAINER is not where its frame says it is.
 *
 * A group's frame is 0x0 by design — its extent is its children's union — and
 * `resolveEndpoints` read the frame, so a line joined to a group ran to the
 * group's origin instead of to its edge. Frames are the same shape of thing
 * and people join lines to those on purpose.
 *
 * In the browser rather than in a unit test because what is being checked is
 * that the whole path agrees: what the hit test offers, what the type pins,
 * and what is finally drawn.
 */
test.describe('joining a line to a container', () => {
  test('meets the group where it is drawn, and follows it', async ({ page }) => {
    await sticky(page, 320, 260, 'A')
    await sticky(page, 620, 260, 'B')
    await page.keyboard.press(`${MOD}+a`)
    await page.keyboard.press(`${MOD}+g`)
    await expect(page.locator('[data-object-type="group"]')).toHaveCount(1)
    await page.locator(CANVAS).click({ position: { x: 1120, y: 620 } })

    /*
     * Where the group actually is: the union of the notes it holds — named by
     * id, because a third note joins the board in a moment and a span taken
     * over every sticky would then be measuring something else entirely. That
     * is not hypothetical: it is what this test did at first, and it reported
     * the line had not followed when it had.
     */
    const members = await page
      .locator('[data-object-type="sticky"]')
      .evaluateAll((notes) => notes.map((note) => note.getAttribute('data-object-id') ?? ''))
    expect(members).toHaveLength(2)

    const span = async () => {
      const boxes = await Promise.all(
        members.map(async (id) => page.locator(`[data-object-id="${id}"]`).boundingBox()),
      )
      const rects = boxes.filter((box) => box !== null)
      return {
        left: Math.min(...rects.map((r) => r.x)),
        right: Math.max(...rects.map((r) => r.x + r.width)),
        bottom: Math.max(...rects.map((r) => r.y + r.height)),
      }
    }
    const before = await span()

    await sticky(page, 460, 640, 'C')
    await page.keyboard.press('c')
    // Onto the group's bottom edge, which is a place only its children know.
    await drag(
      page,
      { x: 460, y: 640 },
      { x: (before.left + before.right) / 2, y: before.bottom - 6 },
    )
    await page.keyboard.press('v')

    const endOfLine = async () => {
      const d = await page.locator('.of-connector__line').getAttribute('d')
      if (d === null) throw new Error('no line')
      const numbers = [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
      const x = numbers[numbers.length - 2]
      const y = numbers[numbers.length - 1]
      if (x === undefined || y === undefined) throw new Error('no end point')
      return { x, y }
    }

    /*
     * The line's coordinates are the world's, and a fresh board sits at the
     * viewport origin, so the two are comparable. It lands on the group's
     * bottom edge rather than at the group's 0x0 frame.
     */
    const landed = await endOfLine()
    expect(landed.x).toBeGreaterThan(before.left - 8)
    expect(landed.x).toBeLessThan(before.right + 8)
    expect(Math.abs(landed.y - before.bottom)).toBeLessThan(8)

    /*
     * AND IT FOLLOWS. This is the half that cannot be faked: a free point
     * dropped in the same spot passes every assertion above and then sits
     * still while the group walks away. Dragging a member moves the whole
     * group, and the line is derived, so its end must move with it.
     */
    await page.locator(CANVAS).click({ position: { x: 320, y: 260 } })
    await drag(page, { x: 320, y: 260 }, { x: 320, y: 160 })
    await page.keyboard.press('v')

    const after = await span()
    expect(after.bottom, 'the group did not move').not.toBeCloseTo(before.bottom, 0)
    const moved = await endOfLine()
    expect(Math.abs(moved.y - after.bottom), 'the line stayed where it was dropped').toBeLessThan(8)
  })
})

/**
 * WHAT A BEND DRAG SHOWS WHILE IT IS HAPPENING.
 *
 * Dragging a control point used to start the same drag state as dragging an
 * END, so a dashed line rubber-banded from the far end of the connector to the
 * pointer — a diagonal to nowhere — while the line being bent sat still until
 * the drop. The route previews itself instead.
 */
test.describe('reshaping a line', () => {
  async function bendable(page: Page, routing: 'orthogonal' | 'curved') {
    await sticky(page, A_AT.x, A_AT.y, 'A')
    await sticky(page, B_AT.x, B_AT.y, 'B')
    await page.keyboard.press('c')
    await drag(page, A_AT, B_AT)
    await page.keyboard.press('v')
    await page.locator('.of-connector__line').click({ force: true })
    await page.getByTestId('field-routing').selectOption(routing)
    await expect(page.getByTestId('endpoint-from')).toBeVisible()
  }

  const route = async (page: Page): Promise<string> =>
    (await page.locator('.of-connector__line').getAttribute('d')) ?? ''

  /** The points of a drawn polyline, in order. */
  const points = (d: string): { x: number; y: number }[] => {
    const numbers = [...d.matchAll(/-?\d+(\.\d+)?/g)].map((m) => Number(m[0]))
    const out: { x: number; y: number }[] = []
    for (let at = 0; at + 1 < numbers.length; at += 2) {
      out.push({ x: numbers[at] ?? 0, y: numbers[at + 1] ?? 0 })
    }
    return out
  }

  /**
   * Where the run that CROSSES between the two ends sits, along the axis it
   * crosses on.
   *
   * Not a count of corners: an orthogonal route leaves each end with a short
   * stub before it turns, so an L still has two turns in it — what makes it an
   * L is that the crossing run has gone all the way to one end rather than
   * standing somewhere in the middle. Counting corners cannot tell those
   * apart, and the first version of this test tried to.
   */
  const crossingAt = (d: string): number => {
    const run = points(d)
    for (let at = 1; at < run.length; at += 1) {
      const a = run[at - 1]
      const b = run[at]
      if (a === undefined || b === undefined) continue
      if (Math.abs(a.x - b.x) < 0.01 && Math.abs(a.y - b.y) > 0.01) return a.x
    }
    throw new Error('this route does not cross')
  }

  const grab = async (page: Page) => legAt(page)

  test('draws the route as it will be, and no line to nowhere', async ({ page }) => {
    await bendable(page, 'curved')
    const before = await route(page)

    /*
     * Reach for the middle of the LINE, not for a handle sitting in the air:
     * a midpoint only appears while the pointer is on the stretch it would
     * change, which is what keeps a long route from becoming a row of dots.
     */
    const middle = await alongTheLine(page)
    // Away from the line first: selecting the route left the pointer on it,
    // and a handle that is already showing proves nothing about the reveal.
    await page.mouse.move(middle.x, middle.y - 160)
    await expect(page.getByTestId('endpoint-midpoint:0')).toHaveCount(0)
    await page.mouse.move(middle.x, middle.y)
    await expect(page.getByTestId('endpoint-midpoint:0')).toBeVisible()

    // From the handle itself, not from the point that revealed it: the two are
    // a few pixels apart, and a press that misses lands on the line and drags
    // the whole connector instead.
    const grip = await page.getByTestId('endpoint-midpoint:0').boundingBox()
    if (grip === null) throw new Error('no midpoint handle')
    const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 90, from.y - 60, { steps: 6 })

    // The line itself has moved, mid-drag, with nothing written to the board.
    expect(await route(page), 'the route did not preview').not.toBe(before)
    // And the rubber band that belongs to an END drag is absent.
    await expect(page.locator('.of-connector--preview')).toHaveCount(0)

    /*
     * ONE stop, after six pointer events. The handle that created it handed
     * the drag over to it — without that it would add a stop per event, and
     * the route would fold up on itself as you dragged.
     */
    await expect(page.getByTestId('endpoint-vertex:0')).toBeVisible()
    await expect(page.getByTestId('endpoint-vertex:1')).toHaveCount(0)

    // The handle came with it: what you are dragging is where you dragged it.
    const held = await page.getByTestId('endpoint-vertex:0').boundingBox()
    if (held === null) throw new Error('no vertex handle')
    expect(held.x + held.width / 2).toBeCloseTo(from.x + 90, 0)

    const previewed = await route(page)
    await page.mouse.up()
    // What was drawn is what was committed.
    expect(await route(page)).toBe(previewed)
    await expect(page.getByTestId('endpoint-vertex:1')).toHaveCount(0)
  })

  test('takes a second stop on the stretch that was pointed at', async ({ page }) => {
    await bendable(page, 'curved')

    const first = await alongTheLine(page)
    await page.mouse.move(first.x, first.y)
    const firstGrip = await page.getByTestId('endpoint-midpoint:0').boundingBox()
    if (firstGrip === null) throw new Error('no midpoint handle')
    await drag(
      page,
      { x: firstGrip.x + firstGrip.width / 2, y: firstGrip.y + firstGrip.height / 2 },
      { x: firstGrip.x + firstGrip.width / 2, y: firstGrip.y + firstGrip.height / 2 - 80 },
    )
    await expect(page.getByTestId('endpoint-vertex:0')).toBeVisible()

    /*
     * The middle of the route is now the stop itself, so aim at the middle of
     * one of the two stretches either side of it instead — which is where the
     * second midpoint handle lives.
     */
    const second = await alongTheLine(page, 0.75)
    await page.mouse.move(second.x, second.y)
    await expect(page.getByTestId('endpoint-midpoint:1')).toBeVisible()
    const secondGrip = await page.getByTestId('endpoint-midpoint:1').boundingBox()
    if (secondGrip === null) throw new Error('no second midpoint handle')
    await drag(
      page,
      { x: secondGrip.x + secondGrip.width / 2, y: secondGrip.y + secondGrip.height / 2 },
      { x: secondGrip.x + secondGrip.width / 2, y: secondGrip.y + secondGrip.height / 2 + 70 },
    )

    // TWO stops, and the line goes through both of them.
    await expect(page.getByTestId('endpoint-vertex:0')).toBeVisible()
    await expect(page.getByTestId('endpoint-vertex:1')).toBeVisible()
    await expect(page.getByTestId('endpoint-vertex:2')).toHaveCount(0)
  })

  test('takes a stop off again by dragging it onto the end next to it', async ({ page }) => {
    await bendable(page, 'curved')
    const plain = await route(page)

    const middle = await alongTheLine(page)
    await page.mouse.move(middle.x, middle.y)
    const grip = await page.getByTestId('endpoint-midpoint:0').boundingBox()
    if (grip === null) throw new Error('no midpoint handle')
    const from = { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 }
    await drag(page, from, { x: from.x, y: from.y - 90 })
    await expect(page.getByTestId('endpoint-vertex:0')).toBeVisible()
    expect(await route(page), 'the stop did not bend the line').not.toBe(plain)

    const stop = await page.getByTestId('endpoint-vertex:0').boundingBox()
    const end = await page.getByTestId('endpoint-from').boundingBox()
    if (stop === null || end === null) throw new Error('no handles to drag between')

    await page.mouse.move(stop.x + stop.width / 2, stop.y + stop.height / 2)
    await page.mouse.down()
    await page.mouse.move(end.x + end.width / 2 + 4, end.y + end.height / 2, { steps: 8 })

    /*
     * ALREADY GONE, while the pointer is still down: the route stops pinning
     * at a place it passes through anyway, so the line drawn mid-drag is the
     * line the release commits. The stop itself is still in the list — taking
     * it out now would shift every index after it under a moving hand.
     */
    const previewed = await route(page)
    expect(previewed, 'the merge was not previewed').toBe(plain)
    await expect(page.getByTestId('endpoint-vertex:0')).toBeVisible()

    await page.mouse.up()
    // No jump on release, which is the whole reason the removal waits for it.
    expect(await route(page)).toBe(previewed)
    await expect(page.getByTestId('endpoint-vertex:0')).toHaveCount(0)

    // And one undo puts it back, because the whole drag was one command.
    await page.keyboard.press('ControlOrMeta+z')
    await expect(page.getByTestId('endpoint-vertex:0')).toBeVisible()
    expect(await route(page)).not.toBe(plain)
  })

  test('builds a staircase out of an orthogonal route, one leg at a time', async ({ page }) => {
    await bendable(page, 'orthogonal')
    const corners = async (): Promise<number> => points(await route(page)).length

    const turns = await corners()

    // Pushing the crossing MOVES the route; it does not add a turn to it.
    const crossing = await legAt(page)
    await drag(page, crossing, { x: crossing.x - 90, y: crossing.y })
    expect(await corners(), 'sliding the crossing added a turn').toBe(turns)

    /*
     * Pushing the run that LEAVES the start is what adds one: the line still
     * has to depart where it is attached, so a corner appears between the two
     * and the run you grabbed moves clear.
     */
    const leaving = await legAt(page, 0.12)
    await drag(page, leaving, { x: leaving.x, y: leaving.y - 70 })
    expect(await corners(), 'the route did not gain a turn').toBeGreaterThan(turns)

    // And it is still square: every run is along one axis or the other.
    const run = points(await route(page))
    for (let at = 1; at < run.length; at += 1) {
      const a = run[at - 1]
      const b = run[at]
      if (a === undefined || b === undefined) continue
      expect(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01, 'a leg ran diagonally').toBe(
        true,
      )
    }
  })

  test('collapses an orthogonal route to an L, and holds it until pulled clear', async ({
    page,
  }) => {
    await bendable(page, 'orthogonal')
    const before = await route(page)

    /*
     * Where the line turns INTO its far end, which is as far as the crossing
     * run can travel. Read off the path rather than guessed: the stubs put it
     * a fixed distance in from the endpoint, so aiming at the endpoint itself
     * would be aiming past it.
     */
    const run = points(before)
    const lastTurn = run[run.length - 2]
    if (lastTurn === undefined) throw new Error('no turn to aim at')
    expect(crossingAt(before), 'it starts out standing in the middle').not.toBeCloseTo(
      lastTurn.x,
      0,
    )

    const from = await grab(page)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()

    await page.mouse.move(lastTurn.x - 8, from.y, { steps: 4 })
    expect(crossingAt(await route(page)), 'it did not take the L').toBeCloseTo(lastTurn.x, 0)

    /*
     * STICKIER than it was to catch: a distance that would not have snapped it
     * does not release it either, so the shape does not flicker while a hand
     * hovers at the threshold. Note the crossing stays put rather than
     * following the pointer — that is what being snapped means.
     */
    await page.mouse.move(lastTurn.x - 20, from.y, { steps: 3 })
    expect(crossingAt(await route(page)), 'the L let go too easily').toBeCloseTo(lastTurn.x, 0)

    await page.mouse.move(lastTurn.x - 70, from.y, { steps: 4 })
    const released = crossingAt(await route(page))
    expect(released, 'the L would not let go').toBeLessThan(lastTurn.x - 40)
    expect(released, 'and then it follows the pointer again').toBeCloseTo(lastTurn.x - 70, 0)

    await page.mouse.up()
  })
})

/**
 * A connector IS a line. It declared a surface colour as well, which painted
 * the same line through a fallback — so the record panel offered "surface"
 * and "outline" for one stroke, overflowed its own width doing it, and marked
 * no swatch for a line visibly drawn in grey.
 */
test('offers its line one colour, and marks the one it is drawn in', async ({ page }) => {
  await connectedPair(page)
  await page.locator(CANVAS).click({ position: MIDPOINT })
  await expect(page.getByTestId('inspector-title')).toHaveText('Connector')

  // Its route and arrowheads are how it is drawn, not a record of anything.
  await expect(page.locator('.of-inspector__band')).toHaveCount(0)
  await expect(page.getByTestId('field-routing')).toBeVisible()
  await expect(page.getByTestId('paint-color')).toHaveCount(0)
  await expect(page.getByTestId('paint-strokeColor')).toHaveText('line')
  await page.getByTestId('paint-strokeColor').click()
  await expect(page.getByTestId('line-gray')).toHaveAttribute('aria-pressed', 'true')

  const panel = await page.getByTestId('inspector').boundingBox()
  const targets = await page.locator('.of-paint__target').boundingBox()
  expect(panel).not.toBeNull()
  expect(targets).not.toBeNull()
  if (panel === null || targets === null) return
  expect(targets.x + targets.width).toBeLessThanOrEqual(panel.x + panel.width)
})
