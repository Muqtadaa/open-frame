import type { Page } from '@playwright/test'

import { expect, seedBoard, test, undo } from './fixtures.js'
import { buildBoard } from './boards.js'

/**
 * Lining a selection up, and evening out the gaps.
 *
 * Every assertion measures where objects ENDED UP. The arithmetic is covered
 * exhaustively in core, without a browser; what this suite is for is the part
 * core cannot see — that the bar appears for the right selections, that a
 * press on it does not deselect what it is about to act on, and that the whole
 * arrangement is one undo.
 */

/**
 * Opens a board holding an empty sticky at each point, with NOTHING selected.
 *
 * Seeded: these tests arrange notes, and placing them was only ever the way
 * to have some. It was also fiddly — the options panel floats beside whatever
 * is selected, so a note placed while the last one was still selected landed
 * on the panel instead of the canvas. Made in the order given, so the DOM
 * order is the same as when they were placed one after another.
 */
async function notes(page: Page, at: readonly { x: number; y: number }[]): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      for (const point of at) board.add('sticky', point)
    }),
  )
}

/** Every object's box on screen, left to right. */
async function boxes(
  page: Page,
): Promise<{ x: number; y: number; width: number; height: number }[]> {
  const count = await page.locator('[data-object-id]').count()
  const found = []
  for (let index = 0; index < count; index += 1) {
    const box = await page.locator('[data-object-id]').nth(index).boundingBox()
    if (box !== null) found.push(box)
  }
  return found.sort((a, b) => a.x - b.x)
}

async function selectAll(page: Page): Promise<void> {
  // No deselecting click first: the options panel floats over the board and
  // every "empty" corner is somewhere it might be.
  await page.keyboard.press('ControlOrMeta+a')
}

test('offers nothing to arrange until two things are selected', async ({ page }) => {
  await notes(page, [
    { x: 420, y: 260 },
    { x: 700, y: 430 },
  ])

  await page.locator('[data-object-id]').first().click()
  await expect(page.getByTestId('arrange-bar')).toHaveCount(0)

  await selectAll(page)
  await expect(page.getByTestId('arrange-bar')).toBeVisible()
})

test('aligns a selection to the top of its own bounding box', async ({ page }) => {
  await notes(page, [
    { x: 420, y: 240 },
    { x: 700, y: 430 },
  ])
  await selectAll(page)

  const before = await boxes(page)
  expect(before).toHaveLength(2)
  // They start at different heights, or the assertion below proves nothing.
  expect(Math.abs(before[0]!.y - before[1]!.y)).toBeGreaterThan(40)

  await page.getByTestId('align-top').click()

  const after = await boxes(page)
  expect(after[0]!.y).toBeCloseTo(after[1]!.y, 0)
  // The TOPMOST one did not move: the reference is the selection's own bounds.
  expect(after[0]!.y).toBeCloseTo(Math.min(before[0]!.y, before[1]!.y), 0)
  // And nothing moved sideways.
  expect(after[0]!.x).toBeCloseTo(before[0]!.x, 0)
})

test('aligns centres rather than edges', async ({ page }) => {
  await notes(page, [
    { x: 420, y: 240 },
    { x: 760, y: 420 },
  ])
  await selectAll(page)

  await page.getByTestId('align-centerX').click()

  const after = await boxes(page)
  const centre = (box: { x: number; width: number }): number => box.x + box.width / 2
  expect(centre(after[0]!)).toBeCloseTo(centre(after[1]!), 0)
})

test('evens out the gaps, leaving the outermost two where they were', async ({ page }) => {
  await notes(page, [
    { x: 320, y: 300 },
    { x: 460, y: 300 },
    { x: 900, y: 300 },
  ])
  await selectAll(page)

  const before = await boxes(page)
  expect(before).toHaveLength(3)

  await page.getByTestId('distribute-x').click()

  const after = await boxes(page)
  expect(after[0]!.x).toBeCloseTo(before[0]!.x, 0)
  expect(after[2]!.x).toBeCloseTo(before[2]!.x, 0)

  const first = after[1]!.x - (after[0]!.x + after[0]!.width)
  const second = after[2]!.x - (after[1]!.x + after[1]!.width)
  expect(first).toBeCloseTo(second, 0)
  // And it actually moved the middle one, rather than finding it already even.
  expect(Math.abs(after[1]!.x - before[1]!.x)).toBeGreaterThan(40)
})

test('will not distribute fewer than three', async ({ page }) => {
  await notes(page, [
    { x: 420, y: 260 },
    { x: 700, y: 400 },
  ])
  await selectAll(page)

  /*
   * Disabled rather than absent: two objects have no space between the ends to
   * even out, and a control that vanishes as the selection changes size reads
   * as a glitch.
   */
  await expect(page.getByTestId('distribute-x')).toBeDisabled()
  await expect(page.getByTestId('align-left')).toBeEnabled()
  // And says why to someone who cannot see the tip: reachable, and described.
  await page.getByTestId('distribute-x').focus()
  await expect(page.getByTestId('distribute-x')).toBeFocused()
  await expect(page.getByTestId('distribute-x')).toHaveAttribute(
    'aria-description',
    'Needs three or more',
  )
})

test('groups the alignments across and down', async ({ page }) => {
  await notes(page, [
    { x: 420, y: 260 },
    { x: 700, y: 400 },
  ])
  await selectAll(page)
  const bar = page.getByRole('group', { name: 'Arrange selection' })
  await expect(bar.getByTestId('arrange-rule')).toHaveCount(2)
  // The first rule sits between "right" and "top".
  const order = await bar.evaluate((node) =>
    [...node.children].map((child) => child.getAttribute('data-testid')),
  )
  expect(order.slice(0, 7)).toEqual([
    'align-left',
    'align-centerX',
    'align-right',
    'arrange-rule',
    'align-top',
    'align-middleY',
    'align-bottom',
  ])
})

test('is one undo, however many objects moved', async ({ page }) => {
  await notes(page, [
    { x: 380, y: 240 },
    { x: 620, y: 400 },
    { x: 860, y: 300 },
  ])
  await selectAll(page)

  const before = await boxes(page)
  await page.getByTestId('align-top').click()
  const after = await boxes(page)
  expect(after[1]!.y).not.toBeCloseTo(before[1]!.y, 0)

  /*
   * ONE step, not three. Aligning is a single `MoveObjects`, so the undo takes
   * the whole arrangement back — a per-object command would cost three presses
   * and leave the board half aligned in between.
   */
  await undo(page)
  await expect.poll(async () => (await boxes(page))[1]?.y ?? 0).toBeCloseTo(before[1]!.y, 0)
})

/**
 * The failure this whole layer exists to prevent: the canvas blurs and
 * deselects on any press it reads as a board gesture, and a bar that is not
 * marked as chrome takes the selection away from itself on the first click.
 * That fault has appeared four times on other apparatus.
 */
test('a press on the bar does not take the selection away', async ({ page }) => {
  await notes(page, [
    { x: 420, y: 240 },
    { x: 700, y: 430 },
  ])
  await selectAll(page)

  await page.getByTestId('align-top').click()
  await expect(page.getByTestId('arrange-bar')).toBeVisible()
  // Still two selected, so a second alignment is possible without reselecting.
  await page.getByTestId('align-left').click()

  const after = await boxes(page)
  expect(after[0]!.x).toBeCloseTo(after[1]!.x, 0)
})
