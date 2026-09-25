import type { ListKind, Mark } from '@openframe/core'

import { BulletListIcon, NumberListIcon } from '../controls/icons.js'
import { IS_MAC } from '../scene/platform.js'
import type { FormatState } from './RichTextField.js'

const MARK_BUTTONS: readonly {
  readonly mark: Mark
  readonly label: string
  readonly glyph: string
}[] = [
  { mark: 'bold', label: 'Bold', glyph: 'B' },
  { mark: 'italic', label: 'Italic', glyph: 'I' },
  { mark: 'underline', label: 'Underline', glyph: 'U' },
  { mark: 'strike', label: 'Strikethrough', glyph: 'S' },
]

/**
 * The formatting controls, shown only while editing.
 *
 * Above the object rather than in the record panel, because the panel is hidden
 * during an edit — deliberately, since a panel that jumps around under the
 * pointer is worse than no panel — and because formatting applies to a
 * SELECTION, which only exists while the caret is in the text.
 *
 * Counter-scaled, like a frame's title: a format bar that shrank with the board
 * would be unusable at the zoom where someone is reading a note closely.
 */
export function FormatBar({
  state,
  embedded = false,
  onList,
  onToggle,
  onResize,
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
}) {
  const active = state.marks
  const list = state.list
  /*
   * `onMouseDown` is prevented on every control. A button that took focus would
   * blur the editor, which COMMITS — so clicking "bold" would end the edit and
   * then apply a mark to a selection that no longer existed.
   */
  const keepFocus = (event: React.MouseEvent): void => {
    event.preventDefault()
  }

  return (
    <div
      className={`of-format-bar${embedded ? ' of-format-bar--embedded' : ' of-surface'}`}
      data-testid="format-bar"
      role="toolbar"
      aria-label="Text formatting"
      onMouseDown={keepFocus}
    >
      {MARK_BUTTONS.map(({ mark, label, glyph }) => (
        <button
          key={mark}
          type="button"
          className={`of-icon-button of-format-bar__button of-format-bar__button--${mark}`}
          aria-label={label}
          aria-pressed={active.includes(mark)}
          data-tip={label}
          data-testid={`format-${mark}`}
          onMouseDown={keepFocus}
          onClick={() => {
            onToggle(mark)
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
       * not be used at all. It also matches what was asked for: increasing and
       * decreasing the size, rather than naming one.
       */}
      <button
        type="button"
        className="of-icon-button of-format-bar__button of-format-bar__button--size"
        aria-label="Smaller text"
        data-tip="Smaller"
        aria-description="Smaller"
        data-testid="format-smaller"
        onMouseDown={keepFocus}
        onClick={() => {
          onResize(-1)
        }}
      >
        A−
      </button>
      <button
        type="button"
        className="of-icon-button of-format-bar__button of-format-bar__button--size of-format-bar__button--bigger"
        aria-label="Bigger text"
        data-tip="Bigger"
        aria-description="Bigger"
        data-testid="format-bigger"
        onMouseDown={keepFocus}
        onClick={() => {
          onResize(1)
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
          aria-keyshortcuts={keys}
          data-tip={`${label} ${shown(keys)}`}
          aria-description={`${label} ${shown(keys)}`}
          data-testid={`format-${kind}`}
          onMouseDown={keepFocus}
          onClick={() => {
            onList(kind)
          }}
        >
          <Icon />
        </button>
      ))}
    </div>
  )
}

const MOD = IS_MAC ? 'Meta' : 'Control'
/** A shortcut as a tip shows it: the platform's own glyphs. */
const shown = (keys: string): string =>
  IS_MAC ? keys.replace('Meta+Shift+', '⌘⇧') : keys.replace('Control', 'Ctrl')

const LIST_BUTTONS: readonly {
  readonly kind: ListKind
  readonly label: string
  readonly keys: string
  readonly Icon: typeof BulletListIcon
}[] = [
  { kind: 'bullet', label: 'Bulleted list', keys: `${MOD}+Shift+8`, Icon: BulletListIcon },
  { kind: 'number', label: 'Numbered list', keys: `${MOD}+Shift+7`, Icon: NumberListIcon },
]
