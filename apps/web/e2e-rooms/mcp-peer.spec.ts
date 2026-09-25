import { openBoard, toolContext, WRITE_TOOLS, type BoardPeer } from '@openframe/mcp'
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

/**
 * The tools, over a real socket, with somebody watching.
 *
 * Stage 4's "proves", and the half that cannot be checked in one process: that
 * what a tool dispatches reaches a browser on the same board, that it arrives
 * marked as an agent's work, and that the whole of a call is ONE change —
 * undone in a single press rather than in twenty.
 *
 * The account is a stub, because signing in needs somebody's password and a
 * test must not want one. What it stands in for is stage 2, which is covered
 * against a fake client in `apps/mcp/src/supabase/account.test.ts`; what is
 * real here is everything below it.
 */
test('an agent builds something, and the browser sees one change', async ({ browser }) => {
  const room = newRoomId()
  const boardId = asBoardId(room)
  const page = await join(browser, room)

  const access = { boardId, title: 'Live board', role: 'editor' as const, accessKey: null }
  /*
   * A list rather than a `let`: the peer is assigned inside a closure, and
   * TypeScript does not follow that — it narrows the variable to `null` and
   * then refuses the `undo` below on a type of `never`.
   */
  const opened: BoardPeer[] = []

  const context = toolContext(
    {
      account: { userId: 'agent', email: null, displayName: 'An agent' },
      boards: () => Promise.resolve([access]),
      board: () => Promise.resolve(access),
      comment: () => Promise.resolve(null),
      close: () => undefined,
    },
    {
      open: async () => {
        const peer = await openBoard({ boardId, server: ROOM_SERVER })
        opened.push(peer)
        return peer
      },
    },
  )

  const create = WRITE_TOOLS.find((tool) => tool.name === 'create_objects')
  expect(create).toBeDefined()

  try {
    const answer = await create?.run(
      {
        board: boardId,
        objects: [
          { type: 'sticky', x: 0, y: 0, data: { text: [{ text: 'from the agent' }] } },
          { type: 'sticky', x: 300, y: 0, data: { text: [{ text: 'and another' }] } },
          { type: 'sticky', x: 600, y: 0, data: { text: [{ text: 'and a third' }] } },
        ],
      },
      context,
    )
    expect(answer?.isError, answer?.text).toBe(false)

    // All three, live, marked as an agent's.
    await expect
      .poll(() => objectsIn(page), { timeout: 20_000 })
      .toEqual([
        { type: 'sticky', via: 'mcp' },
        { type: 'sticky', via: 'mcp' },
        { type: 'sticky', via: 'mcp' },
      ])

    /*
     * ONE entry. Three objects arrived as one change, so one undo takes all
     * three away — which is the difference between an agent that can be
     * reversed and one that leaves somebody deleting notes by hand.
     */
    expect(opened).toHaveLength(1)
    opened[0]?.dispatcher.undo()

    await expect.poll(() => objectsIn(page), { timeout: 20_000 }).toEqual([])
  } finally {
    await context.close()
  }
})
