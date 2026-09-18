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
/*
 * Whatever is currently editable in place.
 *
 * Body text is a `contenteditable` since rich text (ADR 0012); a frame's title
 * and an image's alt text are labels and stay plain textareas. A spec should
 * not have to know which it is about to type into.
 */
const EDITOR = 'textarea, [contenteditable="true"]'
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
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.locator(EDITOR).fill(text)
  await page.locator(CANVAS).click({ position: EMPTY })
  await expect(page.locator(EDITOR)).toHaveCount(0)
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

/**
 * Phase 3's "done when", walked in a browser: capture evidence, cluster it,
 * promote the cluster to an insight, and be able to ask what that insight
 * stands on.
 *
 * This is the test ADR 0011 asks for. Relations are objects with no appearance,
 * which is what buys clean merges — and it means nothing on the BOARD shows a
 * citation exists. If the provenance panel is wrong or absent, the whole
 * relation model is unfalsifiable by use, and these assertions are the only
 * thing standing between "it works" and "nobody has looked".
 */
test.describe('synthesis', () => {
  /*
   * Stacked vertically, not side by side. The record panel floats to the right
   * of the selection, so a neighbour placed there is genuinely underneath it —
   * an accepted cost of floating rather than a bug, but it makes a
   * shift-click on that neighbour a click on the panel.
   */
  const FIRST = { x: 300, y: 300 }
  const SECOND = { x: 300, y: 520 }

  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
  })

  /*
   * Synthesis now lands in the editor, so every assertion about the record
   * panel has to leave it first — the panel is deliberately hidden while an
   * object is being edited, since a panel that jumps around under the pointer
   * is worse than no panel. Escape exits the editor and keeps the selection.
   */
  async function synthesiseFrom(page: Page, at: { x: number; y: number }): Promise<void> {
    await page.locator(CANVAS).click({ position: at, button: 'right' })
    await page.getByTestId('menu-synthesise-into-insight').click()
    await expect(page.locator(EDITOR)).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.locator(EDITOR)).toHaveCount(0)
  }

  async function placeAt(page: Page, at: { x: number; y: number }, text: string): Promise<void> {
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: at })
    await expect(page.locator(EDITOR)).toBeFocused()
    await page.locator(EDITOR).fill(text)
    await page.locator(CANVAS).click({ position: EMPTY })
    await expect(page.locator(EDITOR)).toHaveCount(0)
    await page.keyboard.press('v')
  }

  /**
   * A synthesised insight is an empty card whose only purpose is to hold a
   * claim. Landing in the editor is the difference between "here is a box, go
   * find it" and finishing the thought — and an unwritten claim citing real
   * evidence is the worst thing this board can contain.
   */
  test('lands in the editor so the claim can be written', async ({ page }) => {
    await placeAt(page, FIRST, 'Could not find the price')
    await page.locator(CANVAS).click({ position: FIRST })
    // Not `synthesiseFrom`, which leaves the editor — this test is about
    // arriving in it.
    await page.locator(CANVAS).click({ position: FIRST, button: 'right' })
    await page.getByTestId('menu-synthesise-into-insight').click()

    await expect(page.locator(EDITOR)).toBeFocused()
    await page.locator(EDITOR).fill('Pricing is not discoverable before checkout')
    await page.locator(CANVAS).click({ position: EMPTY })
    await expect(page.locator(CANVAS)).toContainText('Pricing is not discoverable before checkout')
  })

  /**
   * An insight is placed ABOVE the cluster it was drawn from, which for a
   * cluster near the top of the window is off screen. Without a reveal, the
   * record panel would describe a card the user cannot find — which reads as
   * the panel being wrong rather than the view being elsewhere.
   */
  test('brings a newly placed insight into view', async ({ page }) => {
    await placeAt(page, { x: 300, y: 150 }, 'Near the top of the window')
    await page.locator(CANVAS).click({ position: { x: 300, y: 150 } })
    await synthesiseFrom(page, { x: 300, y: 150 })

    const insight = page.locator('[data-object-id]').filter({ hasText: '' }).first()
    const box = await insight.boundingBox()
    expect(box).not.toBeNull()
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(0)
  })

  test('an insight cites the evidence it was drawn from, both ways', async ({ page }) => {
    await placeAt(page, FIRST, 'Could not find the price')
    await placeAt(page, SECOND, 'Gave up before checkout')

    await page.locator(CANVAS).click({ position: FIRST })
    await page.locator(CANVAS).click({ position: SECOND, modifiers: ['Shift'] })
    await synthesiseFrom(page, SECOND)

    // The new insight is selected, and its panel says what it stands on.
    await expect(page.getByTestId('inspector')).toBeVisible()
    const stands = page.getByRole('list', { name: 'stands on' })
    await expect(stands).toBeVisible()
    await expect(stands.getByRole('button')).toHaveCount(2)
    await expect(stands).toContainText('Could not find the price')
    await expect(stands).toContainText('Gave up before checkout')

    // And the reverse direction — the question Phase 1 deferred the decision on.
    await page.locator(CANVAS).click({ position: FIRST })
    await expect(page.getByRole('list', { name: 'cited by' })).toBeVisible()
  })

  test('clicking a trail entry takes you to the object', async ({ page }) => {
    await placeAt(page, FIRST, 'Could not find the price')
    await page.locator(CANVAS).click({ position: FIRST })
    await synthesiseFrom(page, FIRST)

    await page.getByRole('list', { name: 'stands on' }).getByRole('button').first().click()
    // The evidence is now the selection, so ITS panel is showing.
    await expect(page.getByRole('list', { name: 'cited by' })).toBeVisible()
  })

  /**
   * One transaction. Split across two, an undo would leave an insight standing
   * on nothing — a claim whose provenance vanished, which is the single thing
   * this product must not do.
   */
  test('undo removes the insight and its citations together', async ({ page }) => {
    await placeAt(page, FIRST, 'Could not find the price')
    await page.locator(CANVAS).click({ position: FIRST })
    await synthesiseFrom(page, FIRST)
    await expect(page.getByRole('list', { name: 'stands on' })).toBeVisible()

    await page.keyboard.press('Control+z')

    await page.locator(CANVAS).click({ position: FIRST })
    await expect(page.getByTestId('inspector')).toBeVisible()
    await expect(page.getByRole('list', { name: 'cited by' })).toHaveCount(0)
  })

  /**
   * A relation dies with either end (ADR 0011), and the trail must not then
   * list a card that is no longer there.
   */
  test('deleting the insight clears the trail on its evidence', async ({ page }) => {
    await placeAt(page, FIRST, 'Could not find the price')
    await page.locator(CANVAS).click({ position: FIRST })
    await synthesiseFrom(page, FIRST)

    // The insight is selected straight after synthesis.
    await page.keyboard.press('Delete')

    await page.locator(CANVAS).click({ position: FIRST })
    await expect(page.getByTestId('inspector')).toBeVisible()
    await expect(page.getByRole('list', { name: 'cited by' })).toHaveCount(0)
  })

  test('an insight carries the confidence its type declares', async ({ page }) => {
    await placeAt(page, FIRST, 'Could not find the price')
    await page.locator(CANVAS).click({ position: FIRST })
    await synthesiseFrom(page, FIRST)

    const confidence = page.getByTestId('field-confidence')
    await expect(confidence).toBeVisible()
    // Structure is earned: nothing has asserted a confidence yet.
    await expect(confidence).toHaveValue('unstated')
    await confidence.selectOption('high')
    await expect(confidence).toHaveValue('high')
  })
})
