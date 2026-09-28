import {
  asObjectId,
  createSequentialIdGenerator,
  type Command,
  type ObjectId,
} from '@openframe/core'
import { createTestHarness } from '@openframe/core/testing'
import { beforeEach, describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import {
  CHANGE_LOG_LIMIT,
  changesOf,
  clearReverted,
  markReverted,
  readChanges,
} from './change-log.js'
import { CollabSession } from './session.js'

/**
 * The change log: an agent's change, where every peer can take it back
 * (tracks A-2).
 *
 * Only patches crossed the wire. An agent's label, its origin and where one of
 * its changes began and ended stayed in the agent's own process, so a person
 * watching the board had nothing to undo and nothing to point at. The log
 * carries exactly that, in the same Yjs transaction as the change itself — so
 * a peer never holds one without the other.
 */

const WIRE = 'test:wire'

function join(docs: Y.Doc[]): void {
  for (const doc of docs) {
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      if (origin === WIRE) return
      for (const other of docs) if (other !== doc) Y.applyUpdate(other, update, WIRE)
    })
  }
}

function peer(seed: number, by: string, now = (): number => 1_700_000_000_000 + seed) {
  const harness = createTestHarness({ ids: createSequentialIdGenerator(seed) })
  const doc = new Y.Doc()
  const session = CollabSession.join({
    doc,
    dispatcher: harness.dispatcher,
    by,
    now,
    onError: (error) => {
      throw error
    },
  })
  return { ...harness, doc, session }
}

const id = (name: string): ObjectId => asObjectId(`obj_${name}`)
const notes = (...names: string[]): Command => ({
  kind: 'CreateObjects',
  objects: names.map((name, index) => ({ id: id(name), type: 'sticky', x: index * 100, y: 0 })),
})

let agent: ReturnType<typeof peer>
let person: ReturnType<typeof peer>

beforeEach(() => {
  agent = peer(0, 'Ada’s agent')
  person = peer(1000, 'Ada')
  join([agent.doc, person.doc])
})

describe('the change log', () => {
  it('carries an agent’s change to every peer as ONE entry, with what it was', () => {
    const result = agent.dispatcher.transact('Add two notes', [notes('n1', 'n2')], {
      origin: 'mcp',
    })
    if (!result.ok) throw result.error

    const [entry, ...rest] = readChanges(person.doc)
    expect(rest).toHaveLength(0)
    expect(entry).toMatchObject({
      id: result.transactionId,
      label: 'Add two notes',
      origin: 'mcp',
      by: 'Ada’s agent',
      affected: [id('n1'), id('n2')],
      reverted: null,
    })
    expect(entry?.forward).toEqual(result.patches)
    expect(entry?.inverse).toEqual(result.inverse)
  })

  it('does not log a person’s own change, which their undo already covers', () => {
    person.dispatcher.dispatch(notes('mine'))
    agent.dispatcher.dispatch(notes('also-a-person'))
    expect(readChanges(person.doc)).toEqual([])
    expect(readChanges(agent.doc)).toEqual([])
  })

  it('lets the person take the agent’s change back, on every peer, and says who did', () => {
    const result = agent.dispatcher.transact('Add two notes', [notes('n1', 'n2')], {
      origin: 'mcp',
    })
    if (!result.ok) throw result.error
    const [entry] = readChanges(person.doc)
    if (entry === undefined) throw new Error('no entry')

    expect(person.dispatcher.revert(entry).ok).toBe(true)
    expect(markReverted(person.doc, entry.id, 'Ada', 42)).toBe(true)

    for (const side of [agent, person]) {
      expect(side.store.getObject(id('n1'))).toBeUndefined()
      expect(side.store.getObject(id('n2'))).toBeUndefined()
      expect(readChanges(side.doc)[0]?.reverted).toEqual({ at: 42, by: 'Ada' })
    }
  })

  it('keeps the newest entries and lets the oldest go', () => {
    for (let index = 0; index <= CHANGE_LOG_LIMIT; index += 1) {
      const made = agent.dispatcher.transact(
        `Note ${String(index)}`,
        [notes(`n${String(index)}`)],
        {
          origin: 'mcp',
        },
      )
      if (!made.ok) throw made.error
    }
    const labels = readChanges(person.doc).map((entry) => entry.label)
    expect(labels).toHaveLength(CHANGE_LOG_LIMIT)
    expect(labels[0]).toBe(`Note ${String(CHANGE_LOG_LIMIT)}`)
    expect(labels).not.toContain('Note 0')
  })

  it('ignores an entry that is not one, whoever wrote it', () => {
    changesOf(agent.doc).set('txn_hostile', { label: 42, forward: 'everything' })
    changesOf(agent.doc).set('txn_null', null)
    expect(readChanges(person.doc)).toEqual([])
  })

  /*
   * An older client knows `objects` and `meta` and nothing else. The log is
   * its own root map precisely so that such a client relays it and stores it
   * and never turns it into a change to the board.
   */
  it('never becomes a change to the board on a peer that only follows the board', () => {
    const made = agent.dispatcher.transact('Add a note', [notes('n1')], { origin: 'mcp' })
    if (!made.ok) throw made.error
    let dispatched = 0
    person.dispatcher.subscribe(() => {
      dispatched += 1
    })
    expect(markReverted(agent.doc, made.transactionId, 'Ada', 1)).toBe(true)
    changesOf(agent.doc).set('txn_other', { anything: true })
    expect(dispatched).toBe(0)
  })

  /*
   * Each peer stamps `at` with its own clock, and clocks disagree (Codex, on
   * #16). Ordered by `at`, a change from a peer whose clock ran behind was the
   * "oldest" the moment it was written — pruned at once from a full log, its
   * id handed to the agent and then nowhere to be found.
   */
  it('orders and prunes by the log’s own sequence, never by anybody’s clock', () => {
    const behind = peer(5000, 'Slow clock', () => 1)
    join([agent.doc, person.doc, behind.doc])
    for (let index = 0; index < CHANGE_LOG_LIMIT; index += 1) {
      const made = agent.dispatcher.transact(
        `Note ${String(index)}`,
        [notes(`n${String(index)}`)],
        {
          origin: 'mcp',
        },
      )
      if (!made.ok) throw made.error
    }
    const late = behind.dispatcher.transact('From a slow clock', [notes('late')], {
      origin: 'mcp',
    })
    if (!late.ok) throw late.error

    const log = readChanges(person.doc)
    expect(log).toHaveLength(CHANGE_LOG_LIMIT)
    expect(log[0]?.label).toBe('From a slow clock')
    expect(log.map((entry) => entry.label)).not.toContain('Note 0')
  })

  it('can say a revert has itself been undone, for every peer', () => {
    const made = agent.dispatcher.transact('Add a note', [notes('n1')], { origin: 'mcp' })
    if (!made.ok) throw made.error
    expect(markReverted(person.doc, made.transactionId, 'Ada', 1)).toBe(true)
    expect(clearReverted(person.doc, made.transactionId)).toBe(true)
    expect(readChanges(agent.doc)[0]?.reverted).toBeNull()
  })
})
