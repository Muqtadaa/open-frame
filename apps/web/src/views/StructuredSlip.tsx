import { isEmptyText, plainTextOf, type ColorToken, type RichText } from '@openframe/core'

import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'
import type { ObjectEditorProps, ObjectViewProps } from './registry.js'
import { SURFACE_VARS, fontFamily, textAlign, inkColor } from '../scene/style-tokens.js'

/**
 * The card every structured type is drawn as.
 *
 * Deliberately one component rather than six near-identical files. A structured
 * object is a slip with a record line under a hairline; what differs between an
 * experiment and a requirement is WHAT the record line says, which is the
 * type's business and arrives here as strings.
 *
 * Every one of them is the same physical slip as a sticky note — same stock,
 * padding, radius and elevation — because PRODUCT.md's claim is that they are
 * the same kind of thing differing only in payload, and a card that announced
 * its own importance with chrome would argue the opposite.
 */
/**
 * Constrained rather than cast: every structured type's body lives under
 * `text`, and saying so lets the commit below be typed instead of asserted.
 */
export function StructuredSlip<TData extends { readonly text: RichText }>({
  object,
  text,
  noun,
  record,
  defaultColor,
  className,
}: ObjectViewProps<TData> & {
  readonly text: RichText
  /** What this card IS, for the accessible name: "Evidence", "Task". */
  readonly noun: string
  /**
   * The record line, in reading order. Empty parts are dropped rather than
   * rendered as blanks: structure is earned, and a row of empty labels is the
   * form this product refuses to make anyone fill in.
   */
  readonly record: readonly string[]
  readonly defaultColor: ColorToken
  readonly className?: string
}) {
  const parts = record.filter((part) => part.trim() !== '')

  return (
    <div
      className={`of-slip${className === undefined ? '' : ` ${className}`}`}
      style={{
        background: SURFACE_VARS[object.style.color ?? defaultColor],
        color: inkColor(object.style.textColor),
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      /*
       * The accessible name carries the record, not just the body. A screen
       * reader user gets the same thing a sighted one does from the footer —
       * which is the point of these types existing at all.
       */
      aria-label={[
        isEmptyText(text) ? `Empty ${noun.toLowerCase()}` : `${noun}: ${plainTextOf(text)}`,
        ...parts,
      ].join('. ')}
    >
      <div
        className="of-slip__body"
        style={{
          fontFamily: fontFamily(object.style.font),
          textAlign: textAlign(object.style.align),
        }}
      >
        <RichTextView value={text} />
      </div>

      {parts.length > 0 && (
        <div className="of-slip__record" aria-hidden="true">
          {parts.map((part) => (
            <span key={part} className="of-slip__trail">
              {part}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

/** The in-place editor for a structured card. Edits the BODY; fields are in the panel. */
export function StructuredEditor<TData extends { readonly text: RichText }>({
  object,
  zoom,
  text,
  label,
  defaultColor,
  className,
  onCommit,
  onCancel,
}: ObjectEditorProps<TData> & {
  readonly text: RichText
  readonly label: string
  readonly defaultColor: ColorToken
  readonly className?: string
}) {
  return (
    <RichTextEditor
      initialText={text}
      zoom={zoom}
      className={`of-slip of-slip__editor${className === undefined ? '' : ` ${className}`}`}
      style={{
        background: SURFACE_VARS[object.style.color ?? defaultColor],
        color: inkColor(object.style.textColor),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
      }}
      ariaLabel={label}
      onCommit={(next) => onCommit({ text: next } as Partial<TData>)}
      onCancel={onCancel}
    />
  )
}

/**
 * A status, shown only once somebody has set one.
 *
 * The default value is passed in rather than guessed, and rendering it would
 * put a word on every card that means "nobody has said" — which reads as an
 * assessment rather than the absence of one. Structure is earned.
 */
export function statusLine(value: string, unset: string): string {
  return value === unset ? '' : value
}

/**
 * The first line of a longer field, for a record line that has one line to give.
 *
 * Truncated with an ellipsis the CSS would not add, because the CSS ellipsis
 * only fires on overflow and a three-line rationale does not overflow one line
 * — it wraps, and takes the card.
 */
export function firstLine(value: string): string {
  const [first = ''] = value.split('\n')
  return first.length > 60 ? `${first.slice(0, 60)}…` : first
}
