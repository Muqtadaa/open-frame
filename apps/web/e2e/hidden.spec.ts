import type { Page } from '@playwright/test'

import { buildBoard } from './boards.js'
import { CANVAS, expect, seedBoard, test } from './fixtures.js'

/**
 * Hiding says where the objects went, and gives them back.
 *
 * "Hide" used to clear the selection and leave nothing behind: the objects
 * were gone from the board, nothing said so, and nothing anywhere showed them
 * again — only undo, if it was still on the stack.
 */
test.use({ board: 'fresh' })

async function hideTheNote(page: Page): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Kept', { x: 300, y: 300 })
      board.note('Hidden', { x: 600, y: 300 })
    }),
  )
  await page.locator('[data-object-type="sticky"]').nth(1).click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Hide' }).click()
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
}

test('says what was hidden, and Show brings it back selected', async ({ page }) => {
  await hideTheNote(page)
  await expect(page.getByTestId('toast-body')).toHaveText('1 object hidden')
  await page.getByTestId('toast-action').click()
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
  await expect(page.locator('[data-object-type="sticky"][data-selected="true"]')).toHaveCount(1)
})

test('the board’s own menu shows what is hidden, long after the toast', async ({ page }) => {
  await hideTheNote(page)
  await page.locator(CANVAS).click({ button: 'right', position: { x: 900, y: 600 } })
  await page.getByRole('menuitem', { name: 'Show 1 hidden object' }).click()
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
})

test('offers nothing to show when nothing is hidden', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => board.note('Kept', { x: 300, y: 300 })),
  )
  await page.locator(CANVAS).click({ button: 'right', position: { x: 900, y: 600 } })
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /hidden/ })).toHaveCount(0)
})

type Dispatch = (command: unknown) => { ok: boolean }
const dispatch = (page: Page, command: unknown): Promise<boolean> =>
  page.evaluate(
    (c) =>
      (
        window as unknown as { __openframe: { runtime: { dispatcher: { dispatch: Dispatch } } } }
      ).__openframe.runtime.dispatcher.dispatch(c).ok,
    command,
  )

const ids = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [
      ...(
        window as unknown as {
          __openframe: {
            runtime: { store: { getDocument: () => { objects: Map<string, unknown> } } }
          }
        }
      ).__openframe.runtime.store
        .getDocument()
        .objects.keys(),
    ].sort(),
  )

/*
 * Show restores what was hidden AT THE TIME. If somebody deleted one of those
 * since, the command naming it was refused whole, and the rest stayed hidden
 * with the toast already gone.
 */
test('Show brings back what is left when one of the hidden was deleted since', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('One', { x: 300, y: 300 })
      board.note('Two', { x: 600, y: 300 })
    }),
  )
  const [one, two] = await ids(page)
  await page.keyboard.press('ControlOrMeta+a')
  await page.locator('[data-object-type="sticky"]').first().click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Hide' }).click()
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)

  expect(await dispatch(page, { kind: 'DeleteObjects', ids: [one] })).toBe(true)
  await page.getByTestId('toast-action').click()

  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
  expect(await ids(page)).toEqual([two])
})

/*
 * The board's menu counted the hidden objects once, as it opened, so one
 * hidden by somebody else while it was open never reached it.
 */
test('the menu’s count follows the board while it is open', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => board.note('Soon hidden', { x: 300, y: 300 })),
  )
  const [note] = await ids(page)
  await page.locator(CANVAS).click({ button: 'right', position: { x: 900, y: 600 } })
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: /hidden/ })).toHaveCount(0)

  expect(await dispatch(page, { kind: 'SetHidden', ids: [note], hidden: true })).toBe(true)
  await expect(page.getByRole('menuitem', { name: 'Show 1 hidden object' })).toBeVisible()
})
