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
