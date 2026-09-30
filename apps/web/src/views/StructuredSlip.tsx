import { isEmptyText, type ColorToken, type RichText } from '@openframe/core'

import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'
import type { ObjectEditorProps, ObjectViewProps } from './registry.js'
import {
  fontFamily,
  textAlign,
  verticalAlign,
  inkColor,
  readableInkOn,
  surfaceOf,
} from '../scene/style-tokens.js'

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
  /*
   * A TOKEN, not a colour value. What a type falls back to is a design
   * decision that has to follow the theme; only a colour somebody picked is
   * allowed to be literal.
   */
  readonly defaultColor: ColorToken
  readonly className?: string
}) {
  const parts = record.filter((part) => part.trim() !== '')
  const [first, ...rest] = parts

  return (
    <div
      className={`of-slip${className === undefined ? '' : ` ${className}`}`}
      style={{
        background: surfaceOf(object.style.color, defaultColor),
        color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color),
        opacity: object.style.opacity ?? 1,
      }}
      role="group"
      /*
       * The accessible name carries the type and the record — what a sighted
       * reader gets from the footer, which is the point of these types. Not
       * the body: that is the group's content and is read as such, and in the
       * name as well it was read twice.
       */
      aria-label={[isEmptyText(text) ? `Empty ${noun.toLowerCase()}` : noun, ...parts].join('. ')}
    >
      <div
        className="of-slip__body"
        style={{
          fontFamily: fontFamily(object.style.font),
          textAlign: textAlign(object.style.align),
          justifyContent: verticalAlign(object.style.verticalAlign),
        }}
      >
        {/* Its own element, so the clamp that marks hidden text has something
            to sit on: `100cqh` measures against the nearest container
            ANCESTOR, and an element cannot query itself. */}
        <div className="of-slip__text" data-testid="slip-text" data-fit-text>
          <RichTextView value={text} />
        </div>
      </div>

      {/*
       * Always drawn, and always led by the type's name. Colour alone said
       * what a slip was, so a freshly promoted evidence slip looked exactly
       * like a gray note and re-colouring one erased its type. The word
       * survives both, and the first part of the record rides beside it.
       */}
      <div className="of-slip__record" data-testid="slip-record" aria-hidden="true">
        <span className="of-slip__trail">
          <span className="of-slip__type" data-testid="slip-type">
            {noun.toLowerCase()}
          </span>
          {first !== undefined && ` · ${first}`}
        </span>
        {rest.map((part) => (
          <span key={part} className="of-slip__trail">
            {part}
          </span>
        ))}
      </div>
    </div>
  )
}

/** The in-place editor for a structured card. Edits the BODY; fields are in the panel. */
export function StructuredEditor<TData extends { readonly text: RichText }>({
  object,
  Chrome,
  text,
  label,
  defaultColor,
  className,
  onCommit,
}: ObjectEditorProps<TData> & {
  readonly text: RichText
  readonly label: string
  /*
   * A TOKEN, not a colour value. What a type falls back to is a design
   * decision that has to follow the theme; only a colour somebody picked is
   * allowed to be literal.
   */
  readonly defaultColor: ColorToken
  readonly className?: string
}) {
  return (
    <RichTextEditor
      initialText={text}
      Chrome={Chrome}
      className={`of-slip of-slip__editor${className === undefined ? '' : ` ${className}`}`}
      style={{
        background: surfaceOf(object.style.color, defaultColor),
        color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
        justifyContent: verticalAlign(object.style.verticalAlign),
      }}
      ariaLabel={label}
      onCommit={(next) => onCommit({ text: next } as Partial<TData>)}
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
