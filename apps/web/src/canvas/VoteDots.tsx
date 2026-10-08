import type { ObjectId } from '@openframe/core'
import { useState } from 'react'

import { useMe } from '../hooks/use-me.js'
import { countsShown, tallyVoters, useVoters, useVotingContext } from '../hooks/use-voting.js'
import { counted } from '../controls/counted.js'

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
  // Drawn with no dots at all, so the first to arrive is new.
  const [bare] = useState(voters === '')
  // A note without a dot costs one index lookup and nothing else.
  if (voters === '') return null
  return <Dots voters={voters} bare={bare} />
}

function Dots({ voters, bare }: { readonly voters: string; readonly bare: boolean }) {
  const round = useVotingContext()
  const me = useMe()
  const { total, mine } = tallyVoters(voters, round?.id ?? '', me?.key ?? null)
  const shown = round !== null && countsShown(round.data)
  const count = round === null ? 0 : shown ? total : mine
  if (round === null) return null
  const label = shown
    ? `${counted(total, 'vote')}${mine > 0 ? `, ${String(mine)} yours` : ''}`
    : `${counted(mine, 'vote')} of yours`
  /*
   * Drawn again once it is known who "me" is. Until then a hidden round shows
   * none of this person's dots, and every one of them would count as new the
   * moment the account landed — inked in on every open and every scroll
   * (audit 2026-10-08).
   */
  return (
    <Marks
      key={me === null ? 'unknown' : 'known'}
      count={count}
      bare={bare}
      mine={mine}
      label={label}
    />
  )
}

function Marks({
  count,
  bare,
  mine,
  label,
}: {
  readonly count: number
  readonly bare: boolean
  readonly mine: number
  readonly label: string
}) {
  /*
   * How many dots could be SEEN when the note was drawn. Only a dot past that
   * is new, and inked in: a board opening, or a note scrolled into view, must
   * not set all of its dots popping at once (motion.css). What could be seen,
   * not what was there: revealing a hidden round is when everybody else's
   * dots arrive for this person, and they are inked in then (Codex, on #93).
   */
  const [seen] = useState(bare ? 0 : count)
  // Held up here, mounted while nothing shows: a hidden round's dots arrive
  // for this person when it is revealed, and are counted as unseen until then.
  if (count === 0) return null
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
          data-fresh={index >= seen}
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
