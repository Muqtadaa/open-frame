import {
  CommandDispatcher,
  allowAllCapabilities,
  asBoardId,
  createDefaultRegistry,
  createDocumentStore,
  createEmptyDocument,
  createSequentialIdGenerator,
  fixedClock,
  richFromPlain,
  serializeBoard,
  type ObjectId,
  type ObjectStyle,
  type PersistedBoard,
} from '@openframe/core'

import { snapPoint } from '../src/scene/snapping.js'

/**
 * A board built in Node, for a spec whose subject is not how objects get made.
 *
 * Most specs used to open with a string of tool keys and clicks — press S,
 * click, type, click away, press V — to make the notes the test was actually
 * about. That is several seconds a test, in three engines, and it made every
 * one of those tests fail whenever creation broke. The board is built here
 * with core's own dispatcher instead (rule 3 holds: every object is a
 * command), serialized exactly as the adapter serializes it, and handed to the
 * open page's dev-only `loadBoard` (`seedBoard` in fixtures.ts). Specs about
 * CREATING things keep driving the UI.
 */

export interface Point {
  readonly x: number
  readonly y: number
}

export interface BoardBuilder {
  /**
   * An object of `type` placed where a click at `at` would put it: its default
   * size centred on the point, snapped to the grid — what `createObject` does
   * at the default viewport, where a canvas position and a world position are
   * the same numbers. A spec's existing click coordinates therefore still land
   * on it.
   */
  readonly add: (
    type: string,
    at: Point,
    data?: Record<string, unknown>,
    style?: ObjectStyle,
  ) => ObjectId
  /** A sticky note saying `text`. */
  readonly note: (text: string, at: Point, style?: ObjectStyle) => ObjectId
  /**
   * A connector from one object to another, attached to both. `data` can
   * override either end, to pin it to a side.
   */
  readonly connect: (from: ObjectId, to: ObjectId, data?: Record<string, unknown>) => ObjectId
  /** Somebody else's reaction on a note, as their `ToggleReaction` would leave it. */
  readonly react: (
    target: ObjectId,
    glyph: string,
    by: { key: string; name: string; hue: number },
  ) => void
  /** A round of dot voting, as `StartVoteRound` would leave it. */
  readonly voting: (options: {
    readonly perPerson?: number
    readonly hidden?: boolean
    readonly ids?: readonly ObjectId[]
  }) => ObjectId
  /** Somebody's answer on a poll. */
  readonly answer: (
    poll: ObjectId,
    option: string,
    by: { key: string; name: string; hue: number },
  ) => void
  /** Somebody's dot on a note in the round. */
  readonly vote: (
    round: ObjectId,
    target: ObjectId,
    by: { key: string; name: string; hue: number },
  ) => void
}

export interface BuiltBoard {
  readonly title: string
  readonly payload: PersistedBoard
  /** How many objects the page should draw once it has loaded the board. */
  readonly objects: number
}

/** Fixed, so a seeded board is byte-for-byte the same on every run. */
const SAVED_AT = 1_700_000_000_000

export function buildBoard(make: (board: BoardBuilder) => void, title = 'Untitled'): BuiltBoard {
  const registry = createDefaultRegistry()
  const { store, writer } = createDocumentStore(
    createEmptyDocument(asBoardId('board_local'), title, SAVED_AT),
  )
  const dispatcher = new CommandDispatcher({
    store,
    writer,
    registry,
    clock: fixedClock(SAVED_AT),
    ids: createSequentialIdGenerator(),
    capabilities: allowAllCapabilities,
  })

  const create = (spec: Parameters<typeof dispatcher.dispatch>[0]): ObjectId => {
    const result = dispatcher.dispatch(spec)
    if (!result.ok) throw result.error
    // One object per command, so the one object it touched is the one it made.
    const id = result.affected[0]
    if (id === undefined) throw new Error('the board builder created nothing')
    return id
  }

  const add: BoardBuilder['add'] = (type, at, data, style) => {
    const definition = registry.get(type)
    if (definition === undefined) throw new Error(`no such object type "${type}"`)
    const { frame } = definition.create(data === undefined ? undefined : { ...data })
    const placed = snapPoint({ x: at.x - frame.width / 2, y: at.y - frame.height / 2 })
    return create({
      kind: 'CreateObjects',
      objects: [
        {
          type,
          ...placed,
          width: frame.width,
          height: frame.height,
          ...(data === undefined ? {} : { data }),
          ...(style === undefined ? {} : { style }),
        },
      ],
    })
  }

  make({
    add,
    note: (text, at, style) => add('sticky', at, { text: richFromPlain(text) }, style),
    connect: (from, to, data) =>
      create({
        kind: 'CreateObjects',
        objects: [
          {
            type: 'connector',
            x: 0,
            y: 0,
            // Attached to the bodies, as a line dropped on an object is,
            // unless the spec pins an end to a side.
            data: {
              from: { kind: 'object', objectId: from, anchor: { kind: 'auto' } },
              to: { kind: 'object', objectId: to, anchor: { kind: 'auto' } },
              ...data,
            },
          },
        ],
      }),
    react: (target, glyph, by) => {
      const result = dispatcher.dispatch({ kind: 'ToggleReaction', target, glyph, by })
      if (!result.ok) throw result.error
    },
    voting: ({ perPerson = 3, hidden = false, ids }) =>
      create({
        kind: 'StartVoteRound',
        title: 'Which first?',
        scope: ids === undefined ? { kind: 'board' } : { kind: 'objects', ids },
        perPerson,
        hidden,
        by: { key: 'g_facilitator', name: 'Facilitator', hue: 120 },
      }),
    answer: (poll, option, by) => {
      const result = dispatcher.dispatch({ kind: 'AnswerPoll', poll, option, by })
      if (!result.ok) throw result.error
    },
    vote: (round, target, by) => {
      const result = dispatcher.dispatch({ kind: 'CastDotVote', round, target, by })
      if (!result.ok) throw result.error
    },
  })

  const document = store.getDocument()
  return {
    title,
    payload: serializeBoard(document, SAVED_AT),
    // Only what is DRAWN: a reaction or a relation has no element of its own.
    objects: [...document.objects.values()].filter(
      (object) => registry.get(object.type)?.capabilities.spatial !== false,
    ).length,
  }
}
