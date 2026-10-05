import { richFromPlain } from '@openframe/core'
import type { Page } from '@playwright/test'

import { buildBoard } from './boards.js'
import {
  CANVAS,
  defined,
  expect,
  openFreshBoard,
  seedBoard,
  test,
  useClipboard,
} from './fixtures.js'

/**
 * The system clipboard: a copy reaches another tab, another board, and a
 * document as words.
 *
 * Both boards here are in one browser, as they are for anybody with two tabs
 * open. The source is built with a board id of its own, which is how a paste
 * knows it came from somewhere else.
 */

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control'

test.beforeEach(async ({ context }) => {
  await useClipboard(context)
})

interface Stored {
  readonly type: string
  readonly parentId: string | null
  readonly data: Record<string, unknown>
}

function objects(page: Page): Promise<Stored[]> {
  return page.evaluate(() => {
    const runtime = (
      window as unknown as {
        __openframe?: {
          runtime: {
            store: { getDocument: () => { objects: Map<string, Stored & { id: string }> } }
          }
        }
      }
    ).__openframe?.runtime
    return [...(runtime?.store.getDocument().objects.values() ?? [])].map((object) => ({
      id: object.id,
      type: object.type,
      parentId: object.parentId,
      data: object.data,
    }))
  })
}

async function copyFromAnotherBoard(page: Page): Promise<void> {
  await openFreshBoard(page)
  await seedBoard(
    page,
    buildBoard(
      (board) => {
        const frame = board.add('frame', { x: 500, y: 350 }, { name: richFromPlain('Findings') })
        const inside = board.add(
          'sticky',
          { x: 460, y: 380 },
          { text: richFromPlain('P07 could not find the price') },
          undefined,
          frame,
        )
        const outside = board.note('Pricing is hidden', { x: 900, y: 380 })
        board.connect(inside, outside)
      },
      'Interviews',
      'board_interviews',
    ),
  )
  await page.locator(CANVAS).click({ position: { x: 20, y: 20 } })
  await page.keyboard.press(`${MOD}+a`)
  await page.keyboard.press(`${MOD}+c`)
}

test('pastes into another board, with what a frame holds and what a line joins', async ({
  page,
  context,
}) => {
  await copyFromAnotherBoard(page)

  const other = await context.newPage()
  await openFreshBoard(other)
  await other.locator(CANVAS).click({ position: { x: 20, y: 20 } })
  await other.keyboard.press(`${MOD}+v`)

  await expect(other.locator('[data-object-type="frame"]')).toHaveCount(1)
  await expect(other.locator('[data-object-type="sticky"]')).toHaveCount(2)
  await expect(other.locator('[data-object-type="connector"]')).toHaveCount(1)

  const pasted = await objects(other)
  const frame = defined(
    pasted.find((object) => object.type === 'frame'),
    'the pasted frame',
  )
  const notes = pasted.filter((object) => object.type === 'sticky')
  expect(notes.filter((note) => note.parentId !== null).map((note) => note.parentId)).toEqual([
    (frame as Stored & { id: string }).id,
  ])
  const line = defined(
    pasted.find((object) => object.type === 'connector'),
    'the pasted line',
  ).data as { from: { objectId?: string }; to: { objectId?: string } }
  const noteIds = notes.map((note) => (note as Stored & { id: string }).id).sort()
  expect([line.from.objectId, line.to.objectId].sort()).toEqual(noteIds)
})

test('a copy reaches a document as the words on it', async ({ page }) => {
  await copyFromAnotherBoard(page)
  const text = await page.evaluate(() => navigator.clipboard.readText())
  expect(text).toContain('P07 could not find the price')
  expect(text).toContain('Pricing is hidden')
})

test('the menu pastes a copy made in another tab', async ({ page, context }) => {
  await copyFromAnotherBoard(page)

  const other = await context.newPage()
  await openFreshBoard(other)
  await other.locator(CANVAS).click({ position: { x: 700, y: 480 }, button: 'right' })
  const paste = other.getByRole('menuitem', { name: /Paste here/ })
  await expect(paste).not.toHaveAttribute('aria-disabled', 'true')
  await paste.click()

  await expect(other.locator('[data-object-type="sticky"]')).toHaveCount(2)
  await expect(other.locator('[data-object-type="frame"]')).toHaveCount(1)
})

/** Puts what another application would on the system clipboard. */
async function copyFromElsewhere(page: Page, kinds: Record<string, string>): Promise<void> {
  await page.evaluate(async (entries) => {
    const item = new ClipboardItem(
      Object.fromEntries(
        Object.entries(entries).map(([type, value]) => [type, new Blob([value], { type })]),
      ),
    )
    await navigator.clipboard.write([item])
  }, kinds)
}

test.describe('content from another application', () => {
  test.use({ board: 'fresh' })

  test('words from a document land as a text box, formatting and all', async ({ page }) => {
    await copyFromElsewhere(page, {
      'text/html': '<p>Pricing <b>is hidden</b></p>',
      'text/plain': 'Pricing is hidden',
    })
    await page.locator(CANVAS).click({ position: { x: 20, y: 20 } })
    await page.keyboard.press(`${MOD}+v`)

    await expect(page.locator('[data-object-type="text"]')).toHaveCount(1)
    const text = defined(
      (await objects(page)).find((object) => object.type === 'text'),
      'the pasted text box',
    )
    expect(text.data.text).toEqual([{ text: 'Pricing ' }, { text: 'is hidden', marks: ['bold'] }])
  })

  /*
   * Chromium hands this paste only its plain text, so this holds the outcome;
   * that the key itself is what asks for plain words, in a browser that does
   * not strip them, is `clipboard-keys.test.ts`.
   */
  test('Shift+Mod+V pastes the words alone', async ({ page }) => {
    await copyFromElsewhere(page, {
      'text/html': '<p><b>Pricing is hidden</b></p>',
      'text/plain': 'Pricing is hidden',
    })
    await page.locator(CANVAS).click({ position: { x: 20, y: 20 } })
    await page.keyboard.press(`Shift+${MOD}+v`)

    await expect(page.locator('[data-object-type="text"]')).toHaveCount(1)
    const text = defined(
      (await objects(page)).find((object) => object.type === 'text'),
      'the pasted text box',
    )
    expect(text.data.text).toEqual([{ text: 'Pricing is hidden' }])
  })

  test('words pasted onto a selected note go in on a new line', async ({ page }) => {
    await seedBoard(
      page,
      buildBoard((board) => board.note('Pricing', { x: 600, y: 400 })),
    )
    await page.locator('[data-object-type="sticky"]').click()
    await copyFromElsewhere(page, { 'text/plain': 'is hidden' })
    await page.keyboard.press(`${MOD}+v`)

    await expect(page.locator('[data-object-type="sticky"]')).toContainText('is hidden')
    await expect(page.locator('[data-object-type="text"]')).toHaveCount(0)
    const note = defined(
      (await objects(page)).find((object) => object.type === 'sticky'),
      'the note',
    )
    expect(note.data.text).toEqual([{ text: 'Pricing\nis hidden' }])
  })

  test('a spreadsheet range lands as a table, cell for cell', async ({ page }) => {
    await copyFromElsewhere(page, {
      'text/html':
        '<table><tr><td>Who</td><td>What</td></tr><tr><td>P07</td><td>Price</td></tr></table>',
      'text/plain': 'Who\tWhat\nP07\tPrice\n',
    })
    await page.locator(CANVAS).click({ position: { x: 20, y: 20 } })
    await page.keyboard.press(`${MOD}+v`)

    await expect(page.locator('[data-object-type="table"]')).toHaveCount(1)
    const table = defined(
      (await objects(page)).find((object) => object.type === 'table'),
      'the pasted table',
    ).data as { columns: unknown[]; rows: unknown[]; cells: { text: { text: string }[] }[] }
    expect(table.columns).toHaveLength(2)
    expect(table.rows).toHaveLength(2)
    expect(table.cells.map((cell) => cell.text.map((span) => span.text).join(''))).toEqual([
      'Who',
      'What',
      'P07',
      'Price',
    ])
  })
})

test.describe('a picture copied from the board', () => {
  test.use({ board: 'fresh' })

  /** Uploads a 200×150 picture through the board's own file input. */
  async function placePicture(page: Page): Promise<void> {
    const encoded = await page.evaluate(async () => {
      const canvas = new OffscreenCanvas(200, 150)
      const context = canvas.getContext('2d')
      if (context === null) throw new Error('no 2d context')
      context.fillStyle = '#c33'
      context.fillRect(0, 0, 200, 150)
      const bytes = new Uint8Array(await (await canvas.convertToBlob()).arrayBuffer())
      return btoa(String.fromCharCode(...bytes))
    })
    await page.locator('input[type="file"]').setInputFiles({
      name: 'chart.png',
      mimeType: 'image/png',
      buffer: Buffer.from(encoded, 'base64'),
    })
    await expect(page.locator('[data-object-type="image"]')).toHaveCount(1)
  }

  test('reaches other applications as the picture itself', async ({ page }) => {
    await placePicture(page)
    await page.locator('[data-object-type="image"]').click()
    await page.keyboard.press(`${MOD}+c`)

    // The picture follows the words in a write of its own.
    await expect
      .poll(() =>
        page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types)),
      )
      .toContain('image/png')
    const size = await page.evaluate(async () => {
      const [item] = await navigator.clipboard.read()
      if (item === undefined) throw new Error('nothing on the clipboard')
      const bitmap = await createImageBitmap(await item.getType('image/png'))
      return { width: bitmap.width, height: bitmap.height }
    })
    expect(size).toEqual({ width: 200, height: 150 })
  })

  test('pastes back as the board copy, not as a new upload', async ({ page }) => {
    await placePicture(page)
    await page.locator('[data-object-type="image"]').click()
    await page.keyboard.press(`${MOD}+c`)
    await expect
      .poll(() =>
        page.evaluate(async () => (await navigator.clipboard.read()).flatMap((item) => item.types)),
      )
      .toContain('image/png')
    await page.keyboard.press(`${MOD}+v`)

    await expect(page.locator('[data-object-type="image"]')).toHaveCount(2)
    // An upload would be named after the clipboard's file; the copy keeps the original's.
    const alts = (await objects(page))
      .filter((object) => object.type === 'image')
      .map((object) => object.data.alt)
    expect(alts).toEqual(['chart', 'chart'])
  })
})
