import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

/**
 * A table and a code block: two object types that carry structure rather than
 * prose.
 *
 * Both are ONE object. A table's cells are not child objects, which is the
 * decision that keeps a twenty-by-twenty grid from becoming four hundred
 * things culling has to ask for bounds every frame.
 */
const CANVAS = '[data-testid="canvas"]'

async function board(page: Page): Promise<void> {
  await page.goto(BOARD_URL)
  await expect(page.locator(CANVAS)).toBeVisible()
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

/**
 * Places an object and LEAVES its editor.
 *
 * Creating one of these opens its inline editor straight away, the same as a
 * sticky — you are expected to start typing. Escape is what ends that;
 * pressing the select shortcut instead types a `v` into the first cell, which
 * is how the first version of this helper filled a table with the letter v.
 */
async function place(page: Page, tool: string, at: { x: number; y: number }): Promise<void> {
  await page.getByTestId(`tool-${tool}`).click()
  await page.locator(CANVAS).click({ position: at })
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')
}

test('places a table as a single object with a cell per column per row', async ({ page }) => {
  await board(page)
  await place(page, 'table', { x: 340, y: 260 })

  // ONE object, not nine. The whole grid lives in its data.
  await expect(page.locator('[data-object-id]')).toHaveCount(1)
  await expect(page.locator('[role="table"] [role="cell"], [role="table"] [role="columnheader"]')).toHaveCount(9)
})

test('types into the cell that was double-clicked, not the first one', async ({ page }) => {
  await board(page)
  await place(page, 'table', { x: 340, y: 260 })

  const table = page.locator('[data-object-id]').first()
  /*
   * The editor must be CLOSED first, or this proves nothing: double-clicking
   * a textarea focuses it because it is a textarea, not because the click
   * point reached the editor. The first version of this test did exactly
   * that and passed.
   */
  await expect(page.getByTestId('table-editor')).toHaveCount(0)
  await expect(page.locator('[role="table"]')).toBeVisible()

  const box = await table.boundingBox()
  if (box === null) throw new Error('the table is not on screen')

  /*
   * The MIDDLE of the bottom-right cell of a 3x3 — index 8. Aimed by fraction
   * of the table's own box rather than by absolute pixels, so this does not
   * depend on where the board happens to have placed it.
   */
  await page.mouse.dblclick(box.x + box.width * 0.85, box.y + box.height * 0.85)
  await expect(page.getByTestId('table-editor')).toBeVisible()

  /*
   * The caret is in cell 8. Without the click point reaching the editor it
   * lands in cell 0 — which is the difference between an editor that works
   * and one that looks broken the moment a grid has more than one cell.
   */
  await expect(page.getByTestId('table-cell-8')).toBeFocused()

  await page.keyboard.type('bottom right')
  await page.keyboard.press('Enter')

  await expect(page.locator('[role="table"]')).toContainText('bottom right')
})

test('keeps a code block as plain text, with its indentation', async ({ page }) => {
  await board(page)
  await place(page, 'code', { x: 340, y: 260 })
  await expect(page.locator('[data-object-id]')).toHaveCount(1)

  await page.locator('[data-object-id]').first().dblclick()
  await expect(page.getByTestId('code-editor')).toBeVisible()

  await page.getByTestId('code-language').selectOption('typescript')
  const field = page.getByTestId('code-input')
  await field.fill('function add(a: number) {\n  return a + 1\n}')
  // Committed on blur: clicking away is how an inline editor ends.
  await page.locator(CANVAS).click({ position: { x: 900, y: 560 } })

  const block = page.getByTestId('code-block')
  await expect(block).toContainText('function add')
  /*
   * The two leading spaces SURVIVE. Whitespace is the content in a code block,
   * and a renderer that collapsed it would be showing something the user did
   * not paste.
   */
  await expect(block).toContainText('  return a + 1')
})

/**
 * Highlighting arrives after the code does.
 *
 * The highlighter is a separate download, so a block is readable immediately
 * and gains colour when it lands — which is the honest shape of something
 * asynchronous that the render path needs.
 */
test('colours a known language once the highlighter arrives', async ({ page }) => {
  await board(page)
  await place(page, 'code', { x: 340, y: 260 })

  await page.locator('[data-object-id]').first().dblclick()
  await page.getByTestId('code-language').selectOption('typescript')
  await page.getByTestId('code-input').fill('const answer = 42')
  await page.locator(CANVAS).click({ position: { x: 900, y: 560 } })

  // A highlighted token, which only exists if the lazy chunk loaded and ran.
  await expect(page.locator('[data-testid="code-block"] .hljs-keyword')).toHaveCount(1, {
    timeout: 10_000,
  })
})

test('leaves an unknown language as plain text', async ({ page }) => {
  await board(page)
  await place(page, 'code', { x: 340, y: 260 })

  await page.locator('[data-object-id]').first().dblclick()
  await page.getByTestId('code-input').fill('const answer = 42')
  await page.locator(CANVAS).click({ position: { x: 900, y: 560 } })

  const block = page.getByTestId('code-block')
  await expect(block).toContainText('const answer = 42')
  // `plain` is not a grammar, so nothing is marked up and React escapes it.
  await expect(block.locator('.hljs-keyword')).toHaveCount(0)
})

/**
 * Choosing the size before placing it.
 *
 * The size is the first thing anybody knows about a table they are about to
 * make, so it is chosen by pointing at a grid rather than corrected afterwards.
 */
test('drops a table at the size picked from the grid', async ({ page }) => {
  await board(page)

  await page.getByTestId('tool-table').click()
  await page.getByTestId('table-menu').click()

  // Hovering PREVIEWS: the readout says what clicking would give you.
  await page.getByTestId('table-size-5x2').hover()
  await expect(page.getByTestId('table-size-readout')).toHaveText('5 × 2')

  await page.getByTestId('table-size-5x2').click()
  await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })
  await page.keyboard.press('Escape')
  await page.keyboard.press('v')

  /*
   * Ten cells, in a five-by-two grid. A NON-SQUARE size on purpose: a 3x3
   * would pass against a picker whose choice was ignored entirely, because
   * three by three is already the default.
   */
  const table = page.locator('[role="table"]')
  await expect(table).toHaveAttribute('aria-label', /5 columns by 2 rows/)
  await expect(table.locator('[role="cell"], [role="columnheader"]')).toHaveCount(10)
})

/**
 * Changing the shape afterwards, without losing what is in it.
 *
 * Adding a column is a change to the DRAFT, so it lands with whatever was
 * typed as one command — rather than closing the editor and making you
 * re-open it for every column.
 */
test('adds and removes columns and rows, keeping the cells that stay', async ({ page }) => {
  await board(page)
  await place(page, 'table', { x: 340, y: 240 })

  await page.locator('[data-object-id]').first().dblclick()
  await expect(page.getByTestId('table-editor')).toBeVisible()

  await page.getByTestId('table-cell-0').fill('keep me')

  await page.getByTestId('table-add-column').click()
  await page.getByTestId('table-add-row').click()
  // 4x4 now, so the last cell is index 15 and only exists if both landed.
  await expect(page.getByTestId('table-cell-15')).toBeVisible()

  await page.getByTestId('table-remove-column').click()
  await expect(page.getByTestId('table-cell-15')).toHaveCount(0)

  // Commit, and what was typed before the reshaping is still there.
  await page.locator(CANVAS).click({ position: { x: 900, y: 560 } })
  const table = page.locator('[role="table"]')
  await expect(table).toHaveAttribute('aria-label', /3 columns by 4 rows/)
  await expect(table).toContainText('keep me')
})

test('will not remove the last column', async ({ page }) => {
  await board(page)

  await page.getByTestId('tool-table').click()
  await page.getByTestId('table-menu').click()
  await page.getByTestId('table-size-1x1').click()
  await page.locator(CANVAS).click({ position: { x: 340, y: 260 } })

  // A table with no columns is not a smaller table; it is not a table.
  await expect(page.getByTestId('table-remove-column')).toBeDisabled()
  await expect(page.getByTestId('table-remove-row')).toBeDisabled()
})

/**
 * The language menu opens instead of closing the editor.
 *
 * This is the third control to hit the same bug: pressing it read as a canvas
 * gesture, so the editor committed and unmounted and the press landed on
 * nothing. The guard now marks the whole editor rather than each control.
 */
test('opens the language menu without dismissing the editor', async ({ page }) => {
  await board(page)
  await page.getByTestId('tool-code').click()
  await page.locator(CANVAS).click({ position: { x: 340, y: 240 } })
  await expect(page.getByTestId('code-editor')).toBeVisible()

  await page.getByTestId('code-language').click()
  await expect(page.getByTestId('code-editor')).toBeVisible()

  // And it actually changes the language.
  await page.getByTestId('code-language').selectOption('python')
  await expect(page.getByTestId('code-language')).toHaveValue('python')
  await expect(page.getByTestId('code-editor')).toBeVisible()
})

/**
 * Dragging a column boundary.
 *
 * The handles come from the REGISTRY, not from the canvas knowing what a table
 * is — so this also covers the mechanism a later type with internal divisions
 * would use.
 */
test('widens a column by dragging its boundary, in one undo entry', async ({ page }) => {
  await board(page)
  await place(page, 'table', { x: 340, y: 240 })
  await page.locator('[data-object-id]').first().click()

  // Two boundaries on a 3x3, and two more for the rows.
  const boundary = page.getByTestId('divider-c0')
  await expect(boundary).toHaveCount(1)

  const widthOf = async () => {
    const box = await page.locator('[role="table"] [role="columnheader"]').first().boundingBox()
    return box?.width ?? 0
  }
  const before = await widthOf()

  const grip = await boundary.boundingBox()
  if (grip === null) throw new Error('the boundary is not on screen')
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x + grip.width / 2 + 60, grip.y + grip.height / 2, { steps: 8 })

  /*
   * MID-DRAG the table already shows the new width, from the preview — and the
   * document has not been touched. Rule 4: one command on release, however
   * many frames the drag took.
   */
  expect(await widthOf()).toBeGreaterThan(before + 30)

  await page.mouse.up()
  const after = await widthOf()
  expect(after).toBeGreaterThan(before + 30)

  // ONE undo entry for the whole drag.
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(widthOf).toBeCloseTo(before, 0)
})

test('stops at the narrowest a column may be, and leaves its neighbours alone', async ({
  page,
}) => {
  await board(page)
  await place(page, 'table', { x: 340, y: 240 })
  await page.locator('[data-object-id]').first().click()

  const widths = async (): Promise<number[]> =>
    page
      .locator('[role="table"] [role="columnheader"]')
      .evaluateAll((cells) => cells.map((cell) => cell.getBoundingClientRect().width))
  const tableWidth = async (): Promise<number> =>
    (await page.locator('[role="table"]').boundingBox())?.width ?? 0

  const before = await widths()
  const wasWide = await tableWidth()

  const grip = await page.getByTestId('divider-c0').boundingBox()
  if (grip === null) throw new Error('the boundary is not on screen')

  // Dragged far past the table's own left edge.
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
  await page.mouse.down()
  await page.mouse.move(grip.x - 400, grip.y + grip.height / 2, { steps: 10 })
  await page.mouse.up()

  const [wasFirst, wasSecond] = before
  const [isFirst, isSecond] = await widths()
  if (wasFirst === undefined || wasSecond === undefined) throw new Error('no columns were drawn')
  if (isFirst === undefined || isSecond === undefined) throw new Error('no columns were drawn')

  /*
   * Two things, and the second is the one that changed.
   *
   * A column of no width is one nothing can be typed into and nothing can be
   * grabbed to drag back, so the drag stops short of it rather than being
   * refused — an unclamped drag produces a weight the schema rejects, which
   * throws the whole patch away and moves nothing at all.
   *
   * And the NEIGHBOUR is untouched. Resizing a column used to take the space
   * from the one beside it, so the table could only rearrange the width it
   * already had; now the table itself gets narrower.
   */
  expect(isFirst).toBeGreaterThan(4)
  expect(isFirst).toBeLessThan(wasFirst / 2)
  expect(isSecond).toBeCloseTo(wasSecond, 0)
  expect(await tableWidth()).toBeLessThan(wasWide - 50)
})

test('colours a range of cells, in one undo entry', async ({ page }) => {
  await board(page)
  await place(page, 'table', { x: 340, y: 240 })
  await page.locator('[data-object-id]').first().dblclick()
  await expect(page.getByTestId('table-editor')).toBeVisible()

  // A 3x3: the top-left cell to the middle one is a 2x2 block.
  await page.getByTestId('table-cell-0').click()
  await page.getByTestId('table-cell-4').click({ modifiers: ['Shift'] })
  await expect(page.getByTestId('table-cell-style')).toContainText('4 cells')

  await page.getByTestId('cell-fill-green').click()
  // One palette, so the target says what it paints next.
  await page.getByTestId('cell-target-text').click()
  await page.getByTestId('cell-text-red').click()

  /*
   * Committed by leaving, NOT by Escape — Escape cancels, and a first draft of
   * this test pressed it and then asserted against a table that had correctly
   * thrown the colours away.
   */
  await page.locator(CANVAS).click({ position: { x: 900, y: 600 } })
  await page.locator('[data-object-id]').first().click()

  const cells = page.locator('[role="table"] > div')
  await expect(cells.nth(0)).toHaveCSS('background-color', 'rgb(191, 240, 212)')
  await expect(cells.nth(1)).toHaveCSS('background-color', 'rgb(191, 240, 212)')
  await expect(cells.nth(4)).toHaveCSS('color', 'rgb(138, 64, 56)')

  /*
   * A cell OUTSIDE the block is untouched. Without this the test passes just
   * as well against a version that coloured the whole table — which is what a
   * range implemented as "every index between the two" would do.
   */
  await expect(cells.nth(2)).not.toHaveCSS('background-color', 'rgb(191, 240, 212)')
  await expect(cells.nth(8)).not.toHaveCSS('background-color', 'rgb(191, 240, 212)')
})

test('puts a cell back to the colour the table gives it', async ({ page }) => {
  await board(page)
  await place(page, 'table', { x: 340, y: 240 })
  await page.locator('[data-object-id]').first().dblclick()

  /*
   * A BODY cell, not cell 0. The first row is a header and carries its own
   * ground, so "cleared" there means the header's grey — which is correct and
   * is not what this test is asking about. A first draft asserted transparency
   * on cell 0 and failed for exactly that reason.
   */
  await page.getByTestId('table-cell-4').click()
  await page.getByTestId('cell-fill-blue').click()
  await page.getByTestId('cell-clear').click()

  await page.locator(CANVAS).click({ position: { x: 900, y: 600 } })
  await page.locator('[data-object-id]').first().click()

  const cleared = page.locator('[role="table"] > div').nth(4)
  /*
   * Transparent, not "the blue put back as a literal" — the cell follows the
   * table again.
   *
   * That the key is REMOVED rather than set to `undefined` is the sharper
   * claim, and this test cannot see the difference: an undefined background
   * renders the same as no background. `schema.test.ts` asserts the removal
   * directly, and fails when the delete becomes an assignment.
   */
  await expect(cleared).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
})

/**
 * Double-clicking a boundary fits the track to its content, as a spreadsheet
 * does.
 *
 * Measured against a column carrying text far wider than its share, so the
 * assertion cannot be satisfied by the column staying where it was.
 */
test('fits a column to its content on a double click', async ({ page }) => {
  await board(page)
  await place(page, 'table', { x: 300, y: 240 })

  await page.locator('[data-object-id]').first().dblclick()
  await page.getByTestId('table-cell-0').fill('a considerably longer heading than fits')
  await page.locator(CANVAS).click({ position: { x: 950, y: 620 } })

  await page.locator('[data-object-id]').first().click()
  const widthOf = async (): Promise<number> =>
    (await page.locator('[role="table"] [role="columnheader"]').first().boundingBox())?.width ?? 0
  const before = await widthOf()

  const grip = await page.getByTestId('divider-c0').boundingBox()
  if (grip === null) throw new Error('the boundary is not on screen')
  await page.mouse.dblclick(grip.x + grip.width / 2, grip.y + grip.height / 2)

  const after = await widthOf()
  expect(after).toBeGreaterThan(before + 40)

  /*
   * And it is ONE undoable action, like a drag: the weights and the table's
   * new size go in the same transaction.
   */
  await page.keyboard.press('ControlOrMeta+z')
  await expect.poll(widthOf).toBeCloseTo(before, 0)
})
