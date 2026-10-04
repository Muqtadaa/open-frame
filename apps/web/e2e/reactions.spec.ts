import type { Page } from '@playwright/test'

import { boxOf, CANVAS, expect, overlaps, saved, seedBoard, test, undo } from './fixtures.js'
import { buildBoard } from './boards.js'

test.use({ board: 'fresh' })

/**
 * Reactions on a note: one person's 👍, ❤️ or ❓, left on it and taken back.
 *
 * Each reaction is an object of its own, so the note itself never changes —
 * which is what lets two people react at the same moment without one of them
 * losing theirs (the rooms suite covers that).
 */
const NOTE = { x: 400, y: 300 }

async function oneNote(page: Page): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Hide the price until checkout', NOTE)
    }),
  )
}

const chip = (page: Page, glyph: string) => page.getByTestId(`reaction-${glyph}`)

test('reacts from the bar beside a selected note, and takes it back', async ({ page }) => {
  await oneNote(page)
  await page.locator(CANVAS).click({ position: NOTE })

  const bar = page.getByTestId('reaction-bar')
  await bar.getByRole('button', { name: 'Agree' }).click()

  await expect(chip(page, 'plus-one')).toHaveText(/1/)
  await expect(chip(page, 'plus-one')).toHaveAttribute('aria-pressed', 'true')
  await expect(bar.getByRole('button', { name: 'Agree' })).toHaveAttribute('aria-pressed', 'true')

  // The chip itself is a toggle for your own reaction.
  await chip(page, 'plus-one').click()
  await expect(chip(page, 'plus-one')).toHaveCount(0)
})

test('reacts from the keyboard, through the context menu', async ({ page }) => {
  await oneNote(page)
  await page.locator(CANVAS).click({ position: NOTE })
  await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'React' }).press('ArrowRight')
  await page.getByRole('menuitem', { name: /Good idea/ }).press('Enter')

  await expect(chip(page, 'idea')).toHaveText(/1/)
})

test('is one undo step, and survives a reload', async ({ page }) => {
  await oneNote(page)
  await page.locator(CANVAS).click({ position: NOTE })
  await page.getByTestId('reaction-bar').getByRole('button', { name: 'Love it' }).click()
  await expect(chip(page, 'heart')).toHaveCount(1)

  await undo(page)
  await expect(chip(page, 'heart')).toHaveCount(0)

  await page.getByTestId('reaction-bar').getByRole('button', { name: 'Love it' }).click()
  await saved(page)
  await page.reload()
  await expect(chip(page, 'heart')).toHaveText(/1/)
})

/*
 * A reaction to nothing is not a reaction, so it goes with its note — and
 * comes back with it, because both happen in one command.
 */
test('goes with its note when the note is deleted, and comes back on undo', async ({ page }) => {
  await oneNote(page)
  await page.locator(CANVAS).click({ position: NOTE })
  await page.getByTestId('reaction-bar').getByRole('button', { name: 'Question' }).click()
  await expect(chip(page, 'question')).toHaveCount(1)

  await page.locator(CANVAS).click({ position: NOTE })
  await page.keyboard.press('Delete')
  await expect(page.locator('[data-object-type="sticky"]')).toHaveCount(0)

  await undo(page)
  await expect(chip(page, 'question')).toHaveText(/1/)
})

/*
 * A chip sits inside its note's bounds, so a double-click on it was read by the
 * board as a double-click on the note and opened it for typing.
 */
test('double-clicking a reaction does not open the note', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const note = board.note('Hide the price until checkout', NOTE)
      // Somebody else's, so the chip stays while ours comes and goes.
      board.react(note, 'plus-one', { key: 'g_0123456789abcdef', name: 'Heron', hue: 200 })
    }),
  )
  const before = await page.locator('[data-object-type="sticky"]').boundingBox()
  await chip(page, 'plus-one').dblclick()
  await expect(page.locator('[contenteditable="true"]')).toHaveCount(0)
  // Two presses: ours on, then off again.
  await expect(chip(page, 'plus-one')).toHaveText(/1/)
  expect(await page.locator('[data-object-type="sticky"]').boundingBox()).toEqual(before)
})

/*
 * The bar mounts empty while it learns who is reacting, and was placed at
 * that size — nothing — so it never moved off the record panel once its
 * buttons arrived.
 */
test('the bar never sits on the record panel', async ({ page }) => {
  await oneNote(page)
  await page.locator(CANVAS).click({ position: NOTE })
  const bar = page.getByTestId('reaction-bar')
  await expect(bar.getByRole('button', { name: 'Agree' })).toBeVisible()
  await expect(page.getByTestId('inspector')).toBeVisible()
  await expect
    .poll(async () => overlaps(await boxOf(bar), await boxOf(page.getByTestId('inspector'))))
    .toBe(false)
})

test.describe('the whole emoji library', () => {
  test('is a search away from the bar, and reacts with what is picked', async ({ page }) => {
    await oneNote(page)
    await page.locator(CANVAS).click({ position: NOTE })
    await page.getByTestId('react-more').click()

    const picker = page.getByRole('dialog', { name: 'Emoji' })
    await expect(picker.getByRole('searchbox', { name: 'Search emoji' })).toBeFocused()
    await page.keyboard.type('rocket')
    await picker.getByRole('button', { name: 'rocket', exact: true }).click()

    await expect(picker).toHaveCount(0)
    await expect(chip(page, 'u-1f680')).toHaveText(/🚀\s*1/)
    await expect(chip(page, 'u-1f680')).toHaveAttribute('aria-pressed', 'true')
  })

  test('is reached from the keyboard, through the context menu', async ({ page }) => {
    await oneNote(page)
    await page.locator(CANVAS).click({ position: NOTE })
    await page.keyboard.press('Shift+F10')
    await page.getByRole('menuitem', { name: 'React' }).press('ArrowRight')
    await page.getByRole('menuitem', { name: 'More…' }).press('Enter')

    await expect(page.getByRole('searchbox', { name: 'Search emoji' })).toBeFocused()
    await page.keyboard.type('thinking')
    // The library arrives on demand; the arrows walk what has been found.
    await expect(page.getByRole('button', { name: 'thinking face', exact: true })).toBeVisible()
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await expect(chip(page, 'u-1f914')).toHaveText(/1/)
  })

  test('counts an emoji that is on the bar as the bar’s', async ({ page }) => {
    await oneNote(page)
    await page.locator(CANVAS).click({ position: NOTE })
    await page.getByTestId('reaction-bar').getByRole('button', { name: 'Agree' }).click()
    await page.getByTestId('react-more').click()
    await page.keyboard.type('thumbs up')
    await page
      .getByRole('dialog', { name: 'Emoji' })
      .getByRole('button', { name: 'thumbs up', exact: true })
      .click()
    // The same reaction, so picking it again took it back rather than adding one.
    await expect(page.getByTestId('reactions')).toHaveCount(0)
  })

  test('goes on Escape, and gives focus back', async ({ page }) => {
    await oneNote(page)
    await page.locator(CANVAS).click({ position: NOTE })
    await page.getByTestId('react-more').click()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Emoji' })).toHaveCount(0)
    await expect(page.getByTestId('react-more')).toBeFocused()
  })
})

/*
 * The tip names who reacted, and nothing else: the chip is plainly a button,
 * and telling people to press it is noise.
 */
test('a chip’s tip says who reacted, and nothing more', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const note = board.note('Hide the price until checkout', NOTE)
      board.react(note, 'plus-one', { key: 'g_0123456789abcdef', name: 'Heron', hue: 200 })
    }),
  )
  await expect(chip(page, 'plus-one')).toHaveAttribute('data-tip', 'Heron')
  await chip(page, 'plus-one').click()
  await expect(chip(page, 'plus-one')).toHaveAttribute('data-tip', 'Heron and you')
  // A screen reader also hears which reaction it is.
  await expect(chip(page, 'plus-one')).toHaveAttribute('aria-label', 'Agree')
  await expect(chip(page, 'plus-one')).toHaveAttribute('aria-description', 'Heron and you')
})

test.describe('the library’s grid', () => {
  test('scrolls under the wheel instead of zooming the board', async ({ page }) => {
    await oneNote(page)
    await page.locator(CANVAS).click({ position: NOTE })
    await page.getByTestId('react-more').click()
    const first = page.getByRole('button', { name: 'grinning face', exact: true })
    await expect(first).toBeVisible()
    const zoom = await page.getByTestId('zoom-control').textContent()

    await first.hover()
    await page.mouse.wheel(0, 400)
    await expect
      .poll(() =>
        page.evaluate(
          () =>
            document.querySelector('[role="dialog"][aria-label="Emoji"] [data-scroll]')
              ?.scrollTop ?? 0,
        ),
      )
      .toBeGreaterThan(0)
    expect(await page.getByTestId('zoom-control').textContent()).toBe(zoom)
  })

  test('shows every column whole beside its scrollbar', async ({ page }) => {
    await oneNote(page)
    await page.locator(CANVAS).click({ position: NOTE })
    await page.getByTestId('react-more').click()
    await expect(page.getByRole('button', { name: 'grinning face', exact: true })).toBeVisible()
    const fits = await page.evaluate(() => {
      const list = document.querySelector<HTMLElement>(
        '[role="dialog"][aria-label="Emoji"] [data-scroll]',
      )
      const grid = list?.querySelector<HTMLElement>('[role="group"]')
      if (!list || !grid) return { list: false, inside: false, sideways: true }
      const box = list.getBoundingClientRect()
      const last = grid.children[7]?.getBoundingClientRect()
      return {
        list: true,
        // Everything left of the scrollbar, which clientWidth excludes.
        inside: last !== undefined && last.right <= box.left + list.clientWidth + 0.5,
        // A sideways scrollbar takes height off the box's inside.
        sideways: list.offsetHeight - list.clientHeight > 0,
      }
    })
    expect(fits).toEqual({ list: true, inside: true, sideways: false })
  })
})
