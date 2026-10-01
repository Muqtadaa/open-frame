import { buildBoard } from './boards.js'
import { CANVAS, boxOf, expect, place, seedBoard, test } from './fixtures.js'

/**
 * A seeded board puts its objects exactly where the clicks it replaces did.
 *
 * The specs that seed their board keep the click coordinates they had when
 * they made the objects through the rail, so the builder must place as the app
 * does — default size centred on the point, snapped to the grid. If the two
 * drift apart, every seeded spec clicks a little beside its objects and fails
 * for no reason anybody can see; this is where it fails first, and says why.
 */
test.use({ board: 'fresh' })

const AT = { x: 343, y: 257 }

for (const [name, key, type] of [
  ['a sticky note', 's', 'sticky'],
  ['a shape', 'u', 'shape'],
] as const) {
  test(`a seeded ${type} sits where a click would have put ${name}`, async ({ page }) => {
    await place(page, key, AT)
    const clicked = await boxOf(page.locator(`[data-object-type="${type}"]`))

    await seedBoard(
      page,
      buildBoard((board) => {
        board.add(type, AT)
      }),
    )
    const seeded = await boxOf(page.locator(`[data-object-type="${type}"]`))

    expect(seeded).toEqual(clicked)
    await expect(page.locator(CANVAS)).toBeVisible()
  })
}
