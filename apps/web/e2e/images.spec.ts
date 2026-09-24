import { expect, test, type Page } from '@playwright/test'

import { deflateSync } from 'node:zlib'

import { BOARD_URL } from './routes.js'

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
  await page.goto(BOARD_URL)
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
  /*
   * Also wait for the toolbar. A visible canvas only means React rendered;
   * `useKeyboardShortcuts` attaches its listener in an effect, which runs after
   * paint, so a keystroke sent on the canvas alone can land in the gap and be
   * dropped. That showed up as a rare, unexplained tool-selection failure.
   */
  await expect(page.getByTestId("tool-select")).toBeVisible()
}

async function upload(page: Page, name: string, mimeType: string, body: Buffer): Promise<void> {
  await page.locator(FILE_INPUT).setInputFiles({ name, mimeType, buffer: body })
}

const png = (): Buffer => Buffer.from(PNG_2x3_BASE64, 'base64')

/**
 * A real PNG of a given size.
 *
 * The 2x3 fixture above is perfect for "does an upload work" and useless for
 * anything involving a gesture: the object is two world units across, so its
 * eight grips land on top of each other and a drag cannot address one. Two
 * hundred pixels is enough to aim at.
 */
function pngOf(width: number, height: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xed_b8_83_20 ^ (c >>> 1) : c >>> 1
    return c >>> 0
  })
  const crc = (buffer: Buffer): number => {
    let c = 0xff_ff_ff_ff
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
    return (c ^ 0xff_ff_ff_ff) >>> 0
  }
  const chunk = (type: string, body: Buffer): Buffer => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(body.length)
    const typed = Buffer.concat([Buffer.from(type, 'ascii'), body])
    const checksum = Buffer.alloc(4)
    checksum.writeUInt32BE(crc(typed))
    return Buffer.concat([length, typed, checksum])
  }

  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolour
  // A filter byte of zero on each scanline, then three bytes a pixel.
  const raw = Buffer.alloc(height * (1 + width * 3))
  for (let row = 0; row < height; row += 1) raw[row * (1 + width * 3)] = 0

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

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

  /**
   * ALT TEXT IS A NAMED FIELD NOW, not what double-click edits.
   *
   * It used to be the inline editor, on the argument that describing an image
   * should sit on the path of least resistance rather than in a panel nobody
   * opens. Double-click crops instead, so the argument is honoured a different
   * way — and a labelled field arguably teaches what the box is for better
   * than an unlabelled caret over a photograph did.
   */
  test('describes an image through a named field in the panel', async ({ page }) => {
    /*
     * A real-sized picture, because this CLICKS one.
     *
     * The 2x3 fixture makes an object two world units across, and its own
     * eight grips are nine pixels each — so once it is selected it is
     * entirely underneath them, and a press lands on a handle. That used to
     * work by accident: the apparatus was drawn inside the world transform,
     * where a selected object is lifted to `z-index: 1` and so painted over
     * its own handles. On the apparatus layer the grips are over the board,
     * as they are in every tool that has them.
     */
    await upload(page, 'chart.png', 'image/png', pngOf(200, 150))
    const image = page.locator('[data-object-type="image"]')
    await image.click()

    const field = page.getByTestId('field-alt')
    await expect(field).toBeVisible()
    await field.fill('Quarterly revenue by region')
    await field.blur()

    await expect(image.locator('img')).toHaveAttribute('alt', 'Quarterly revenue by region')
  })
})

/**
 * Cropping: double-click an image and trim it.
 *
 * The property worth testing is not that the numbers change — the arithmetic
 * is covered exhaustively in core — but that the SURVIVING PIXELS DO NOT MOVE.
 * Get that wrong and cropping feels like stretching a rubber sheet, which is
 * obvious in use and invisible in a screenshot.
 */
test.describe('cropping', () => {
  test.beforeEach(async ({ page }) => {
    await freshBoard(page)
    // Big enough that its eight grips are eight distinct places to aim at.
    await upload(page, 'holiday.png', 'image/png', pngOf(200, 150))
    await expect(page.locator('[data-object-type="image"]')).toHaveCount(1)
  })

  test('double-click opens crop brackets rather than resize squares', async ({ page }) => {
    await expect(page.getByTestId('crop-overlay')).toHaveCount(0)
    await page.locator('[data-object-type="image"]').dblclick()
    await expect(page.getByTestId('crop-overlay')).toBeVisible()
    await expect(page.getByTestId('crop-e')).toBeVisible()

    /*
     * A BRACKET, not a square. A corner grip draws only the two sides it owns,
     * so it reads as the edge you are about to move rather than as the resize
     * handle it used to be mistaken for.
     */
    const corner = page.getByTestId('crop-nw')
    await expect(corner).toHaveCSS('border-top-style', 'solid')
    await expect(corner).toHaveCSS('border-left-style', 'solid')
    await expect(corner).toHaveCSS('border-right-style', 'none')
    await expect(corner).toHaveCSS('border-bottom-style', 'none')
  })

  test('trims the right edge without moving what is left', async ({ page }) => {
    const image = page.locator('[data-object-type="image"]')
    await image.dblclick()

    const before = await image.boundingBox()
    const picture = await page.locator('.of-image').boundingBox()
    if (before === null || picture === null) throw new Error('no image')

    const grip = await page.getByTestId('crop-e').boundingBox()
    if (grip === null) throw new Error('no handle')
    const trim = Math.round(before.width / 4)
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2 - trim, grip.y + grip.height / 2, { steps: 8 })
    await page.mouse.up()

    const after = await image.boundingBox()
    const shown = await page.locator('.of-image').boundingBox()
    if (after === null || shown === null) throw new Error('no image')

    // The box is narrower by what was dragged off.
    expect(after.width).toBeCloseTo(before.width - trim, 0)
    // The left edge has not moved, because the right handle was dragged.
    expect(after.x).toBeCloseTo(before.x, 0)
    /*
     * And the PICTURE is still the same size and in the same place — the
     * window moved over it, it did not shrink to fit. This is the assertion
     * the feature exists for.
     */
    expect(shown.width).toBeCloseTo(picture.width, 0)
    expect(shown.x).toBeCloseTo(picture.x, 0)
  })

  test('trimming the left edge moves the box, not the picture', async ({ page }) => {
    const image = page.locator('[data-object-type="image"]')
    await image.dblclick()

    const before = await image.boundingBox()
    const picture = await page.locator('.of-image').boundingBox()
    if (before === null || picture === null) throw new Error('no image')

    const grip = await page.getByTestId('crop-w').boundingBox()
    if (grip === null) throw new Error('no handle')
    const trim = Math.round(before.width / 4)
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2 + trim, grip.y + grip.height / 2, { steps: 8 })
    await page.mouse.up()

    const after = await image.boundingBox()
    const shown = await page.locator('.of-image').boundingBox()
    if (after === null || shown === null) throw new Error('no image')

    /*
     * An object's position IS its top-left corner, so a left-edge crop that
     * left `x` alone would slide the whole picture sideways as you dragged.
     */
    expect(after.x).toBeCloseTo(before.x + trim, 0)
    expect(after.width).toBeCloseTo(before.width - trim, 0)
    expect(shown.x).toBeCloseTo(picture.x, 0)
  })

  /**
   * CROP MODE BELONGS TO THE SELECTED OBJECT.
   *
   * Nothing cleared it, and that single omission produced three symptoms at
   * once: the dashed outline and its reset button stayed on the image you had
   * left; the crop grips stayed in the DOM at `z-index: 3`, which is above a
   * selected object; and because those grips sit on exactly the corners the
   * resize handles use, every later attempt to resize that image cropped it
   * instead.
   */
  test('leaves crop mode when something else is selected', async ({ page }) => {
    await page.locator('[data-object-type="image"]').dblclick()
    await expect(page.getByTestId('crop-overlay')).toBeVisible()

    // Anywhere else on the board.
    await page.locator(CANVAS).click({ position: { x: 1180, y: 160 } })
    await expect(page.getByTestId('crop-overlay')).toHaveCount(0)
    await expect(page.getByTestId('crop-reset')).toHaveCount(0)
  })

  test('leaves crop mode on escape', async ({ page }) => {
    await page.locator('[data-object-type="image"]').dblclick()
    await expect(page.getByTestId('crop-overlay')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('crop-overlay')).toHaveCount(0)
  })

  test('can still be resized after being cropped', async ({ page }) => {
    const image = page.locator('[data-object-type="image"]')
    await image.dblclick()

    const grip = await page.getByTestId('crop-e').boundingBox()
    if (grip === null) throw new Error('no crop handle')
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2 - 40, grip.y + grip.height / 2, { steps: 6 })
    await page.mouse.up()

    // Leave crop mode the way anybody would: click away, then select it again.
    await page.locator(CANVAS).click({ position: { x: 1180, y: 160 } })
    await image.click()

    const cropped = await image.boundingBox()
    if (cropped === null) throw new Error('no image')

    /*
     * The resize handle must be reachable. It was not: the crop grips were
     * still in the DOM, above the object, on the same corner.
     */
    const handle = await page.getByTestId('handle-se').boundingBox()
    if (handle === null) throw new Error('no resize handle')
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(handle.x + 60, handle.y + 45, { steps: 8 })
    await page.mouse.up()

    await expect.poll(async () => (await image.boundingBox())?.width ?? 0).toBeGreaterThan(
      cropped.width + 30,
    )
  })

  test('offers crop grips OR resize grips, never both at once', async ({ page }) => {
    const image = page.locator('[data-object-type="image"]')
    await image.click()
    await expect(page.getByTestId('handle-se')).toBeVisible()
    await expect(page.getByTestId('crop-se')).toHaveCount(0)

    await image.dblclick()
    await expect(page.getByTestId('crop-se')).toBeVisible()
    // Two gestures cannot offer a handle in the same place and expect anyone
    // to know which one they got.
    await expect(page.getByTestId('handle-se')).toHaveCount(0)
  })

  /**
   * RESET, clicked.
   *
   * The test that was supposed to cover this was called "is one undoable
   * action, and reset puts the whole picture back" and its body never touched
   * the button — it pressed undo and stopped. A name is not a test, and this
   * one let a control ship that did nothing at all.
   */
  test('reset puts the whole picture back', async ({ page }) => {
    const image = page.locator('[data-object-type="image"]')
    await image.dblclick()
    const before = await image.boundingBox()
    if (before === null) throw new Error('no image')

    const grip = await page.getByTestId('crop-e').boundingBox()
    if (grip === null) throw new Error('no handle')
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2 - 60, grip.y + grip.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect.poll(async () => (await image.boundingBox())?.width ?? 0).toBeLessThan(before.width)

    await page.getByTestId('crop-reset').click()

    /*
     * The frame grows BACK. Restoring the window without growing the frame
     * would squeeze the whole picture into the cropped box, which looks like
     * the image was rescaled rather than uncropped.
     */
    await expect.poll(async () => (await image.boundingBox())?.width ?? 0).toBeCloseTo(
      before.width,
      0,
    )
    // And the button is gone, because there is nothing left to reset.
    await expect(page.getByTestId('crop-reset')).toHaveCount(0)
  })

  test('is one undoable action', async ({ page }) => {
    const image = page.locator('[data-object-type="image"]')
    await image.dblclick()
    const before = await image.boundingBox()
    if (before === null) throw new Error('no image')

    const grip = await page.getByTestId('crop-e').boundingBox()
    if (grip === null) throw new Error('no handle')
    await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2)
    await page.mouse.down()
    await page.mouse.move(grip.x + grip.width / 2 - 40, grip.y + grip.height / 2, { steps: 6 })
    await page.mouse.up()
    await expect.poll(async () => (await image.boundingBox())?.width ?? 0).toBeLessThan(before.width)

    /*
     * ONE step. The window and the box are two commands — data and geometry —
     * but one action, and undoing a drag has to put both back.
     */
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(async () => (await image.boundingBox())?.width ?? 0).toBeCloseTo(before.width, 0)
  })
})
