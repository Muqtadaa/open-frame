import { expect, test, type Browser, type Page } from '@playwright/test'

import { BOARD_URL } from '../e2e/routes.js'
import { join, newRoomId } from './rooms.js'

/**
 * A poll answered by two people on one board, through a real room.
 *
 * Each answer is an object of its own, so two people answering at the same
 * moment are both counted rather than one writing over the other.
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

async function addPoll(page: Page): Promise<void> {
  await page.evaluate(() => {
    const result = (window as unknown as DebugWindow).__openframe.runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'poll', x: 300, y: 200, data: { text: [{ text: 'Ship it?' }] } }],
    })
    if (!result.ok) throw new Error(result.error?.message ?? 'the command was refused')
  })
}

async function open(browser: Browser, room: string, key: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto(`/?room=${room}&k=${key}`)
  await expect(page.getByTestId('room-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 20_000,
  })
  return page
}

test('two people answering at the same moment are both counted', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  const bob = await join(browser, room)
  await addPoll(alice)
  await expect(bob.locator('[data-object-type="poll"]')).toHaveCount(1)

  await Promise.all([
    alice.getByTestId('poll-option-o1').click(),
    bob.getByTestId('poll-option-o1').click(),
  ])
  for (const page of [alice, bob]) {
    await expect(page.getByTestId('poll-option-o1')).toHaveAccessibleName(
      'Option 1, 2 answers, 100%',
    )
    await expect(page.getByTestId('poll-option-o1')).toHaveAttribute('aria-pressed', 'true')
  }
})

test('a viewer sees the answers and cannot answer', async ({ browser }) => {
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
  await addPoll(editor)
  await editor.getByTestId('poll-option-o2').click()

  await expect(viewer.getByTestId('poll-option-o2')).toHaveAccessibleName(
    'Option 2, 1 answer, 100%',
  )
  await expect(viewer.getByTestId('poll-option-o2')).toBeDisabled()
})
