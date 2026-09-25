import {
  asBoardId,
  asObjectId,
  groupByParent,
  type AnyOpenFrameObject,
  type BoardDocument,
} from '@openframe/core'
import { z } from 'zod'

import type { BoardPeer } from '../board.js'
import type { ToolContext } from './context.js'
import { data, problem, type ToolResponse } from './respond.js'

/**
 * What an agent may ask about a board.
 *
 * Every one of these is served from `registry.describeObject` — the same seam
 * board search reads, and the reason a type that adds a field is answerable
 * here without a line changing. A tool that reached into `object.data` would
 * be a second answer to "what is this object", and it would be the stale one
 * the first time a type changed (rule 21, one layer out).
 *
 * The payloads carry no access key, no token and no session. `format.ts` holds
 * that line for the terminal; here it is held by the fact that nothing below
 * ever looks at `BoardAccess.accessKey`, and `read.test.ts` checks the whole
 * of every response against a key it planted.
 */

const NOT_SIGNED_IN =
  'Not signed in. Run `openframe login` in a terminal on this machine, then try again.'
const NO_SUCH_BOARD =
  'No such board, or it is not one this account can open. `list_boards` says which are.'

/** Enough to say which board an answer is about, without repeating the board. */
function boardHead(peer: BoardPeer): { id: string; title: string } {
  return { id: peer.boardId, title: peer.store.getDocument().meta.title }
}

function described(peer: BoardPeer, object: AnyOpenFrameObject) {
  const description = peer.registry.describeObject(object)
  return {
    id: object.id,
    type: object.type,
    summary: description.summary,
    fields: description.fields,
    /*
     * The frame as stored, not the bounds. A connector has no meaningful
     * frame and its extent is derived (rule 16) — asking the registry for
     * bounds here would mean an agent's idea of where a line is depends on
     * where the objects it joins are, which is true but is not what a reader
     * of this field expects a number to mean.
     */
    at: { x: object.frame.x, y: object.frame.y },
    size: { width: object.frame.width, height: object.frame.height },
    parentId: object.parentId,
  }
}

function inDocumentOrder(document: BoardDocument): AnyOpenFrameObject[] {
  // The order key is the board's own stacking order, and a stable one: two
  // calls a minute apart page through the same list in the same sequence.
  return [...document.objects.values()].sort((a, b) => a.order.localeCompare(b.order))
}

/**
 * One tool, transport-free.
 *
 * `input` is a Zod SHAPE rather than a schema because that is what the MCP SDK
 * takes for a tool's declared arguments — and validating it here as well is
 * rule 8, not belt and braces: this layer is what stage 5's HTTP transport
 * will call, and a payload that arrived over a network is arbitrary whatever
 * the last layer promised.
 */
export interface ToolDefinition {
  readonly name: string
  readonly title: string
  readonly description: string
  readonly input: z.ZodRawShape
  readonly run: (input: unknown, context: ToolContext) => Promise<ToolResponse>
}

const boardArgument = {
  board: z.string().describe('The board id, as `list_boards` gives it (brd_…).'),
}

/** Resolves the board argument, or says why it could not. */
async function onBoard(
  input: unknown,
  context: ToolContext,
  shape: z.ZodRawShape,
): Promise<{ peer: BoardPeer; input: Record<string, unknown> } | ToolResponse> {
  const parsed = z.object(shape).safeParse(input)
  if (!parsed.success) return problem(`That is not a valid request: ${parsed.error.message}`)
  if (context.account === null) return problem(NOT_SIGNED_IN)

  const asked = parsed.data as { board: string }
  // `asBoardId` at a deserialization boundary, which is what a tool call is:
  // the string arrived from outside and nothing has vouched for it yet.
  const peer = await context.board(asBoardId(asked.board))
  if (peer === null) return problem(NO_SUCH_BOARD)
  return { peer, input: parsed.data }
}

function isResponse(value: unknown): value is ToolResponse {
  return typeof value === 'object' && value !== null && 'text' in value
}

export const listBoards: ToolDefinition = {
  name: 'list_boards',
  title: 'List boards',
  description:
    'The OpenFrame boards this account can open, with what it may do with each. ' +
    'Start here: every other tool takes a board id from this list.',
  input: {},
  run: async (_input, context) => {
    if (context.account === null) return problem(NOT_SIGNED_IN)
    const boards = await context.account.boards()
    return data({
      // The key each row also carries is not here and must never be: it is the
      // whole of a link's authority, and a tool response is a transcript.
      boards: boards.map((board) => ({ id: board.boardId, title: board.title, role: board.role })),
    })
  },
}

export const getBoard: ToolDefinition = {
  name: 'get_board',
  title: 'Describe a board',
  description:
    'The shape of a board: what it is called, how much is on it, what kinds of objects, ' +
    'and the frames and groups that hold the rest. Always small — use `get_objects` for the ' +
    'objects themselves and `search_board` to find some.',
  input: boardArgument,
  run: async (input, context) => {
    const opened = await onBoard(input, context, boardArgument)
    if (isResponse(opened)) return opened
    const document = opened.peer.store.getDocument()

    const byType: Record<string, number> = {}
    for (const object of document.objects.values()) {
      byType[object.type] = (byType[object.type] ?? 0) + 1
    }

    /*
     * ONE index for every container, not `childrenOf` per object: that is the
     * O(n²) rule 10 forbids, and a board with ten thousand objects on it is
     * exactly the board somebody asks an agent about.
     */
    const children = groupByParent(document)
    const containers = [...children]
      .filter(([parentId]) => parentId !== null)
      .map(([parentId, held]) => {
        const container = parentId === null ? undefined : document.objects.get(parentId)
        return container === undefined
          ? null
          : {
              id: container.id,
              type: container.type,
              summary: opened.peer.registry.describeObject(container).summary,
              children: held.length,
            }
      })
      .filter((container) => container !== null)

    return data({
      board: boardHead(opened.peer),
      you: opened.peer.role,
      objects: { total: document.objects.size, byType },
      containers,
    })
  },
}

const DEFAULT_PAGE = 100
const MAX_PAGE = 500

const objectsArguments = {
  ...boardArgument,
  ids: z
    .array(z.string())
    .max(MAX_PAGE)
    .optional()
    .describe('Specific objects, by id. Everything else is ignored when this is given.'),
  type: z.string().optional().describe('Only objects of this type, e.g. `sticky`, `evidence`.'),
  limit: z.number().int().min(1).max(MAX_PAGE).optional().describe(`At most this many (default ${String(DEFAULT_PAGE)}).`),
  cursor: z.string().optional().describe('Continue after this object id, from a previous `next`.'),
}

export const getObjects: ToolDefinition = {
  name: 'get_objects',
  title: 'Read objects on a board',
  description:
    'The objects on a board, in the board\'s own order, a page at a time. Each carries its ' +
    'type, a one-line summary and the named fields that type declares. Returns `next` when ' +
    'there is more; pass it back as `cursor`.',
  input: objectsArguments,
  run: async (input, context) => {
    const opened = await onBoard(input, context, objectsArguments)
    if (isResponse(opened)) return opened
    const asked = opened.input as {
      ids?: string[]
      type?: string
      limit?: number
      cursor?: string
    }
    const document = opened.peer.store.getDocument()

    if (asked.ids !== undefined) {
      const found = asked.ids
        .map((id) => document.objects.get(asObjectId(id)))
        .filter((object) => object !== undefined)
      return data({
        board: boardHead(opened.peer),
        objects: found.map((object) => described(opened.peer, object)),
        // Asked for by id, so a missing one is worth saying rather than
        // leaving somebody to diff two lists.
        missing: asked.ids.filter((id) => !document.objects.has(asObjectId(id))),
        next: null,
      })
    }

    const ordered = inDocumentOrder(document).filter(
      (object) => asked.type === undefined || object.type === asked.type,
    )
    const from =
      asked.cursor === undefined
        ? 0
        : ordered.findIndex((object) => object.id === asked.cursor) + 1
    const limit = asked.limit ?? DEFAULT_PAGE
    const page = ordered.slice(from, from + limit)
    const more = from + limit < ordered.length

    return data({
      board: boardHead(opened.peer),
      total: ordered.length,
      objects: page.map((object) => described(opened.peer, object)),
      next: more ? (page.at(-1)?.id ?? null) : null,
    })
  },
}

const searchArguments = {
  ...boardArgument,
  query: z.string().min(1).max(200).describe('Words to look for. Case is ignored.'),
  limit: z.number().int().min(1).max(MAX_PAGE).optional(),
}

export const searchBoard: ToolDefinition = {
  name: 'search_board',
  title: 'Search a board',
  description:
    'Objects on a board whose text matches. Searches everything a type says is worth ' +
    'searching — a piece of evidence matches on its source and its participant as well as ' +
    'its text — and answers with the same shape as `get_objects`.',
  input: searchArguments,
  run: async (input, context) => {
    const opened = await onBoard(input, context, searchArguments)
    if (isResponse(opened)) return opened
    const asked = opened.input as { query: string; limit?: number }
    const document = opened.peer.store.getDocument()
    const needle = asked.query.toLowerCase()

    const matches = inDocumentOrder(document).filter((object) =>
      /*
       * `searchText`, which is what the type says is worth searching — an
       * evidence slip matches on its source and its participant, which is how
       * "what did we learn in the September study?" is answered with no query
       * language existing.
       */
      opened.peer.registry.describeObject(object).searchText.toLowerCase().includes(needle),
    )

    const limit = asked.limit ?? DEFAULT_PAGE
    return data({
      board: boardHead(opened.peer),
      query: asked.query,
      total: matches.length,
      objects: matches.slice(0, limit).map((object) => described(opened.peer, object)),
    })
  },
}

export const READ_TOOLS: readonly ToolDefinition[] = [listBoards, getBoard, getObjects, searchBoard]
