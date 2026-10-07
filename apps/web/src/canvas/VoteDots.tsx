import type { ObjectId } from '@openframe/core'
import { useState } from 'react'

import { useMe } from '../hooks/use-me.js'
import { countsShown, tallyVoters, useVoters, useVotingContext } from '../hooks/use-voting.js'

/**
 * The dots on a note, drawn on the note — in the world, like its reactions,
 * because they are part of how it reads while the session runs, not a handle.
 *
 * While a round's counts are hidden a person sees only their own dots; once
 * revealed, or once it has ended, everybody sees the count.
 */
/** How many dots are drawn before the count is written as a number. */
const DOTS_AT_MOST = 5

export function VoteDots({ id }: { readonly id: ObjectId }) {
  const voters = useVoters(id)
  /*
   * The dots already on the note when it was drawn. Only one placed after
   * that is new, and inked in: a board opening, or a note scrolled into view,
   * must not set all of its dots popping at once (motion.css).
   */
  const [born] = useState(voters)
  // A note without a dot costs one index lookup and nothing else.
  if (voters === '') return null
  return <Dots voters={voters} born={born} />
}

function Dots({ voters, born }: { readonly voters: string; readonly born: string }) {
  const round = useVotingContext()
  const me = useMe()
  if (round === null) return null
  const { total, mine } = tallyVoters(voters, round.id, me?.key ?? null)
  const shown = countsShown(round.data)
  const count = shown ? total : mine
  if (count === 0) return null
  const before = tallyVoters(born, round.id, me?.key ?? null)
  const counted = shown ? before.total : before.mine
  const label = shown
    ? `${String(total)} ${total === 1 ? 'vote' : 'votes'}${mine > 0 ? `, ${String(mine)} yours` : ''}`
    : `${String(mine)} ${mine === 1 ? 'vote' : 'votes'} of yours`
  // Five can be seen at a glance; six in a row are counted, so past five the
  // number says it instead.
  const drawn = count <= DOTS_AT_MOST ? count : 1
  return (
    <div
      className="of-votes"
      data-testid="votes"
      data-mine={mine > 0}
      data-count={count}
      role="img"
      aria-label={label}
      data-tip={label}
    >
      {Array.from({ length: drawn }, (_, index) => (
        <span
          key={index}
          className="of-votes__dot"
          data-testid="vote-dot"
          data-fresh={index >= counted}
          aria-hidden="true"
        />
      ))}
      {count > DOTS_AT_MOST && (
        <span className="of-votes__count" aria-hidden="true">
          {count}
        </span>
      )}
    </div>
  )
}
