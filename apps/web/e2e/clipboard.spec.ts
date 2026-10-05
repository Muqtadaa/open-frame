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
