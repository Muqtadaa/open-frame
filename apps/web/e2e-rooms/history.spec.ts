import { expect, test, type Browser, type Page } from '@playwright/test'

import { BOARD_URL } from '../e2e/routes.js'
import { inBucket, newRoomId } from './rooms.js'

/**
 * A shared board's earlier versions, taken by a real room (ADR 0019).
 *
 * WHEN a version is due and WHICH are kept is unit-tested in core and in
 * `apps/rooms/src/history.test.ts`. This is the Durable Object doing it: an
 * edit through a real socket sets the alarm, the alarm takes a version into
 * R2, and the room serves it back by the rule an image is served by. The
 * suite's room runs with seconds for minutes (`HISTORY_TIMING` in
 * `playwright.rooms.config.ts`).
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

interface Keys {
  readonly editor: string
  readonly viewer: string
  readonly owner: string
}

interface Listed {
  readonly versions: readonly { readonly id: string; readonly kind: string }[]
}

const ROOMS = 'http://127.0.0.1:8787'

async function claimed(browser: Browser, room: string): Promise<Keys> {
  const opener = await (await browser.newContext()).newPage()
  await opener.goto(BOARD_URL)
  return opener.evaluate(async (url) => {
    const response = await fetch(`${url}/claim`, { method: 'POST' })
    if (!response.ok) throw new Error(`claim failed: ${String(response.status)}`)
    return (await response.json()) as Keys
  }, `${ROOMS}/room/${room}`)
}

async function open(browser: Browser, room: string, key: string): Promise<Page> {
  const page = await (await browser.newContext()).newPage()
  await page.goto(`/?room=${room}&k=${key}`)
  await expect(page.getByTestId('room-status')).toHaveAttribute('data-status', 'connected', {
    timeout: 20_000,
  })
  return page
}

async function addNote(page: Page, text: string): Promise<void> {
  await page.evaluate((words) => {
    const result = (window as unknown as DebugWindow).__openframe.runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 300, y: 200, data: { text: [{ text: words }] } }],
    })
    if (!result.ok) throw new Error(result.error?.message ?? 'the command was refused')
  }, text)
}

/** The room's list of versions, as `key` sees it: the status, and the list on a 200. */
function list(page: Page, room: string, key: string | null): Promise<[number, Listed | null]> {
  return page.evaluate(
    async ({ url, key }) => {
      const response = await fetch(`${url}/versions`, {
        headers: key === null ? {} : { 'x-openframe-key': key },
        cache: 'no-store',
      })
      return [response.status, response.ok ? ((await response.json()) as Listed) : null] as [
        number,
        Listed | null,
      ]
    },
    { url: `${ROOMS}/room/${room}`, key },
  )
}

/** One version, opened as a client would: gunzipped, then read as text. */
function versionText(page: Page, room: string, key: string, id: string): Promise<string> {
  return page.evaluate(
    async ({ url, key }) => {
      const response = await fetch(url, { headers: { 'x-openframe-key': key } })
      if (!response.ok) throw new Error(`version read failed: ${String(response.status)}`)
      const body = response.body
      if (body === null) throw new Error('a version with no body')
      const opened = body.pipeThrough(new DecompressionStream('gzip'))
      // Yjs writes a plain value's strings as UTF-8, so the note's words are
      // in the bytes as written.
      return new TextDecoder('utf-8', { fatal: false }).decode(
        await new Response(opened).arrayBuffer(),
      )
    },
    { url: `${ROOMS}/room/${room}/versions/${id}`, key },
  )
}

test('an edit to a shared board is kept as a version once it settles', async ({ browser }) => {
  const room = newRoomId()
  const keys = await claimed(browser, room)
  const editor = await open(browser, room, keys.editor)

  // Nothing yet: a board nobody has changed has no history.
  expect(await list(editor, room, keys.viewer)).toEqual([200, { versions: [] }])

  await addNote(editor, 'Kept for later')

  await expect
    .poll(async () => (await list(editor, room, keys.viewer))[1]?.versions.length ?? 0, {
      timeout: 20_000,
    })
    .toBe(1)
  const [, listed] = await list(editor, room, keys.viewer)
  const version = listed?.versions[0]
  expect(version?.kind).toBe('auto')

  // A viewer may read it — anyone who can open the board may see what it was.
  expect(await versionText(editor, room, keys.viewer, version?.id ?? '')).toContain(
    'Kept for later',
  )
  // And nobody else may: the same answer as for an image.
  expect((await list(editor, room, null))[0]).toBe(403)
  expect((await list(editor, room, 'x'.repeat(32)))[0]).toBe(403)

  // The bytes are in the bucket under the board's prefix, so the sweep that
  // deletes a board's images when it is destroyed takes its history too.
  const key = `${room}/versions/${version?.id ?? ''}`
  expect(await inBucket(key)).toBe(true)
  const destroyed = await editor.evaluate(
    async ({ url, owner }) =>
      (
        await fetch(`${url}/destroy`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ key: owner }),
        })
      ).status,
    { url: `${ROOMS}/room/${room}`, owner: keys.owner },
  )
  expect(destroyed).toBe(200)
  expect(await inBucket(key)).toBe(false)
  expect((await list(editor, room, keys.viewer))[0]).toBe(410)
})

/*
 * The history panel on a shared board: the editor's restore is an edit like
 * any other, so it reaches everybody in the room; a viewer may look back but
 * is never offered the restore.
 */
test('an editor restores a version for everyone, and a viewer can only look', async ({
  browser,
}) => {
  const room = newRoomId()
  const keys = await claimed(browser, room)
  const editor = await open(browser, room, keys.editor)
  const viewer = await open(browser, room, keys.viewer)

  await addNote(editor, 'Kept for later')
  await expect
    .poll(async () => (await list(editor, room, keys.viewer))[1]?.versions.length ?? 0, {
      timeout: 20_000,
    })
    .toBeGreaterThan(0)
  await addNote(editor, 'Written since')
  await expect(viewer.getByTestId('canvas')).toContainText('Written since')

  // The viewer looks back, and is offered no restore.
  await viewer.getByTestId('history-button').click()
  await viewer.getByTestId('history-version').last().click()
  await expect(viewer.getByTestId('version-preview')).toBeVisible()
  await expect(viewer.getByTestId('version-restore')).toHaveCount(0)
  await expect(viewer.getByTestId('canvas')).not.toContainText('Written since')
  await viewer.getByTestId('version-back').click()

  // The oldest version is the one with only the first note on it.
  await editor.getByTestId('history-button').click()
  await editor.getByTestId('history-version').last().click()
  await editor.getByTestId('version-restore').click()
  await expect(editor.getByTestId('version-preview')).toHaveCount(0)

  for (const page of [editor, viewer]) {
    await expect(page.getByTestId('canvas')).toContainText('Kept for later')
    await expect(page.getByTestId('canvas')).not.toContainText('Written since')
  }
})
