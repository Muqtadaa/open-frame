import { expect, test, type Locator, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * A table edited as a spreadsheet (ADR 0015): a selection the keyboard moves,
 * rows and columns inserted and deleted anywhere, merges, and lines ruled from
 * a borders menu — all into one draft, committed as one command.
 */
const CANVAS = '[data-testid="canvas"]'
const AWAY = { x: 1100, y: 640 }

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

/** A new table, left open in its editor, navigating from A1. */
async function newTable(page: Page, size?: string): Promise<void> {
  await page.getByTestId('tool-table').click()
  if (size !== undefined) {
    await page.getByTestId('table-menu').click()
    await page.getByTestId(`table-size-${size}`).click()
  }
  await page.locator(CANVAS).click({ position: { x: 340, y: 300 } })
  await expect(page.getByTestId('table-editor')).toHaveAttribute('data-mode', 'navigate')
}

/** The cells on the board, once the editor has closed. */
const drawn = (page: Page): Locator => page.locator('[role="table"] > div')
const cell = (page: Page, index: number): Locator => page.getByTestId(`table-cell-${String(index)}`)
const selected = (page: Page): Locator =>
  page.locator('[data-testid="table-editor"] [aria-selected="true"]')

/** Types into cells in reading order, as a spreadsheet takes a row of values. */
async function fill(page: Page, values: readonly string[]): Promise<void> {
  for (const value of values) {
    await page.keyboard.type(value)
    await page.keyboard.press('Tab')
  }
}

async function leave(page: Page): Promise<void> {
  await page.locator(CANVAS).click({ position: AWAY })
  await expect(page.getByTestId('table-editor')).toHaveCount(0)
}

test.beforeEach(async ({ page }) => {
  await board(page)
})

test.describe('the keyboard', () => {
  test('types over a selected cell, and Tab and Enter move on', async ({ page }) => {
    await newTable(page)
    await page.keyboard.type('Name')
    await expect(page.getByTestId('table-editor')).toHaveAttribute('data-mode', 'edit')
    await page.keyboard.press('Tab')
    await page.keyboard.type('Owner')
    await page.keyboard.press('Enter')
    // Enter goes DOWN from the cell it finished, as a spreadsheet does.
    await page.keyboard.type('Beta')
    await page.keyboard.press('Enter')
    await leave(page)

    await expect(drawn(page).nth(0)).toHaveText('Name')
    await expect(drawn(page).nth(1)).toHaveText('Owner')
    await expect(drawn(page).nth(4)).toHaveText('Beta')
  })

  test('moves with the arrows, extends with Shift, and wraps with Tab', async ({ page }) => {
    await newTable(page)
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowDown')
    await expect(selected(page)).toHaveCount(1)
    await expect(cell(page, 4)).toHaveAttribute('aria-selected', 'true')

    await page.keyboard.press('Shift+ArrowRight')
    await page.keyboard.press('Shift+ArrowDown')
    await expect(selected(page)).toHaveCount(4)
    await expect(page.getByTestId('table-selection-count')).toHaveText('4 cells')

    // Tab from the end of a row starts the next one.
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('ArrowRight')
    await page.keyboard.press('Tab')
    await expect(cell(page, 3)).toHaveAttribute('aria-selected', 'true')
  })

  test('opens a cell with Enter, keeping its words and adding to them', async ({ page }) => {
    await newTable(page)
    await page.keyboard.type('draft')
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Enter')
    await page.keyboard.type(' two')
    await page.keyboard.press('Enter')
    await leave(page)
    await expect(drawn(page).nth(0)).toHaveText('draft two')
  })

  test('keeps the cell being typed in on Escape, and a second Escape leaves', async ({
    page,
  }) => {
    await newTable(page)
    await fill(page, ['kept'])
    await page.keyboard.type('also kept')
    await page.keyboard.press('Escape')
    // Still editing the table, navigating — with the words still there.
    await expect(page.getByTestId('table-editor')).toHaveAttribute('data-mode', 'navigate')
    await expect(cell(page, 1)).toHaveText('also kept')
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('table-editor')).toHaveCount(0)
    await expect(drawn(page).nth(0)).toHaveText('kept')
    await expect(drawn(page).nth(1)).toHaveText('also kept')
  })

  test('clears a block with Delete, and leaves its colours', async ({ page }) => {
    await newTable(page)
    await fill(page, ['a', 'b', 'c'])
    // Tab from C1 wrapped to A2; up is A1.
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Shift+ArrowRight')
    await page.getByTestId('cell-fill-green').click()
    await page.keyboard.press('Delete')
    await leave(page)
    await expect(drawn(page).nth(0)).toHaveText('')
    await expect(drawn(page).nth(1)).toHaveText('')
    await expect(drawn(page).nth(2)).toHaveText('c')
    await expect(drawn(page).nth(1)).toHaveCSS('background-color', 'rgb(191, 240, 212)')
  })

  test('selects the whole table with Mod+A', async ({ page }) => {
    await newTable(page)
    await page.keyboard.press('ControlOrMeta+a')
    await expect(selected(page)).toHaveCount(9)
  })

  test('keeps the board’s own keys out of the table', async ({ page }) => {
    await newTable(page)
    // Delete clears a cell; it must not delete the table. Arrows must not nudge it.
    const before = await page.locator('[data-object-id]').first().boundingBox()
    await page.keyboard.press('Delete')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('[data-object-id]')).toHaveCount(1)
    expect(await page.locator('[data-object-id]').first().boundingBox()).toEqual(before)
  })
})

test.describe('the pointer', () => {
  test('types into the cell that was double-clicked', async ({ page }) => {
    await newTable(page)
    await leave(page)
    const box = await page.locator('[data-object-id]').first().boundingBox()
    if (box === null) throw new Error('the table is not on screen')
    // The middle of the bottom-right cell of a 3x3.
    await page.mouse.dblclick(box.x + box.width * 0.85, box.y + box.height * 0.85)
    await expect(page.getByTestId('table-cell-field')).toBeFocused()
    await expect(cell(page, 8)).toHaveAttribute('aria-selected', 'true')
    await page.keyboard.type('bottom right')
    await page.keyboard.press('Enter')
    await leave(page)
    await expect(drawn(page).nth(8)).toHaveText('bottom right')
  })

  test('selects a block by dragging across it', async ({ page }) => {
    await newTable(page)
    const from = await cell(page, 0).boundingBox()
    const to = await cell(page, 4).boundingBox()
    if (from === null || to === null) throw new Error('no cells')
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
    await page.mouse.down()
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect(selected(page)).toHaveCount(4)
    await expect(cell(page, 8)).not.toHaveAttribute('aria-selected', 'true')
  })

  test('extends a selection with a shift-click', async ({ page }) => {
    await newTable(page)
    await cell(page, 1).click()
    await cell(page, 5).click({ modifiers: ['Shift'] })
    await expect(selected(page)).toHaveCount(4)
  })

  test('selects a column or a row from its letter or number', async ({ page }) => {
    await newTable(page)
    await page.getByTestId('table-column-B').click()
    await expect(selected(page)).toHaveCount(3)
    for (const index of [1, 4, 7]) {
      await expect(cell(page, index)).toHaveAttribute('aria-selected', 'true')
    }
    await page.getByTestId('table-column-C').click({ modifiers: ['Shift'] })
    await expect(selected(page)).toHaveCount(6)

    await page.getByTestId('table-row-2').click()
    await expect(selected(page)).toHaveCount(3)
    await expect(page.getByTestId('table-row-2')).toHaveAttribute('aria-pressed', 'true')

    await page.getByTestId('table-select-all').click()
    await expect(selected(page)).toHaveCount(9)
  })

  test('lines the letters up with the columns they name', async ({ page }) => {
    await newTable(page, '4x2')
    for (const [letter, index] of [
      ['A', 0],
      ['D', 3],
    ] as const) {
      const strip = await page.getByTestId(`table-column-${letter}`).boundingBox()
      const column = await cell(page, index).boundingBox()
      if (strip === null || column === null) throw new Error('not drawn')
      expect(Math.abs(strip.x - column.x)).toBeLessThan(2)
      expect(Math.abs(strip.width - column.width)).toBeLessThan(2)
    }
  })
})

test.describe('rows and columns, anywhere', () => {
  test('inserts a row in the middle, dressed like the one above it', async ({ page }) => {
    await newTable(page)
    await fill(page, ['h1', 'h2', 'h3', 'a1', 'a2', 'a3', 'b1', 'b2', 'b3'])
    await cell(page, 3).click()
    await page.getByTestId('table-row-2').click()
    await page.getByTestId('cell-fill-yellow').click()

    await cell(page, 4).click({ button: 'right' })
    await page.getByTestId('table-menu-row-below').click()
    await leave(page)

    await expect(page.locator('[role="table"]')).toHaveAttribute(
      'aria-label',
      /3 columns by 4 rows/,
    )
    // Every cell kept its own words — the old per-field editor could not.
    await expect(drawn(page).nth(3)).toHaveText('a1')
    await expect(drawn(page).nth(6)).toHaveText('')
    await expect(drawn(page).nth(9)).toHaveText('b1')
    // The new row copies the dress of the row it was inserted beside.
    await expect(drawn(page).nth(6)).toHaveCSS('background-color', 'rgb(255, 233, 163)')
    await expect(drawn(page).nth(9)).not.toHaveCSS('background-color', 'rgb(255, 233, 163)')
  })

  test('inserts a column to the left from the cell bar’s menu', async ({ page }) => {
    await newTable(page)
    await fill(page, ['a', 'b'])
    await cell(page, 1).click()
    await page.getByTestId('cell-table-menu').click()
    await page.getByTestId('table-menu-column-left').click()
    await leave(page)
    await expect(page.locator('[role="table"]')).toHaveAttribute(
      'aria-label',
      /4 columns by 3 rows/,
    )
    await expect(drawn(page).nth(0)).toHaveText('a')
    await expect(drawn(page).nth(1)).toHaveText('')
    await expect(drawn(page).nth(2)).toHaveText('b')
  })

  test('finishes the cell being typed in before a menu action moves it', async ({ page }) => {
    await newTable(page)
    await page.keyboard.type('typed')
    await expect(page.getByTestId('table-editor')).toHaveAttribute('data-mode', 'edit')
    await page.getByTestId('cell-table-menu').click()
    await page.getByTestId('table-menu-row-above').click()
    await expect(page.getByTestId('table-editor')).toHaveAttribute('data-mode', 'navigate')
    // The keyboard still works: the grid has it, not a field left behind.
    await page.keyboard.press('ArrowDown')
    await leave(page)
    await expect(drawn(page).nth(0)).toHaveText('')
    await expect(drawn(page).nth(3)).toHaveText('typed')
  })

  test('inserts as many as are selected', async ({ page }) => {
    await newTable(page)
    await page.getByTestId('table-row-1').click()
    await page.getByTestId('table-row-2').click({ modifiers: ['Shift'] })
    await cell(page, 0).click({ button: 'right', modifiers: ['Shift'] })
    await page.getByTestId('table-menu-row-above').click()
    await leave(page)
    await expect(page.locator('[role="table"]')).toHaveAttribute(
      'aria-label',
      /3 columns by 5 rows/,
    )
  })

  test('deletes the selected columns, and never the last', async ({ page }) => {
    await newTable(page)
    await fill(page, ['a', 'b', 'c'])
    await page.getByTestId('table-column-A').click()
    await page.getByTestId('table-column-B').click({ modifiers: ['Shift'] })
    await cell(page, 0).click({ button: 'right' })
    await page.getByTestId('table-menu-delete-columns').click()
    await expect(page.getByTestId('table-column-B')).toHaveCount(0)

    await page.getByTestId('table-column-A').click({ button: 'right' })
    await expect(page.getByTestId('table-menu-delete-columns')).toBeDisabled()
    await page.keyboard.press('Escape')
    await leave(page)
    await expect(drawn(page).nth(0)).toHaveText('c')
  })
})

test.describe('merging', () => {
  test('draws a block as one cell, and gives back what it covered', async ({ page }) => {
    await newTable(page)
    await fill(page, ['left', 'right'])
    await cell(page, 0).click()
    await cell(page, 1).click({ modifiers: ['Shift'] })
    await cell(page, 0).click({ button: 'right' })
    await page.getByTestId('table-menu-merge').click()
    await expect(cell(page, 1)).toHaveCount(0)
    await leave(page)

    // Eight cells drawn, the first spanning two columns.
    await expect(drawn(page)).toHaveCount(8)
    const merged = await drawn(page).nth(0).boundingBox()
    const below = await drawn(page).nth(2).boundingBox()
    if (merged === null || below === null) throw new Error('not drawn')
    expect(merged.width).toBeGreaterThan(below.width * 1.8)

    await page.locator('[data-object-id]').first().dblclick()
    await cell(page, 0).click({ button: 'right' })
    await page.getByTestId('table-menu-unmerge').click()
    await leave(page)
    await expect(drawn(page)).toHaveCount(9)
    await expect(drawn(page).nth(1)).toHaveText('right')
  })

  test('steps over a merge with the arrows', async ({ page }) => {
    await newTable(page)
    await cell(page, 0).click()
    await cell(page, 1).click({ modifiers: ['Shift'] })
    await cell(page, 0).click({ button: 'right' })
    await page.getByTestId('table-menu-merge').click()
    await cell(page, 0).click()
    await page.keyboard.press('ArrowRight')
    await expect(cell(page, 2)).toHaveAttribute('aria-selected', 'true')
  })
})

test.describe('borders', () => {
  const lines = (page: Page): Locator => page.locator('[role="table"] ~ svg.of-table__lines line')

  test('rules the outside of a block thick and red', async ({ page }) => {
    await newTable(page)
    await cell(page, 0).click()
    await cell(page, 4).click({ modifiers: ['Shift'] })
    await page.getByTestId('cell-target-borders').click()
    await page.getByTestId('borders-weight-thick').click()
    await page.getByTestId('borders-color-red').click()
    await page.getByTestId('borders-outer').click()
    await leave(page)

    // Four runs: the block's top, bottom, left and right, each two cells long.
    const thick = page.locator('svg.of-table__lines line[stroke-width="4"]')
    await expect(thick).toHaveCount(4)
    for (const line of await thick.all()) {
      await expect(line).toHaveAttribute('stroke', /red/)
    }
  })

  test('draws a shared edge once, whichever cell set it', async ({ page }) => {
    await newTable(page)
    await cell(page, 0).click()
    await page.getByTestId('cell-target-borders').click()
    await page.getByTestId('borders-weight-thick').click()
    await page.getByTestId('borders-right').click()
    // The neighbour's LEFT is the same line: setting it dashed changes that one line.
    await cell(page, 1).click()
    await page.getByTestId('cell-target-borders').click()
    await page.getByTestId('borders-dash-dashed').click()
    await page.getByTestId('borders-left').click()
    await leave(page)
    await expect(page.locator('svg.of-table__lines line[stroke-dasharray]')).toHaveCount(1)
    await expect(page.locator('svg.of-table__lines line[stroke-width="4"]')).toHaveCount(1)
  })

  test('takes lines away with none, and hands them back with reset', async ({ page }) => {
    await newTable(page)
    const all = await lines(page).count()
    await page.keyboard.press('ControlOrMeta+a')
    await page.getByTestId('cell-target-borders').click()
    await page.getByTestId('borders-none').click()
    await expect(lines(page)).toHaveCount(0)
    await page.getByTestId('borders-reset').click()
    await expect(lines(page)).toHaveCount(all)
  })

  test('recolours every line nobody chose from the table’s line colour', async ({ page }) => {
    await newTable(page)
    await leave(page)
    await page.locator('[data-object-id]').first().click()
    await page.getByTestId('paint-strokeColor').click()
    await page.getByTestId('line-blue').click()
    for (const line of await lines(page).all()) {
      await expect(line).toHaveAttribute('stroke', /blue/)
    }
  })
})

test.describe('formatting a range', () => {
  test('bolds every selected cell from the format bar, with no caret', async ({ page }) => {
    await newTable(page)
    await fill(page, ['one', 'two', 'three'])
    await page.getByTestId('table-row-1').click()
    await page.getByTestId('format-bold').click()
    await expect(page.getByTestId('format-bold')).toHaveAttribute('aria-pressed', 'true')
    await leave(page)
    await expect(drawn(page).nth(0).locator('strong')).toHaveText('one')
    await expect(drawn(page).nth(2).locator('strong')).toHaveText('three')
    await expect(drawn(page).nth(3).locator('strong')).toHaveCount(0)
  })

  test('bolds the words of the cell being typed in', async ({ page }) => {
    await newTable(page)
    await page.keyboard.type('Revenue')
    await page.keyboard.press('ControlOrMeta+a')
    await page.getByTestId('format-bold').click()
    await expect(page.getByTestId('table-cell-field').locator('strong')).toHaveText('Revenue')
    await page.keyboard.press('Enter')
    await leave(page)
    await expect(drawn(page).nth(0).locator('strong')).toHaveText('Revenue')
  })

  test('holds a list, made with Shift+Enter while Enter still finishes', async ({ page }) => {
    await newTable(page)
    await page.keyboard.type('- one')
    await page.keyboard.press('Shift+Enter')
    await page.keyboard.type('two')
    await page.keyboard.press('Enter')
    await leave(page)
    await expect(drawn(page).nth(0).locator('[role="listitem"]')).toHaveText(['one', 'two'])
  })
})

test.describe('sizing tracks', () => {
  const width = async (locator: Locator): Promise<number> =>
    (await locator.boundingBox())?.width ?? 0

  test('fits a column to its content from the letters, while editing', async ({ page }) => {
    await newTable(page)
    await page.keyboard.type('a considerably longer heading than fits')
    await page.keyboard.press('Enter')
    const before = await width(cell(page, 0))
    const tableBefore = await width(page.locator('[data-object-id]').first())

    await page.getByTestId('table-column-edge-A').dblclick()
    // Still editing: fitting is part of the draft, not a separate command.
    await expect(page.getByTestId('table-editor')).toBeVisible()
    await expect.poll(() => width(cell(page, 0))).toBeGreaterThan(before + 40)
    // The letter stays over its column as it grows.
    const letter = await page.getByTestId('table-column-A').boundingBox()
    const column = await cell(page, 0).boundingBox()
    expect(Math.abs((letter?.width ?? 0) - (column?.width ?? 0))).toBeLessThan(2)

    await leave(page)
    // The table grew to hold it, rather than squeezing the other columns.
    await expect
      .poll(() => width(page.locator('[data-object-id]').first()))
      .toBeGreaterThan(tableBefore + 40)
    expect(await width(drawn(page).nth(0))).toBeGreaterThan(before + 40)

    // The text, the fit and the new size are one undo entry.
    await page.keyboard.press('ControlOrMeta+z')
    await expect
      .poll(() => width(page.locator('[data-object-id]').first()))
      .toBeCloseTo(tableBefore, 0)
    await expect(drawn(page).nth(0)).toHaveText('')
  })

  test('sizes a row by dragging the edge under its number', async ({ page }) => {
    await newTable(page)
    const height = async (): Promise<number> => (await cell(page, 3).boundingBox())?.height ?? 0
    const before = await height()
    const edge = await page.getByTestId('table-row-edge-2').boundingBox()
    if (edge === null) throw new Error('no edge')
    const x = edge.x + edge.width / 2
    const y = edge.y + edge.height / 2
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x, y + 40, { steps: 5 })
    await page.mouse.up()
    await expect.poll(height).toBeGreaterThan(before + 30)
    // Only that row: the one under it keeps its height.
    const below = (await cell(page, 6).boundingBox())?.height ?? 0
    expect(Math.abs(below - before)).toBeLessThan(2)
    await leave(page)
    expect((await drawn(page).nth(3).boundingBox())?.height ?? 0).toBeGreaterThan(before + 30)
  })

  /*
   * A merged cell's width is shared, so it says nothing about any one column.
   * Counting the grid's children to find a column measured the wrong cells
   * once a merge had hidden one: here, the long merged heading, which made
   * column A enormous for the sake of a cell that is not in it alone.
   */
  test('fits a column by its own cells, not a merge across it', async ({ page }) => {
    await newTable(page)
    await page.keyboard.type('a heading merged across two columns and very long')
    await page.keyboard.press('Enter')
    await page.keyboard.type('x')
    await page.keyboard.press('Enter')
    await cell(page, 0).click()
    await cell(page, 1).click({ modifiers: ['Shift'] })
    await cell(page, 0).click({ button: 'right' })
    await page.getByTestId('table-menu-merge').click()
    await leave(page)

    await page.locator('[data-object-id]').first().click()
    const grip = await page.getByTestId('divider-c0').boundingBox()
    if (grip === null) throw new Error('the boundary is not on screen')
    await page.mouse.dblclick(grip.x + grip.width / 2, grip.y + grip.height / 2)
    // Fitted to "x" — narrow — not to the merged heading.
    await expect.poll(() => width(drawn(page).nth(2))).toBeLessThan(80)
  })
})

test('builds a table in one undo entry', async ({ page }) => {
  await newTable(page)
  await fill(page, ['a', 'b'])
  await cell(page, 0).click({ button: 'right' })
  await page.getByTestId('table-menu-row-below').click()
  await page.getByTestId('cell-fill-blue').click()
  await leave(page)
  await expect(page.locator('[role="table"]')).toHaveAttribute('aria-label', /3 columns by 4 rows/)

  await page.keyboard.press('ControlOrMeta+z')
  await expect(page.locator('[role="table"]')).toHaveAttribute('aria-label', /3 columns by 3 rows/)
  await expect(drawn(page).nth(0)).toHaveText('')
})
