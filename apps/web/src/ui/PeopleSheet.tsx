import { useRef, type RefObject } from 'react'

import { useDismiss, useFocusOnOpen } from '../controls/use-dismiss.js'
import { hueVar, initialOf } from '../scene/presence.js'

/** One person on the board, as the bar lists them. */
export interface BoardPerson {
  readonly key: string
  readonly name: string
  readonly hue: number
  /** `null` for yourself. */
  readonly clientId: number | null
  /** Why they cannot be followed, in a few words, or `null` when they can. */
  readonly unfollowable: string | null
}

/**
 * Everyone on the board, each one followable from here.
 *
 * The bar has room for three faces and a count. Whoever the count stood for
 * could not be followed at all — and who that was depended only on when they
 * arrived — so the count opens this: the whole room, in the bar's own order,
 * every person a choice. Choosing one follows them (or stops), and the bar
 * then shows them among its three, as it always does the person you follow.
 */
export function PeopleSheet({
  people,
  following,
  trigger,
  onFollow,
  onClose,
}: {
  readonly people: readonly BoardPerson[]
  readonly following: number | null
  readonly trigger: RefObject<HTMLElement | null>
  readonly onFollow: (clientId: number | null) => void
  readonly onClose: () => void
}) {
  const sheet = useRef<HTMLDivElement>(null)
  useDismiss(sheet, trigger, onClose)
  useFocusOnOpen(sheet)

  return (
    <div
      ref={sheet}
      className="of-sheet of-people"
      role="dialog"
      aria-label="People on this board"
      data-testid="people-sheet"
    >
      <ul className="of-people__list">
        {people.map((person) => {
          const face = (
            <span
              className="of-status__person"
              style={{ background: hueVar(person.hue) }}
              aria-hidden="true"
            >
              {initialOf(person.name)}
            </span>
          )
          if (person.clientId === null || person.unfollowable !== null) {
            return (
              <li key={person.key} className="of-people__row" data-testid="people-row">
                {face}
                <span className="of-people__name">{person.name}</span>
                {person.unfollowable !== null && (
                  <span className="of-people__state">{person.unfollowable}</span>
                )}
              </li>
            )
          }
          const followed = person.clientId === following
          const clientId = person.clientId
          return (
            <li key={person.key}>
              <button
                type="button"
                className="of-people__row of-people__choice"
                aria-pressed={followed}
                aria-label={followed ? `Stop following ${person.name}` : `Follow ${person.name}`}
                data-testid={`people-follow-${person.key}`}
                onClick={() => {
                  onFollow(followed ? null : clientId)
                  onClose()
                }}
              >
                {face}
                <span className="of-people__name">{person.name}</span>
                {followed && <span className="of-people__state">Following</span>}
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
