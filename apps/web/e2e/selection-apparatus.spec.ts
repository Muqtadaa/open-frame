import type { Page } from '@playwright/test'

import { CANVAS, expect, test, undo, boxOf, clickLine, seedBoard } from './fixtures.js'
import { buildBoard, type BoardBuilder } from './boards.js'

/**
 * The selection apparatus tells the truth about what is selected, where it is
 * NOW — during a gesture as well as after one (C3 #7).
 */
test.use({ board: 'open' })

/**
 * What a test's selection is made of, already on the board with nothing
 * selected, as placing them with a tool and clicking away left them. These
 * tests are about the apparatus drawn round a selection, not about how its
 * objects were made.
 */
async function seed(page: Page, make: (board: BoardBuilder) => void): Promise<void> {
  await seedBoard(page, buildBoard(make))
}

/** Notes A and B, and a line attached to both, as dragging one between them leaves it. */
async function linkedPair(page: Page): Promise<void> {
  await seed(page, (board) => {
    board.connect(board.note('A', { x: 280, y: 250 }), board.note('B', { x: 780, y: 470 }))
  })
}

/**
 * A rectangle, selected — what drawing one and pressing Escape left. Drawn
 * shapes had a size of their own; nothing below depends on it except the
 * small selection, which is still drawn.
 */
async function selectedShape(page: Page, at: { x: number; y: number }): Promise<void> {
  await seed(page, (board) => {
    board.add('shape', at, { shape: 'rectangle' })
  })
  await page.locator('[data-object-type="shape"]').click()
  await expect(page.getByTestId('selection-overlay')).toBeVisible()
}

/*
 * The box and its eight handles stayed where the note WAS while the note moved
 * under the pointer — on the most frequent gesture on the board, a detached
 * frame that looked like a glitch.
 */
test('the box travels with a moving selection', async ({ page }) => {
  await seed(page, (board) => {
    board.note('Moving', { x: 340, y: 260 })
  })
  const object = page.locator('[data-object-type="sticky"]')
  await object.click()
  const start = await boxOf(object)

  const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 }
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  for (let i = 1; i <= 6; i++) await page.mouse.move(from.x + 25 * i, from.y + 15 * i)

  const moved = await boxOf(object)
  const box = await boxOf(page.getByTestId('selection-overlay'))
  // The note really moved, so the comparison below is not vacuous.
  expect(moved.x - start.x).toBeGreaterThan(100)
  expect(Math.abs(box.x - moved.x)).toBeLessThan(2)
  expect(Math.abs(box.y - moved.y)).toBeLessThan(2)
  await page.mouse.up()
})

/*
 * A line's apparatus is its ends. The box drawn around one as well was a
 * rectangle nobody could use — and it went stale while the line was reshaped.
 */
test('a lone connector is selected by its ends, not by a box', async ({ page }) => {
  await linkedPair(page)
  await clickLine(page)

  await expect(page.getByTestId('endpoint-from')).toBeVisible()
  await expect(page.getByTestId('selection-overlay')).toHaveCount(0)
})

/** Presses Tab until the element with `testId` has focus, at most `limit` times. */
async function tabsTo(page: Page, testId: string, limit: number): Promise<boolean> {
  for (let press = 0; press < limit; press += 1) {
    await page.keyboard.press('Tab')
    const there = await page.evaluate(
      (id) => document.activeElement?.getAttribute('data-testid') === id,
      testId,
    )
    if (there) return true
  }
  return false
}

/**
 * The press target a grip really offers: its `__target` child if it has one,
 * which is what receives the press, otherwise the grip itself.
 */
async function targets(
  page: Page,
  selector: string,
): Promise<{ id: string; w: number; h: number }[]> {
  return page.locator(selector).evaluateAll((grips) =>
    grips.map((grip) => {
      const target = grip.querySelector('[class$="__target"]') ?? grip
      const box = target.getBoundingClientRect()
      return {
        id: grip.getAttribute('data-testid') ?? grip.className,
        w: Math.round(box.width * 10) / 10,
        h: Math.round(box.height * 10) / 10,
      }
    }),
  )
}

function atLeast24(found: readonly { id: string; w: number; h: number }[]): void {
  expect(found.length).toBeGreaterThan(0)
  for (const grip of found) {
    expect(
      Math.min(grip.w, grip.h),
      `${grip.id} is ${String(grip.w)}×${String(grip.h)}`,
    ).toBeGreaterThanOrEqual(24)
  }
}

/*
 * WCAG 2.5.8: a pointer target is 24px, whatever is drawn. The grips were
 * 24, 22, 14, 12, 10 and 9 depending on the family — and the finest gesture on
 * the board, placing a line's end, had the smallest.
 */
test.describe('every grip is a 24px target', () => {
  test('resize handles and connect points', async ({ page }) => {
    await selectedShape(page, { x: 520, y: 340 })
    atLeast24(await targets(page, '[data-testid^="handle-"]'))
    atLeast24(await targets(page, '[data-handle="connect"]'))
  })

  test("a line's ends, bends and legs", async ({ page }) => {
    await linkedPair(page)
    await clickLine(page)
    await expect(page.getByTestId('endpoint-from')).toBeVisible()
    atLeast24(await targets(page, '[data-testid="endpoint-from"], [data-testid="endpoint-to"]'))

    await page.getByTestId('field-routing').selectOption('orthogonal')
    const line = page.getByTestId('connector-line')
    const middle = await line.evaluate((element) => {
      const path = element as unknown as SVGPathElement
      const point = path.getPointAtLength(path.getTotalLength() / 2)
      const matrix = path.getScreenCTM()
      if (matrix === null) throw new Error('off screen')
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix)
      return { x: screen.x, y: screen.y }
    })
    await page.mouse.move(middle.x, middle.y)
    await expect(page.locator('[data-testid^="endpoint-leg:"]')).toHaveCount(1)
    atLeast24(await targets(page, '[data-testid^="endpoint-leg:"]'))
  })

  test("a table's dividers", async ({ page }) => {
    await seed(page, (board) => {
      board.add('table', { x: 340, y: 300 })
    })
    await page.locator('[data-object-type="table"]').click()
    await expect(page.locator('[data-testid^="divider-"]').first()).toBeAttached()
    atLeast24(await targets(page, '[data-testid^="divider-"]'))
  })
})

/*
 * Below about 48px on screen there is no room for eight squares, two
 * families of strip, four connect points and a rotate grip — at 25% a 40px
 * shape was ten pixels across, its handles covered it, and a press in its
 * middle landed on a handle and RESIZED it. A small selection keeps its four
 * corners, outside it, and its middle moves it.
 */
test('a small selection keeps its corners, and its middle moves it', async ({ page }) => {
  await page.getByTestId('tool-shape').click()
  await page.mouse.move(400, 300)
  await page.mouse.down()
  await page.mouse.move(440, 340, { steps: 4 })
  await page.mouse.up()
  await page.keyboard.press('Escape')
  for (let press = 0; press < 2; press += 1) await page.keyboard.press('Control+-')
  await expect(page.getByTestId('zoom-percent')).toHaveText('25%')
  const shape = page.locator('[data-object-type="shape"]')
  await shape.click()
  await expect(page.getByTestId('selection-overlay')).toBeVisible()

  await expect(page.locator('[data-testid^="handle-"]')).toHaveCount(4)
  await expect(page.getByTestId('handle-nw')).toBeVisible()
  await expect(page.locator('[data-testid^="edge-"]')).toHaveCount(0)
  await expect(page.getByTestId('handle-rotate')).toHaveCount(0)
  await expect(page.locator('[data-handle="connect"]')).toHaveCount(0)

  const before = await boxOf(shape)
  const middle = { x: before.x + before.width / 2, y: before.y + before.height / 2 }
  await page.mouse.move(middle.x, middle.y)
  await page.mouse.down()
  await page.mouse.move(middle.x + 60, middle.y + 40, { steps: 6 })
  await page.mouse.up()
  const after = await boxOf(shape)
  // Moved, not resized.
  expect(after.x - before.x).toBeGreaterThan(40)
  expect(Math.abs(after.width - before.width)).toBeLessThan(1)
  expect(Math.abs(after.height - before.height)).toBeLessThan(1)
})

/*
 * The board without a pointer (C3 #7). Objects could not be reached from the
 * keyboard at all, the only thing a key could do to a selection was nudge it,
 * the lock key was handled and never bound, and nothing was ever announced.
 */
test.describe('the board from the keyboard', () => {
  const announcer = (page: Page) => page.getByTestId('board-announcer')

  test('Tab reaches the board, walks its objects in reading order, and lets go', async ({
    page,
  }) => {
    await seed(page, (board) => {
      board.note('Second', { x: 600, y: 260 })
      board.note('First', { x: 300, y: 260 })
      board.note('Third', { x: 300, y: 480 })
    })
    await page.keyboard.press('Escape')

    // From the top of the page, the board is a stop in the order. Started
    // from the bar's first control rather than from nothing focused: a blur
    // left the canvas as where Tab resumed, so reaching it again meant
    // wrapping past the end of the page — which Firefox does not do back
    // into it, and which was never the claim.
    await page.getByTestId('status-bar').locator('a, button, input').first().focus()
    expect(await tabsTo(page, 'canvas', 60)).toBe(true)
    await expect(page.locator(CANVAS)).toHaveAttribute('aria-description', /Tab: next object/)

    const selected = page.locator('[data-selected="true"]')
    await page.keyboard.press('Tab')
    await expect(selected).toContainText('First')
    await expect(announcer(page)).toContainText('First')
    await page.keyboard.press('Tab')
    await expect(selected).toContainText('Second')
    await page.keyboard.press('Tab')
    await expect(selected).toContainText('Third')
    await page.keyboard.press('Shift+Tab')
    await expect(selected).toContainText('Second')
    await page.keyboard.press('Tab')

    // Past the last one, Tab leaves the board rather than trapping the keyboard.
    await page.keyboard.press('Tab')
    const left = await page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') !== 'canvas',
    )
    expect(left).toBe(true)
  })

  /*
   * A frame does not select as a unit: a press on a note in it takes the note.
   * Tab left framed objects out altogether, so on a board organised in frames
   * the keyboard reached the frames and none of what was in them.
   */
  test('Tab reaches what is inside a frame', async ({ page }) => {
    // The note first, then a frame drawn round it: drawing one adopts what it lands on.
    await seed(page, (board) => {
      board.note('Inside', { x: 380, y: 330 })
    })
    await page.keyboard.press('Escape')
    await page.getByTestId('tool-frame').click()
    await page.mouse.move(200, 150)
    await page.mouse.down()
    await page.mouse.move(900, 560, { steps: 8 })
    await page.mouse.up()
    await page.keyboard.press('Escape')
    await page.keyboard.press('Escape')
    // Really inside: otherwise this passes whether or not framed notes are reached.
    await expect
      .poll(() =>
        page.evaluate(() => {
          const runtime = (
            window as unknown as {
              __openframe: {
                runtime: {
                  store: {
                    getDocument: () => {
                      objects: Map<string, { type: string; parentId: string | null }>
                    }
                  }
                }
              }
            }
          ).__openframe.runtime
          return [...runtime.store.getDocument().objects.values()].find(
            (object) => object.type === 'sticky',
          )?.parentId
        }),
      )
      .not.toBeNull()

    await page.locator(CANVAS).focus()
    const announcer = page.getByTestId('board-announcer')
    // The frame first, being higher on the page; then what is in it.
    await page.keyboard.press('Tab')
    await expect(announcer).toContainText('Frame')
    await page.keyboard.press('Tab')
    await expect(announcer).toContainText('Inside')
  })

  test('Ctrl or Cmd with an arrow resizes, and says the new size', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Grow', { x: 340, y: 260 })
    })
    const object = page.locator('[data-object-type="sticky"]')
    await object.click()
    const before = await boxOf(object)
    await page.keyboard.press('ControlOrMeta+ArrowRight')
    await page.keyboard.press('ControlOrMeta+ArrowDown')
    await page.keyboard.press('ControlOrMeta+ArrowDown')
    const after = await boxOf(object)
    expect(Math.round(after.width - before.width)).toBe(10)
    expect(Math.round(after.height - before.height)).toBe(20)
    await expect(announcer(page)).toHaveText(/^Width \d+, height \d+$/)

    // One undo per press, like a nudge.
    await undo(page)
    const undone = await object.boundingBox()
    expect(Math.round((undone?.height ?? 0) - before.height)).toBe(10)
  })

  test('period and comma rotate, and say the angle', async ({ page }) => {
    await selectedShape(page, { x: 440, y: 290 })

    await page.keyboard.press('.')
    await expect(announcer(page)).toHaveText('Rotated to 15 degrees')
    await page.keyboard.press('.')
    await page.keyboard.press('Shift+<')
    await expect(announcer(page)).toHaveText('Rotated to 29 degrees')
    await page.keyboard.press(',')
    await expect(announcer(page)).toHaveText('Rotated to 14 degrees')
    const transform = await page
      .getByTestId('selection-overlay')
      .evaluate((element) => (element as HTMLElement).style.transform)
    expect(transform).toMatch(/rotate\(0\.24\d*rad\)/)
  })

  test('Mod+Shift+L locks and unlocks, and says which', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Keep', { x: 340, y: 260 })
    })
    await page.locator('[data-object-type="sticky"]').click()
    await page.keyboard.press('ControlOrMeta+Shift+L')
    await expect(page.getByTestId('selection-lock')).toBeVisible()
    await expect(announcer(page)).toHaveText('Locked')
    await page.keyboard.press('ControlOrMeta+Shift+L')
    await expect(page.getByTestId('selection-lock')).toHaveCount(0)
    await expect(announcer(page)).toHaveText('Unlocked')
  })
})

/*
 * Escape is the "never mind" key. Mid-drag it cleared the selection and the
 * move still committed on release; in crop mode one press both left the crop
 * AND let go of the picture.
 */
test.describe('Escape backs out one step at a time', () => {
  test('mid-drag it puts the object back and keeps it selected', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Stay', { x: 340, y: 260 })
    })
    const object = page.locator('[data-object-type="sticky"]')
    await object.click()
    const start = await boxOf(object)
    const from = { x: start.x + start.width / 2, y: start.y + start.height / 2 }
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x + 120, from.y + 80, { steps: 6 })
    await page.keyboard.press('Escape')
    await page.mouse.move(from.x + 160, from.y + 100, { steps: 3 })
    await page.mouse.up()

    const end = await object.boundingBox()
    expect(Math.abs((end?.x ?? 0) - start.x)).toBeLessThan(1)
    expect(Math.abs((end?.y ?? 0) - start.y)).toBeLessThan(1)
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
  })
})

/*
 * What a selection says about itself. A group was a bare box; the padlock
 * explained the missing handles but could not be pressed, and its tip never
 * showed; members of a multi-selection looked like bystanders; and a resize
 * or a turn said nothing about the size or angle it was reaching for.
 */
test.describe('a selection says what it is', () => {
  test('the padlock unlocks what it is on', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Held', { x: 340, y: 260 })
    })
    await page.locator('[data-object-type="sticky"]').click()
    await page.keyboard.press('ControlOrMeta+Shift+L')
    const lock = page.getByRole('button', { name: 'Unlock' })
    await expect(lock).toBeVisible()
    const box = await lock.boundingBox()
    expect(Math.min(box?.width ?? 0, box?.height ?? 0)).toBeGreaterThanOrEqual(24)
    await lock.click()
    await expect(page.getByTestId('selection-lock')).toHaveCount(0)
    await expect(page.getByTestId('handle-se')).toBeVisible()
  })

  /*
   * A line on its own gets no box, because its ends are its apparatus — but a
   * LOCKED line shows no ends, so it lost its box and its padlock with them and
   * a selected locked line looked exactly like an unselected one.
   */
  test('a locked line keeps its box and its padlock', async ({ page }) => {
    await linkedPair(page)
    await clickLine(page)
    await expect(page.getByTestId('endpoint-from')).toBeVisible()
    await page.keyboard.press('ControlOrMeta+Shift+L')
    await expect(page.getByTestId('selection-lock')).toBeVisible()
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
  })

  test('a group says it is one, and how many it holds', async ({ page }) => {
    await seed(page, (board) => {
      board.note('One', { x: 300, y: 260 })
      board.note('Two', { x: 600, y: 260 })
    })
    await page.keyboard.press('ControlOrMeta+a')
    await page.keyboard.press('ControlOrMeta+g')
    await expect(page.getByTestId('selection-group')).toHaveText('Group of 2')
  })

  test('each member of a multi-selection is marked', async ({ page }) => {
    await seed(page, (board) => {
      board.note('One', { x: 300, y: 260 })
      board.note('Two', { x: 600, y: 260 })
    })
    await page.keyboard.press('ControlOrMeta+a')
    await expect(page.getByTestId('selection-member')).toHaveCount(2)
  })

  test('a resize shows the size it is reaching for, and a turn its angle', async ({ page }) => {
    await selectedShape(page, { x: 440, y: 290 })

    const corner = await boxOf(page.getByTestId('handle-se'))
    await page.mouse.move(corner.x + corner.width / 2, corner.y + corner.height / 2)
    await page.mouse.down()
    await page.mouse.move(corner.x + 60, corner.y + 40, { steps: 5 })
    await expect(page.getByTestId('selection-readout')).toHaveText(/^\d+ × \d+$/)
    await page.mouse.up()
    await expect(page.getByTestId('selection-readout')).toHaveCount(0)

    const grip = await boxOf(page.getByTestId('handle-rotate'))
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + 120, grip.y + 60, { steps: 6 })
    await expect(page.getByTestId('selection-readout')).toHaveText(/^-?\d+°$/)
    await page.mouse.up()
  })
})

test.describe('the apparatus under the pointer', () => {
  /*
   * A handle's cursor names the way it pulls. On a turned object the cursors
   * stayed upright, so the top handle of a shape turned a quarter said "up and
   * down" while it pulled sideways.
   */
  test('cursors turn with the object', async ({ page }) => {
    await selectedShape(page, { x: 440, y: 290 })
    await expect(page.getByTestId('handle-n')).toHaveCSS('cursor', 'ns-resize')
    for (let press = 0; press < 6; press += 1) await page.keyboard.press('.')
    await expect(page.getByTestId('handle-n')).toHaveCSS('cursor', 'ew-resize')
    await expect(page.getByTestId('handle-ne')).toHaveCSS('cursor', 'nwse-resize')
  })

  /*
   * An object said nothing under the pointer until it was clicked. It now
   * shows a quiet outline, so what a press will take is visible before it.
   */
  test('an object under the pointer is outlined before it is pressed', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Hover', { x: 340, y: 260 })
    })
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('hover-outline')).toHaveCount(0)
    const box = await boxOf(page.locator('[data-object-type="sticky"]'))
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await expect(page.getByTestId('hover-outline')).toBeVisible()
    // Not over what is already selected, which has its own.
    await page.mouse.down()
    await page.mouse.up()
    await expect(page.getByTestId('hover-outline')).toHaveCount(0)
  })

  // Yours was 1.5px — a pixel on most screens — and a peer's 2px dashed.
  test('your own selection is drawn at least as firmly as anyone else’s', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Mine', { x: 340, y: 260 })
    })
    await page.locator('[data-object-type="sticky"]').click()
    await expect(page.getByTestId('selection-overlay')).toHaveCSS('outline-width', '2px')
  })

  test('a grip answers the pointer', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Grip', { x: 340, y: 260 })
    })
    await page.locator('[data-object-type="sticky"]').click()
    const handle = page.getByTestId('handle-se')
    const rest = await handle.evaluate((element) => getComputedStyle(element).backgroundColor)
    await handle.hover()
    await expect
      .poll(() => handle.evaluate((element) => getComputedStyle(element).backgroundColor))
      .not.toBe(rest)
  })

  // Dragging from the zoom cluster used to select the chrome's words.
  test('a drag across the chrome selects no text', async ({ page }) => {
    const cluster = await boxOf(page.getByTestId('zoom-control'))
    await page.mouse.move(cluster.x + 4, cluster.y + cluster.height / 2)
    await page.mouse.down()
    await page.mouse.move(200, 120, { steps: 8 })
    await page.mouse.up()
    expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('')
  })
})

/*
 * A TURNED object's connection points sat on the upright box around it, so
 * they floated off its edges, and a line started from one left from the turned
 * edge somewhere else. They sit off the turned edges now, pushed out along
 * each edge's own direction.
 */
test('connection points sit off a turned object’s own edges', async ({ page }) => {
  await selectedShape(page, { x: 440, y: 290 })
  for (let press = 0; press < 3; press += 1) await page.keyboard.press('.')
  await expect(page.getByTestId('board-announcer')).toHaveText('Rotated to 45 degrees')

  const shape = await boxOf(page.locator('[data-object-type="shape"]'))
  const centre = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
  const frame = await page.evaluate(() => {
    const doc = (
      window as unknown as {
        __openframe: {
          runtime: {
            store: {
              getDocument: () => {
                objects: Map<string, { frame: { width: number; height: number } }>
              }
            }
          }
        }
      }
    ).__openframe.runtime.store.getDocument()
    const [only] = [...doc.objects.values()]
    return only?.frame ?? { width: 0, height: 0 }
  })

  for (const [side, angle, half] of [
    ['right', 45, frame.width / 2],
    ['bottom', 135, frame.height / 2],
    ['left', 225, frame.width / 2],
    ['top', 315, frame.height / 2],
  ] as const) {
    const dot = await boxOf(page.getByTestId(`connect-${side}`))
    const at = { x: dot.x + dot.width / 2, y: dot.y + dot.height / 2 }
    const turned = (Math.atan2(at.y - centre.y, at.x - centre.x) * 180) / Math.PI
    // Off the edge's middle along its own normal: the side's turned direction,
    // and as far out as the edge plus the fixed gap.
    expect(((turned % 360) + 360) % 360, side).toBeCloseTo(angle, 0)
    expect(Math.hypot(at.x - centre.x, at.y - centre.y), side).toBeCloseTo(half + 26, 0)
  }
})

/*
 * The rotate grip turns with the object; a connection point does not. Its 24px
 * target is ROUND, which is what keeps the two apart on a turned object: a
 * square one would point a corner along the edge's normal at 45°, past the
 * grip's inner edge, and the point is drawn after the grip — so a press just
 * inside the grip would start a line instead of turning.
 */
test('a turned object’s top connection point stays clear of its rotate grip', async ({ page }) => {
  await selectedShape(page, { x: 440, y: 290 })
  for (let press = 0; press < 3; press += 1) await page.keyboard.press('.')
  await expect(page.getByTestId('board-announcer')).toHaveText('Rotated to 45 degrees')

  const shape = await boxOf(page.locator('[data-object-type="shape"]'))
  const centre = { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 }
  const top = await boxOf(page.getByTestId('connect-top'))
  const point = { x: top.x + top.width / 2, y: top.y + top.height / 2 }
  // Along the top edge's normal, 16px beyond the point: inside the grip's
  // target, and where a square target's corner would reach.
  const length = Math.hypot(point.x - centre.x, point.y - centre.y)
  const at = {
    x: point.x + ((point.x - centre.x) / length) * 16,
    y: point.y + ((point.y - centre.y) / length) * 16,
  }
  const under = await page.evaluate(
    ({ x, y }) =>
      document.elementFromPoint(x, y)?.closest('[data-testid]')?.getAttribute('data-testid') ??
      null,
    at,
  )
  expect(under).toBe('handle-rotate')
})
