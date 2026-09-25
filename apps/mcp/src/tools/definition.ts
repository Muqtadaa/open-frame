import { asBoardId } from '@openframe/core'
import { z } from 'zod'

import type { BoardPeer } from '../board.js'
import type { ToolContext } from './context.js'
import { problem, type ToolResponse } from './respond.js'

/**
 * What a tool IS, here: a name, what it takes, and what it does with it.
 *
 * Transport-free. The stdio server registers these; stage 5's HTTP endpoint
 * will register the same objects, which is only possible while nothing in a
 * tool knows how it was called.
 */
export interface ToolDefinition {
  readonly name: string
  readonly title: string
  readonly description: string
  /**
   * A Zod SHAPE rather than a schema, because that is what the MCP SDK takes
   * for a tool's declared arguments — and it is validated here as well, which
   * is rule 8 rather than belt and braces: this layer is what a network
   * transport will call, and a payload that arrived over one is arbitrary
   * whatever the last layer promised.
   */
  readonly input: z.ZodRawShape
  /** Whether calling it can change the board. Read tools say so, and are cheaper to trust. */
  readonly writes?: boolean
  /** Whether it can remove something. A client may ask a person first. */
  readonly destructive?: boolean
  readonly run: (input: unknown, context: ToolContext) => Promise<ToolResponse>
}

export const NOT_SIGNED_IN =
  'Not signed in. Run `openframe login` in a terminal on this machine, then try again.'
export const NO_SUCH_BOARD =
  'No such board, or it is not one this account can open. `list_boards` says which are.'
export const VIEW_ONLY =
  'This board is view-only for this account. `list_boards` says which boards it may change.'

export const boardArgument = {
  board: z.string().describe('The board id, as `list_boards` gives it (brd_…).'),
}

export interface OnBoard {
  readonly peer: BoardPeer
  readonly input: Record<string, unknown>
}

/**
 * Validates the request, resolves the board, and refuses the three ways a call
 * can be refused before any command exists.
 *
 * One place, because a second transcription of "is this board mine" is a
 * second chance to answer it differently — and the answer is a permission.
 *
 * `needs: 'edit'` refuses a view-only board HERE, as well as at the room and
 * in the dispatcher. All three would stop the write; only this one tells the
 * agent, and an agent told nothing tries again.
 */
export async function onBoard(
  input: unknown,
  context: ToolContext,
  shape: z.ZodRawShape,
  needs: 'view' | 'edit' = 'view',
): Promise<OnBoard | ToolResponse> {
  const parsed = z.object(shape).safeParse(input)
  if (!parsed.success) return problem(`That is not a valid request: ${parsed.error.message}`)
  if (context.account === null) return problem(NOT_SIGNED_IN)

  const asked = parsed.data as { board: string }
  // `asBoardId` at a deserialization boundary, which is what a tool call is:
  // the string arrived from outside and nothing has vouched for it yet.
  const peer = await context.board(asBoardId(asked.board))
  if (peer === null) return problem(NO_SUCH_BOARD)
  /*
   * The ROOM's answer, not the client's belief: `role` is what the room said
   * when it accepted this connection, which is the same thing that judges the
   * bytes if a write is attempted anyway.
   */
  if (needs === 'edit' && peer.role !== 'editor') return problem(VIEW_ONLY)

  return { peer, input: parsed.data }
}

export function isResponse(value: unknown): value is ToolResponse {
  return typeof value === 'object' && value !== null && 'text' in value
}
