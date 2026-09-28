import { openBoard, READ_TOOLS, toolContext, WRITE_TOOLS, type BoardPeer } from '@openframe/mcp'
import { asBoardId } from '@openframe/core'
import { expect, test, type Browser, type Page } from '@playwright/test'

/**
 * An agent's change, taken back from the board or by the agent (tracks A-2).
 *
 * A person watching an agent work could not take anything it did back: the
 * change arrived with no undo entry, because it was never theirs to undo,
 * and the agent's own undo lived in a process no tool reached. Every agent
 * change is now in the board's change log, where the browser offers Revert as
 * the change lands, lists it afterwards, and the agent can revert it itself —
 * all through the same guarded replay as undo, so what a person wrote since
 * survives.
 */

const ROOM_SERVER = 'ws://127.0.0.1:8787'

interface DebugWindow {
  readonly __openframe: {
    readonly runtime: {
      readonly dispatcher: {
        dispatch(command: unknown): { readonly ok: boolean; readonly error?: { message: string } }
      }
      readonly store: {
        getDocument(): { readonly objects: ReadonlyMap<string, { readonly type: string }> }
      }
    }
  }
}

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

const idsIn = (page: Page): Promise<string[]> =>
  page.evaluate(() => [
    ...(window as unknown as DebugWindow).__openframe.runtime.store.getDocument().objects.keys(),
  ])

/** An agent signed in as Ada, on the room the page is in. */
function agentOn(room: string) {
  const boardId = asBoardId(room)
  const access = { boardId, title: 'Live board', role: 'editor' as const, accessKey: null }
  const opened: BoardPeer[] = []
  const context = toolContext(
    {
      account: { userId: 'agent', email: null, displayName: 'Ada' },
      boards: () => Promise.resolve([access]),
      board: () => Promise.resolve(access),
      comment: () => Promise.resolve(null),
      close: () => undefined,
    },
    {
      open: async () => {
        const peer = await openBoard({ boardId, server: ROOM_SERVER, by: 'Ada' })
        opened.push(peer)
        return peer
      },
    },
  )
  const tool = (name: string) => {
    const found = [...READ_TOOLS, ...WRITE_TOOLS].find((candidate) => candidate.name === name)
    if (found === undefined) throw new Error(`no tool ${name}`)
    return found
  }
  const call = async (name: string, input: Record<string, unknown>) => {
    const answer = await tool(name).run({ board: boardId, ...input }, context)
    expect(answer.isError, answer.text).toBe(false)
    return answer
  }
  return { context, call }
}

/** The board's change log, as `list_changes` tells the agent. */
async function changesSeenBy(
  agent: ReturnType<typeof agentOn>,
): Promise<{ id: string; reverted: { by: string | null } | null }[]> {
  const answer = await agent.call('list_changes', {})
  const payload = JSON.parse(answer.text.slice(answer.text.indexOf('{'))) as {
    changes: { id: string; reverted: { by: string | null } | null }[]
  }
  return payload.changes
}

async function threeNotes(agent: ReturnType<typeof agentOn>, page: Page): Promise<void> {
  await agent.call('create_objects', {
    objects: [0, 300, 600].map((x) => ({ type: 'sticky', x, y: 0 })),
  })
  await expect.poll(() => idsIn(page), { timeout: 20_000 }).toHaveLength(3)
}

test('the change lands with Revert on it, and Revert takes all of it away', async ({ browser }) => {
  const room = newRoomId()
  const page = await join(browser, room)
  const agent = agentOn(room)
  try {
    await threeNotes(agent, page)

    const toast = page.getByTestId('toast')
    await expect(toast).toContainText('Ada’s agent: Create 3 object(s)')
    await toast.getByTestId('toast-action').click()

    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toEqual([])
    await expect(page.getByTestId('board-announcer')).toContainText('Reverted')

    // Taken back for everyone: the agent is told, by name, who did it.
    await expect
      .poll(async () => (await changesSeenBy(agent))[0]?.reverted?.by, { timeout: 20_000 })
      .toEqual(expect.stringMatching(/\S/))
  } finally {
    await agent.context.close()
  }
})

test('the panel lists it after the toast has gone, and reverts from there', async ({ browser }) => {
  const room = newRoomId()
  const page = await join(browser, room)
  const agent = agentOn(room)
  try {
    await threeNotes(agent, page)
    await page.getByTestId('toast').getByRole('button', { name: 'Dismiss' }).click()

    const button = page.getByTestId('agent-changes-button')
    await expect(button).toHaveText('1 agent change')
    await button.click()
    const revert = page.getByTestId('agent-change-revert')
    await expect(revert).toBeFocused()
    await revert.click()

    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toEqual([])
    await expect(page.getByTestId('agent-changes-list')).toContainText('Taken back')
    await expect(button).toHaveText('Agent changes')

    await page.keyboard.press('Escape')
    await expect(button).toBeFocused()
  } finally {
    await agent.context.close()
  }
})

test('what a person wrote since is kept, and the board says so', async ({ browser }) => {
  const room = newRoomId()
  const page = await join(browser, room)
  const agent = agentOn(room)
  try {
    await threeNotes(agent, page)
    const [first] = await idsIn(page)
    await page.evaluate((id) => {
      const result = (window as unknown as DebugWindow).__openframe.runtime.dispatcher.dispatch({
        kind: 'UpdateObjectData',
        id,
        patch: { text: [{ text: 'mine now' }] },
      })
      if (!result.ok) throw new Error(result.error?.message ?? 'refused')
    }, first)

    await page.getByTestId('toast').getByTestId('toast-action').click()

    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toEqual([first])
    await expect(page.getByTestId('board-announcer')).toContainText('except 1 object changed since')
  } finally {
    await agent.context.close()
  }
})

test('undo after Revert puts the agent’s change back', async ({ browser }) => {
  const room = newRoomId()
  const page = await join(browser, room)
  const agent = agentOn(room)
  try {
    await threeNotes(agent, page)
    await page.getByTestId('toast').getByTestId('toast-action').click()
    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toEqual([])

    await page.getByTestId('canvas').focus()
    await page.keyboard.press('ControlOrMeta+z')
    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toHaveLength(3)
  } finally {
    await agent.context.close()
  }
})

test('the agent reverts its own change, and the browser sees it go', async ({ browser }) => {
  const room = newRoomId()
  const page = await join(browser, room)
  const agent = agentOn(room)
  try {
    await threeNotes(agent, page)
    const id = (await changesSeenBy(agent))[0]?.id
    await agent.call('revert_change', { change: id })

    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toEqual([])
    await page.getByTestId('agent-changes-button').click()
    await expect(page.getByTestId(`agent-change-${String(id)}`)).toContainText('Taken back by Ada')
  } finally {
    await agent.context.close()
  }
})
