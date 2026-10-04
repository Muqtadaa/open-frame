import {
  POLL_OPTION_ID,
  asObjectId,
  type AnyOpenFrameObject,
  type FieldDefinition,
} from '@openframe/core'
import { afterEach, describe, expect, it } from 'vitest'

import { mountOnBoard, type Mounted } from '../test-render.js'
import { RecordFields } from './RecordFields.js'

/**
 * The record panel's two newer kinds: a checkbox, and a list of options whose
 * labels are edited and whose ids never are.
 */
let ui: Mounted | null = null
afterEach(() => {
  ui?.unmount()
  ui = null
})

const poll = (data: Record<string, unknown>): AnyOpenFrameObject =>
  ({ id: asObjectId('obj_poll'), type: 'poll', data }) as unknown as AnyOpenFrameObject

const options = [
  { id: 'o1', label: 'Cats' },
  { id: 'o2', label: 'Dogs' },
]

async function mount(field: FieldDefinition, data: Record<string, unknown>) {
  const writes: Record<string, unknown>[] = []
  ui = await mountOnBoard(
    <RecordFields
      object={poll(data)}
      fields={[field]}
      onCommit={(_id, patch) => {
        writes.push({ ...patch })
      }}
    />,
  )
  return { ui, writes }
}

const choices: FieldDefinition = {
  key: 'options',
  label: 'Options',
  kind: 'choices',
  meaning: 'record',
}

describe('a boolean field', () => {
  it('is a checkbox that writes what it now says', async () => {
    const { ui, writes } = await mount(
      { key: 'closed', label: 'Closed', kind: 'boolean', meaning: 'record' },
      { closed: false },
    )
    const box = ui.container.querySelector<HTMLInputElement>('[data-testid="field-closed"]')
    expect(box?.type).toBe('checkbox')
    expect(box?.checked).toBe(false)
    ui.act(() => {
      box?.click()
    })
    expect(writes).toEqual([{ closed: true }])
  })
})

describe('a choices field', () => {
  it('rewords an option on Enter, keeping its id', async () => {
    const { ui, writes } = await mount(choices, { options })
    const first = ui.container.querySelector<HTMLInputElement>('input[aria-label="Options 1"]')
    if (first === null) throw new Error('no first option')
    ui.type(first, 'Cats, obviously')
    ui.press(first, 'Enter')
    expect(writes).toEqual([
      {
        options: [
          { id: 'o1', label: 'Cats, obviously' },
          { id: 'o2', label: 'Dogs' },
        ],
      },
    ])
  })

  it('puts back an emptied label rather than saving it', async () => {
    const { ui, writes } = await mount(choices, { options })
    const first = ui.container.querySelector<HTMLInputElement>('input[aria-label="Options 1"]')
    if (first === null) throw new Error('no first option')
    ui.type(first, '   ')
    ui.press(first, 'Enter')
    expect(writes).toEqual([])
    expect(first.value).toBe('Cats')
  })

  it('adds an option under an id nothing has used, and removes one', async () => {
    const { ui, writes } = await mount(choices, {
      options: [...options, { id: 'o4', label: 'Birds' }],
    })
    ui.act(() => {
      ui.container.querySelector<HTMLButtonElement>('[data-testid="field-options-add"]')?.click()
    })
    ui.act(() => {
      ui.container.querySelector<HTMLButtonElement>('button[aria-label="Remove Dogs"]')?.click()
    })
    const added = (writes[0]?.options as { id: string; label: string }[]).at(-1)
    expect(added?.label).toBe('Option 4')
    expect(['o1', 'o2', 'o4']).not.toContain(added?.id)
    expect(writes[1]).toEqual({
      options: [
        { id: 'o1', label: 'Cats' },
        { id: 'o4', label: 'Birds' },
      ],
    })
  })

  it('never gives a new option the id of one that was removed', async () => {
    // o3 was removed; its answers are still on the board, uncounted. A new
    // option named o3 would pick them all up.
    const { ui, writes } = await mount(choices, { options })
    ui.act(() => {
      ui.container.querySelector<HTMLButtonElement>('[data-testid="field-options-add"]')?.click()
    })
    const added = (writes[0]?.options as { id: string }[] | undefined)?.at(-1)?.id
    expect(added).toMatch(POLL_OPTION_ID)
    expect(added).not.toBe('o3')
  })

  it('will not go below two options', async () => {
    const { ui } = await mount(choices, { options })
    const remove = ui.container.querySelector<HTMLButtonElement>('button[aria-label="Remove Cats"]')
    expect(remove?.disabled).toBe(true)
  })
})
