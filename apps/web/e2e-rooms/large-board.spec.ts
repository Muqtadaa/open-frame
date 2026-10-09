import { expect, test, type Page } from '@playwright/test'

import { join, newRoomId } from './rooms.js'

/**
 * A board too large for one message, through a real room.
 *
 * Above 4 MiB a message goes in parts (`packages/collab/src/parts.ts`), and the
 * room keeps its board in values under the platform's 2 MB
 * (`apps/rooms/src/document-store.ts`). Both are held in one process by their
 * own tests; this is the same board through workerd's sockets and storage,
 * which is the only place a mistake about either would show.
 */

interface DebugWindow {
  readonly __openframe: {
    readonly runtime: {
      readonly dispatcher: {
        dispatch(command: unknown): { readonly ok: boolean; readonly error?: { message: string } }
      }
      readonly store: { getDocument(): { readonly objects: ReadonlyMap<string, unknown> } }
    }
  }
}

const NOTES = 2000
/** About 3 KB a note: some six megabytes in one change, so it travels in parts. */
const TEXT = 'A long note about what the research found. '.repeat(70)

const count = (page: Page): Promise<number> =>
  page.evaluate(
    () => (window as unknown as DebugWindow).__openframe.runtime.store.getDocument().objects.size,
  )

test('a board of several megabytes is published in one change and opened on another device', async ({
  browser,
}) => {
  test.setTimeout(120_000)
  const room = newRoomId()
  const first = await join(browser, room)
  /*
   * Closed when the test ends, whatever happens. Contexts a test opens itself
   * outlive it, and two pages drawing two thousand notes each starved every
   * spec after this one of the machine — the next share took over 20 seconds.
   */
  const opened = [first.context()]
  try {
    await first.evaluate(
      ({ notes, text }) => {
        const objects = Array.from({ length: notes }, (_, n) => ({
          type: 'sticky',
          x: (n % 50) * 200,
          y: Math.floor(n / 50) * 200,
          data: { text: [{ text: `${String(n)} ${text}` }] },
        }))
        const result = (window as unknown as DebugWindow).__openframe.runtime.dispatcher.dispatch({
          kind: 'CreateObjects',
          objects,
        })
        if (!result.ok) throw new Error(result.error?.message ?? 'the command was refused')
      },
      { notes: NOTES, text: TEXT },
    )
    await expect.poll(() => count(first)).toBe(NOTES)

    // A new device: the whole board arrives from the room, in parts.
    const second = await join(browser, room)
    opened.push(second.context())
    await expect.poll(() => count(second), { timeout: 60_000 }).toBe(NOTES)
  } finally {
    await Promise.all(opened.map((context) => context.close()))
  }
})
