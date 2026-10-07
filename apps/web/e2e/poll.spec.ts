import type { Page } from '@playwright/test'

import { CANVAS, expect, saved, seedBoard, test, undo } from './fixtures.js'
import { buildBoard } from './boards.js'

test.use({ board: 'fresh' })

/**
 * A poll card: placed from the rail, its question written in place, its
 * options edited in the record panel, and answered on the card itself.
 */
const AT = { x: 500, y: 320 }
const heron = { key: 'g_heron', name: 'Heron', hue: 200 }

const card = (page: Page) => page.locator('[data-object-type="poll"]')
const option = (page: Page, id: string) => page.getByTestId(`poll-option-${id}`)

async function seeded(page: Page, data: Record<string, unknown> = {}, answers = false) {
  await seedBoard(
    page,
    buildBoard((board) => {
      const poll = board.add('poll', AT, { text: [{ text: 'Cats or dogs?' }], ...data })
      if (answers) {
        board.answer(poll, 'o2', heron)
      }
    }),
  )
}

test('places a poll, asks the question, and answers it', { tag: '@smoke' }, async ({ page }) => {
  await page.keyboard.press('p')
  await page.locator(CANVAS).click({ position: AT })
  await expect(card(page)).toHaveCount(1)
  await page.keyboard.type('Cats or dogs?')
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('poll-question')).toHaveText('Cats or dogs?')

  await option(page, 'o1').click()
  await expect(option(page, 'o1')).toHaveAttribute('aria-pressed', 'true')
  await expect(option(page, 'o1')).toHaveAccessibleName('Option 1, 1 answer, 100%')
  await expect(page.getByTestId('poll-state')).toHaveText('1 answer')

  // One answer each: picking the other moves it.
  await option(page, 'o2').click()
  await expect(option(page, 'o1')).toHaveAttribute('aria-pressed', 'false')
  await expect(option(page, 'o2')).toHaveAttribute('aria-pressed', 'true')

  // Moving it was one step.
  await undo(page)
  await expect(option(page, 'o1')).toHaveAttribute('aria-pressed', 'true')
  await saved(page)
})

test('answers from the keyboard', async ({ page }) => {
  await seeded(page)
  await option(page, 'o2').focus()
  await page.keyboard.press('Enter')
  await expect(option(page, 'o2')).toHaveAttribute('aria-pressed', 'true')
})

test('edits the options in the record panel, keeping the answers where they are', async ({
  page,
}) => {
  await seeded(page, {}, true)
  await page.locator(CANVAS).click({ position: { x: AT.x, y: AT.y - 90 } })
  const first = page.getByRole('textbox', { name: 'Options 1' })
  await first.fill('Cats, clearly')
  await first.press('Enter')
  await expect(option(page, 'o1')).toHaveAccessibleName('Cats, clearly, 0 answers, 0%')
  await expect(option(page, 'o2')).toHaveAccessibleName('Option 2, 1 answer, 100%')

  await page.getByTestId('field-options-add').click()
  const options = page.getByTestId('poll-options').getByRole('button')
  await expect(options).toHaveCount(3)
  await expect(options.last()).toHaveText(/Option 3/)
})

test('takes several answers each when it allows them', async ({ page }) => {
  await seeded(page, { multi: true })
  await option(page, 'o1').click()
  await option(page, 'o2').click()
  await expect(option(page, 'o1')).toHaveAttribute('aria-pressed', 'true')
  await expect(option(page, 'o2')).toHaveAttribute('aria-pressed', 'true')
})

test('keeps the counts back until it closes, then shows them', async ({ page }) => {
  await seeded(page, { hideResults: true }, true)
  await option(page, 'o1').click()
  await expect(option(page, 'o1')).toHaveAccessibleName('Option 1')
  // How many have answered is said; what they answered is not.
  await expect(page.getByTestId('poll-state')).toHaveText('2 answers · results when closed')

  await page.getByTestId('poll-close').click()
  await expect(page.getByTestId('poll-state')).toHaveText('Closed · 2 answers')
  await expect(option(page, 'o2')).toHaveAccessibleName('Option 2, 1 answer, 50%')
})

test('takes no answers once closed', async ({ page }) => {
  await seeded(page, { closed: true })
  await expect(option(page, 'o1')).toBeDisabled()
  await expect(page.getByTestId('poll-state')).toHaveText('Closed · 0 answers')
})

test('keeps all ten options in reach on a card of the default size', async ({ page }) => {
  const ten = Array.from({ length: 10 }, (_, index) => ({
    id: `o${String(index + 1)}`,
    label: `Choice ${String(index + 1)}`,
  }))
  await seeded(page, { options: ten })
  const list = page.getByTestId('poll-options')
  await list.hover()
  await page.mouse.wheel(0, 400)
  await expect.poll(() => list.evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  await option(page, 'o10').click()
  await expect(option(page, 'o10')).toHaveAttribute('aria-pressed', 'true')
})

test('follows an answer that changes in place', async ({ page }) => {
  await seeded(page, { multi: true }, true)
  await expect(option(page, 'o2')).toHaveAccessibleName('Option 2, 1 answer, 100%')
  // An agent, or a peer's edit, rewriting an answer it already holds.
  await page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __openframe: {
          runtime: {
            store: { getDocument: () => { objects: Map<string, { type: string; data: object }> } }
            dispatcher: { dispatch: (command: unknown) => { ok: boolean } }
          }
        }
      }
    ).__openframe.runtime
    const [id, answer] = [...runtime.store.getDocument().objects.entries()].find(
      ([, object]) => object.type === 'poll-answer',
    ) ?? ['', { data: {} }]
    runtime.dispatcher.dispatch({
      kind: 'UpdateObjectData',
      id,
      patch: { ...answer.data, option: 'o1' },
    })
  })
  await expect(option(page, 'o1')).toHaveAccessibleName('Option 1, 1 answer, 100%')
  await expect(option(page, 'o2')).toHaveAccessibleName('Option 2, 0 answers, 0%')
})

test('closes and reopens from the card, as one undo step each', async ({ page }) => {
  await seeded(page, {}, true)
  await page.getByTestId('poll-close').click()
  await expect(page.getByTestId('poll-state')).toHaveText('Closed · 1 answer')
  await expect(option(page, 'o1')).toBeDisabled()
  await expect(page.getByTestId('poll-close')).toHaveText('Reopen')
  await undo(page)
  await expect(page.getByTestId('poll-state')).toHaveText('1 answer')
  await expect(option(page, 'o1')).toBeEnabled()
})

test('a press between the options takes hold of the card', async ({ page }) => {
  await seeded(page)
  const first = await option(page, 'o1').boundingBox()
  const second = await option(page, 'o2').boundingBox()
  expect(first).not.toBeNull()
  expect(second).not.toBeNull()
  // Halfway down the gap between the two option buttons.
  const x = (first?.x ?? 0) + (first?.width ?? 0) / 2
  const y = ((first?.y ?? 0) + (first?.height ?? 0) + (second?.y ?? 0)) / 2
  await page.mouse.click(x, y)
  await expect(card(page)).toHaveAttribute('data-selected', 'true')
  await expect(option(page, 'o1')).toHaveAttribute('aria-pressed', 'false')
})

test('a locked poll offers no Close, which could only be refused', async ({ page }) => {
  await seeded(page)
  await page.getByTestId('poll-question').click()
  await page.keyboard.press('ControlOrMeta+Shift+L')
  await expect(page.getByRole('button', { name: 'Unlock' }).first()).toBeVisible()
  await expect(page.getByTestId('poll-close')).toHaveCount(0)
})

/*
 * The asker closes it (PR 3 critique, 2026-10-07). Anybody with an edit link
 * could close a poll, from the card or a checkbox in the record panel, so the
 * person running the session had it closed under them by whoever reached it
 * first.
 */
test('only the person who asked closes the poll', async ({ page }) => {
  await seeded(page, { by: heron }, true)
  await expect(page.getByTestId('poll-close')).toHaveCount(0)
  await page.getByTestId('poll-question').click()
  await expect(page.getByTestId('inspector')).toBeVisible()
  await expect(page.getByTestId('field-closed')).toHaveCount(0)
})

test('a poll you put on the board is yours to close', async ({ page }) => {
  await page.keyboard.press('p')
  await page.locator(CANVAS).click({ position: AT })
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('poll-close')).toHaveText('Close poll')
})

test('a closed poll looks closed, and your answer is marked as yours', async ({ page }) => {
  await seeded(page)
  await option(page, 'o2').click()
  await expect(option(page, 'o2').getByTestId('poll-mine')).toBeVisible()
  await expect(option(page, 'o1').getByTestId('poll-mine')).toHaveCount(0)
  await page.getByTestId('poll-close').click()
  await expect(card(page).locator('[data-closed="true"]')).toHaveCount(1)
  // Still marked once it closes: closing is when people look for it.
  await expect(option(page, 'o2').getByTestId('poll-mine')).toBeVisible()
})

/*
 * An option somebody has answered is fixed (PR 3 critique, 2026-10-07).
 * Rewording it kept their answer on it while changing what they had said yes
 * to; removing it left the answer on the board, counted by nothing. The
 * options nobody has picked can still be reworded and removed.
 */
test('an answered option can be neither reworded nor removed', async ({ page }) => {
  // Three, so the one nobody picked is above the two a poll must keep.
  const options = [
    { id: 'o1', label: 'Option 1' },
    { id: 'o2', label: 'Option 2' },
    { id: 'o3', label: 'Option 3' },
  ]
  await seeded(page, { options }, true)
  await page.getByTestId('poll-question').click()
  const field = page.getByTestId('field-options')
  await expect(field.getByRole('textbox', { name: 'Options 2' })).toHaveAttribute('readonly', '')
  await expect(field.getByRole('button', { name: 'Remove Option 2' })).toBeDisabled()
  await expect(field.getByRole('textbox', { name: 'Options 1' })).not.toHaveAttribute('readonly')
  await expect(field.getByRole('button', { name: 'Remove Option 1' })).toBeEnabled()
})
