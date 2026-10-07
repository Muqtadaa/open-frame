import type { Page } from '@playwright/test'

import { richFromPlain } from '@openframe/core'

import { CANVAS, EDITOR, expect, saved, seedBoard, test, undo } from './fixtures.js'
import { buildBoard } from './boards.js'

test.use({ board: 'fresh' })

/**
 * Dot voting: a round set up from the context menu, dots placed with the
 * vote tool or from the keyboard, then revealed, ranked and carried forward.
 */
const FIRST = { x: 300, y: 300 }
const SECOND = { x: 560, y: 300 }
const heron = { key: 'g_heron', name: 'Heron', hue: 200 }

async function twoNotes(page: Page): Promise<void> {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Show the price early', FIRST)
      board.note('Free returns', SECOND)
    }),
  )
}

const dots = (page: Page, nth: number) =>
  page.locator('[data-object-type="sticky"]').nth(nth).getByTestId('votes')

test(
  'starts a round on the whole board, and votes with the tool',
  { tag: '@smoke' },
  async ({ page }) => {
    await twoNotes(page)
    await page.locator(CANVAS).click({ button: 'right', position: { x: 800, y: 600 } })
    await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()

    const setup = page.getByTestId('voting-setup')
    await expect(setup.getByRole('heading')).toHaveText('Dot voting · whole board')
    await expect(page.getByTestId('voting-title')).toBeFocused()
    await page.getByTestId('voting-title').fill('What first?')
    await page.getByTestId('voting-per-person').fill('2')
    await page.getByTestId('voting-start').click()

    const status = page.getByTestId('voting-status')
    await expect(status).toHaveText('2 of 2 votes left')
    // Starting a round arms the tool.
    await expect(page.getByTestId('voting-vote')).toHaveAttribute('aria-pressed', 'true')

    await page.locator(CANVAS).click({ position: FIRST })
    await page.locator(CANVAS).click({ position: FIRST })
    await expect(dots(page, 0)).toHaveText('2')
    await expect(status).toHaveText('0 of 2 votes left · 1 person voted')

    // A third is refused, and says why.
    await page.locator(CANVAS).click({ position: SECOND })
    await expect(page.getByTestId('toast-body')).toHaveText('No votes left')
    await expect(dots(page, 1)).toHaveCount(0)

    // Alt takes one back.
    await page.locator(CANVAS).click({ position: FIRST, modifiers: ['Alt'] })
    await expect(dots(page, 0)).toHaveText('1')
    await saved(page)
  },
)

test('votes from the keyboard through the context menu, on the notes the round covers', async ({
  page,
}) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Show the price early', FIRST)
      const second = board.note('Free returns', SECOND)
      board.voting({ ids: [second] })
    }),
  )
  await page.locator(CANVAS).click({ position: SECOND })
  await page.keyboard.press('Shift+F10')
  await page.getByRole('menuitem', { name: 'Dot voting' }).press('ArrowRight')
  await page.getByRole('menuitem', { name: 'Add vote' }).press('Enter')
  await expect(dots(page, 1)).toHaveText('1')

  // The round holds the note it was started on, and nothing else.
  await page.keyboard.press('Escape')
  await page.locator(CANVAS).click({ position: FIRST })
  await page.keyboard.press('Shift+F10')
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(page.getByRole('menuitem', { name: 'Dot voting' })).toHaveCount(0)
})

test('hides other people’s dots until revealed, then ranks the notes', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const first = board.note('Show the price early', FIRST)
      const second = board.note('Free returns', SECOND)
      const round = board.voting({ hidden: true })
      board.vote(round, second, heron)
      board.vote(round, second, heron)
      board.vote(round, first, heron)
    }),
  )
  await expect(page.getByTestId('voting')).toBeVisible()
  await expect(dots(page, 0)).toHaveCount(0)
  await expect(dots(page, 1)).toHaveCount(0)
  await expect(page.getByTestId('voting-results')).toHaveCount(0)

  await page.getByTestId('voting-reveal').click()
  await expect(dots(page, 1)).toHaveText('2')
  await expect(dots(page, 0)).toHaveText('1')

  await page.getByTestId('voting-results').click()
  const list = page.getByTestId('voting-list').getByRole('listitem')
  await expect(list).toHaveCount(2)
  await expect(list.first()).toContainText('Free returns')

  await page.getByTestId('voting-select-top').click()
  await expect(page.locator('[data-object-type="sticky"][data-selected="true"]')).toHaveCount(2)
})

test('ranks tied notes in the order they sit on the board', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const first = board.note('Show the price early', FIRST)
      const second = board.note('Free returns', SECOND)
      const round = board.voting({})
      board.vote(round, first, heron)
      board.vote(round, second, heron)
    }),
  )
  // Send the later note to the back: it is now first in board order, and
  // still last by id.
  await page.locator(CANVAS).click({ position: SECOND })
  await page.keyboard.press('Shift+[')
  await page.getByTestId('voting-results').click()
  const list = page.getByTestId('voting-list').getByRole('listitem')
  await expect(list.first()).toContainText('Free returns')
  await expect(list.last()).toContainText('Show the price early')
})

test('ends a round, keeps the counts, and clears it with one undo to bring it back', async ({
  page,
}) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const first = board.note('Show the price early', FIRST)
      board.note('Free returns', SECOND)
      const round = board.voting({})
      board.vote(round, first, heron)
    }),
  )
  await page.getByTestId('voting-end').click()
  await expect(page.getByTestId('voting-status')).toHaveText('Voting ended')
  await expect(dots(page, 0)).toHaveText('1')
  await expect(page.getByTestId('voting-vote')).toHaveCount(0)

  await page.getByTestId('voting-clear').click()
  await expect(page.getByTestId('voting')).toHaveCount(0)
  await expect(dots(page, 0)).toHaveCount(0)

  await undo(page)
  await expect(page.getByTestId('voting')).toBeVisible()
  await expect(dots(page, 0)).toHaveText('1')
})

test('starts a round on what one frame holds, and only that', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Outside', { x: 900, y: 500 })
      board.add('frame', { x: 400, y: 320 }, { title: [{ text: 'Ideas' }] })
    }),
  )
  // By its title: a frame's body is hollow, so a press there reaches the board.
  await page.getByTestId('frame-title').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await expect(page.getByTestId('voting-setup').getByRole('heading')).toHaveText(
    'Dot voting · this frame',
  )
  await page.getByTestId('voting-start').click()

  // The note outside the frame is not part of it.
  await page.locator(CANVAS).click({ position: { x: 900, y: 500 } })
  await expect(page.getByTestId('toast-body')).toHaveText('That note is not part of this vote')
})

test('cancels a round that was never started, leaving nothing on the board', async ({ page }) => {
  await twoNotes(page)
  await page.locator(CANVAS).click({ button: 'right', position: { x: 800, y: 600 } })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('voting-setup')).toHaveCount(0)
  await expect(page.getByTestId('voting')).toHaveCount(0)
})

test('keeps the keyboard through setup, start, end, reopen and clear', async ({ page }) => {
  await twoNotes(page)
  await page.locator(CANVAS).click({ button: 'right', position: { x: 800, y: 600 } })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await expect(page.getByTestId('voting-title')).toBeFocused()
  // Escape from the board still closes the setup, and the keyboard goes back to the board.
  await page.locator(CANVAS).focus()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('voting-setup')).toHaveCount(0)
  await expect(page.locator(CANVAS)).toBeFocused()

  await page.locator(CANVAS).click({ button: 'right', position: { x: 800, y: 600 } })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await page.getByTestId('voting-start').press('Enter')
  await expect(page.getByTestId('voting-vote')).toBeFocused()

  await page.getByTestId('voting-end').press('Enter')
  await expect(page.getByTestId('voting-reopen')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('voting-end')).toBeFocused()
  await page.keyboard.press('Enter')
  await page.getByTestId('voting-clear').press('Enter')
  await expect(page.getByTestId('voting')).toHaveCount(0)
  await expect(page.locator(CANVAS)).toBeFocused()
})

/*
 * What a room full of people actually does with the vote tool, none of which
 * the tests above did: double-click, right-click, vote on notes that sit in a
 * group or were made inside a frame, and undo the start.
 */
async function armed(page: Page): Promise<void> {
  await page.getByTestId('voting-vote').click()
  await expect(page.getByTestId('voting-vote')).toHaveAttribute('aria-pressed', 'true')
}

test('a double-click while voting casts two dots and opens nothing', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Show the price early', FIRST)
      board.voting({})
    }),
  )
  await armed(page)
  await page.locator(CANVAS).dblclick({ position: FIRST })
  await expect(dots(page, 0)).toHaveText('2')
  await expect(page.locator(EDITOR)).toHaveCount(0)
  // And the tool is still voting.
  await page.locator(CANVAS).click({ position: FIRST })
  await expect(dots(page, 0)).toHaveText('3')
})

test('a right-click while voting opens the menu and casts nothing', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Show the price early', FIRST)
      board.voting({})
    }),
  )
  await armed(page)
  await page.locator(CANVAS).click({ position: FIRST, button: 'right' })
  await expect(page.getByRole('menu')).toBeVisible()
  await expect(dots(page, 0)).toHaveCount(0)
})

test('votes on a note inside a group, not on the group', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const group = board.add('group', { x: 0, y: 0 })
      board.add('sticky', FIRST, { text: richFromPlain('Grouped') }, undefined, group)
      board.add('sticky', SECOND, { text: richFromPlain('Also grouped') }, undefined, group)
      board.voting({})
    }),
  )
  await armed(page)
  await page.locator(CANVAS).click({ position: SECOND })
  await expect(dots(page, 1)).toHaveText('1')
  await expect(page.getByTestId('toast-body')).toHaveCount(0)
})

test('a note made inside a frame counts in that frame’s round', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.add('frame', { x: 420, y: 340 })
    }),
  )
  // Made inside the frame's body with the sticky tool, as people do.
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: { x: 420, y: 360 } })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await page.getByTestId('frame-title').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await expect(page.getByTestId('voting-setup').getByRole('heading')).toHaveText(
    'Dot voting · this frame',
  )
  await page.getByTestId('voting-start').click()
  await page.locator(CANVAS).click({ position: { x: 420, y: 360 } })
  await expect(dots(page, 0)).toHaveText('1')
  await expect(page.getByTestId('toast-body')).toHaveCount(0)
})

test('undoing the start of a round puts the vote tool down', async ({ page }) => {
  await twoNotes(page)
  await page.locator(CANVAS).click({ button: 'right', position: { x: 800, y: 600 } })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await page.getByTestId('voting-start').click()
  await expect(page.getByTestId('voting-vote')).toHaveAttribute('aria-pressed', 'true')

  await undo(page)
  await expect(page.getByTestId('voting-status')).toHaveCount(0)
  await expect(page.getByTestId('tool-select')).toHaveAttribute('aria-pressed', 'true')
})

test('Escape puts the vote tool down', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      board.note('Show the price early', FIRST)
      board.voting({})
    }),
  )
  await armed(page)
  await page.locator(CANVAS).click({ position: { x: 800, y: 600 } })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('voting-vote')).toHaveAttribute('aria-pressed', 'false')
  await page.locator(CANVAS).click({ position: FIRST })
  await expect(dots(page, 0)).toHaveCount(0)
})

test('starts a round on the selected notes, and votes on them all as one step', async ({
  page,
}) => {
  await twoNotes(page)
  await page.locator(CANVAS).click({ position: FIRST })
  await page.locator(CANVAS).click({ position: SECOND, modifiers: ['Shift'] })
  await page.locator(CANVAS).click({ position: SECOND, button: 'right' })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await expect(page.getByTestId('voting-setup').getByRole('heading')).toHaveText(
    'Dot voting · 2 notes',
  )
  await page.getByTestId('voting-start').click()
  await page.keyboard.press('Escape')

  // Both still selected: one Add vote is a dot on each, and one undo takes both.
  await page.locator(CANVAS).click({ position: SECOND, button: 'right' })
  await page.getByRole('menuitem', { name: 'Dot voting' }).click()
  await page.getByRole('menuitem', { name: 'Add vote' }).click()
  await expect(dots(page, 0)).toHaveText('1')
  await expect(dots(page, 1)).toHaveText('1')
  await undo(page)
  await expect(dots(page, 0)).toHaveCount(0)
  await expect(dots(page, 1)).toHaveCount(0)
})

test('says how many people have voted, says how to take a dot back, and reopens', async ({
  page,
}) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const note = board.note('Show the price early', FIRST)
      const round = board.voting({ hidden: true })
      board.vote(round, note, heron)
    }),
  )
  await expect(page.getByTestId('voting-status')).toHaveText('3 of 3 votes left · 1 person voted')
  await armed(page)
  await expect(page.getByTestId('voting-vote')).toHaveText('Voting')
  await expect(page.getByTestId('voting-hint')).toHaveText('Alt-click a dot to take it back')

  await page.getByTestId('voting-end').click()
  await expect(page.getByTestId('voting-status')).toHaveText('Voting ended')
  await page.getByTestId('voting-reopen').click()
  await expect(page.getByTestId('voting-status')).toHaveText('3 of 3 votes left · 1 person voted')
})

test('a note made over a group inside a frame still joins the frame', async ({ page }) => {
  await seedBoard(
    page,
    buildBoard((board) => {
      const frame = board.add('frame', { x: 420, y: 340 })
      const group = board.add('group', { x: 0, y: 0 }, undefined, undefined, frame)
      board.add('sticky', { x: 260, y: 300 }, { text: richFromPlain('Left') }, undefined, group)
      board.add('sticky', { x: 580, y: 300 }, { text: richFromPlain('Right') }, undefined, group)
    }),
  )
  // Between the group's two notes: inside the group's extent, on no note.
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: { x: 420, y: 300 } })
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await page.getByTestId('frame-title').click({ button: 'right' })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await page.getByTestId('voting-start').click()
  await page.locator(CANVAS).click({ position: { x: 420, y: 300 } })
  await expect(page.getByTestId('toast-body')).toHaveCount(0)
  await expect(page.getByTestId('votes')).toHaveText('1')
})
