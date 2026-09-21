import type { BoardPerson } from '../hooks/use-comments.js'
import { hueVar } from '../scene/presence.js'

/**
 * Who you might mean, while you are typing their name.
 *
 * A LISTBOX rather than a set of buttons: the composer keeps the focus the
 * whole time, because moving it into the menu would take the caret out of the
 * sentence being written and there would be nothing to return it to. The
 * textarea therefore owns the keys and this draws what it has chosen, which
 * is why the highlight arrives as a prop rather than living here.
 *
 * Every entry is a `div`, not a `button`. A button takes focus on mousedown in
 * some browsers, and a focus change between mousedown and mouseup is exactly
 * what makes a click on a floating menu do nothing — the menu unmounts under
 * the pointer before the click lands. The press is taken on pointerdown with
 * the default prevented, which keeps the caret where it was.
 */
export function MentionPicker({
  people,
  highlight,
  onPick,
  id,
}: {
  readonly people: readonly BoardPerson[]
  readonly highlight: number
  readonly onPick: (person: BoardPerson) => void
  readonly id: string
}) {
  return (
    <ul className="of-mention-menu" role="listbox" id={id} data-testid="mention-menu">
      {people.map((person, index) => (
        <li
          key={person.userId}
          id={`${id}-${String(index)}`}
          role="option"
          aria-selected={index === highlight}
          className={
            index === highlight ? 'of-mention-menu__item is-active' : 'of-mention-menu__item'
          }
          data-testid={`mention-option-${person.userId}`}
          onPointerDown={(event) => {
            // The caret must not move: the insert is computed from where it
            // already is, and a menu that stole it would insert at zero.
            event.preventDefault()
            onPick(person)
          }}
        >
          <span
            className="of-mention-menu__face"
            style={{ background: hueVar(person.hue) }}
            aria-hidden="true"
          >
            {(person.displayName.trim()[0] ?? '?').toUpperCase()}
          </span>
          <span className="of-mention-menu__name">{person.displayName}</span>
        </li>
      ))}
    </ul>
  )
}
