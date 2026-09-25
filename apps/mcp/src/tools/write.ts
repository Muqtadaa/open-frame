import { asBoardId, asObjectId, createIdGenerator, type Command, type ObjectId } from '@openframe/core'
import { z } from 'zod'

import type { BoardPeer } from '../board.js'
import {
  boardArgument,
  isResponse,
  NO_SUCH_BOARD,
  NOT_SIGNED_IN,
  onBoard,
  type ToolDefinition,
} from './definition.js'
import { data, problem, type ToolResponse } from './respond.js'
import type { ToolContext } from './context.js'

/**
 * What an agent may change, and the one way it changes it.
 *
 * Every tool here builds `Command[]` and hands them to
 * `CommandDispatcher.transact`. There is no second path and there must not be
 * (rule 3): the dispatcher is where validation, authorization, the origin
 * stamp and undo live, and a tool that wrote to the document directly would
 * skip all four — on a board other people are looking at.
 *
 * **One tool call is one undo entry.** An agent that rearranges twenty notes
 * must be revertible in one press, not twenty, so even a tool that issues two
 * commands — a frame and the reparenting of what goes in it — issues them as
 * one transaction. `write.test.ts` proves it the only way that means anything:
 * by undoing once and looking at the board.
 *
 * **A viewer is refused here as well as by the room.** The room re-authorizes
 * every write and would drop these bytes regardless, and the dispatcher's own
 * capability check would refuse them before that — but an agent told "denied"
 * by the tool it called learns something it can act on, where one told nothing
 * and left watching an unchanged board tries again.
 */

/** Ids for objects a later command in the same transaction has to name. */
const ids = createIdGenerator()

/** Every write tool needs `edit`, so the need is written once rather than seven times. */
const onBoardEditing = (
  input: unknown,
  context: ToolContext,
  shape: z.ZodRawShape,
): ReturnType<typeof onBoard> => onBoard(input, context, shape, 'edit')

/**
 * One transaction, one undo entry, and an answer the agent can check.
 *
 * The result is the DISPATCHER's, including its refusal: a handler that
 * rejected an object it could not validate says so here rather than being
 * reported as a success that quietly changed nothing.
 */
function commit(
  peer: BoardPeer,
  label: string,
  commands: readonly Command[],
  also: Record<string, unknown> = {},
): ToolResponse {
  const result = peer.dispatcher.transact(label, commands, { origin: 'mcp' })
  if (!result.ok) return problem(`The board refused that: ${result.error.message}`)
  return data({
    board: { id: peer.boardId, title: peer.store.getDocument().meta.title },
    did: label,
    // What it touched, so the next call can name the objects this one made
    // without reading the whole board back.
    objects: result.affected,
    // One press to put it back, whatever this changed.
    undo: 'This was one change; undoing once in OpenFrame reverses all of it.',
    ...also,
  })
}

const point = { x: z.number().finite(), y: z.number().finite() }

const createArguments = {
  ...boardArgument,
  objects: z
    .array(
      z.object({
        type: z.string().describe('A type this build knows: sticky, text, shape, evidence, …'),
        ...point,
        width: z.number().positive().optional(),
        height: z.number().positive().optional(),
        parentId: z.string().optional().describe('A frame or group to put it in.'),
        /*
         * `data` is whatever the TYPE says it is, and the type validates it —
         * which is why this is a passthrough rather than a shape enumerated
         * here. A schema in this file would be a second answer to what a
         * sticky holds, and it would be the stale one (rule 21).
         */
        data: z.record(z.string(), z.unknown()).optional(),
        style: z.record(z.string(), z.unknown()).optional(),
      }),
    )
    .min(1)
    .max(200),
}

export const createObjects: ToolDefinition = {
  name: 'create_objects',
  title: 'Create objects',
  writes: true,
  description:
    'Put objects on a board — notes, text, shapes, evidence, anything this build has a type ' +
    'for. One call is one undo entry however many objects it makes. `get_board` says which ' +
    'types a board already uses; `data` is whatever that type holds.',
  input: createArguments,
  run: async (input, context) => {
    const opened = await onBoardEditing(input, context, createArguments)
    if (isResponse(opened)) return opened
    const asked = opened.input as {
      objects: {
        type: string
        x: number
        y: number
        width?: number
        height?: number
        parentId?: string
        data?: Record<string, unknown>
        style?: Record<string, unknown>
      }[]
    }

    return commit(opened.peer, `Create ${String(asked.objects.length)} object(s)`, [
      {
        kind: 'CreateObjects',
        objects: asked.objects.map((object) => ({
          type: object.type,
          x: object.x,
          y: object.y,
          ...(object.width === undefined ? {} : { width: object.width }),
          ...(object.height === undefined ? {} : { height: object.height }),
          ...(object.parentId === undefined ? {} : { parentId: asObjectId(object.parentId) }),
          ...(object.data === undefined ? {} : { data: object.data }),
          ...(object.style === undefined ? {} : { style: object.style }),
        })),
      },
    ])
  },
}

const updateArguments = {
  ...boardArgument,
  id: z.string().describe('The object to change, as `get_objects` gives it.'),
  data: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Fields to change on the object itself. Merged, so leave out what stays.'),
  style: z.record(z.string(), z.unknown()).optional().describe('Colour, size and the rest.'),
}

export const updateObject: ToolDefinition = {
  name: 'update_object',
  title: 'Change an object',
  writes: true,
  description:
    'Change what an object says or how it looks. `data` is merged, so pass only what changes. ' +
    'Both together are one undo entry.',
  input: updateArguments,
  run: async (input, context) => {
    const opened = await onBoardEditing(input, context, updateArguments)
    if (isResponse(opened)) return opened
    const asked = opened.input as {
      id: string
      data?: Record<string, unknown>
      style?: Record<string, unknown>
    }
    if (asked.data === undefined && asked.style === undefined) {
      return problem('Nothing to change: pass `data`, `style`, or both.')
    }

    const id = asObjectId(asked.id)
    const commands: Command[] = []
    if (asked.data !== undefined) commands.push({ kind: 'UpdateObjectData', id, patch: asked.data })
    if (asked.style !== undefined) {
      commands.push({ kind: 'UpdateStyle', ids: [id], style: asked.style })
    }
    return commit(opened.peer, 'Change an object', commands)
  },
}

const moveArguments = {
  ...boardArgument,
  moves: z
    .array(z.object({ id: z.string(), ...point }))
    .min(1)
    .max(500)
    .describe('Where each object goes, in board coordinates — the same numbers `get_objects` gives.'),
}

export const moveObjects: ToolDefinition = {
  name: 'move_objects',
  title: 'Move objects',
  writes: true,
  description:
    'Put objects at given positions on the board. Coordinates are absolute — the `at` that ' +
    '`get_objects` reports — and one call is one undo entry however many objects move.',
  input: moveArguments,
  run: async (input, context) => {
    const opened = await onBoardEditing(input, context, moveArguments)
    if (isResponse(opened)) return opened
    const asked = opened.input as { moves: { id: string; x: number; y: number }[] }
    const document = opened.peer.store.getDocument()

    /*
     * Absolute in, deltas out. The command is a delta because a drag is one —
     * and an agent reads coordinates rather than feeling them, so asking it to
     * subtract would be asking it to re-derive a number it already has, from a
     * board that may have moved under it since.
     */
    const moves: { id: ObjectId; dx: number; dy: number }[] = []
    const missing: string[] = []
    for (const move of asked.moves) {
      const object = document.objects.get(asObjectId(move.id))
      if (object === undefined) {
        missing.push(move.id)
        continue
      }
      moves.push({
        id: object.id,
        dx: move.x - object.frame.x,
        dy: move.y - object.frame.y,
      })
    }
    if (moves.length === 0) return problem(`Nothing to move: no such object as ${missing.join(', ')}`)

    return commit(
      opened.peer,
      `Move ${String(moves.length)} object(s)`,
      [{ kind: 'MoveObjects', moves }],
      // Said rather than silently skipped: an agent that asked for six and got
      // five would otherwise have to diff the lists to find out which.
      missing.length === 0 ? {} : { missing },
    )
  },
}

const deleteArguments = {
  ...boardArgument,
  ids: z.array(z.string()).min(1).max(500),
}

export const deleteObjects: ToolDefinition = {
  name: 'delete_objects',
  title: 'Delete objects',
  writes: true,
  destructive: true,
  description:
    'Remove objects from a board. Deleting a frame or a group deletes what is inside it. ' +
    'One call is one undo entry, so this is reversible in one press.',
  input: deleteArguments,
  run: async (input, context) => {
    const opened = await onBoardEditing(input, context, deleteArguments)
    if (isResponse(opened)) return opened
    const asked = opened.input as { ids: string[] }
    return commit(opened.peer, `Delete ${String(asked.ids.length)} object(s)`, [
      { kind: 'DeleteObjects', ids: asked.ids.map((id) => asObjectId(id)) },
    ])
  },
}

const endpoint = z.union([
  z.object({ objectId: z.string().describe('Attach to this object.') }),
  z.object(point).describe('A free point in board coordinates.'),
])

const connectorArguments = {
  ...boardArgument,
  from: endpoint,
  to: endpoint,
  routing: z.enum(['straight', 'orthogonal', 'curved']).optional(),
  text: z.string().max(200).optional().describe('A label on the line.'),
  endArrow: z.enum(['none', 'arrow', 'triangle', 'dot', 'diamond', 'semicircle', 'bar']).optional(),
  startArrow: z
    .enum(['none', 'arrow', 'triangle', 'dot', 'diamond', 'semicircle', 'bar'])
    .optional(),
}

export const createConnector: ToolDefinition = {
  name: 'create_connector',
  title: 'Join two things with a line',
  writes: true,
  description:
    'Draw a connector between two objects, or between points. An end attached to an object ' +
    'follows it when it moves and picks its own side of it; `routing` is straight, orthogonal ' +
    'or curved.',
  input: connectorArguments,
  run: async (input, context) => {
    const opened = await onBoardEditing(input, context, connectorArguments)
    if (isResponse(opened)) return opened
    const asked = opened.input as {
      from: { objectId?: string; x?: number; y?: number }
      to: { objectId?: string; x?: number; y?: number }
      routing?: string
      text?: string
      startArrow?: string
      endArrow?: string
    }

    const end = (spec: { objectId?: string; x?: number; y?: number }): Record<string, unknown> =>
      spec.objectId === undefined
        ? { kind: 'point', x: spec.x, y: spec.y }
        : // `auto` because where a line meets a shape is the type's decision,
          // not the caller's: it picks the side that suits the route and keeps
          // picking as the objects move.
          { kind: 'object', objectId: spec.objectId, anchor: { kind: 'auto' } }

    return commit(opened.peer, 'Join two objects', [
      {
        kind: 'CreateObjects',
        objects: [
          {
            type: 'connector',
            // A connector has no meaningful frame of its own — its extent
            // comes from its ends (rule 16) — so this is a placeholder the
            // type ignores.
            x: 0,
            y: 0,
            data: {
              from: end(asked.from),
              to: end(asked.to),
              routing: asked.routing ?? 'straight',
              points: [],
              startArrow: asked.startArrow ?? 'none',
              endArrow: asked.endArrow ?? 'arrow',
              // A label is rich text (ADR 0014); an agent names it in words.
              text: [{ text: asked.text ?? '' }],
              label: null,
            },
          },
        ],
      },
    ])
  },
}

const frameArguments = {
  ...boardArgument,
  name: z.string().max(120).describe('What the frame is called.'),
  ...point,
  width: z.number().positive(),
  height: z.number().positive(),
  contains: z
    .array(z.string())
    .max(500)
    .optional()
    .describe('Objects to put inside it. They keep their positions.'),
}

export const createFrame: ToolDefinition = {
  name: 'create_frame',
  title: 'Make a frame',
  writes: true,
  description:
    'A named region that holds other objects — a column on a board, a section of a map. ' +
    'Pass `contains` to put objects in it as part of the same change.',
  input: frameArguments,
  run: async (input, context) => {
    const opened = await onBoardEditing(input, context, frameArguments)
    if (isResponse(opened)) return opened
    const asked = opened.input as {
      name: string
      x: number
      y: number
      width: number
      height: number
      contains?: string[]
    }

    /*
     * The id is minted HERE because the second command has to name the first
     * command's object, and a transaction cannot wait to be told. That is what
     * `NewObjectSpec.id` is for, and it is the same thing grouping does.
     */
    const id = ids.objectId()
    const commands: Command[] = [
      {
        kind: 'CreateObjects',
        objects: [
          {
            type: 'frame',
            id,
            x: asked.x,
            y: asked.y,
            width: asked.width,
            height: asked.height,
            data: { name: asked.name },
          },
        ],
      },
    ]
    if (asked.contains !== undefined && asked.contains.length > 0) {
      commands.push({
        kind: 'ReparentObjects',
        ids: asked.contains.map((child) => asObjectId(child)),
        parentId: id,
      })
    }

    // One entry for both: undoing a frame that swallowed six notes must give
    // back the six notes as well as remove the frame.
    return commit(opened.peer, 'Make a frame', commands)
  },
}

const commentArguments = {
  ...boardArgument,
  body: z.string().min(1).max(4000),
  objectId: z.string().optional().describe('Pin it to this object.'),
  x: z.number().finite().optional().describe('Or drop the pin here, in board coordinates.'),
  y: z.number().finite().optional(),
}

export const addComment: ToolDefinition = {
  name: 'add_comment',
  title: 'Say something on a board',
  writes: true,
  description:
    'Leave a comment, on an object or at a point. Comments are a discussion beside the board ' +
    'rather than part of it: they are not in undo and do not move the objects.',
  input: commentArguments,
  run: async (input, context) => {
    const parsed = z.object(commentArguments).safeParse(input)
    if (!parsed.success) return problem(`That is not a valid request: ${parsed.error.message}`)
    if (context.account === null) return problem(NOT_SIGNED_IN)

    const asked = parsed.data as {
      board: string
      body: string
      objectId?: string
      x?: number
      y?: number
    }
    /*
     * No `role` check, and deliberately not: commenting is what a viewer MAY
     * do — `readOnlyCapabilities` has granted `comment` since phase 1 — and
     * the database decides it for an agent by the same policy it decides it
     * for a person. This tool does not open the room at all, because a comment
     * never enters the document.
     */
    const known = await context.account.board(asBoardId(asked.board))
    if (known === null) return problem(NO_SUCH_BOARD)

    const id = await context.account.comment({
      boardId: known.boardId,
      body: asked.body,
      ...(asked.x === undefined || asked.y === undefined ? {} : { at: { x: asked.x, y: asked.y } }),
      ...(asked.objectId === undefined ? {} : { objectId: asked.objectId }),
      // The middle of whatever it is pinned to, which is where a person
      // dropping a pin on an object without aiming would put it.
      ...(asked.objectId === undefined ? {} : { on: { fx: 0.5, fy: 0.5 } }),
    })
    if (id === null) return problem('The board refused that comment.')

    return data({ board: { id: known.boardId, title: known.title }, comment: { id } })
  },
}

export const WRITE_TOOLS: readonly ToolDefinition[] = [
  createObjects,
  updateObject,
  moveObjects,
  deleteObjects,
  createConnector,
  createFrame,
  addComment,
]
