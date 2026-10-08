import type { Page } from '@playwright/test'

import { buildBoard } from './boards.js'
import { alongTheLine, boxOf, clickLine, expect, seedBoard, test } from './fixtures.js'

/**
 * A middle-drag pans, whatever it starts on.
 *
 * It did not over a selected table, whose editor took the press for its cells
 * or its column grips, nor over a selected connector's handles, which bent the
 * line instead — the owner's report, 10-08. The middle button has one meaning
 * on a canvas, and nothing under the pointer gets to borrow it.
 */

test.use({ board: 'fresh' })

const SHIFT = { x: -160, y: -90 }

async function middleDrag(page: Page, from: { x: number; y: number }): Promise<void> {
  await page.mouse.move(from.x, from.y)
  await page.mouse.down({ button: 'middle' })
  await page.mouse.move(from.x + SHIFT.x / 2, from.y + SHIFT.y / 2, { steps: 4 })
  await page.mouse.move(from.x + SHIFT.x, from.y + SHIFT.y, { steps: 4 })
  await page.mouse.up({ button: 'middle' })
}

/** That the board moved by the drag, measured on something that sits still on it. */
async function expectPanned(
  page: Page,
  before: { x: number; y: number },
  selector: string,
): Promise<void> {
  const after = await boxOf(page.locator(selector).first())
  expect(Math.round(after.x - before.x)).toBe(SHIFT.x)
  expect(Math.round(after.y - before.y)).toBe(SHIFT.y)
}

test('pans over a table being edited, leaving its cells and its editor alone', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.add('table', { x: 520, y: 360 })
    }),
  )
  const table = page.locator('[data-object-type="table"]')
  await table.click()
  await page.keyboard.press('Enter')
  const editor = page.getByTestId('table-editor')
  await expect(editor).toHaveAttribute('data-mode', 'navigate')
  const selected = editor.locator('[aria-selected="true"]')
  await expect(selected).toHaveCount(1)

  const before = await boxOf(table)
  const cell = await boxOf(page.getByTestId('table-cell-4'))
  await middleDrag(page, { x: cell.x + cell.width / 2, y: cell.y + cell.height / 2 })

  await expectPanned(page, before, '[data-object-type="table"]')
  await expect(editor).toHaveAttribute('data-mode', 'navigate')
  await expect(selected).toHaveCount(1)
})

test('pans over a selected table’s column grip rather than resizing the column', async ({
  page,
}) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.add('table', { x: 520, y: 360 })
    }),
  )
  const table = page.locator('[data-object-type="table"]')
  await table.click()
  const grip = page.locator('[data-handle="divider"]').first()
  const at = await boxOf(grip)
  const before = await boxOf(table)

  await middleDrag(page, { x: at.x + at.width / 2, y: at.y + at.height / 2 })

  await expectPanned(page, before, '[data-object-type="table"]')
  const after = await boxOf(table)
  expect(Math.round(after.width)).toBe(Math.round(before.width))
})

for (const routing of ['orthogonal', 'curved'] as const) {
  test(`pans over a selected ${routing} line’s handle rather than bending it`, async ({ page }) => {
    await seedBoard(
      page,
      buildBoard((board) => {
        const a = board.note('From', { x: 300, y: 260 })
        const b = board.note('To', { x: 800, y: 520 })
        board.connect(a, b, { routing })
      }),
    )
    await clickLine(page)
    const line = page.getByTestId('connector-line').first()
    const shape = await line.getAttribute('d')
    // The handle for the run is revealed where the pointer is.
    const middle = await alongTheLine(page)
    await page.mouse.move(middle.x, middle.y)
    const handle = page.locator('[data-handle="endpoint"]').filter({
      hasNot: page.locator('[data-testid="endpoint-from"], [data-testid="endpoint-to"]'),
    })
    await expect(handle.first()).toBeVisible()
    const before = await boxOf(page.locator('[data-object-type="sticky"]').first())

    await middleDrag(page, middle)

    await expectPanned(page, before, '[data-object-type="sticky"]')
    expect(await line.getAttribute('d')).toBe(shape)
  })
}

/*
 * Every grip a selection grows takes presses of its own, so each is held to
 * the same rule — the owner found it on a note's and a shape's handles too.
 */
const GRIPS = [
  { what: 'a note’s resize corner', type: 'sticky', grip: 'handle-se' },
  { what: 'a shape’s rotate grip', type: 'shape', grip: 'handle-rotate' },
  { what: 'a shape’s edge', type: 'shape', grip: 'handle-e' },
] as const

for (const { what, type, grip } of GRIPS) {
  test(`pans over ${what} rather than taking hold of it`, async ({ page }) => {
    await seedBoard(
      page,
      buildBoard((board) => {
        board.add(type, { x: 520, y: 360 })
      }),
    )
    const object = page.locator(`[data-object-type="${type}"]`)
    await object.click()
    const at = await boxOf(page.getByTestId(grip))
    const before = await boxOf(object)

    await middleDrag(page, { x: at.x + at.width / 2, y: at.y + at.height / 2 })

    await expectPanned(page, before, `[data-object-type="${type}"]`)
    const after = await boxOf(object)
    expect(Math.round(after.width)).toBe(Math.round(before.width))
    expect(Math.round(after.height)).toBe(Math.round(before.height))
  })
}

test('pans over a straight line’s end rather than moving it', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const a = board.note('From', { x: 300, y: 260 })
      const b = board.note('To', { x: 800, y: 520 })
      board.connect(a, b)
    }),
  )
  await clickLine(page)
  const line = page.getByTestId('connector-line').first()
  const shape = await line.getAttribute('d')
  const end = await boxOf(page.getByTestId('endpoint-to'))
  const before = await boxOf(page.locator('[data-object-type="sticky"]').first())

  await middleDrag(page, { x: end.x + end.width / 2, y: end.y + end.height / 2 })

  await expectPanned(page, before, '[data-object-type="sticky"]')
  expect(await line.getAttribute('d')).toBe(shape)
})
