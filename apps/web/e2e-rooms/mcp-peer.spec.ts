import { openBoard } from '@openframe/mcp'
import { asBoardId } from '@openframe/core'
import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * A board changed by a process, seen by a person.
 *
 * This is stage 1's "proves" clause from
 * [phase 5a](../../../docs/phases/phase-5a-mcp-server.md): a Node process joins
 * a room over a real socket, reads the board a browser put there, dispatches
 * one command, and the browser sees it arrive — with no reload, no polling and
 * nothing in `apps/rooms` or `packages/collab` that knows an agent exists.
 *
 * It lives here rather than in `apps/mcp` because this is where the room
 * server runs: `playwright.rooms.config.ts` boots a real workerd Durable
 * Object. Everything below a real socket is covered in one process by
 * `apps/mcp/src/board.test.ts`.
 *
 * `@openframe/mcp` is a devDependency of the web app for this file and this
 * file only. The direction that matters is the other one, and
 * `mcp-does-not-depend-on-the-web-app` holds it.
 */

const ROOM_SERVER = 'ws://127.0.0.1:8787'

interface DebugWindow {
  readonly __openframe: {
    readonly runtime: {
      readonly dispatcher: {
        dispatch(command: unknown): { readonly ok: boolean; readonly error?: { message: string } }
      }
      readonly store: {
        getDocument(): {
          readonly objects: ReadonlyMap<
            string,
            { readonly type: string; readonly meta: { readonly createdVia: string } }
          >
        }
      }
    }
  }
}

/** A fresh room per test: wrangler keeps local Durable Object state on disk. */
function newRoomId(): string {
  return `brd_${Math.random().toString(36).slice(2, 12)}${Date.now().toString(36)}`
}

async function join(browser: Browser, room: string): Promise<Page> {
  const context = await browser.newContext()
  const page = await context.newPage()
  await page.goto(`/?room=${room}`)
  await page.waitForSelector('[data-testid="status-bar"]')
  await expect(page.locator('[data-testid="room-status"]')).toHaveAttribute(
    'data-status',
    'connected',
    { timeout: 20_000 },
  )
  return page
}

/** What the browser holds, as `type` and where each object came from. */
const objectsIn = (page: Page): Promise<{ type: string; via: string }[]> =>
  page.evaluate(() =>
    [
      ...(window as unknown as DebugWindow).__openframe.runtime.store.getDocument().objects.values(),
    ].map((object) => ({ type: object.type, via: object.meta.createdVia })),
  )

test('a headless peer reads the board and writes to it, live', async ({ browser }) => {
  const room = newRoomId()
  const page = await join(browser, room)

  await page.evaluate(() => {
    const result = (window as unknown as DebugWindow).__openframe.runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: [{ type: 'sticky', x: 100, y: 100, data: { text: [{ text: 'from the browser' }] } }],
    })
    if (!result.ok) throw new Error(result.error?.message ?? 'the command was refused')
  })
  await expect.poll(() => objectsIn(page)).toHaveLength(1)

  const peer = await openBoard({ boardId: asBoardId(room), server: ROOM_SERVER })
  try {
    // Read: the board the browser made, in a process with no browser in it.
    expect([...peer.store.getDocument().objects.values()].map((object) => object.type)).toEqual([
      'sticky',
    ])

    // Write: the same dispatcher a click goes through, with its own origin.
    const made = peer.dispatcher.dispatch(
      {
        kind: 'CreateObjects',
        objects: [{ type: 'sticky', x: 400, y: 100, data: { text: [{ text: 'from the agent' }] } }],
      },
      { origin: 'mcp' },
    )
    expect(made.ok, made.ok ? 'made' : made.error.message).toBe(true)

    /*
     * And it arrives on its own. Nothing touches the page between the dispatch
     * and this assertion: no click, no keystroke, no reload — the same bar the
     * live-comments suite holds presence to.
     *
     * `createdVia` is the half that could not be faked by a second write path:
     * the object carries where it came from because the dispatcher stamped it,
     * so an agent's work is distinguishable from a person's on any board it
     * touches.
     */
    await expect
      .poll(() => objectsIn(page), { timeout: 20_000 })
      .toEqual([
        { type: 'sticky', via: 'user' },
        { type: 'sticky', via: 'mcp' },
      ])
  } finally {
    peer.close()
  }
})
