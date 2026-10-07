import { expect, test, type Browser, type Page } from '@playwright/test'

import { CANVAS } from '../e2e/fixtures.js'
import { BOARD_URL } from '../e2e/routes.js'
import { join, newRoomId } from './rooms.js'

/**
 * Dot voting between people on one board, through a real room.
 *
 * Every dot is an object of its own, so two people voting for the same note at
 * the same moment both count, and the round they vote in is the same object
 * on every device.
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

/** Inside the note, clear of the dots in its corner and the chips along its bottom. */
const NOTE = { x: 380, y: 240 }

async function open(browser: Browser, room: string, key: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto(`/?room=${room}&k=${key}`)
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-room', 'connected', {
    timeout: 20_000,
  })
  return page
}

async function startRound(page: Page): Promise<void> {
  await page.locator(CANVAS).click({ button: 'right', position: { x: 900, y: 600 } })
  await page.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await page.getByTestId('voting-start').click()
  await expect(page.getByTestId('voting')).toBeVisible()
}

test('two people voting for one note at the same moment are both counted', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  const bob = await join(browser, room)
  await addNote(alice)
  await expect(bob.locator('[data-object-type="sticky"]')).toHaveCount(1)

  await startRound(alice)
  await expect(bob.getByTestId('voting-status')).toHaveText('5 of 5 votes left')
  await bob.getByTestId('voting-vote').click()

  await Promise.all([
    alice.locator(CANVAS).click({ position: NOTE }),
    bob.locator(CANVAS).click({ position: NOTE }),
  ])
  for (const page of [alice, bob]) {
    await expect(page.getByTestId('votes')).toHaveAttribute('data-count', '2')
    await expect(page.getByTestId('voting-status')).toHaveText('4 of 5 votes left · 2 people voted')
  }

  // Ending it ends it for everybody.
  await alice.getByTestId('voting-end').click()
  await expect(bob.getByTestId('voting-status')).toHaveText('Voting ended')
})

test('a viewer sees the round and the dots, and cannot vote', async ({ browser }) => {
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
  await startRound(editor)
  await editor.locator(CANVAS).click({ position: NOTE })

  await expect(viewer.getByTestId('voting-status')).toHaveText(
    'Voting open · view only · 1 person voted',
  )
  await expect(viewer.getByTestId('votes')).toHaveAttribute('data-count', '1')
  await expect(viewer.getByTestId('voting-vote')).toHaveCount(0)
  await expect(viewer.getByTestId('voting-end')).toHaveCount(0)
})

test('a round somebody else starts puts away the one being set up here', async ({ browser }) => {
  const room = newRoomId()
  const alice = await join(browser, room)
  const bob = await join(browser, room)
  await addNote(alice)
  await expect(bob.locator('[data-object-type="sticky"]')).toHaveCount(1)

  await bob.locator(CANVAS).click({ button: 'right', position: { x: 900, y: 600 } })
  await bob.getByRole('menuitem', { name: 'Start dot voting…' }).click()
  await expect(bob.getByTestId('voting-setup')).toBeVisible()

  await startRound(alice)
  await expect(bob.getByTestId('voting')).toBeVisible()

  // When Alice's round ends, Bob sees it ended — not his old form back in its place.
  await alice.getByTestId('voting-end').click()
  await expect(bob.getByTestId('voting-status')).toHaveText('Voting ended')
  await expect(bob.getByTestId('voting-setup')).toHaveCount(0)
})
