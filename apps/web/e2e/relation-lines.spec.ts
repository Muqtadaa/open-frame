import { buildBoard } from './boards.js'
import { boxOf, CANVAS, drag, expect, overlaps, seedBoard, test } from './fixtures.js'

/**
 * A selected object's relations, drawn on the board.
 *
 * They were readable only in the record panel, as names with nothing pointing
 * at where those things sit. A line now runs from what the selection stands
 * on, and to what stands on it, while it is selected.
 */
test.use({ board: 'fresh' })

/*
 * Two pieces of evidence to the left of the insight, which is where the record
 * panel goes first — and, before it kept clear of related things, covered the
 * lines and the evidence they point at.
 */
const board = buildBoard((b) => {
  const evidence = b.add('evidence', { x: 300, y: 200 })
  const more = b.add('evidence', { x: 300, y: 520 })
  const insight = b.add('insight', { x: 760, y: 360 })
  b.add('relation', { x: 0, y: 0 }, { from: insight, to: evidence, predicate: 'cites' })
  b.add('relation', { x: 0, y: 0 }, { from: insight, to: more, predicate: 'cites' })
})

test('draws what the selection stands on, edge to edge, while it is selected', async ({ page }) => {
  await seedBoard(page, board)
  // Nothing drawn until something is selected: the board stays quiet.
  await expect(page.getByTestId('relation-lines')).toHaveCount(0)

  const insight = page.locator('[data-object-type="insight"]')
  const evidence = page.locator('[data-object-type="evidence"]').first()
  await insight.click()

  // A level line has no height, which Playwright reads as hidden: its label
  // is what is visibly there.
  const lines = page.locator('[data-testid^="relation-obj_"]')
  await expect(lines).toHaveCount(2)
  const labels = page.locator('[data-testid^="relation-label-"]')
  await expect(labels).toHaveText(['cites', 'cites'])

  // The record panel keeps clear of the lines and what they point at.
  const panel = await boxOf(page.getByTestId('inspector'))
  for (const label of await labels.all()) expect(overlaps(panel, await boxOf(label))).toBe(false)
  for (const each of await page.locator('[data-object-type="evidence"]').all()) {
    expect(overlaps(panel, await boxOf(each))).toBe(false)
  }

  // From the insight's edge to the evidence's edge, across the gap: each end
  // lies on one of the two boxes' outlines, not at their middles.
  const from = await boxOf(insight)
  const to = await boxOf(evidence)
  const ends = await lines.first().evaluate((element) => ({
    x1: Number(element.getAttribute('x1')),
    x2: Number(element.getAttribute('x2')),
  }))
  const layer = await boxOf(page.locator(CANVAS))
  expect(ends.x1 + layer.x).toBeCloseTo(from.x, -1)
  expect(ends.x2 + layer.x).toBeCloseTo(to.x + to.width, -1)

  // And from the other end too: the evidence shows what stands on it.
  await evidence.click()
  await expect(labels).toHaveText(['cites'])

  // Gone with the selection, and hidden while the selection is moved.
  const moving = await boxOf(evidence)
  await drag(
    page,
    { x: moving.x + 20, y: moving.y + 20 },
    { x: moving.x + 20, y: moving.y + 120 },
    async () => {
      await expect(page.getByTestId('relation-lines')).toHaveCount(0)
    },
  )
  await page.locator(CANVAS).click({ position: { x: 1150, y: 700 } })
  await expect(page.getByTestId('relation-lines')).toHaveCount(0)
})
