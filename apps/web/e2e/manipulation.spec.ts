import type { Page } from '@playwright/test'

import {
  CANVAS,
  drag,
  EDITOR,
  expect,
  place,
  test,
  undo,
  boxOf,
  viewOf,
  seedBoard,
} from './fixtures.js'
import { buildBoard, type BoardBuilder } from './boards.js'

/**
 * Direct manipulation: resize, rotate, z-order, clipboard, lock.
 *
 * Browser-level because all of it depends on pointer capture, hit testing
 * against what is actually painted, and DOM transforms — none of which a unit
 * test can observe.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test.use({ board: 'fresh' })

/** Made with a tool's key, for the tests whose subject is making it. */
async function create(page: Page, tool: string, x: number, y: number, text = ''): Promise<void> {
  await place(page, tool, { x, y }, text)
}

/**
 * Already on the board, and nothing selected — as `create` left it — for the
 * tests about what happens to an object rather than how it got there.
 */
async function seed(page: Page, make: (board: BoardBuilder) => void): Promise<void> {
  await seedBoard(page, buildBoard(make))
}

const SHAPE = { shape: 'rectangle' }

test.describe('resize', () => {
  test('shows handles for a selected object and hides them otherwise', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Resize me', { x: 400, y: 300 })
    })
    await expect(page.getByTestId('selection-overlay')).toHaveCount(0)

    await page.locator('[data-object-type="sticky"]').click()
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await expect(page.getByTestId('handle-se')).toBeVisible()
    await expect(page.getByTestId('handle-n')).toBeVisible()
  })

  test('resizes from the south-east corner', { tag: '@smoke' }, async ({ page }) => {
    await seed(page, (board) => {
      board.note('Resize me', { x: 400, y: 300 })
    })
    await page.locator('[data-object-type="sticky"]').click()

    const before = await boxOf(page.locator('[data-object-type="sticky"]'))
    const handle = await boxOf(page.getByTestId('handle-se'))

    await drag(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: handle.x + 120, y: handle.y + 120 },
    )

    const after = await boxOf(page.locator('[data-object-type="sticky"]'))
    expect(after.width).toBeGreaterThan(before.width + 80)
  })

  /** A resize drag must be ONE undo entry, like every other gesture. */
  test('a resize is a single undoable action', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Resize me', { x: 400, y: 300 })
    })
    await page.locator('[data-object-type="sticky"]').click()

    const before = await boxOf(page.locator('[data-object-type="sticky"]'))
    const handle = await boxOf(page.getByTestId('handle-se'))

    await drag(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: handle.x + 140, y: handle.y + 100 },
    )
    await undo(page)

    const restored = await boxOf(page.locator('[data-object-type="sticky"]'))
    expect(Math.round(restored.width)).toBe(Math.round(before.width))
  })

  /** The registry decides: a sticky declares itself non-rotatable. */
  test('offers a rotate grip only for rotatable types', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Sticky', { x: 400, y: 300 })
      board.add('shape', { x: 800, y: 400 }, SHAPE)
    })
    await page.locator('[data-object-type="sticky"]').click()
    await expect(page.getByTestId('handle-rotate')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await page.locator('[data-object-type="shape"]').click()
    await expect(page.getByTestId('handle-rotate')).toBeVisible()
  })

  test('rotates a shape', async ({ page }) => {
    await seed(page, (board) => {
      board.add('shape', { x: 600, y: 400 }, SHAPE)
    })
    await page.locator('[data-object-type="shape"]').click()

    const grip = await boxOf(page.getByTestId('handle-rotate'))
    const box = await boxOf(page.locator('[data-object-type="shape"]'))

    await drag(
      page,
      { x: grip.x + grip.width / 2, y: grip.y + grip.height / 2 },
      { x: box.x + box.width + 90, y: box.y + box.height / 2 },
    )

    const transform = await page
      .locator('[data-object-type="shape"]')
      .evaluate((el) => getComputedStyle(el).transform)
    expect(transform).not.toBe('none')
    // A rotated matrix has non-zero off-diagonal terms.
    const parts = /matrix\(([^)]+)\)/.exec(transform)?.[1]?.split(',').map(Number) ?? []
    expect(Math.abs(parts[1] ?? 0)).toBeGreaterThan(0.05)
  })
})

test.describe('clipboard and ordering', () => {
  test('copies and pastes', { tag: '@smoke' }, async ({ page }) => {
    await seed(page, (board) => {
      board.note('Original', { x: 400, y: 300 })
    })
    await page.locator('[data-object-type="sticky"]').click()

    await page.keyboard.press(`${MOD}+c`)
    await page.keyboard.press(`${MOD}+v`)

    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
    await expect(page.locator('[data-object-type="sticky"]').nth(1)).toContainText('Original')
  })

  test('cuts', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Cut me', { x: 400, y: 300 })
    })
    await page.locator('[data-object-type="sticky"]').click()

    await page.keyboard.press(`${MOD}+x`)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)

    await page.keyboard.press(`${MOD}+v`)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
  })

  test('reorders with bracket keys', async ({ page }) => {
    // Placed apart: overlapping notes make `.first()` ambiguous to click,
    // and paint order is what this test is about, not geometry.
    await seed(page, (board) => {
      board.note('First', { x: 320, y: 300 })
      board.note('Second', { x: 760, y: 300 })
    })

    const ids = async () =>
      page
        .locator('[data-object-type="sticky"]')
        .evaluateAll((els) => els.map((el) => el.getAttribute('data-object-id')))
    const original = await ids()

    await page.locator('[data-object-type="sticky"]').first().click()
    await page.keyboard.press('Shift+]')

    const reordered = await ids()
    expect(reordered).not.toEqual(original)
    expect(reordered[reordered.length - 1]).toBe(original[0])
  })
})

test.describe('context menu', () => {
  test('opens on right click and acts on the object under the pointer', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Target', { x: 400, y: 300 })
    })

    await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
    await expect(page.getByTestId('context-menu')).toBeVisible()

    await page.getByTestId('menu-duplicate').click()
    await expect(page.getByTestId('context-menu')).toHaveCount(0)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(2)
  })

  test('locks, which blocks further edits until unlocked', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Locked', { x: 400, y: 300 })
    })

    await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
    await page.getByTestId('menu-lock').click()

    await page.locator('[data-object-type="sticky"]').click()
    await expect(page.getByTestId('handle-se')).toHaveCount(0)

    await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
    await page.getByTestId('menu-unlock').click()
    await page.locator('[data-object-type="sticky"]').click()
    await expect(page.getByTestId('handle-se')).toBeVisible()
  })

  test('dismisses on outside press', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Target', { x: 400, y: 300 })
    })
    await page.locator('[data-object-type="sticky"]').click({ button: 'right' })
    await expect(page.getByTestId('context-menu')).toBeVisible()
    await page.locator(CANVAS).click({ position: { x: 1000, y: 600 } })
    await expect(page.getByTestId('context-menu')).toHaveCount(0)
  })
})

test.describe('frames', () => {
  test('creates a frame and renames it', async ({ page }) => {
    await page.keyboard.press('f')
    await page.locator(CANVAS).click({ position: { x: 500, y: 350 } })
    await expect(page.locator(EDITOR)).toBeFocused()
    await page.locator(EDITOR).fill('Discovery')
    await page.locator(CANVAS).click({ position: { x: 1150, y: 130 } })
    await page.keyboard.press('v')

    await expect(page.locator('[data-object-type="frame"]')).toHaveCount(1)
    await expect(page.getByTestId('frame-title')).toContainText('Discovery')
  })

  /**
   * The behaviour frames exist for: dropping a note onto one makes it a member,
   * and the frame then carries it. Membership is set by the drop, not by
   * geometry alone.
   */
  test('a note dropped on a frame moves with it afterwards', async ({ page }) => {
    await seed(page, (board) => {
      board.add('frame', { x: 700, y: 400 })
      board.note('Inside', { x: 200, y: 200 })
    })

    const note = page.locator('[data-object-type="sticky"]')
    const before = await boxOf(note)

    // Drag the note onto the frame.
    await drag(page, { x: before.x + 40, y: before.y + 40 }, { x: 700, y: 400 })

    const inFrame = await boxOf(note)

    // Now drag the FRAME by its title and confirm the note travels with it.
    const title = await boxOf(page.getByTestId('frame-title'))
    await drag(page, { x: title.x + 10, y: title.y + 5 }, { x: title.x + 10, y: title.y - 120 })

    const after = await boxOf(note)
    expect(Math.round(after.y - inFrame.y)).toBeLessThan(-80)
  })

  test('undo returns a nested note to the board', async ({ page }) => {
    await seed(page, (board) => {
      board.add('frame', { x: 700, y: 400 })
      board.note('Note', { x: 200, y: 200 })
    })
    const note = page.locator('[data-object-type="sticky"]')
    const start = await boxOf(note)

    await drag(page, { x: start.x + 40, y: start.y + 40 }, { x: 700, y: 400 })
    await undo(page)

    const restored = await boxOf(note)
    expect(Math.round(restored.x)).toBe(Math.round(start.x))
  })

  test('deleting a frame removes its contents, and undo restores both', async ({ page }) => {
    await seed(page, (board) => {
      board.add('frame', { x: 700, y: 400 })
      board.note('Doomed', { x: 200, y: 200 })
    })
    const note = page.locator('[data-object-type="sticky"]')
    const start = await boxOf(note)
    await drag(page, { x: start.x + 40, y: start.y + 40 }, { x: 700, y: 400 })

    await page.getByTestId('frame-title').click()
    await page.keyboard.press('Delete')
    await expect(page.locator('[data-object-type="frame"]')).toHaveCount(0)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)

    await undo(page)
    await expect(page.locator('[data-object-type="frame"]')).toHaveCount(1)
    await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(1)
  })
})

test.describe('snap to grid', () => {
  test('is on by default and lands a drag on the grid', async ({ page }) => {
    await expect(page.getByTestId('snap-toggle')).toHaveAttribute('data-snap', 'on')
    await seed(page, (board) => {
      board.note('Snappy', { x: 405, y: 307 })
    })

    const note = page.locator('[data-object-type="sticky"]')
    const before = await boxOf(note)

    // A deliberately awkward distance: 37 and 23 are not grid multiples.
    await drag(
      page,
      { x: before.x + 40, y: before.y + 40 },
      { x: before.x + 40 + 37, y: before.y + 40 + 23 },
    )

    const after = await boxOf(note)
    // The POSITION is what snaps, not the distance travelled — an object that
    // began off-grid must end up on it.
    expect(Math.round(after.x) % 10).toBe(0)
    expect(Math.round(after.y) % 10).toBe(0)
    expect(after.x).not.toBe(before.x)
  })

  test('places a newly created object on the grid', async ({ page }) => {
    await create(page, 's', 407, 313, 'Aligned')
    const box = await boxOf(page.locator('[data-object-type="sticky"]'))
    expect(Math.round(box.x) % 10).toBe(0)
    expect(Math.round(box.y) % 10).toBe(0)
  })

  /** The override has to be reachable mid-gesture, which is why it is a held key. */
  test('is suspended while the modifier is held, without changing the setting', async ({
    page,
  }) => {
    await seed(page, (board) => {
      board.note('Free', { x: 405, y: 307 })
    })

    const note = page.locator('[data-object-type="sticky"]')
    const before = await boxOf(note)

    await page.keyboard.down(MOD)
    await drag(
      page,
      { x: before.x + 40, y: before.y + 40 },
      { x: before.x + 40 + 37, y: before.y + 40 + 23 },
    )
    await page.keyboard.up(MOD)

    const after = await boxOf(note)
    expect(Math.round(after.x - before.x)).toBe(37)
    expect(Math.round(after.y - before.y)).toBe(23)

    // The preference itself is untouched.
    await expect(page.getByTestId('snap-toggle')).toHaveAttribute('data-snap', 'on')
  })

  test('can be turned off, and the choice survives a reload', async ({ page }) => {
    await page.getByTestId('snap-toggle').click()
    await expect(page.getByTestId('snap-toggle')).toHaveAttribute('data-snap', 'off')

    await seed(page, (board) => {
      board.note('Loose', { x: 405, y: 307 })
    })
    const note = page.locator('[data-object-type="sticky"]')
    const before = await boxOf(note)

    await drag(
      page,
      { x: before.x + 40, y: before.y + 40 },
      { x: before.x + 40 + 37, y: before.y + 40 + 23 },
    )

    const after = await boxOf(note)
    expect(Math.round(after.x - before.x)).toBe(37)

    await page.reload()
    await expect(page.getByTestId('snap-toggle')).toHaveAttribute('data-snap', 'off')
  })

  test('snaps a resize to the grid', async ({ page }) => {
    await seed(page, (board) => {
      board.note('Resize', { x: 405, y: 307 })
    })
    await page.locator('[data-object-type="sticky"]').click()

    const handle = await boxOf(page.getByTestId('handle-se'))
    await drag(
      page,
      { x: handle.x + handle.width / 2, y: handle.y + handle.height / 2 },
      { x: handle.x + 73, y: handle.y + 47 },
    )

    const after = await boxOf(page.locator('[data-object-type="sticky"]'))
    expect(Math.round(after.width) % 10).toBe(0)
    expect(Math.round(after.height) % 10).toBe(0)
  })
})

/**
 * Reported from the deployed build, and each one is a fix that a unit test
 * structurally could not have caught: they are all about what the browser
 * finally paints.
 */
test.describe('reported regressions', () => {
  const AT = { x: 340, y: 280 }
  const CLEAR = { x: 1120, y: 140 }

  /**
   * A shape's label sits in a flex box that centres it, and a flex container
   * sizes text to its content before placing it — so `text-align` had nothing
   * to align within and every label stayed centred whatever the panel said.
   */
  test('a shape label honours the alignment that was picked', async ({ page }) => {
    await seed(page, (board) => {
      board.add('shape', AT, { ...SHAPE, text: [{ text: 'align me' }] })
    })

    await page.locator(CANVAS).click({ position: AT })
    const text = page.getByTestId('shape-label-text')

    await page.getByTestId('align-start').click()
    const left = (await text.boundingBox())?.x ?? 0
    await page.getByTestId('align-center').click()
    const middle = (await text.boundingBox())?.x ?? 0
    await page.getByTestId('align-end').click()
    const right = (await text.boundingBox())?.x ?? 0

    // Before the fix all three were identical, because the flex container
    // centred the text whatever `text-align` said.
    expect(left).toBeLessThan(middle)
    expect(middle).toBeLessThan(right)
  })

  /**
   * A selected object is lifted above its siblings so the selection reads
   * clearly. Lifting a FRAME lifts it above its own contents, and a filled one
   * then hid everything inside it for as long as it was selected.
   */
  test('selecting a frame does not hide what is inside it', async ({ page }) => {
    await seed(page, (board) => {
      board.note('inside', AT)
    })

    // The frame is still PLACED: adopting what it lands on is how the note
    // gets inside it, and a seeded frame adopts nothing.
    await page.keyboard.press('f')
    await page.locator(CANVAS).click({ position: AT })
    await page.locator(EDITOR).fill('Findings')
    await page.locator(CANVAS).click({ position: CLEAR })
    await page.keyboard.press('v')

    // The frame adopted the note it landed on, rather than covering it.
    const note = viewOf(page, 'sticky').first()
    await expect(note).toBeVisible()

    // Selecting the frame by its edge, away from the note.
    await page.locator(CANVAS).click({ position: { x: AT.x - 150, y: AT.y } })
    await expect(page.getByTestId('selection-overlay')).toBeVisible()
    await expect(note).toBeVisible()
    // Still painted above its container, not behind it.
    const covered = await note.evaluate((el) => {
      const r = el.getBoundingClientRect()
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
      return top === null || !el.contains(top)
    })
    expect(covered).toBe(false)
  })
})
