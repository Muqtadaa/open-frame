import type { Page } from '@playwright/test'

import { boxOf, CANVAS, expect, seedBoard, test } from './fixtures.js'
import { buildBoard } from './boards.js'

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test.use({ board: 'fresh' })

/**
 * Measuring on purpose, as in a design tool: select something, hold Alt, point
 * at something else, and the board says how far apart they are and where they
 * line up. With several things selected and nothing else pointed at, it says
 * the gaps between them.
 *
 * The board only said how far apart two things were while one was being
 * dragged into line with the other, so checking a layout meant moving it.
 */
const A = { x: 320, y: 300 }
const B = { x: 620, y: 300 }
const C = { x: 920, y: 300 }

async function notes(page: Page, ...at: { x: number; y: number }[]): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      at.forEach((point, i) => board.note(`Note ${String(i + 1)}`, point))
    }),
  )
}

const note = (page: Page, i: number) => page.locator('[data-object-type="sticky"]').nth(i)

test('says how far the selection is from what Alt points at, and goes when Alt is let go', async ({
  page,
}) => {
  await notes(page, A, B)
  const a = await boxOf(note(page, 0))
  const b = await boxOf(note(page, 1))
  await page.locator(CANVAS).click({ position: A })

  await page.mouse.move(B.x, B.y)
  await page.keyboard.down('Alt')
  await page.mouse.move(B.x + 4, B.y + 4)

  const gap = page.getByTestId('measure-gap-x')
  await expect(gap).toHaveCount(1)
  // At 100%, a screen pixel is a board unit.
  await expect(gap).toHaveText(String(Math.round(b.x - (a.x + a.width))))
  // Same size, same row: top, middle and bottom all line up.
  await expect(page.getByTestId('measure-match-y')).toHaveCount(3)

  await page.keyboard.up('Alt')
  await expect(gap).toHaveCount(0)
  await expect(page.getByTestId('measure-match-y')).toHaveCount(0)
})

/*
 * Apart on both axes, the two measurements stood out from each one's middle
 * as spokes that met nowhere. They are one L, corner to corner.
 */
test('measures something off on a diagonal as one L from corner to corner', async ({ page }) => {
  const D = { x: 620, y: 560 }
  await notes(page, A, D)
  const a = await boxOf(note(page, 0))
  const d = await boxOf(note(page, 1))
  await page.locator(CANVAS).click({ position: A })

  await page.mouse.move(D.x, D.y)
  await page.keyboard.down('Alt')
  await page.mouse.move(D.x + 4, D.y + 4)

  const across = await boxOf(page.getByTestId('measure-line-x'))
  const down = await boxOf(page.getByTestId('measure-line-y'))
  // Across along the selection's bottom edge, from its corner to the target's
  // left edge…
  expect(across.y).toBeCloseTo(a.y + a.height, 0)
  expect(across.x).toBeCloseTo(a.x + a.width, 0)
  expect(across.x + across.width).toBeCloseTo(d.x, 0)
  // …then down the target's left edge to its corner.
  expect(down.x).toBeCloseTo(d.x, 0)
  expect(down.y).toBeCloseTo(a.y + a.height, 0)
  expect(down.y + down.height).toBeCloseTo(d.y, 0)

  await expect(page.getByTestId('measure-gap-x')).toHaveText(
    String(Math.round(d.x - (a.x + a.width))),
  )
  await expect(page.getByTestId('measure-gap-y')).toHaveText(
    String(Math.round(d.y - (a.y + a.height))),
  )
  await page.keyboard.up('Alt')
})

test('says nothing with nothing selected', async ({ page }) => {
  await notes(page, A, B)
  await page.mouse.move(B.x, B.y)
  await page.keyboard.down('Alt')
  await page.mouse.move(B.x + 4, B.y + 4)
  await expect(page.getByTestId('measure-gap-x')).toHaveCount(0)
  await page.keyboard.up('Alt')
})

test('says the gaps between the things selected when nothing else is pointed at', async ({
  page,
}) => {
  await notes(page, A, B, C)
  await page.keyboard.press(`${MOD}+a`)
  await page.mouse.move(640, 600)
  await page.keyboard.down('Alt')
  await page.mouse.move(644, 604)

  const gaps = page.getByTestId('measure-gap-x')
  await expect(gaps).toHaveCount(2)
  const a = await boxOf(note(page, 0))
  const b = await boxOf(note(page, 1))
  await expect(gaps.first()).toHaveText(String(Math.round(b.x - (a.x + a.width))))
  await page.keyboard.up('Alt')
})

/*
 * Selected neighbours on a diagonal were measured midway between them: two
 * short lines crossing in the empty space, touching neither note.
 */
test('measures selected neighbours on a diagonal as one L too', async ({ page }) => {
  const D = { x: 620, y: 560 }
  await notes(page, A, D)
  await page.keyboard.press(`${MOD}+a`)
  await page.mouse.move(1000, 150)
  await page.keyboard.down('Alt')
  await page.mouse.move(1004, 154)

  const a = await boxOf(note(page, 0))
  const d = await boxOf(note(page, 1))
  const across = await boxOf(page.getByTestId('measure-line-x'))
  const down = await boxOf(page.getByTestId('measure-line-y'))
  expect(across.y).toBeCloseTo(a.y + a.height, 0)
  expect(across.x + across.width).toBeCloseTo(d.x, 0)
  expect(down.x).toBeCloseTo(d.x, 0)
  expect(down.y).toBeCloseTo(a.y + a.height, 0)
  await page.keyboard.up('Alt')
})

/*
 * Three things selected, each on a diagonal from the others. The across and
 * down passes paired them differently, so some pairs got one leg of their L
 * and nothing else: a line hanging from empty space.
 */
test('draws every selected pair on a diagonal as a whole L', async ({ page }) => {
  await notes(page, { x: 430, y: 600 }, { x: 880, y: 200 }, { x: 1150, y: 400 })
  await page.keyboard.press(`${MOD}+a`)
  await page.mouse.move(150, 680)
  await page.keyboard.down('Alt')
  await page.mouse.move(154, 684)

  const across = page.getByTestId('measure-line-x')
  const down = page.getByTestId('measure-line-y')
  await expect(across).toHaveCount(3)
  await expect(down).toHaveCount(3)
  const xs = await Promise.all((await across.all()).map((line) => boxOf(line)))
  const ys = await Promise.all((await down.all()).map((line) => boxOf(line)))
  const near = (a: number, b: number) => Math.abs(a - b) <= 1
  for (const leg of xs) {
    const meets = ys.some(
      (other) =>
        (near(other.x, leg.x) || near(other.x, leg.x + leg.width)) &&
        (near(leg.y, other.y) || near(leg.y, other.y + other.height)),
    )
    expect(meets, `the leg across at ${String(leg.x)},${String(leg.y)} meets one going down`).toBe(
      true,
    )
  }
  await page.keyboard.up('Alt')
})

/*
 * Pointing at a note and then leaving the board — for the bar, say — left that
 * note recorded as under the pointer, and Alt went on measuring to it.
 */
test('measures to nothing once the pointer has left the board', async ({ page }) => {
  await notes(page, A, B)
  await page.locator(CANVAS).click({ position: A })
  await page.mouse.move(B.x, B.y)
  await page.keyboard.down('Alt')
  await page.mouse.move(B.x + 4, B.y + 4)
  await expect(page.getByTestId('measure-gap-x')).toHaveCount(1)
  await page.keyboard.up('Alt')

  // Out of the window, which is the only way off this board: the browser says
  // so with a pointerout that has nowhere to go to.
  await page.locator(CANVAS).dispatchEvent('pointerout', {
    bubbles: true,
    relatedTarget: null,
    pointerType: 'mouse',
  })
  await page.keyboard.down('Alt')
  await expect(page.getByTestId('measure-match-y')).toHaveCount(0)
  await expect(page.getByTestId('measure-gap-x')).toHaveCount(0)
  await page.keyboard.up('Alt')
})

test('stops measuring when the window loses the key', async ({ page }) => {
  await notes(page, A, B)
  await page.locator(CANVAS).click({ position: A })
  await page.mouse.move(B.x, B.y)
  await page.keyboard.down('Alt')
  await page.mouse.move(B.x + 4, B.y + 4)
  await expect(page.getByTestId('measure-gap-x')).toHaveCount(1)

  // Alt-Tab: the key goes up in another window, and this one only hears blur.
  await page.evaluate(() => window.dispatchEvent(new Event('blur')))
  await expect(page.getByTestId('measure-gap-x')).toHaveCount(0)
  await page.keyboard.up('Alt')
})

test('moves with Alt and an arrow, so it can be nudged while measuring', async ({ page }) => {
  await notes(page, A)
  await page.locator(CANVAS).click({ position: A })
  const before = await boxOf(note(page, 0))
  await page.keyboard.press('Alt+ArrowRight')
  await expect.poll(async () => (await boxOf(note(page, 0))).x).toBeGreaterThan(before.x)
  expect((await boxOf(note(page, 0))).width).toBe(before.width)
})

/*
 * Nudging with the arrows said nothing: whether a note had reached the edge it
 * was being walked towards was a matter of squinting.
 */
test.describe('nudging with the arrows', () => {
  test('says how far it is from its neighbours on every press', async ({ page }) => {
    await notes(page, A, B)
    await page.locator(CANVAS).click({ position: A })
    // Out of the way, so nothing is pointed at.
    await page.mouse.move(640, 700)
    await page.keyboard.press('ArrowRight')

    const gap = page.getByTestId('measure-gap-x')
    await expect(gap).toHaveCount(1)
    const a = await boxOf(note(page, 0))
    const b = await boxOf(note(page, 1))
    await expect(gap).toHaveText(String(Math.round(b.x - (a.x + a.width))))

    // A pointer move is the hand coming back to the mouse.
    await page.mouse.move(650, 700)
    await expect(gap).toHaveCount(0)
  })

  test('shows the line the moment an edge lines up', async ({ page }) => {
    // Ten units apart on x, one below the other.
    await notes(page, A, { x: B.x - 290, y: 600 })
    await page.locator(CANVAS).click({ position: A })
    await page.mouse.move(640, 700)
    const a = await boxOf(note(page, 0))
    const c = await boxOf(note(page, 1))
    const presses = Math.round(c.x - a.x)
    expect(presses).toBe(10)

    for (let i = 1; i < presses; i++) await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('measure-match-x')).toHaveCount(0)
    await page.keyboard.press('ArrowRight')
    await expect(page.getByTestId('measure-match-x').first()).toBeVisible()
  })
})

/*
 * A turned shape was measured as the upright box around it, so the line began
 * in empty space short of the shape. It begins on the shape's edge now.
 */
test('measures from a turned shape’s edge, not the box around it', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.add('shape', A)
      board.note('Plain', { x: B.x, y: B.y + 60 })
    }),
  )
  const turned = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __openframe: {
          runtime: {
            store: { getDocument(): { objects: Map<string, { id: string; type: string }> } }
            dispatcher: { dispatch(command: unknown): { ok: boolean } }
          }
        }
      }
    ).__openframe.runtime
    const shape = [...runtime.store.getDocument().objects.values()].find(
      (object) => object.type === 'shape',
    )
    return shape === undefined
      ? false
      : runtime.dispatcher.dispatch({
          kind: 'RotateObjects',
          rotations: [{ id: shape.id, rotation: Math.PI / 12 }],
        }).ok
  })
  expect(turned).toBe(true)

  await page.locator(CANVAS).click({ position: A })
  await page.mouse.move(B.x, B.y + 60)
  await page.keyboard.down('Alt')
  await page.mouse.move(B.x + 4, B.y + 64)

  const line = await boxOf(page.getByTestId('measure-line-x'))
  // Just inside the line's start is the shape itself, not the board. Every
  // layer at that point is asked: the selection's apparatus is drawn over it.
  const under = await page.evaluate(
    ({ x, y }) =>
      document
        .elementsFromPoint(x, y)
        .map((element) => element.closest('[data-object-type]')?.getAttribute('data-object-type'))
        .find((type) => type !== undefined) ?? null,
    { x: line.x - 3, y: line.y + line.height / 2 },
  )
  expect(under).toBe('shape')
  await page.keyboard.up('Alt')
})

/*
 * Nudging an upright note beside a turned shape measured to the shape's
 * upright box, so the line ended in empty space — though selecting the shape
 * and nudging that measured the same gap correctly.
 */
test('a nudge measures to a turned neighbour’s edge too', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Plain', A)
      board.add('shape', { x: B.x, y: A.y })
    }),
  )
  const turned = await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __openframe: {
          runtime: {
            store: { getDocument(): { objects: Map<string, { id: string; type: string }> } }
            dispatcher: { dispatch(command: unknown): { ok: boolean } }
          }
        }
      }
    ).__openframe.runtime
    const shape = [...runtime.store.getDocument().objects.values()].find(
      (object) => object.type === 'shape',
    )
    return shape === undefined
      ? false
      : runtime.dispatcher.dispatch({
          kind: 'RotateObjects',
          rotations: [{ id: shape.id, rotation: Math.PI / 12 }],
        }).ok
  })
  expect(turned).toBe(true)

  await page.locator(CANVAS).click({ position: A })
  await page.mouse.move(640, 700)
  await page.keyboard.press('ArrowRight')

  const line = await boxOf(page.getByTestId('measure-line-x'))
  // Just past the line's end is the turned shape itself, not the board.
  const under = await page.evaluate(
    ({ x, y }) =>
      document
        .elementsFromPoint(x, y)
        .map((element) => element.closest('[data-object-type]')?.getAttribute('data-object-type'))
        .find((type) => type !== undefined) ?? null,
    { x: line.x + line.width + 3, y: line.y + line.height / 2 },
  )
  expect(under).toBe('shape')
})
