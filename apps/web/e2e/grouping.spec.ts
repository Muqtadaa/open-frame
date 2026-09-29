import type { Page } from '@playwright/test'

import { boxOf, CANVAS, EDITOR, expect, place, test, undo } from './fixtures.js'

/**
 * Grouping: one container, built from ordinary commands.
 *
 * Group and ungroup are `transact` composites rather than bespoke commands —
 * create-then-reparent, and reparent-then-delete — so what these tests really
 * check is that the existing parent/child machinery does the work: cycle
 * safety, cascading delete, move-with-container and a single undo entry.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test.use({ board: 'fresh' })

async function sticky(page: Page, x: number, y: number, text: string): Promise<void> {
  await place(page, 's', { x, y }, text, { x: 1120, y: 140 })
}

const A = { x: 320, y: 300 }
const B = { x: 620, y: 300 }

async function twoNotes(page: Page): Promise<void> {
  await sticky(page, A.x, A.y, 'A')
  await sticky(page, B.x, B.y, 'B')
}

async function groupBoth(page: Page): Promise<void> {
  await page.keyboard.press(`${MOD}+a`)
  await page.keyboard.press(`${MOD}+g`)
  await expect(page.locator('[data-object-type="group"]')).toHaveCount(1)
}

const selectionBox = async (page: Page) => boxOf(page.getByTestId('selection-overlay'))

test.describe('grouping', () => {
  test.beforeEach(async ({ page }) => {
    await twoNotes(page)
  })

  test('wraps the selection in one group', async ({ page }) => {
    await groupBoth(page)
    // The notes survive: a group contains them, it does not replace them.
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
  })

  test('refuses to group a single object', async ({ page }) => {
    await page.locator(CANVAS).click({ position: A })
    await page.keyboard.press(`${MOD}+g`)
    await expect(page.locator('[data-object-type="group"]')).toHaveCount(0)
  })

  test('selects the whole group when a member is clicked', async ({ page }) => {
    await groupBoth(page)
    await page.locator(CANVAS).click({ position: { x: 1120, y: 140 } })
    await expect(page.getByTestId('selection-overlay')).toHaveCount(0)

    await page.locator(CANVAS).click({ position: A })

    // The box spans BOTH notes, so it is the group that got selected.
    const box = await selectionBox(page)
    expect(box.width).toBeGreaterThan(400)
  })

  test('moves every member together', async ({ page }) => {
    await groupBoth(page)
    await page.locator(CANVAS).click({ position: A })

    const before = await page.locator('[data-object-type="sticky"]').nth(1).boundingBox()
    if (before === null) throw new Error('missing note')

    // Drag by a member; the whole group should travel.
    await page.mouse.move(A.x, A.y)
    await page.mouse.down()
    for (let i = 1; i <= 6; i++) await page.mouse.move(A.x, A.y + (120 * i) / 6)
    await page.mouse.up()

    const after = await page.locator('[data-object-type="sticky"]').nth(1).boundingBox()
    if (after === null) throw new Error('missing note')
    expect(after.y - before.y).toBeGreaterThan(100)
  })

  test('ungroups back to loose objects', async ({ page }) => {
    await groupBoth(page)
    await page.keyboard.press(`${MOD}+Shift+g`)

    await expect(page.locator('[data-object-type="group"]')).toHaveCount(0)
    // Ungrouping must not take the members with it, which a plain delete would.
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
  })

  test('grouping is a single undo entry', async ({ page }) => {
    await groupBoth(page)
    await undo(page)

    await expect(page.locator('[data-object-type="group"]')).toHaveCount(0)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
  })

  test('ungrouping is a single undo entry', async ({ page }) => {
    await groupBoth(page)
    await page.keyboard.press(`${MOD}+Shift+g`)
    await undo(page)

    await expect(page.locator('[data-object-type="group"]')).toHaveCount(1)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
  })

  test('deleting a group deletes what it contains', async ({ page }) => {
    await groupBoth(page)
    await page.locator(CANVAS).click({ position: A })
    await page.keyboard.press('Delete')

    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)
    await expect(page.locator('[data-object-type="group"]')).toHaveCount(0)
  })

  test('offers group and ungroup in the context menu', async ({ page }) => {
    await page.keyboard.press(`${MOD}+a`)
    await page.locator(CANVAS).click({ position: A, button: 'right' })
    await page.getByText('Group', { exact: true }).click()

    await expect(page.locator('[data-object-type="group"]')).toHaveCount(1)
  })

  test('survives a reload', async ({ page }) => {
    await groupBoth(page)
    await page.waitForTimeout(800)
    await page.reload()

    await expect(page.locator('[data-object-type="group"]')).toHaveCount(1)
    await page.locator(CANVAS).click({ position: A })
    const box = await selectionBox(page)
    expect(box.width).toBeGreaterThan(400)
  })
})

/**
 * Getting back inside a group.
 *
 * Without this, grouping a note would make its text permanently uneditable —
 * every click resolves to a container that has no text of its own.
 */
test.describe('reaching into a group', () => {
  test.beforeEach(async ({ page }) => {
    await twoNotes(page)
    await groupBoth(page)
  })

  test('double-click edits the member, not the group', async ({ page }) => {
    await page.locator(CANVAS).dblclick({ position: A })

    const editor = page.locator(EDITOR)
    await expect(editor).toBeFocused()
    // `toHaveValue` is for form controls; a rich editor is a contenteditable
    // and has text, not a value.
    await expect(editor).toHaveText('A')

    await editor.fill('Edited inside')
    await page.locator(CANVAS).click({ position: { x: 1120, y: 140 } })
    await expect(page.locator('[data-object-type="sticky"]').first()).toContainText('Edited inside')
  })

  test('a single click still selects the whole group afterwards', async ({ page }) => {
    await page.locator(CANVAS).dblclick({ position: A })
    await page.locator(CANVAS).click({ position: { x: 1120, y: 140 } })

    await page.locator(CANVAS).click({ position: A })
    const box = await selectionBox(page)
    expect(box.width).toBeGreaterThan(400)
  })
})
