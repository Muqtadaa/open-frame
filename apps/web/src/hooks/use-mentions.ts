import { useCallback, useEffect, useState } from 'react'

import { listMyBoards } from '../app/remote-boards.js'
import {
  markMentionsRead,
  myMentions,
  watchMyMentions,
  type Mention,
} from '../app/discussion.js'
import { useIdentity } from './use-identity.js'

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
 *
 * LIVE, because a notification you have to reload to see is not one. The
 * subscription carries a nudge and never the mention itself — see
 * `watchMyMentions` — so a message arriving out of order cannot make this
 * disagree with the database.
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
  const [revision, setRevision] = useState(0)
  const me = useIdentity()
  const userId = me?.userId ?? null

  useEffect(() => {
    // A guest has no mentions and no boards. Asking anyway is two requests
    // per board opened that can only ever come back empty. Signing out does
    // not need to clear what was loaded, because what is RETURNED is derived
    // from being signed in — emptying the state here would be a second answer
    // to the same question, and a cascading render to give it.
    if (userId === null) return
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
  }, [userId, revision])

  /*
   * Separate from the read above so that a nudge re-runs the READ and not the
   * subscription: re-subscribing on every arrival would drop and rebuild the
   * channel each time somebody names you, and lose any mention that landed in
   * the gap.
   */
  useEffect(() => {
    if (userId === null) return
    return watchMyMentions(userId, () => {
      setRevision((current) => current + 1)
    })
  }, [userId])

  const keyFor = useCallback((boardId: string) => keys.get(boardId) ?? null, [keys])

  const markRead = useCallback((commentId: string) => {
    // Recorded on the way out. The navigation is what matters, so a failure to
    // write this must not stop the link working.
    markMentionsRead([commentId]).catch(() => {
      // Still unread next time, which is the safe direction to fail in.
    })
  }, [])

  return { mentions: userId === null ? [] : mentions, keyFor, markRead }
}
