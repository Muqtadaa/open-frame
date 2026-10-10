import { safeLink, SIZE_TOKENS, type ListKind, type Mark, type SizeToken } from '@openframe/core'
import { useState } from 'react'

import { BulletListIcon, LinkIcon, NumberListIcon } from '../controls/icons.js'
import { stepFocus } from '../controls/roving.js'
import { ariaKeys, formatKeys } from '../scene/shortcuts.js'
import type { FormatState } from './RichTextField.js'

const MARK_BUTTONS: readonly {
  readonly mark: Mark
  readonly label: string
  readonly glyph: string
  readonly keys: string
}[] = [
  { mark: 'bold', label: 'Bold', glyph: 'B', keys: 'Mod+B' },
  { mark: 'italic', label: 'Italic', glyph: 'I', keys: 'Mod+I' },
  { mark: 'underline', label: 'Underline', glyph: 'U', keys: 'Mod+U' },
  { mark: 'strike', label: 'Strikethrough', glyph: 'S', keys: 'Mod+Shift+X' },
]

const LIST_BUTTONS: readonly {
  readonly kind: ListKind
  readonly label: string
  readonly keys: string
  readonly Icon: typeof BulletListIcon
}[] = [
  { kind: 'bullet', label: 'Bulleted list', keys: 'Mod+Shift+8', Icon: BulletListIcon },
  { kind: 'number', label: 'Numbered list', keys: 'Mod+Shift+7', Icon: NumberListIcon },
]

/**
 * Each step of the ladder as a multiple of the object's own size — the
 * `.of-size--*` rules in styles/text-format.css, which `design-tokens.test.ts` holds this
 * to. Shown as the readout because a size is RELATIVE: `lg` in a sticky and in
 * a heading are different pixels and the same "1.4 times the rest of it".
 */
export const SIZE_SCALE: Readonly<Record<SizeToken, number>> = {
  xs: 0.6,
  sm: 0.8,
  md: 1,
  lg: 1.4,
  xl: 2,
  '2xl': 2.8,
  '3xl': 3.9,
  '4xl': 5.5,
  '5xl': 7.6,
}

const tip = (label: string, keys: string): string => `${label}  ${formatKeys(keys)}`

/**
 * The formatting controls, shown only while editing.
 *
 * Above the object rather than in the record panel, because the panel is hidden
 * during an edit — deliberately, since a panel that jumps around under the
 * pointer is worse than no panel — and because formatting applies to a
 * SELECTION, which only exists while the caret is in the text.
 *
 * A toolbar in the ARIA sense: Alt+F10 from the text comes in (the field
 * binds it), the arrows move along it, and Escape goes back to the text.
 */
export function FormatBar({
  state,
  embedded = false,
  onList,
  onToggle,
  onResize,
  onReturn,
  onLeave,
  onLinkOpen,
  onLink,
  linkScope,
}: {
  readonly state: FormatState
  /**
   * Inside another surface — a table's cell bar — rather than floating on its
   * own, so it takes no page stock or shadow of its own.
   */
  readonly embedded?: boolean
  readonly onList: (kind: ListKind) => void
  readonly onToggle: (mark: Mark) => void
  readonly onResize: (by: 1 | -1) => void
  /** Escape: hand the keyboard back to the text. */
  readonly onReturn?: (() => void) | undefined
  /**
   * The keyboard left the bar for somewhere that is neither the bar nor the
   * text — which, for an object, is leaving the edit.
   */
  readonly onLeave?: ((to: Element | null) => void) | undefined
  /**
   * The link field is opening: the text should remember its selection, which
   * the field is about to take (ADR 0021).
   */
  readonly onLinkOpen?: (() => void) | undefined
  /** Links the selection to a safe address, or unlinks it (`undefined`). No link control without it. */
  readonly onLink?: ((href: string | undefined) => void) | undefined
  /**
   * Which text the link field belongs to, where the bar outlives it — a
   * table's cell bar stays while the edit moves from cell to cell.
   */
  readonly linkScope?: string | undefined
}) {
  const [linking, setLinking] = useState(false)
  const [address, setAddress] = useState('')
  const [refused, setRefused] = useState(false)
  /*
   * A field left open is put away when the text it was for goes: otherwise the
   * next cell to be typed in opens with the last one's address, and Enter
   * writes it in with no selection held. Adjusted during render, not in an
   * effect, so the stale field is never drawn even once.
   */
  const scope = onLink === undefined ? null : (linkScope ?? '')
  const [linkFor, setLinkFor] = useState(scope)
  if (linkFor !== scope) {
    setLinkFor(scope)
    setLinking(false)
    setAddress('')
    setRefused(false)
  }
  const active = state.marks
  const mixed = state.mixed ?? []
  const list = state.list
  const at = state.size === undefined ? -1 : SIZE_TOKENS.indexOf(state.size)
  const smallest = at === 0
  const largest = at === SIZE_TOKENS.length - 1
  /*
   * `onMouseDown` is prevented on every control. A button that took focus would
   * blur the editor, which COMMITS — so clicking "bold" would end the edit and
   * then apply a mark to a selection that no longer existed.
   */
  const keepFocus = (event: React.MouseEvent): void => {
    // Except the link field, which has to take the keyboard to be typed in.
    if (event.target instanceof HTMLInputElement) return
    event.preventDefault()
  }

  /*
   * Runs a control's action and, when the KEYBOARD pressed it, keeps the
   * keyboard on it. Putting the selection back in the text — which every
   * action does — also moves focus there in Chrome, so an Enter on "italic"
   * threw somebody out of the bar they had just arrived in.
   */
  const act = (event: React.MouseEvent<HTMLButtonElement>, action: () => void): void => {
    const button = event.currentTarget
    const fromKeyboard = button.ownerDocument.activeElement === button
    action()
    if (fromKeyboard) button.focus()
  }

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    // The board's keymap must not read these as nudges, tools or deselection.
    event.stopPropagation()
    // The link field keeps its arrows for its own caret, and its own Escape.
    if (event.target instanceof HTMLInputElement) return
    // A toolbar is a row: Left and Right walk it, wrapping, with Home and End.
    if (stepFocus(event, { items: 'button', orientation: 'horizontal' }) !== null) return
    if (event.key === 'Escape' && onReturn !== undefined) {
      event.preventDefault()
      onReturn()
    }
  }

  return (
    <div
      className={`of-format-bar${embedded ? ' of-format-bar--embedded' : ' of-surface'}`}
      data-testid="format-bar"
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={keepFocus}
      onKeyDown={onKeyDown}
      onBlur={(event) => {
        const to = event.relatedTarget
        if (to instanceof Node && event.currentTarget.contains(to)) return
        onLeave?.(to instanceof Element ? to : null)
      }}
    >
      {MARK_BUTTONS.map(({ mark, label, glyph, keys }) => (
        <button
          key={mark}
          type="button"
          className={`of-icon-button of-format-bar__button of-format-bar__button--${mark}`}
          aria-label={label}
          // Mixed, not off, over a selection only part of which has the mark.
          aria-pressed={active.includes(mark) ? true : mixed.includes(mark) ? 'mixed' : false}
          aria-keyshortcuts={ariaKeys(keys)}
          data-tip={tip(label, keys)}
          data-testid={`format-${mark}`}
          onMouseDown={keepFocus}
          onClick={(event) => {
            act(event, () => {
              onToggle(mark)
            })
          }}
        >
          {glyph}
        </button>
      ))}

      <span className="of-format-bar__rule" aria-hidden="true" />

      {/*
       * Stepping buttons, not a dropdown.
       *
       * Every control here has to prevent `mousedown` or it takes focus, which
       * blurs the editor and COMMITS — and preventing mousedown on a native
       * `<select>` also stops the browser opening it, so the dropdown could
       * not be used at all.
       *
       * With the size BETWEEN them. Six presses of A+ took a note's text to
       * 7.6 times its size with nothing on screen saying how far it had gone
       * or that the ladder had an end; the ends now switch their button off.
       */}
      <button
        type="button"
        className="of-icon-button of-format-bar__button of-format-bar__button--size"
        aria-label="Smaller text"
        aria-disabled={smallest ? true : undefined}
        aria-keyshortcuts={ariaKeys('Mod+Shift+Comma')}
        data-tip={tip('Smaller text', 'Mod+Shift+Comma')}
        data-testid="format-smaller"
        onMouseDown={keepFocus}
        onClick={(event) => {
          if (!smallest)
            act(event, () => {
              onResize(-1)
            })
        }}
      >
        A−
      </button>
      <span
        className="of-format-bar__size"
        data-testid="format-size"
        role="status"
        aria-label={
          state.size === undefined
            ? 'Text size mixed'
            : `Text size ${String(SIZE_SCALE[state.size])} times`
        }
      >
        {state.size === undefined ? '—' : `×${String(SIZE_SCALE[state.size])}`}
      </span>
      <button
        type="button"
        className="of-icon-button of-format-bar__button of-format-bar__button--size of-format-bar__button--bigger"
        aria-label="Bigger text"
        aria-disabled={largest ? true : undefined}
        aria-keyshortcuts={ariaKeys('Mod+Shift+Period')}
        data-tip={tip('Bigger text', 'Mod+Shift+Period')}
        data-testid="format-bigger"
        onMouseDown={keepFocus}
        onClick={(event) => {
          if (!largest)
            act(event, () => {
              onResize(1)
            })
        }}
      >
        A+
      </button>

      <span className="of-format-bar__rule" aria-hidden="true" />

      {LIST_BUTTONS.map(({ kind, label, keys, Icon }) => (
        <button
          key={kind}
          type="button"
          className="of-icon-button of-format-bar__button"
          aria-label={label}
          aria-pressed={list === kind}
          aria-keyshortcuts={ariaKeys(keys)}
          data-tip={tip(label, keys)}
          data-testid={`format-${kind}`}
          onMouseDown={keepFocus}
          onClick={(event) => {
            act(event, () => {
              onList(kind)
            })
          }}
        >
          <Icon />
        </button>
      ))}

      {onLink !== undefined && (
        <>
          <span className="of-format-bar__rule" aria-hidden="true" />
          <button
            type="button"
            className="of-icon-button of-format-bar__button"
            aria-label="Link"
            aria-pressed={state.link !== undefined}
            aria-expanded={linking}
            aria-keyshortcuts={ariaKeys('Mod+K')}
            data-tip={tip('Link', 'Mod+K')}
            data-testid="format-link"
            onMouseDown={keepFocus}
            onClick={() => {
              if (linking) {
                setLinking(false)
                onReturn?.()
                return
              }
              onLinkOpen?.()
              setAddress(state.link ?? '')
              setRefused(false)
              setLinking(true)
            }}
          >
            <LinkIcon />
          </button>
          {linking && (
            <form
              className="of-format-bar__link"
              onSubmit={(event) => {
                event.preventDefault()
                // An emptied field takes the link off; anything else must be
                // somewhere a board may send people.
                const href = address.trim() === '' ? undefined : safeLink(address)
                if (href === null) {
                  setRefused(true)
                  return
                }
                setLinking(false)
                onLink(href)
              }}
            >
              <input
                className="of-input of-format-bar__address"
                type="url"
                inputMode="url"
                autoFocus
                placeholder="https://"
                aria-label="Link address"
                aria-invalid={refused ? true : undefined}
                aria-describedby={refused ? 'of-link-refused' : undefined}
                data-testid="format-link-field"
                value={address}
                onChange={(event) => {
                  setAddress(event.target.value)
                  setRefused(false)
                }}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return
                  event.preventDefault()
                  setLinking(false)
                  onReturn?.()
                }}
              />
              {state.link !== undefined && (
                <button
                  type="button"
                  className="of-button of-button--ghost"
                  data-testid="format-unlink"
                  onClick={() => {
                    setLinking(false)
                    onLink(undefined)
                  }}
                >
                  Remove link
                </button>
              )}
              {refused && (
                <span id="of-link-refused" className="of-format-bar__refused" role="alert">
                  Not a web or mail address
                </span>
              )}
            </form>
          )}
        </>
      )}
    </div>
  )
}
