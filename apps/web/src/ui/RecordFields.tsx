import type { AnyOpenFrameObject, FieldDefinition, ObjectId } from '@openframe/core'
import { useState } from 'react'

/**
 * The semantic half of the record panel: an object's own fields, as its TYPE
 * declares them.
 *
 * Nothing here names a type or a field. `evidence` having a participant is
 * `evidence`'s business; this renders whatever `registry.get(type).fields`
 * says, which is why the eight structured types are a two-file change rather
 * than eight edits to a panel (rule 21).
 */
export function RecordFields({
  object,
  fields,
  onCommit,
}: {
  readonly object: AnyOpenFrameObject
  readonly fields: readonly FieldDefinition[]
  readonly onCommit: (id: ObjectId, patch: Readonly<Record<string, unknown>>) => void
}) {
  return (
    <>
      {fields.map((field) => (
        <FieldRow
          key={field.key}
          field={field}
          object={object}
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
}: {
  readonly field: FieldDefinition
  readonly object: AnyOpenFrameObject
  readonly onCommit: (value: unknown) => void
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

  return (
    <Row field={field}>
      <Textish field={field} stored={stored} onCommit={onCommit} />
    </Row>
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

/**
 * Tags are edited as one comma-separated line.
 *
 * A chip editor is the better control and is not this change: a text line is
 * honest about what it stores, and it round-trips exactly — which a chip
 * editor with its own parsing would have to prove separately.
 */
function toText(field: FieldDefinition, stored: unknown): string {
  if (field.kind === 'tags') return Array.isArray(stored) ? stored.join(', ') : ''
  return typeof stored === 'string' ? stored : ''
}

function fromText(field: FieldDefinition, text: string): unknown {
  if (field.kind !== 'tags') return text
  return text
    .split(',')
    .map((tag) => tag.trim())
    .filter((tag) => tag !== '')
}
