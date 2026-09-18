import { expect, test, type Page } from '@playwright/test'

/**
 * Phase 3's claim, walked end to end by a user.
 *
 * A note is dropped without being classified, promoted once its meaning is
 * clear, and the record it becomes is editable — with the object keeping its
 * place on the board throughout. Unit tests prove each piece; only this proves
 * a person can reach any of it.
 */

const CANVAS = '[data-testid="canvas"]'
const EMPTY = { x: 1120, y: 150 }
const NOTE = { x: 340, y: 260 }

async function freshBoard(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        const r = indexedDB.deleteDatabase('openframe')
        r.onsuccess = () => resolve()
        r.onerror = () => resolve()
        r.onblocked = () => resolve()
      }),
  )
  await page.reload()
  await expect(page.locator(CANVAS)).toBeVisible()
  // The keyboard effect attaches after paint; without this the first keypress
  // of a spec is dropped and the failure looks like a broken shortcut.
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

async function placeNote(page: Page, text: string): Promise<void> {
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: NOTE })
  await expect(page.locator('textarea')).toBeFocused()
  await page.locator('textarea').fill(text)
  await page.locator(CANVAS).click({ position: EMPTY })
  await expect(page.locator('textarea')).toHaveCount(0)
  await page.keyboard.press('v')
}

async function promote(page: Page, at: { x: number; y: number }): Promise<void> {
  await page.locator(CANVAS).click({ position: at })
  await page.locator(CANVAS).click({ position: at, button: 'right' })
  await expect(page.getByTestId('context-menu')).toBeVisible()
  await page.getByTestId('menu-promote-to-evidence').click()
  await expect(page.getByTestId('context-menu')).toHaveCount(0)
}

test.describe('structured objects', () => {
  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
  })

  test('a note is promoted to evidence and keeps its text and place', async ({ page }) => {
    await placeNote(page, 'Participants skipped the pricing page')

    const before = await page.locator('[data-object-id]').first().boundingBox()
    await promote(page, NOTE)

    // The quote survived, and so did where it sits.
    await expect(page.locator(CANVAS)).toContainText('Participants skipped the pricing page')
    const after = await page.locator('[data-object-id]').first().boundingBox()
    expect(after?.x).toBeCloseTo(before?.x ?? -1, 0)
    expect(after?.y).toBeCloseTo(before?.y ?? -1, 0)
  })

  /**
   * The point of the type. A sticky's panel has colour and face; an evidence
   * card's also has the fields that make it a record — and they come from the
   * registry, so this fails if the declaration stops reaching the interface.
   */
  test('the record panel gains the fields the type declares', async ({ page }) => {
    await placeNote(page, 'Could not find the price')

    await page.locator(CANVAS).click({ position: NOTE })
    await expect(page.getByTestId('inspector')).toBeVisible()
    await expect(page.getByTestId('field-source')).toHaveCount(0)

    await promote(page, NOTE)
    await page.locator(CANVAS).click({ position: NOTE })
    await expect(page.getByTestId('field-source')).toBeVisible()
    await expect(page.getByTestId('field-participant')).toBeVisible()
    await expect(page.getByTestId('field-tags')).toBeVisible()
  })

  test('a field is written once, on blur, and shows on the card', async ({ page }) => {
    await placeNote(page, 'Could not find the price')
    await promote(page, NOTE)
    await page.locator(CANVAS).click({ position: NOTE })

    await page.getByTestId('field-source').fill('September usability study')
    await page.getByTestId('field-participant').fill('P07')
    await page.getByTestId('field-tags').fill('pricing, comprehension')
    // Commit the last field by leaving it.
    await page.getByTestId('field-source').click()

    await expect(page.locator(CANVAS)).toContainText('September usability study · P07')
    await expect(page.locator(CANVAS)).toContainText('#pricing #comprehension')
  })

  /**
   * One promotion is one undo entry. If the conversion were a delete and a
   * create, or three separate writes, this would take several presses and the
   * object would come back with a different identity.
   */
  test('a promotion is undone in one press', async ({ page }) => {
    await placeNote(page, 'A plain note')
    await promote(page, NOTE)
    await page.locator(CANVAS).click({ position: NOTE })
    await expect(page.getByTestId('field-source')).toBeVisible()

    await page.locator(CANVAS).click({ position: EMPTY })
    await page.keyboard.press('Control+z')

    await page.locator(CANVAS).click({ position: NOTE })
    await expect(page.getByTestId('inspector')).toBeVisible()
    await expect(page.getByTestId('field-source')).toHaveCount(0)
    await expect(page.locator(CANVAS)).toContainText('A plain note')
  })

  /**
   * Typing into a field must not reach the canvas keymap. Without the guard,
   * the 'v' in "conversion" switches to the select tool and a Delete keypress
   * destroys the object being described.
   */
  test('typing in a field does not drive the canvas', async ({ page }) => {
    await placeNote(page, 'A note')
    await promote(page, NOTE)
    await page.locator(CANVAS).click({ position: NOTE })

    await page.getByTestId('field-source').fill('conversion review')
    await page.getByTestId('field-source').press('Delete')
    await page.getByTestId('field-participant').click()

    // Still there, and still says what it said.
    await expect(page.locator(CANVAS)).toContainText('A note')
    await expect(page.locator(CANVAS)).toContainText('conversion review')
  })

  test('an empty evidence card shows no record line at all', async ({ page }) => {
    await placeNote(page, 'Nothing filled in')
    await promote(page, NOTE)
    // Structure is earned: a card carrying only a quote looks like a plain slip.
    await expect(page.locator('.of-slip__record')).toHaveCount(0)
  })
})
