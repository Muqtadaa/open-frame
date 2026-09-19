import { useCallback, useEffect, useState } from 'react'

import { listMyBoards } from '../app/remote-boards.js'
import { markMentionsRead, myMentions, type Mention } from '../app/discussion.js'

export type { Mention }

/**
 * What somebody wanted you to see, and the links that take you there.
 *
 * The board list comes too, for the KEYS: a claimed room refuses a board id on
 * its own, so a link built without one leads to a board that will not open —
 * a worse answer than no link at all.
 *
 * Which is why the two land TOGETHER rather than racing. Loaded separately,
 * every mention renders keyless for as long as the board list is in flight,
 * and a click inside that window opens a board that refuses the visitor. One
 * settle means a mention is never shown before the link under it is real.
 *
 * A failure takes both with it, and the bell simply does not appear. A
 * notification list is the least important thing on the front door: an
 * unreachable server should leave the board list working, not take the page
 * down with an unhandled rejection.
 */
export interface Notifications {
  readonly mentions: readonly Mention[]
  /**
   * The access key for a board, or `null` for one shared before roles — never
   * for one whose key has merely not arrived yet.
   */
  readonly keyFor: (boardId: string) => string | null
  readonly markRead: (commentId: string) => void
}

export function useMentions(): Notifications {
  const [mentions, setMentions] = useState<readonly Mention[]>([])
  const [keys, setKeys] = useState<ReadonlyMap<string, string | null>>(new Map())

  useEffect(() => {
    let live = true

    Promise.all([myMentions(), listMyBoards()])
      .then(([found, boards]) => {
        if (!live) return
        setKeys(new Map(boards.map((board) => [board.boardId as string, board.accessKey])))
        setMentions(found)
      })
      .catch(() => {
        // No bell, rather than a bell whose links go nowhere.
      })

    return () => {
      live = false
    }
  }, [])

  const keyFor = useCallback((boardId: string) => keys.get(boardId) ?? null, [keys])

  const markRead = useCallback((commentId: string) => {
    // Recorded on the way out. The navigation is what matters, so a failure to
    // write this must not stop the link working.
    markMentionsRead([commentId]).catch(() => {
      // Still unread next time, which is the safe direction to fail in.
    })
  }, [])

  return { mentions, keyFor, markRead }
}
