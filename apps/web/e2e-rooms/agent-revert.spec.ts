import { openBoard, READ_TOOLS, toolContext, WRITE_TOOLS, type BoardPeer } from '@openframe/mcp'
import { asBoardId } from '@openframe/core'
import { expect, test, type Page } from '@playwright/test'
import { join, newRoomId } from './rooms.js'

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
    await expect(toast).toContainText('Ada’s agent: Create 3 objects')
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

    const button = page.getByTestId('inbox')
    await expect(button).toHaveAccessibleName('Inbox, 1 new')
    await button.click()
    await expect(
      page.getByRole('dialog', { name: 'Inbox' }).getByRole('heading', { name: 'Agent changes' }),
    ).toBeVisible()
    // The count is said once: "Create 3 objects", not "… · 3 objects" again below it.
    await expect(page.getByTestId('agent-changes-list')).toContainText('Create 3 objects')
    await expect(page.getByTestId('agent-changes-list')).not.toContainText('· 3 objects')
    const revert = page.getByTestId('agent-change-revert')
    await expect(revert).toBeFocused()
    await revert.click()

    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toEqual([])
    await expect(page.getByTestId('agent-changes-list')).toContainText('Taken back')
    await expect(button).toHaveAccessibleName('Inbox, nothing new')

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

    /*
     * And it is on offer again. The log kept saying "taken back" while the
     * change was on the board (Codex, on #16): Revert was hidden, and the
     * agent refused it as already reverted.
     */
    const button = page.getByTestId('inbox')
    await expect(button).toHaveAccessibleName('Inbox, 1 new')
    await button.click()
    await expect(page.getByTestId('agent-change-revert')).toBeVisible()
    await expect
      .poll(async () => (await changesSeenBy(agent))[0]?.reverted ?? null, { timeout: 20_000 })
      .toBeNull()

    // Redo takes it back again, and says so again.
    await page.keyboard.press('Escape')
    await page.getByTestId('canvas').focus()
    await page.keyboard.press('ControlOrMeta+Shift+z')
    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toEqual([])
    await expect(button).toHaveAccessibleName('Inbox, nothing new')
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
    await page.getByTestId('inbox').click()
    await expect(page.getByTestId(`agent-change-${String(id)}`)).toContainText('Taken back by Ada')
  } finally {
    await agent.context.close()
  }
})

/*
 * A browser that has never held this board starts from an empty log, and the
 * whole of it arrives in the room's first sync. Read as news, that toasted the
 * newest OLD change to everybody opening the board (Codex, on #16).
 */
test('somebody opening the board later is not told about old changes as news', async ({
  browser,
}) => {
  const room = newRoomId()
  const first = await join(browser, room)
  const agent = agentOn(room)
  try {
    await threeNotes(agent, first)
    await expect(first.getByTestId('toast')).toBeVisible()

    const later = await join(browser, room)
    await expect.poll(() => idsIn(later), { timeout: 20_000 }).toHaveLength(3)
    await expect(later.getByTestId('inbox')).toHaveAccessibleName('Inbox, 1 new')
    await expect(later.getByTestId('toast')).toHaveCount(0)
  } finally {
    await agent.context.close()
  }
})

const typesIn = (page: Page): Promise<string[]> =>
  page.evaluate(() =>
    [
      ...(window as unknown as DebugWindow).__openframe.runtime.store
        .getDocument()
        .objects.values(),
    ].map((object) => object.type),
  )

/**
 * The edits that are several changes to the document and one thing to a
 * person, done by an agent: a group arrives as ONE change, reads in the
 * person's own words, and one Revert frees the notes again.
 */
test('an agent groups two notes, and one Revert frees them', async ({ browser }) => {
  const room = newRoomId()
  const page = await join(browser, room)
  const agent = agentOn(room)
  try {
    const made = await agent.call('create_objects', {
      objects: [0, 300].map((x) => ({ type: 'sticky', x, y: 0 })),
    })
    const notes = (JSON.parse(made.text.slice(made.text.indexOf('{'))) as { objects: string[] })
      .objects
    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toHaveLength(2)
    await page.getByTestId('toast').getByRole('button', { name: 'Dismiss' }).click()

    await agent.call('group_objects', { ids: notes })
    await expect
      .poll(async () => (await typesIn(page)).sort(), { timeout: 20_000 })
      .toEqual(['group', 'sticky', 'sticky'])

    const toast = page.getByTestId('toast')
    await expect(toast).toContainText('Ada’s agent: Group')
    await toast.getByTestId('toast-action').click()

    await expect.poll(() => typesIn(page), { timeout: 20_000 }).toEqual(['sticky', 'sticky'])
  } finally {
    await agent.context.close()
  }
})

/*
 * Looked at is read. An agent change stayed "new" in the inbox for as long as
 * it was on the board, so the count never went away once anybody's agent had
 * done anything at all. Opening the inbox and closing it reads what was in
 * it, in this browser; the change is still there, and still revertible.
 */
test('an agent change seen in the inbox is no longer new, after a reload too', async ({
  browser,
}) => {
  const room = newRoomId()
  const page = await join(browser, room)
  const agent = agentOn(room)
  try {
    await threeNotes(agent, page)
    await page.getByTestId('toast').getByRole('button', { name: 'Dismiss' }).click()
    const inbox = page.getByTestId('inbox')
    await expect(inbox).toHaveAccessibleName('Inbox, 1 new')

    await inbox.click()
    await expect(page.getByTestId('agent-changes-list').locator('li')).toHaveAttribute(
      'data-unread',
      'true',
    )
    await page.keyboard.press('Escape')
    await expect(inbox).toHaveAccessibleName('Inbox, nothing new')

    await page.reload()
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-room', 'connected', {
      timeout: 20_000,
    })
    await expect(inbox).toHaveAccessibleName('Inbox, nothing new')
    await inbox.click()
    await expect(page.getByTestId('agent-change-revert')).toBeVisible()
    await expect(page.getByTestId('agent-changes-list').locator('li')).toHaveAttribute(
      'data-unread',
      'false',
    )
  } finally {
    await agent.context.close()
  }
})

test('a frame the agent made is taken back from the board, though nobody touched it', async ({
  browser,
}) => {
  const room = newRoomId()
  const page = await join(browser, room)
  const agent = agentOn(room)
  try {
    await threeNotes(agent, page)
    const [moved, gone, alsoGone] = await idsIn(page)
    await agent.call('move_objects', { moves: [{ id: moved, x: 40, y: 600 }] })
    await agent.call('delete_objects', { ids: [gone, alsoGone] })
    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toHaveLength(1)
    await agent.call('create_frame', { name: 'Findings', x: 0, y: 900, width: 400, height: 300 })
    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toHaveLength(2)

    await page.getByTestId('toast').getByRole('button', { name: 'Dismiss' }).click()
    // Opening the frame's name and leaving it unchanged is not touching it.
    await page.getByTestId('frame-title').dblclick()
    await expect(page.getByRole('textbox', { name: 'Rename frame' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('textbox', { name: 'Rename frame' })).toHaveCount(0)
    await page.getByTestId('inbox').focus()
    await page.keyboard.press('Enter')
    await page.getByRole('button', { name: 'Revert “Make a frame”' }).press('Space')

    await expect.poll(() => idsIn(page), { timeout: 20_000 }).toEqual([moved])
    await expect(page.getByTestId('board-announcer')).toContainText('Reverted')
  } finally {
    await agent.context.close()
  }
})
