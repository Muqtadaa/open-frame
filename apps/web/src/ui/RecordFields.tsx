import {
  MAX_POLL_OPTIONS,
  MIN_POLL_OPTIONS,
  type AnyOpenFrameObject,
  type FieldDefinition,
  type ObjectId,
  type PollOption,
} from '@openframe/core'
import { useState } from 'react'

import { CloseIcon } from '../controls/icons.js'
import { fromText, toText } from './record-text.js'

/**
 * The semantic half of the record panel: an object's own fields, as its TYPE
 * declares them.
 *
 * Nothing here names a type or a field. `evidence` having a participant is
 * `evidence`'s business; this renders whatever `registry.get(type).fields`
 * says, which is why the eight structured types are a two-file change rather
 * than eight edits to a panel (rule 21).
 */
/** Nothing named: every value is free to change. */
const NONE: ReadonlySet<string> = new Set()

export function RecordFields({
  object,
  fields,
  onCommit,
  named = NONE,
}: {
  readonly object: AnyOpenFrameObject
  readonly fields: readonly FieldDefinition[]
  /**
   * The values something else on the board names — for a list of choices,
   * the options somebody has answered. Those are fixed: see `Choices`.
   */
  readonly named?: ReadonlySet<string>
  readonly onCommit: (id: ObjectId, patch: Readonly<Record<string, unknown>>) => void
}) {
  return (
    <>
      {fields.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          object={object}
          named={named}
          onCommit={(value) => {
            onCommit(object.id, { [field.key]: value })
          }}
        />
      ))}
    </>
  )
}

function FieldRow({
  field,
  object,
  onCommit,
  named,
}: {
  readonly field: FieldDefinition
  readonly object: AnyOpenFrameObject
  readonly onCommit: (value: unknown) => void
  readonly named: ReadonlySet<string>
}) {
  const stored = (object.data as Record<string, unknown>)[field.key]

  if (field.kind === 'select') {
    const current = typeof stored === 'string' ? stored : ''
    return (
      <Row field={field}>
        <select
          className="of-input of-input--select"
          value={current}
          aria-label={field.label}
          data-testid={`field-${field.key}`}
          onChange={(event) => {
            onCommit(event.target.value)
          }}
        >
          {(field.options ?? []).map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </Row>
    )
  }

  /*
   * A yes-or-no is its box and then its whole label, across the full row. In
   * the label column every other field has, "Hide results until closed" was
   * cut to "hide resu…" beside a lone checkbox; and the words are part of the
   * control, so pressing them ticks the box.
   */
  if (field.kind === 'boolean') {
    return (
      <label className="of-field of-field--check">
        <input
          type="checkbox"
          className="of-field__check"
          checked={stored === true}
          data-testid={`field-${field.key}`}
          onChange={(event) => {
            onCommit(event.target.checked)
          }}
        />
        <span className="of-field__statement">{field.label}</span>
      </label>
    )
  }

  if (field.kind === 'choices') {
    return (
      <Row field={field}>
        <Choices
          field={field}
          stored={Array.isArray(stored) ? (stored as PollOption[]) : []}
          named={named}
          onCommit={onCommit}
        />
      </Row>
    )
  }

  return (
    <Row field={field}>
      <Textish field={field} stored={stored} onCommit={onCommit} />
    </Row>
  )
}

/**
 * A list of options, each a label that commits when the person is done with
 * it, as any other field does — the whole list in one write, so it is one undo
 * step.
 *
 * Ids are never edited and never reused: an answer names its option by id, and
 * a new option takes an id nobody's answer has ever named.
 *
 * An option somebody has ANSWERED is fixed. Reworded, their answer stayed on
 * it while what they had said yes to changed under them; removed, the answer
 * stayed on the board counted by nothing.
 */
function Choices({
  field,
  stored,
  named,
  onCommit,
}: {
  readonly field: FieldDefinition
  readonly stored: readonly PollOption[]
  readonly named: ReadonlySet<string>
  readonly onCommit: (value: unknown) => void
}) {
  const relabel = (id: string, label: string): void => {
    const trimmed = label.trim()
    // An empty label is not an option; put the old one back rather than save it.
    if (trimmed === '') return
    onCommit(stored.map((option) => (option.id === id ? { ...option, label: trimmed } : option)))
  }
  return (
    <div className="of-choices" data-testid={`field-${field.key}`}>
      <ol className="of-choices__list">
        {stored.map((option, index) => (
          <li key={option.id} className="of-choices__row">
            <ChoiceLabel
              label={option.label}
              name={`${field.label} ${String(index + 1)}`}
              answered={named.has(option.id)}
              onCommit={(label) => {
                relabel(option.id, label)
              }}
            />
            <button
              type="button"
              className="of-icon-button"
              aria-label={`Remove ${option.label}`}
              disabled={stored.length <= MIN_POLL_OPTIONS || named.has(option.id)}
              onClick={() => {
                onCommit(stored.filter((other) => other.id !== option.id))
              }}
            >
              <CloseIcon />
            </button>
          </li>
        ))}
      </ol>
      <button
        type="button"
        className="of-button of-button--ghost"
        data-testid={`field-${field.key}-add`}
        disabled={stored.length >= MAX_POLL_OPTIONS}
        onClick={() => {
          onCommit([
            ...stored,
            { id: newOptionId(stored), label: `Option ${String(stored.length + 1)}` },
          ])
        }}
      >
        Add option
      </button>
    </div>
  )
}

/**
 * An id no option has had: random rather than counted, because a removed
 * option's answers stay on the board and an id counted from what is there now
 * would hand them to the next option added.
 */
function newOptionId(taken: readonly PollOption[]): string {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    const id = `o${Array.from(bytes, (byte) => (byte % 36).toString(36)).join('')}`
    if (!taken.some((option) => option.id === id)) return id
  }
}

/** One option's label: a draft while typing, written on Enter or leaving it. */
function ChoiceLabel({
  label,
  name,
  answered,
  onCommit,
}: {
  readonly label: string
  readonly name: string
  readonly answered: boolean
  readonly onCommit: (label: string) => void
}) {
  const [draft, setDraft] = useState(label)
  const [seen, setSeen] = useState(label)
  // Re-synced during render, as `Textish` is, so an undo never flashes the old value.
  if (label !== seen) {
    setSeen(label)
    setDraft(label)
  }
  const commit = (): void => {
    if (draft === label) return
    if (draft.trim() === '') {
      setDraft(label)
      return
    }
    onCommit(draft)
  }
  return (
    <input
      className="of-input"
      type="text"
      value={draft}
      maxLength={80}
      aria-label={name}
      readOnly={answered}
      aria-description={answered ? 'Answered' : undefined}
      onChange={(event) => {
        setDraft(event.target.value)
      }}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(label)
          event.currentTarget.blur()
        }
        event.stopPropagation()
      }}
    />
  )
}

/**
 * A text, long-text or tag control that writes ONCE, when the user is done.
 *
 * Dispatching per keystroke would put "September usability study" into undo as
 * twenty-eight entries, save twenty-eight times, and later send twenty-eight
 * network messages — the same failure as writing during a drag, which is why
 * the document is not written until the gesture commits (rule 4). So the draft
 * lives in component state and commits on blur or Enter.
 *
 * Escape abandons the draft rather than committing it, because the one thing a
 * user reaches for after typing into the wrong field must not save.
 */
function Textish({
  field,
  stored,
  onCommit,
}: {
  readonly field: FieldDefinition
  readonly stored: unknown
  readonly onCommit: (value: unknown) => void
}) {
  const committed = toText(field, stored)
  const [draft, setDraft] = useState(committed)
  const [seen, setSeen] = useState(committed)

  /*
   * Re-sync when the stored value changes underneath — an undo, or another
   * person's edit once boards are shared.
   *
   * Adjusted during render rather than in an effect. An effect would render the
   * stale draft once, then re-render with the new one, so an undo would flash
   * the old value; this pattern re-renders before anything is painted. It is
   * also what `react-hooks/set-state-in-effect` is pointing at.
   *
   * Compared against the last value SEEN rather than against the draft, so a
   * deliberate edit in progress is not clobbered by its own re-render.
   */
  if (committed !== seen) {
    setSeen(committed)
    setDraft(committed)
  }

  const commit = (): void => {
    if (draft === committed) return
    onCommit(fromText(field, draft))
  }

  const shared = {
    className: 'of-input',
    value: draft,
    /*
     * An EXAMPLE, and said to be one. A type's placeholder is a real-looking
     * value — "September usability study", "P07" — and set in muted ink beside
     * fields in full ink it read as data somebody had entered, so an unsourced
     * slip looked sourced: the one thing this product promises not to lose.
     */
    placeholder: field.placeholder === undefined ? undefined : `e.g. ${field.placeholder}`,
    'aria-label': field.label,
    'data-testid': `field-${field.key}`,
    onChange: (event: { target: { value: string } }) => {
      setDraft(event.target.value)
    },
    onBlur: commit,
  }

  if (field.kind === 'longText') {
    return (
      <textarea
        {...shared}
        rows={3}
        onKeyDown={(event) => {
          // Enter is a newline here, so only Escape is special.
          if (event.key === 'Escape') {
            setDraft(committed)
            event.currentTarget.blur()
          }
          event.stopPropagation()
        }}
      />
    )
  }

  return (
    <input
      {...shared}
      type="text"
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          commit()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(committed)
          event.currentTarget.blur()
        }
        /*
         * The canvas keymap listens on the document, so without this a 'v' in
         * "conversion" switches to the select tool and a 'Delete' while editing
         * destroys the object being described.
         */
        event.stopPropagation()
      }}
    />
  )
}

/** One record row: mono label in the left column, control in the right. */
function Row({ field, children }: { field: FieldDefinition; children: React.ReactNode }) {
  return (
    <div className={`of-field${field.kind === 'longText' ? ' of-field--tall' : ''}`}>
      <span className="of-field__label" title={field.label}>
        {field.label.toLowerCase()}
      </span>
      <div className="of-field__control">{children}</div>
    </div>
  )
}
