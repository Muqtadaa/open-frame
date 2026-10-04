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
  await expect(option(page, 'o1')).toHaveAccessibleName('Option 1, 1 answer')
  await expect(page.getByTestId('poll-state')).toHaveText('1 person')

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

test('edits the options in the record panel, keeping the answers on them', async ({ page }) => {
  await seeded(page, {}, true)
  await page.locator(CANVAS).click({ position: { x: AT.x, y: AT.y - 90 } })
  const second = page.getByRole('textbox', { name: 'Options 2' })
  await second.fill('Dogs, clearly')
  await second.press('Enter')
  await expect(option(page, 'o2')).toHaveAccessibleName('Dogs, clearly, 1 answer')

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
  await expect(page.getByTestId('poll-state')).toHaveText('')

  await page.locator(CANVAS).click({ position: { x: AT.x, y: AT.y - 90 } })
  await page.getByTestId('field-closed').check()
  await expect(page.getByTestId('poll-state')).toHaveText('Closed · 2 people')
  await expect(option(page, 'o2')).toHaveAccessibleName('Option 2, 1 answer')
})

test('takes no answers once closed', async ({ page }) => {
  await seeded(page, { closed: true })
  await expect(option(page, 'o1')).toBeDisabled()
  await expect(page.getByTestId('poll-state')).toHaveText('Closed · 0 people')
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
  await expect(option(page, 'o2')).toHaveAccessibleName('Option 2, 1 answer')
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
  await expect(option(page, 'o1')).toHaveAccessibleName('Option 1, 1 answer')
  await expect(option(page, 'o2')).toHaveAccessibleName('Option 2, 0 answers')
})
