import { expect, test, type Browser, type Page } from '@playwright/test'

import { CANVAS } from '../e2e/fixtures.js'
import { BOARD_URL } from '../e2e/routes.js'
import { join, newRoomId } from './rooms.js'

/**
 * Reactions between two people on one board, through a real room.
 *
 * Each person's reaction is an object of its own, so two people agreeing with
 * the same note at the same moment both count. Kept inside the note, the later
 * write would have replaced the earlier one and somebody's 👍 would be gone.
 */

interface DebugWindow {
  readonly __openframe: {
    readonly runtime: {
      readonly dispatcher: {
        dispatch(command: unknown): { readonly ok: boolean; readonly error?: { message: string } }
      }
    }
  }
}

async function addNote(page: Page): Promise<void> {
  await page.evaluate(() => {
    const result = (window as unknown as DebugWindow).__openframe.runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 300, y: 200, data: { text: [{ text: 'Ship it' }] } }],
    })
    if (!result.ok) throw new Error(result.error?.message ?? 'the command was refused')
  })
}

/** Inside the note, clear of the chips along its bottom edge. */
const NOTE = { x: 380, y: 240 }

async function open(browser: Browser, room: string, key: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto(`/?room=${room}&k=${key}`)
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-room', 'connected', {
    timeout: 20_000,
  })
  return page
}

test('two people agreeing at the same moment are both counted', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  const bob = await join(browser, room)
  await addNote(alice)
  await expect(bob.locator('[data-object-type="sticky"]')).toHaveCount(1)

  for (const page of [alice, bob]) await page.locator(CANVAS).click({ position: NOTE })
  const agree = (page: Page) =>
    page.getByTestId('reaction-bar').getByRole('button', { name: 'Agree' })
  await Promise.all([agree(alice).click(), agree(bob).click()])

  for (const page of [alice, bob]) {
    await expect(page.getByTestId('reaction-plus-one')).toHaveText(/2/)
    await expect(page.getByTestId('reaction-plus-one')).toHaveAttribute('aria-pressed', 'true')
  }

  // Taking yours back leaves theirs.
  await alice.getByTestId('reaction-plus-one').click()
  for (const page of [alice, bob])
    await expect(page.getByTestId('reaction-plus-one')).toHaveText(/1/)
  await expect(alice.getByTestId('reaction-plus-one')).toHaveAttribute('aria-pressed', 'false')
})

test('a viewer sees the reactions and cannot add one', async ({ browser }) => {
  const room = newRoomId()
  const opener = await (await browser.newContext()).newPage()
  await opener.goto(BOARD_URL)
  const keys = await opener.evaluate(async (id) => {
    const response = await fetch(`http://127.0.0.1:8787/room/${id}/claim`, { method: 'POST' })
    if (!response.ok) throw new Error(`claim failed: ${String(response.status)}`)
    return (await response.json()) as { editor: string; viewer: string }
  }, room)

  const editor = await open(browser, room, keys.editor)
  const viewer = await open(browser, room, keys.viewer)
  await addNote(editor)
  await editor.locator(CANVAS).click({ position: NOTE })
  await editor.getByTestId('reaction-bar').getByRole('button', { name: 'Love it' }).click()

  const chip = viewer.getByTestId('reaction-heart')
  await expect(chip).toHaveText(/1/)
  await expect(chip).toBeDisabled()

  await viewer.locator(CANVAS).click({ position: NOTE })
  await expect(viewer.locator('[data-object-type="sticky"][data-selected="true"]')).toHaveCount(1)
  await expect(viewer.getByTestId('reaction-bar')).toHaveCount(0)
})
