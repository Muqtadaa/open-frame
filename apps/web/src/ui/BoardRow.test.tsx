import { asBoardId } from '@openframe/core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { ListedBoard } from '../runtime/services.js'
import { mountOnBoard, type Mounted } from '../test-render.js'
import { BoardRow } from './BoardRow.js'

/**
 * Renaming a board from the front door: the row becomes a field on the old
 * name, Enter saves what was typed (trimmed), Escape and an unchanged or empty
 * name save nothing, and a name the server refuses leaves the old one with the
 * reason on the row.
 */
const BOARD: ListedBoard = {
  boardId: asBoardId('board_one'),
  title: 'Discovery',
  updatedAt: 0,
  shared: false,
  role: null,
  accessKey: null,
  viewKey: null,
  ownerKey: null,
  pinned: false,
  openedAt: 0,
  workspaceId: null,
}

let ui: Mounted
let renamed: string[]
let accept: boolean

beforeEach(async () => {
  renamed = []
  accept = true
  ui = await mountOnBoard(
    <ul>
      <BoardRow board={BOARD} index={0} readAt={0} onChanged={() => undefined} />
    </ul>,
    {
      services: (built) => ({
        ...built,
        boards: {
          ...built.boards,
          rename: (_board, title) => {
            renamed.push(title)
            return Promise.resolve(accept)
          },
        },
      }),
    },
  )
})

afterEach(() => {
  ui.unmount()
})

function startRenaming(): HTMLInputElement {
  ui.act(() => {
    ui.container.querySelector<HTMLElement>('[data-testid="rename-board"]')?.click()
  })
  const field = ui.container.querySelector<HTMLInputElement>('[data-testid="rename-input"]')
  if (field === null) throw new Error('no rename field')
  return field
}

describe('renaming a board from its row', () => {
  it('opens on the current name, selected', () => {
    const field = startRenaming()
    expect(field.value).toBe('Discovery')
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 9])
  })

  it('saves the trimmed name on Enter, once', () => {
    const field = startRenaming()
    ui.type(field, '  Pricing study  ')
    ui.press(field, 'Enter')
    expect(renamed).toEqual(['Pricing study'])
    expect(ui.container.querySelector('[data-testid="rename-input"]')).toBeNull()
  })

  it('saves nothing for Escape, an unchanged name, or an empty one', () => {
    let field = startRenaming()
    ui.type(field, 'Something else')
    ui.press(field, 'Escape')

    field = startRenaming()
    expect(field.value).toBe('Discovery')
    ui.press(field, 'Enter')

    field = startRenaming()
    ui.type(field, '   ')
    ui.press(field, 'Enter')

    expect(renamed).toEqual([])
  })

  it('says so on the row when the rename is refused, and keeps the old name', async () => {
    accept = false
    const field = startRenaming()
    ui.type(field, 'Pricing study')
    ui.press(field, 'Enter')
    await ui.settle()

    expect(ui.container.querySelector('[role="alert"]')?.textContent).toBe(
      'That name could not be saved.',
    )
    expect(ui.container.querySelector('[data-testid="board-title-text"]')?.textContent).toBe(
      'Discovery',
    )
  })
})
