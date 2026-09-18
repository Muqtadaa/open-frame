import { expect, test, type Page } from '@playwright/test'

/**
 * Formatting selected text (ADR 0012), walked in a browser.
 *
 * The unit tests prove the text algebra and the DOM translation. Only this
 * proves the two meet: that a selection made with a real mouse, formatted with
 * a real button, survives a commit and a reload.
 */

const CANVAS = '[data-testid="canvas"]'
const EDITOR = '[data-testid="rich-text-editor"]'
const AT = { x: 340, y: 280 }
const CLEAR = { x: 1120, y: 140 }

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
  await expect(page.getByTestId('tool-select')).toBeVisible()
}

async function noteSaying(page: Page, text: string): Promise<void> {
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: AT })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.locator(EDITOR).fill(text)
}

/** Selects the first `count` characters, as a user dragging across them would. */
async function selectFirst(page: Page, count: number): Promise<void> {
  await page.locator(EDITOR).evaluate((element, n) => {
    const node = element.firstChild
    if (node === null) return
    const range = document.createRange()
    range.setStart(node, 0)
    range.setEnd(node, n)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  }, count)
}

test.describe('formatting selected text', () => {
  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
  })

  test('a format bar appears while editing and not otherwise', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await expect(page.getByTestId('format-bar')).toBeVisible()

    await page.locator(CANVAS).click({ position: CLEAR })
    await expect(page.getByTestId('format-bar')).toHaveCount(0)
  })

  test('bolds the selection and leaves the rest alone', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    await page.getByTestId('format-bold').click()

    await expect(page.locator(`${EDITOR} strong`)).toHaveText('Pricing')
    // The characters are untouched — the whole point.
    await expect(page.locator(EDITOR)).toHaveText('Pricing is unclear')
  })

  /*
   * A fresh note per mark. Applying one re-renders the editor from the model,
   * so the text node `selectFirst` reaches for is replaced — reusing the same
   * note tests the selection helper's assumptions, not the feature.
   */
  for (const [mark, tag] of [
    ['italic', 'em'],
    ['underline', 'u'],
    ['strike', 's'],
  ] as const) {
    test(`applies ${mark}`, async ({ page }) => {
      await noteSaying(page, 'Pricing is unclear')
      await selectFirst(page, 7)
      await page.getByTestId(`format-${mark}`).click()
      await expect(page.locator(`${EDITOR} ${tag}`)).toHaveText('Pricing')
    })
  }

  test('toggles a mark off again', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    await page.getByTestId('format-bold').click()
    await expect(page.locator(`${EDITOR} strong`)).toHaveCount(1)

    await page.getByTestId('format-bold').click()
    await expect(page.locator(`${EDITOR} strong`)).toHaveCount(0)
    await expect(page.locator(EDITOR)).toHaveText('Pricing is unclear')
  })

  /**
   * Clicked with a real mouse, deliberately.
   *
   * The first version of this test used `selectOption`, which sets a native
   * select's value programmatically and never opens it — so it passed against a
   * dropdown a human could not open at all, because the `mousedown` guard that
   * stops the editor committing also stops Chrome opening a native select. Any
   * control on this bar has to be provably clickable, not merely settable.
   */
  test('a size step applies to the selection', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    await page.getByTestId('format-bigger').click()
    await expect(page.locator(`${EDITOR} [data-size="large"]`)).toHaveText('Pricing')
  })

  test('steps up and back down again', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    await page.getByTestId('format-bigger').click()
    await page.getByTestId('format-bigger').click()
    await expect(page.locator(`${EDITOR} [data-size="huge"]`)).toHaveText('Pricing')

    await page.getByTestId('format-smaller').click()
    await expect(page.locator(`${EDITOR} [data-size="large"]`)).toHaveText('Pricing')
  })

  test('stops at the ends rather than running off them', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    for (let i = 0; i < 5; i++) await page.getByTestId('format-smaller').click()
    await expect(page.locator(`${EDITOR} [data-size="small"]`)).toHaveText('Pricing')
    for (let i = 0; i < 6; i++) await page.getByTestId('format-bigger').click()
    await expect(page.locator(`${EDITOR} [data-size="huge"]`)).toHaveText('Pricing')
  })

  /** `normal` is the object's own size, so it is stored as no size at all. */
  test('returning to normal leaves no size on the run', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    await page.getByTestId('format-bigger').click()
    await expect(page.locator(`${EDITOR} [data-size]`)).toHaveCount(1)
    await page.getByTestId('format-smaller').click()
    await expect(page.locator(`${EDITOR} [data-size]`)).toHaveCount(0)
  })



  test('the keyboard shortcut does the same thing', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    await page.keyboard.press('Control+b')
    await expect(page.locator(`${EDITOR} strong`)).toHaveText('Pricing')
  })

  /**
   * Clicking a format button must not end the edit. A button that took focus
   * would blur the editor, which COMMITS — so the mark would be applied to a
   * selection that no longer existed.
   */
  test('clicking a format button keeps the editor open', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    await page.getByTestId('format-bold').click()
    await expect(page.locator(EDITOR)).toBeVisible()
    await expect(page.getByTestId('format-bar')).toBeVisible()
  })

  test('formatting survives the commit', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    await page.getByTestId('format-bold').click()
    await page.locator(CANVAS).click({ position: CLEAR })

    await expect(page.locator('.of-sticky strong')).toHaveText('Pricing')
    await expect(page.locator('.of-sticky')).toContainText('Pricing is unclear')
  })

  /** The document is what persists, so this is the model surviving, not the DOM. */
  test('formatting survives a reload', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    await page.getByTestId('format-bold').click()
    await page.locator(CANVAS).click({ position: CLEAR })
    await expect(page.locator('.of-sticky strong')).toHaveText('Pricing')

    await page.waitForTimeout(800) // autosave is debounced
    await page.reload()
    await expect(page.locator('.of-sticky strong')).toHaveText('Pricing')
  })

  /** One command per edit, however many marks were applied along the way. */
  test('the whole edit is one undo entry', async ({ page }) => {
    await noteSaying(page, 'A plain note')
    await page.locator(CANVAS).click({ position: CLEAR })
    await page.locator(CANVAS).dblclick({ position: AT })
    await selectFirst(page, 1)
    await page.getByTestId('format-bold').click()
    await page.getByTestId('format-italic').click()
    await page.locator(CANVAS).click({ position: CLEAR })
    await expect(page.locator('.of-sticky strong')).toHaveCount(1)

    await page.keyboard.press('Control+z')
    await expect(page.locator('.of-sticky strong')).toHaveCount(0)
    await expect(page.locator('.of-sticky')).toContainText('A plain note')
  })

  test('Escape abandons the formatting along with the edit', async ({ page }) => {
    await noteSaying(page, 'A plain note')
    await page.locator(CANVAS).click({ position: CLEAR })
    await page.locator(CANVAS).dblclick({ position: AT })
    await selectFirst(page, 1)
    await page.getByTestId('format-bold').click()
    await page.keyboard.press('Escape')

    await expect(page.locator('.of-sticky strong')).toHaveCount(0)
    await expect(page.locator('.of-sticky')).toContainText('A plain note')
  })

  /*
   * The three below are the behaviour that was reported missing: with nothing
   * selected, formatting applies to the WHOLE object. Each fails against the
   * previous version, which returned early on a collapsed caret and so did
   * nothing at all — which is what "font size is not working" turned out to
   * mean, once the dropdown was clickable.
   */
  test('a size step with no selection resizes the whole object', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    // A click puts a caret in without selecting anything.
    await page.locator(EDITOR).click()
    await page.getByTestId('format-bigger').click()

    const sized = page.locator(`${EDITOR} [data-size="large"]`)
    await expect(sized).toHaveText('Pricing is unclear')
  })

  test('bold with no selection bolds the whole object', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await page.locator(EDITOR).click()
    await page.getByTestId('format-bold').click()
    await expect(page.locator(`${EDITOR} strong`)).toHaveText('Pricing is unclear')
  })

  test('and it survives the commit', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await page.locator(EDITOR).click()
    await page.getByTestId('format-bigger').click()
    await page.locator(CANVAS).click({ position: CLEAR })
    await expect(page.locator('.of-sticky [data-size="large"]')).toHaveText('Pricing is unclear')
  })
})
