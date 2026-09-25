import { expect, test, type Page } from '@playwright/test'

import { BOARD_URL } from './routes.js'

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
  await page.goto(BOARD_URL)
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
    // The first TEXT, wherever it sits: each paragraph is a block now
    // (ADR 0014), so the editor's first child is a paragraph, not the words.
    const node = document.createTreeWalker(element, NodeFilter.SHOW_TEXT).nextNode()
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
    await expect(page.locator(`${EDITOR} [data-size="lg"]`)).toHaveText('Pricing')
  })

  test('steps up and back down again', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    await page.getByTestId('format-bigger').click()
    await page.getByTestId('format-bigger').click()
    await expect(page.locator(`${EDITOR} [data-size="xl"]`)).toHaveText('Pricing')

    await page.getByTestId('format-smaller').click()
    await expect(page.locator(`${EDITOR} [data-size="lg"]`)).toHaveText('Pricing')
  })

  test('stops at the ends rather than running off them', async ({ page }) => {
    await noteSaying(page, 'Pricing is unclear')
    await selectFirst(page, 7)
    for (let i = 0; i < 6; i++) await page.getByTestId('format-smaller').click()
    await expect(page.locator(`${EDITOR} [data-size="xs"]`)).toHaveText('Pricing')
    for (let i = 0; i < 12; i++) await page.getByTestId('format-bigger').click()
    await expect(page.locator(`${EDITOR} [data-size="5xl"]`)).toHaveText('Pricing')
  })

  /**
   * The reported problem: a large shape needs type big enough to read when the
   * whole shape is on screen, and the old ladder topped out at 1.9× — small
   * type in a big box. The ladder is what makes this reachable, so its SPAN is
   * the thing worth asserting, not just its ends.
   */
  test('reaches a size that suits a large shape', async ({ page }) => {
    await page.keyboard.press('u')
    await page.locator(CANVAS).click({ position: { x: 300, y: 200 } })
    await page.locator(EDITOR).fill('Discovery')
    await page.locator(EDITOR).click()

    const measure = async (): Promise<number> =>
      page
        .locator(`${EDITOR}`)
        .evaluate((el) =>
          Number.parseFloat(
            getComputedStyle(el.querySelector('[data-size]') ?? el.querySelector('.of-p') ?? el)
              .fontSize,
          ),
        )

    const base = await measure()
    for (let i = 0; i < 12; i++) await page.getByTestId('format-bigger').click()
    // Comfortably past the old 1.9× ceiling, which is the whole point.
    expect(await measure()).toBeGreaterThan(base * 4)
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

    const sized = page.locator(`${EDITOR} [data-size="lg"]`)
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
    await expect(page.locator('.of-sticky [data-size="lg"]')).toHaveText('Pricing is unclear')
  })
})

/**
 * Lists (ADR 0014), in the editor every text uses.
 *
 * The browser splits a list item on Enter and copies its attributes, so most
 * of this is the platform's own behaviour; what these hold is the handful of
 * keys that are the editor's, and that what is drawn is what is stored.
 */
test.describe('lists', () => {
  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
    await page.keyboard.press('s')
    await page.locator(CANVAS).click({ position: AT })
    await expect(page.locator(EDITOR)).toBeFocused()
    await page.keyboard.press('Delete')
  })

  const items = (page: Page) => page.locator(`${EDITOR} .of-p[data-list]`)

  test('"- " starts a bulleted list, and Enter continues it', async ({ page }) => {
    await page.keyboard.type('- first')
    await page.keyboard.press('Enter')
    await page.keyboard.type('second')
    await expect(items(page)).toHaveText(['first', 'second'])
    await expect(items(page).first()).toHaveAttribute('data-list', 'bullet')
    // The dash was the command, not the text.
    await expect(page.locator(EDITOR)).not.toContainText('-')
  })

  /*
   * The numbers themselves are drawn by CSS counters, which no computed style
   * will report — `content` comes back as the counter expression. The golden
   * of a note with a nested list (surfaces.visual.spec.ts) is what holds 1, 2,
   * a, b; this holds that they are the items the counters count.
   */
  test('"1. " starts a numbered list that Enter continues', async ({ page }) => {
    await page.keyboard.type('1. one')
    await page.keyboard.press('Enter')
    await page.keyboard.type('two')
    await expect(items(page)).toHaveText(['one', 'two'])
    for (const index of [0, 1]) {
      await expect(items(page).nth(index)).toHaveAttribute('data-list', 'number')
    }
  })

  test('"- " on the empty line after a list starts an item there', async ({ page }) => {
    await page.keyboard.type('- first')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('- again')
    await expect(items(page)).toHaveText(['first', 'again'])
  })

  test('Enter on an empty item ends the list', async ({ page }) => {
    await page.keyboard.type('- only')
    await page.keyboard.press('Enter')
    await page.keyboard.press('Enter')
    await page.keyboard.type('after')
    await expect(items(page)).toHaveText(['only'])
    await expect(page.locator(`${EDITOR} .of-p:not([data-list])`).last()).toHaveText('after')
  })

  test('Tab nests an item and Shift+Tab brings it back', async ({ page }) => {
    await page.keyboard.type('- outer')
    await page.keyboard.press('Enter')
    await page.keyboard.type('inner')
    await page.keyboard.press('Tab')
    await expect(items(page).nth(1)).toHaveAttribute('data-indent', '1')
    // Still editing: Tab in a list is the list's, not the way out.
    await expect(page.locator(EDITOR)).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(items(page).nth(1)).not.toHaveAttribute('data-indent', /.*/)
  })

  test('Backspace at the start of an item takes the bullet, not the words', async ({ page }) => {
    await page.keyboard.type('- kept')
    await page.keyboard.press('Home')
    await page.keyboard.press('Backspace')
    await expect(items(page)).toHaveCount(0)
    await expect(page.locator(EDITOR)).toHaveText('kept')
  })

  test('the shortcut and the button toggle a list', async ({ page }) => {
    await page.keyboard.type('line')
    await page.keyboard.press('ControlOrMeta+Shift+8')
    await expect(items(page)).toHaveCount(1)
    await expect(page.getByTestId('format-bullet')).toHaveAttribute('aria-pressed', 'true')
    await page.getByTestId('format-number').click()
    await expect(items(page).first()).toHaveAttribute('data-list', 'number')
    await page.getByTestId('format-number').click()
    await expect(items(page)).toHaveCount(0)
  })

  test('a list survives the commit and a reload, and reads as a list', async ({ page }) => {
    await page.keyboard.type('- alpha')
    await page.keyboard.press('Enter')
    await page.keyboard.type('beta')
    await page.locator(CANVAS).click({ position: CLEAR })

    const drawn = page.locator('[data-object-type="sticky"] [role="list"] [role="listitem"]')
    await expect(drawn).toHaveText(['alpha', 'beta'])
    await page.waitForTimeout(800) // autosave
    await page.reload()
    await expect(drawn).toHaveText(['alpha', 'beta'])
  })
})

test('a frame title takes formatting and a list', async ({ page }) => {
  await freshBoard(page)
  await page.keyboard.press('f')
  await page.locator(CANVAS).click({ position: AT })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.keyboard.type('Findings')
  await page.keyboard.press('ControlOrMeta+a')
  await page.getByTestId('format-bold').click()
  await page.locator(CANVAS).click({ position: CLEAR })
  await expect(page.locator('.of-frame__title strong')).toHaveText('Findings')
})

/*
 * Pasted markup is READ for its words, marks and lists, in a document that is
 * never rendered. A document with no browsing context fetches nothing, so an
 * image in someone's clipboard must not become a request to wherever it
 * points — which is what inserting that markup into the page would do.
 */
test('pasting markup with images fetches none of them', async ({ page }) => {
  await freshBoard(page)
  const fetched: string[] = []
  await page.route('**/paste-probe-*', async (route) => {
    fetched.push(route.request().url())
    await route.fulfill({ status: 200, body: '' })
  })
  await page.keyboard.press('s')
  await page.locator(CANVAS).click({ position: AT })
  await expect(page.locator(EDITOR)).toBeFocused()
  await page.locator(EDITOR).evaluate((element) => {
    const data = new DataTransfer()
    data.setData(
      'text/html',
      '<ul><li><b>kept</b></li></ul><img src="/paste-probe-img.png"><iframe src="/paste-probe-frame"></iframe><img srcset="/paste-probe-srcset.png 1x">',
    )
    data.setData('text/plain', 'kept')
    element.dispatchEvent(
      new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
    )
  })
  await expect(page.locator(`${EDITOR} [data-list="bullet"] strong`)).toHaveText('kept')
  await page.waitForTimeout(500)
  expect(fetched).toEqual([])
})
