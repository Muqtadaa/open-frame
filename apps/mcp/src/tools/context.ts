import type { BoardId } from '@openframe/core'

import { openBoard, type BoardPeer } from '../board.js'
import { ROOM_SERVER } from '../project.js'
import type { BoardAccess, SignedIn } from '../supabase/account.js'

/**
 * What every tool is handed: who this server is acting as, and a way to open a
 * board they may open.
 *
 * Transport-free on purpose. Stage 5 puts an HTTP endpoint in front of exactly
 * this, and a tool that reached for a transport would have to be rewritten to
 * get there — so the stdio server is a caller of this module and nothing more.
 *
 * A board is opened ONCE and held. Joining a room costs a socket and a round
 * trip, and an agent asking three questions about one board would otherwise
 * pay for three; holding the peer also means the second question is answered
 * against a board that has been kept current by the room in between.
 */

export interface ToolContext {
  /** The person this server is acting as, or `null` when nobody signed in. */
  readonly account: SignedIn | null
  /**
   * The board, joined — or `null` when this account cannot reach it.
   *
   * `null` covers "there is no such board" and "it is not yours" with one
   * answer, deliberately: they are the same answer, and telling them apart
   * would make this a way to ask whether a board exists.
   */
  readonly board: (id: BoardId) => Promise<BoardPeer | null>
  readonly close: () => Promise<void>
}

export interface ContextDeps {
  /** Injected by tests, which run a room in this process. */
  readonly open?: (board: BoardAccess) => Promise<BoardPeer>
}

export function toolContext(account: SignedIn | null, deps: ContextDeps = {}): ToolContext {
  const open =
    deps.open ??
    ((board: BoardAccess) =>
      openBoard({
        boardId: board.boardId,
        server: ROOM_SERVER,
        credentials: { key: board.accessKey },
      }))

  /*
   * Promises rather than peers, so two questions arriving together join the
   * room once. Storing the resolved peer would let the second call start a
   * second connection while the first was still syncing.
   */
  const held = new Map<BoardId, Promise<BoardPeer>>()

  return {
    account,
    async board(id) {
      const already = held.get(id)
      if (already !== undefined) return already

      if (account === null) return null
      /*
       * The key comes from the account, so the set of boards this can open is
       * the set row-level security hands back — the phase's whole security
       * story, and the reason there is no `--board-key` anywhere.
       */
      const known = await account.board(id)
      if (known === null) return null

      const joining = open(known)
      held.set(id, joining)
      /*
       * A failed join is not remembered. Left in the map, a room that was
       * briefly unreachable would answer every later question with the same
       * rejected promise, for the life of the process.
       */
      joining.catch(() => held.delete(id))
      return joining
    },
    async close() {
      const open = [...held.values()]
      held.clear()
      for (const joining of open) {
        try {
          ;(await joining).close()
        } catch {
          // A board that never opened has nothing to close.
        }
      }
      account?.close()
    },
  }
}
