import { expect, test, type Page } from '@playwright/test'

/**
 * Images: uploading, what gets rejected, and surviving a reload.
 *
 * The reload case is the one unit tests structurally cannot reach — it is the
 * whole reason the stored locator is `idb:<id>` rather than an object URL.
 */

const CANVAS = '[data-testid="canvas"]'
const FILE_INPUT = 'input[type="file"]'

/**
 * A real 2×3 PNG, not a stub.
 *
 * Upload validation sniffs the leading bytes and the browser then decodes the
 * file to learn its intrinsic size, so anything that is not a genuinely
 * decodable image is rejected before it reaches the board — which would make
 * this suite pass for the wrong reason.
 */
const PNG_2x3_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAADCAIAAAA2iEnWAAAAEElEQVR42mP4zwAE/xlQKAA+' +
  '1gX7ttb52gAAAABJRU5ErkJggg=='

async function freshBoard(page: Page): Promise<void> {
  await page.goto('/')
  await page.evaluate(
    async () =>
      new Promise<void>((resolve) => {
        const request = indexedDB.deleteDatabase('openframe')
        request.onsuccess = () => resolve()
        request.onerror = () => resolve()
        request.onblocked = () => resolve()
      }),
  )
  await page.reload()
  await expect(page.locator(CANVAS)).toBeVisible()
}

async function upload(page: Page, name: string, mimeType: string, body: Buffer): Promise<void> {
  await page.locator(FILE_INPUT).setInputFiles({ name, mimeType, buffer: body })
}

const png = (): Buffer => Buffer.from(PNG_2x3_BASE64, 'base64')

test.describe('images', () => {
  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
  })

  test('places an uploaded image and names it after the file', async ({ page }) => {
    await upload(page, 'holiday.png', 'image/png', png())

    const image = page.locator('[data-object-type="image"]')
    await expect(image).toHaveCount(1)
    await expect(image.locator('img')).toHaveAttribute('alt', 'holiday')
  })

  test('places an image at its natural aspect ratio', async ({ page }) => {
    await upload(page, 'tall.png', 'image/png', png())

    const box = await page.locator('[data-object-type="image"]').boundingBox()
    expect(box).not.toBeNull()
    // The source is 2×3, so the placed object must be taller than it is wide.
    expect(box?.height ?? 0).toBeGreaterThan(box?.width ?? 0)
  })

  /**
   * The security case. An SVG can carry scripts, so it is rejected — and
   * renaming it does not help, because the bytes are what is checked.
   */
  test('rejects an SVG disguised as a PNG, and says why', async ({ page }) => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')
    await upload(page, 'not-really.png', 'image/png', svg)

    await expect(page.getByRole('status')).toContainText('contents are')
    await expect(page.locator('[data-object-type="image"]')).toHaveCount(0)
  })

  test('survives a reload, which an object URL could not', async ({ page }) => {
    await upload(page, 'persisted.png', 'image/png', png())
    await expect(page.locator('[data-object-type="image"] img')).toBeVisible()

    // Long enough for the autosave debounce to have flushed the board.
    await page.waitForTimeout(800)
    await page.reload()

    const image = page.locator('[data-object-type="image"] img')
    await expect(image).toHaveCount(1)
    // A src is not enough: the bytes have to have been found and decoded.
    await expect(image).toHaveJSProperty('naturalWidth', 2)
  })

  test('undo removes the image', async ({ page }) => {
    await upload(page, 'oops.png', 'image/png', png())
    await expect(page.locator('[data-object-type="image"]')).toHaveCount(1)

    await page.locator(CANVAS).click({ position: { x: 1150, y: 600 } })
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z')

    await expect(page.locator('[data-object-type="image"]')).toHaveCount(0)
  })

  test('double-click edits the alt text rather than a caption', async ({ page }) => {
    await upload(page, 'chart.png', 'image/png', png())
    const image = page.locator('[data-object-type="image"]')

    await image.dblclick()
    const editor = page.getByLabel('Describe this image')
    await expect(editor).toBeFocused()
    await editor.fill('Quarterly revenue by region')
    await page.locator(CANVAS).click({ position: { x: 1150, y: 600 } })

    await expect(image.locator('img')).toHaveAttribute('alt', 'Quarterly revenue by region')
  })
})
