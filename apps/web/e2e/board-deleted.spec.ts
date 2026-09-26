import { expect, test, type Page, type WebSocketRoute } from '@playwright/test'

import { signedIn } from './signed-in.js'

const KEY = 'e'.repeat(32)
const BOARD = 'brd_abcdefgh12345678'

/**
 * Holds the room's end of the socket so the test can decide WHEN the board is
 * deleted, rather than racing a timer against autosave. The first version of
 * this closed 400ms in and passed with the fix removed, because nothing had
 * been written to forget yet.
 */
async function roomThatCanBeDeleted(page: Page): Promise<() => Promise<void>> {
  let room: WebSocketRoute | null = null
  await page.routeWebSocket(/\/room\//, (ws) => {
    // Nothing is forwarded: this handler IS the room for the length of the
    // test, and the only thing it ever does is stop being one.
    room = ws
  })
  return async () => {
    await expect.poll(() => room !== null).toBe(true)
    await room?.close({ code: 4004, reason: 'This board was deleted' })
  }
}

/**
 * The owner deletes a board while somebody else has it open.
 *
 * The room puts everyone out with close code 4004 and then refuses every
 * reconnection with 410. The provider used to ignore the code, so it treated
 * this exactly like a dropped connection: reconnect, be refused, back off, try
 * again, for as long as the tab stayed open. The board simply stopped
 * responding and nothing anywhere said why — which reads as a bug in OpenFrame
 * rather than as somebody else's decision.
 */
test('says so, instead of freezing, when the owner deletes the board', async ({ page }) => {
  await signedIn(page, [])
  const deleteTheBoard = await roomThatCanBeDeleted(page)

  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect(page.getByTestId('board-gone')).toHaveCount(0)

  await deleteTheBoard()

  const gone = page.getByTestId('board-gone')
  await expect(gone).toBeVisible()
  await expect(gone).toContainText('This board was deleted')

  /*
   * NOT DISMISSIBLE. Everything on screen is a corpse and nothing typed into
   * it can be saved, so an interface that let you wave the message away would
   * be offering to go on working into a void. Leaving is the only control.
   */
  await expect(gone.getByRole('button', { name: /dismiss/i })).toHaveCount(0)
  await expect(page.getByTestId('board-gone-exit')).toBeVisible()
})

/*
 * Named, and the only thing on the page: it used to announce as "dialog", leave
 * the keyboard on the board it had just declared dead, and let Tab wander into
 * the rail behind the scrim.
 */
test('is named, takes the keyboard to Keep a copy, and holds it', async ({ page }) => {
  await signedIn(page, [])
  const deleteTheBoard = await roomThatCanBeDeleted(page)
  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await deleteTheBoard()

  const gate = page.getByRole('alertdialog', { name: 'This board was deleted' })
  await expect(gate).toBeVisible()
  await expect(gate).toHaveAccessibleDescription(/removed it while you had it open/)
  await expect(page.getByTestId('board-gone-keep')).toBeFocused()

  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Tab')
    const inside = await page.evaluate(
      () => document.activeElement?.closest('[data-testid="board-gone"]') !== null,
    )
    expect(inside).toBe(true)
  }
})

/**
 * And it does not leave its document and CRDT behind in this browser.
 *
 * THE FIRST VERSION OF THIS TEST ASSERTED THE WRONG THING. It checked that no
 * row appeared in the board list, on the reasoning that a cached board with no
 * remote row is what the list calls "this browser" — and it passed with the
 * forgetting deleted, because `listAllBoards` already drops room-board ids
 * from that section. The phantom row cannot arrive by this route at all.
 *
 * What the forgetting really prevents is storage: a deleted board's document
 * and stored CRDT sitting in IndexedDB for the life of the profile. So that is
 * what this reads, directly.
 */
test('drops the local copy of a board that was deleted under you', async ({ page }) => {
  await signedIn(page, [])
  const deleteTheBoard = await roomThatCanBeDeleted(page)

  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await page.waitForSelector('[data-testid="status-bar"]')

  // A board with something in it, WRITTEN. Autosave coalesces, so the document
  // on screen is routinely ahead of the one on disk; flushing is what makes
  // this a local copy that exists rather than one still pending.
  await page.keyboard.press('s')
  await page.locator('[data-testid="canvas"]').click({ position: { x: 200, y: 200 } })
  await expect(page.locator('[data-object-id]')).toHaveCount(1)
  await page.evaluate(async () => {
    await (
      window as unknown as { __openframe: { runtime: { flush: () => Promise<void> } } }
    ).__openframe.runtime.flush()
  })

  // There is something to forget. Without this the test could pass against a
  // board that was never stored in the first place.
  await expect.poll(() => storedBoards(page)).toContain(BOARD)

  await deleteTheBoard()
  await expect(page.getByTestId('board-gone')).toBeVisible()

  await expect.poll(() => storedBoards(page)).not.toContain(BOARD)
  await expect.poll(() => storedCrdt(page)).not.toContain(BOARD)
})

/*
 * What was on screen when it went is still on screen, and it is the last copy
 * anybody has. "All boards" alone meant walking away from it.
 */
test('keeps a copy of what was on screen as a board of your own', async ({ page }) => {
  await signedIn(page, [])
  const deleteTheBoard = await roomThatCanBeDeleted(page)
  await page.goto(`/?room=${BOARD}&k=${KEY}`)
  await page.waitForSelector('[data-testid="status-bar"]')

  await page.keyboard.press('s')
  await page.locator('[data-testid="canvas"]').click({ position: { x: 300, y: 260 } })
  await expect(page.locator('[contenteditable="true"]')).toBeFocused()
  await page.keyboard.type('Last words')
  await page.keyboard.press('Escape')
  await page.keyboard.press('Escape')

  await deleteTheBoard()
  await page.getByRole('button', { name: 'Keep a copy' }).click()

  await expect(page).toHaveURL(/[?&]board=/)
  await expect(page.getByTestId('board-gone')).toHaveCount(0)
  await expect(page.locator('[data-object-type="sticky"]')).toHaveText('Last words')
  // A board of its own, not the deleted one come back.
  expect(page.url()).not.toContain(BOARD)
  await expect.poll(() => storedBoards(page)).not.toContain(BOARD)
})

/** The board ids this browser is holding documents for. */
async function storedBoards(page: Page): Promise<string[]> {
  return readStore(page, 'boards')
}

/** The board ids this browser is holding CRDT state for. */
async function storedCrdt(page: Page): Promise<string[]> {
  return readStore(page, 'crdt')
}

function readStore(page: Page, store: string): Promise<string[]> {
  return page.evaluate(async (name: string) => {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      // No version: opening at the current one never triggers an upgrade, so
      // this cannot race the application's own connection.
      const request = indexedDB.open('openframe')
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(new Error('could not open'))
    })
    if (!db.objectStoreNames.contains(name)) return []
    return new Promise<string[]>((resolve, reject) => {
      const request = db.transaction(name, 'readonly').objectStore(name).getAllKeys()
      request.onsuccess = () => resolve(request.result.map(String))
      request.onerror = () => reject(new Error('could not read'))
    })
  }, store)
}
