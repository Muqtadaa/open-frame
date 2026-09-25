import { useState, type CSSProperties } from 'react'

import {
  cellRange,
  cellRegion,
  plainTextOf,
  resizeGrid,
  styleCells,
  type CellStyle,
  type ColorValue,
  type TableCell,
  type TableData,
} from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextView } from './RichTextView.js'
import { cellAt, tracks } from '../scene/table-grid.js'
import {
  fontFamily,
  textAlign, verticalAlign,
  inkColor,
  inkOf,
  readableInkOn,
  surfaceOf,
} from '../scene/style-tokens.js'
import { Swatches, groundOf, type SwatchKind } from '../controls/Swatches.js'
import { MinusIcon, PlusIcon } from '../controls/icons.js'

/**
 * What a colour lands on, named in the order somebody reaches for them.
 *
 * `label` is what the control shows and `name` is what the swatch grid is
 * called for a screen reader — "fill" alone would be three identically named
 * groups to anyone not looking at which tab is pressed.
 */
type CellTarget = 'fill' | 'text' | 'rule'

const CELL_TARGETS: readonly { key: CellTarget; label: string; name: string }[] = [
  { key: 'fill', label: 'fill', name: 'Cell background' },
  { key: 'text', label: 'text', name: 'Cell text colour' },
  { key: 'rule', label: 'rule', name: 'Cell rule colour' },
]

/** The same three specimens the record panel uses, for the same reason. */
const CELL_KIND: Readonly<Record<CellTarget, SwatchKind>> = {
  fill: 'surface',
  text: 'ink',
  rule: 'line',
}

const CELL_KEY: Readonly<Record<CellTarget, keyof CellStyle>> = {
  fill: 'fill',
  text: 'textColor',
  rule: 'border',
}

/**
 * One cell's own colours, as a style object, or `undefined` for none.
 *
 * `undefined` rather than an empty object: React treats `style={{}}` as a
 * value that changed on every render, and this runs once per cell per frame on
 * a grid that may hold hundreds.
 */
function cellPaint(cell: TableCell): CSSProperties | undefined {
  if (cell.fill === undefined && cell.textColor === undefined && cell.border === undefined) {
    return undefined
  }
  /*
   * The ink flips on the CELL's own fill, not the table's. A black cell in a
   * plain table is the case: the table says nothing about ink, so without this
   * the cell takes the board's and disappears into itself.
   */
  const ink = cell.textColor === undefined ? readableInkOn(cell.fill) : inkOf(cell.textColor)
  return {
    ...(cell.fill === undefined ? {} : { background: surfaceOf(cell.fill, 'gray') }),
    ...(ink === undefined ? {} : { color: ink }),
    ...(cell.border === undefined ? {} : { borderColor: inkOf(cell.border) }),
  }
}

/**
 * A table: one object holding a grid.
 *
 * Laid out with CSS grid and `fr` units, which are exactly the weight model
 * the data uses — so the browser divides the frame and a resize needs no
 * recalculation at all.
 */
function TableRenderer({ object }: ObjectViewProps<TableData>) {
  const { columns, rows, cells, headerRow } = object.data

  return (
    <div
      className="of-table"
      style={{
        gridTemplateColumns: tracks(columns),
        gridTemplateRows: tracks(rows),
        fontFamily: fontFamily(object.style.font),
        textAlign: textAlign(object.style.align),
        /*
         * A CUSTOM PROPERTY, because those inherit and `justify-content` does
         * not. This element is a grid, where `justify-content` distributes
         * tracks along the inline axis — so setting it here moved nothing at
         * all, and vertical alignment in a table did nothing until this line
         * changed. The cells read it in `.of-table__cell`.
         */
        ['--of-valign' as string]: verticalAlign(object.style.verticalAlign),
        // On the table, not on each cell: one declaration the cells inherit,
        // rather than a style object rebuilt per cell on every render.
        color: inkColor(object.style.textColor),
        // On the table; the cells read it through `currentcolor` on their rules.
        borderColor: inkColor(object.style.strokeColor),
        opacity: object.style.opacity ?? 1,
      }}
      role="table"
      aria-label={`Table, ${String(columns.length)} columns by ${String(rows.length)} rows`}
    >
      {cells.map((cell, index) => {
        const row = Math.floor(index / columns.length)
        return (
          <div
            // The index IS the identity: cells have no ids, and their position
            // is what they are.
            key={index}
            className={`of-table__cell${headerRow && row === 0 ? ' of-table__cell--head' : ''}`}
            role={headerRow && row === 0 ? 'columnheader' : 'cell'}
            /*
             * A cell's own colours, or nothing at all. Absent means "the
             * table's", and an absent CSS property is exactly that — writing
             * the table's current colour into each cell would stop the cell
             * following it.
             */
            style={cellPaint(cell)}
          >
            <div className="of-table__cell-text">
              <RichTextView value={cell.text} />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/**
 * Editing the grid: its contents AND its shape, committing ONE command.
 *
 * Adding a column while editing changes only this draft. It reaches the
 * document when the edit ends, together with whatever was typed — so building
 * a table is one undo entry, one save and one network message rather than one
 * per keystroke and one per column.
 *
 * The alternative was dispatching each shape change immediately, which closes
 * the editor every time: adding three columns would mean re-opening it three
 * times.
 */
function TableEditor({ object, at, zoom, Chrome, onCommit, onCancel }: ObjectEditorProps<TableData>) {
  /*
   * The whole table as a draft, not just its text. `resizeGrid` moves the
   * weights and the cells together, which is the only way the two cannot
   * disagree — and it is the same function the tests exercise directly.
   */
  const [draft, setDraft] = useState<TableData>(object.data)

  /*
   * Which cell the caret starts in, decided ONCE when the editor opens.
   *
   * A `useState` initialiser rather than a ref, because a ref read during
   * render is a render that depends on something React does not track — and
   * this value is read while deciding which field carries `autoFocus`.
   */
  const [started] = useState(() => {
    if (at === null) return 0
    const found = cellAt(object.data, object.frame, at)
    return found === null ? 0 : found.row * object.data.columns.length + found.column
  })

  /*
   * The cell range being dressed: an anchor and a focus, in the spreadsheet
   * sense. Click sets both; shift-click moves the focus and the rectangle
   * between them is what a colour lands on.
   *
   * Shift-click rather than drag-select, and that is a real trade. A cell is a
   * `textarea`, so a pointer drag inside one is the browser selecting TEXT —
   * taking that over would mean the cells stop being fields until something
   * says otherwise, which is a bigger rework of typing than this feature
   * earns. Shift-click is what a spreadsheet already teaches.
   */
  const [target, setTarget] = useState<CellTarget>('fill')
  const [anchor, setAnchor] = useState(started)
  const [focus, setFocus] = useState(started)
  const selected = cellRange(draft, anchor, focus)
  const inRange = new Set(selected)

  const commit = (): void => {
    onCommit({ columns: draft.columns, rows: draft.rows, cells: draft.cells })
  }

  /**
   * Dresses the selected cells.
   *
   * Into the DRAFT, like everything else in this editor, so colouring three
   * cells and typing in a fourth is one command, one undo entry and one
   * network message when the editor closes.
   */
  const dress = (patch: Partial<Record<keyof CellStyle, ColorValue | null>>): void => {
    setDraft((current) => styleCells(current, cellRange(current, anchor, focus), patch))
  }

  /** What the selection agrees on, or `undefined` if it does not. */
  const agreed = (key: keyof CellStyle): ColorValue | undefined => {
    const first = draft.cells[selected[0] ?? -1]?.[key]
    return selected.every((index) => draft.cells[index]?.[key] === first) ? first : undefined
  }

  const reshape = (axis: 'column' | 'row', delta: 1 | -1): void => {
    setDraft((current) => resizeGrid(current, axis, delta))
  }

  /*
   * The shape buttons do not TAKE focus, so the caret stays in the cell you
   * were typing in while you add a column beside it.
   *
   * Comfort, not correctness — and worth saying, because it was written as
   * the fix for the editor closing on every press and it was not. That was
   * the canvas reading the press as a gesture, and it is fixed where gestures
   * are decided; removing these four handlers leaves every test green.
   */
  const keepFocus = (event: { preventDefault: () => void }): void => {
    event.preventDefault()
  }

  const width = draft.columns.length

  return (
    <div
      className="of-table-edit of-editor-chrome"
      data-testid="table-editor"
      onBlur={(event) => {
        /*
         * Committed only when focus leaves the whole editor, not when it moves
         * between cells or onto one of the buttons. Tabbing from one cell to
         * the next is still one edit.
         */
        if (
          event.relatedTarget instanceof Node &&
          event.currentTarget.contains(event.relatedTarget)
        ) {
          return
        }
        /*
         * The apparatus is PORTALED out of this element, so `contains` says a
         * click on a swatch left the editor — and committing there closed it
         * mid-edit. The layer is the editor as far as focus is concerned: the
         * DOM is what knows where a portal landed, which is the same fallback
         * rule 15 uses for chrome outside an object's world bounds.
         */
        if (
          event.relatedTarget instanceof Element &&
          event.relatedTarget.closest('[data-chrome-layer]') !== null
        ) {
          return
        }
        commit()
      }}
    >
      <div
        className="of-table of-table--editing"
        style={{
          gridTemplateColumns: tracks(draft.columns),
          gridTemplateRows: tracks(draft.rows),
          fontFamily: fontFamily(object.style.font),
          color: inkColor(object.style.textColor),
        }}
      >
        {draft.cells.map((cell, index) => (
          <textarea
            key={index}
            className={`of-table__cell of-table__input${
              draft.headerRow && Math.floor(index / width) === 0 ? ' of-table__cell--head' : ''
            }`}
            value={plainTextOf(cell.text)}
            autoFocus={index === started}
            aria-label={`Row ${String(Math.floor(index / width) + 1)}, column ${String(
              (index % width) + 1,
            )}`}
            data-testid={`table-cell-${String(index)}`}
            data-selected={inRange.has(index) ? 'true' : undefined}
            /*
             * The ring is 2px ON SCREEN, so it is divided by the zoom like
             * every other piece of chrome here — at 400% a 2px inset ring is
             * 8px of accent and reads as a filled border rather than as a
             * selection.
             */
            style={{
              ...cellPaint(cell),
              ...(inRange.has(index)
                ? { boxShadow: `inset 0 0 0 ${String(2 / zoom)}px var(--of-accent)` }
                : {}),
            }}
            onPointerDown={(event) => {
              /*
               * Shift EXTENDS from the anchor; a plain press starts a new
               * range where it landed. `preventDefault` only on the extend:
               * without it the browser moves focus and selects text across
               * two fields, and with it on every press you could not put the
               * caret anywhere.
               */
              if (event.shiftKey) {
                event.preventDefault()
                setFocus(index)
                return
              }
              setAnchor(index)
              setFocus(index)
            }}
            onChange={(event) => {
              const text = event.target.value
              setDraft((current) => ({
                ...current,
                /*
                 * Only the edited cell is rebuilt. Cells hold plain text
                 * today so nothing is lost either way — but the moment one
                 * holds a formatted span, rebuilding every cell on every
                 * keystroke would flatten the table because somebody
                 * corrected a typo in one corner.
                 */
                cells: current.cells.map((old, other) =>
                  other === index ? { text: [{ text }] } : old,
                ),
              }))
            }}
            onKeyDown={(event) => {
              // The board's own shortcuts must not fire while typing in a cell.
              event.stopPropagation()
              if (event.key === 'Escape') {
                onCancel()
                return
              }
              /*
               * Enter commits; Shift+Enter is a line inside the cell. A table
               * holds short values, so finishing is the common case and the
               * plain key is what makes it quick.
               */
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                commit()
              }
            }}
          />
        ))}
      </div>

      {/*
        * CELL COLOURS, acting on the selected range.
        *
        * ONE palette and a target, not three palettes. Eleven colours times
        * three properties is thirty-three swatches in a bar wider than the
        * table it belongs to, with the two ink grids indistinguishable from
        * each other — you had to count columns to know which one you were
        * about to press. Naming the target first is how every paint tool has
        * solved this, and it costs one press that you were making anyway by
        * aiming.
        *
        * Here rather than in the record panel: the panel's fields come from
        * the registry's `styleProps` and apply to whole OBJECTS. A cell is not
        * one, and teaching the panel about "the selected cells of the selected
        * table" would put type-specific knowledge in the one component that
        * exists to have none — rule 21.
        *
        * Rendered into `Chrome`, so it sits in SCREEN space beside the cells
        * it acts on. Inside the editor it was multiplied by the zoom and
        * anchored to the table's top edge, which is off the window as soon as
        * you zoom into a large table — and it pointed at the table rather than
        * at the selection, which is not what it changes.
        */}
      <Chrome anchor={cellRegion(draft, selected)} prefer={['above', 'below']}>
      <div className="of-cellbar of-surface" data-testid="table-cell-style">
        <div className="of-cellbar__head">
          <span className="of-cellbar__count">
            {selected.length === 1 ? '1 cell' : `${String(selected.length)} cells`}
          </span>
          <div className="of-choice of-cellbar__target" role="group" aria-label="What to colour">
            {CELL_TARGETS.map((option) => (
              <button
                key={option.key}
                type="button"
                className={`of-choice__item${target === option.key ? ' of-choice__item--on' : ''}`}
                aria-pressed={target === option.key}
                data-testid={`cell-target-${option.key}`}
                onMouseDown={keepFocus}
                onClick={() => {
                  setTarget(option.key)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="of-button of-button--ghost of-cellbar__clear"
            // Says what it puts back, not just that it removes something.
            title="Use the table's own colours"
            data-testid="cell-clear"
            onMouseDown={keepFocus}
            onClick={() => {
              /*
               * Back to the table's own colours, which no token can express:
               * every colour in the palette is A colour, and "whatever the
               * table is" is the absence of one.
               */
              dress({ fill: null, textColor: null, border: null })
            }}
          >
            Reset
          </button>
        </div>

        <Swatches
          kind={CELL_KIND[target]}
          label={CELL_TARGETS.find((option) => option.key === target)?.name ?? 'Colour'}
          testPrefix={`cell-${target}`}
          current={agreed(CELL_KEY[target])}
          /*
           * Read against what the cell actually stands on: its own fill when
           * the range agrees on one, the board otherwise. The table's own
           * colour is not it — a table has no surface.
           */
          against={target === 'fill' ? null : groundOf(agreed('fill'))}
          onPick={(colour) => {
            dress({ [CELL_KEY[target]]: colour })
          }}
        />
      </div>
      </Chrome>

      {/*
        * The shape controls, beside the axis each one changes: columns on the
        * right, rows underneath. A row of four identical buttons in a corner
        * would make you read every label to find the one you want.
        */}
      <Chrome anchor={{ x: 1, y: 0, width: 0, height: 1 }} prefer={['right', 'left']}>
      <div className="of-table-edit__columns of-surface" role="group" aria-label="Columns">
        <button
          type="button"
          className="of-icon-button"
          aria-label="Add a column"
          data-testid="table-add-column"
          onMouseDown={keepFocus}
          onClick={() => {
            reshape('column', 1)
          }}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className="of-icon-button"
          aria-label="Remove the last column"
          disabled={width <= 1}
          data-testid="table-remove-column"
          onMouseDown={keepFocus}
          onClick={() => {
            reshape('column', -1)
          }}
        >
          <MinusIcon />
        </button>
      </div>

      </Chrome>

      <Chrome anchor={{ x: 0, y: 1, width: 1, height: 0 }} prefer={['below', 'above']}>
      <div className="of-table-edit__rows of-surface" role="group" aria-label="Rows">
        <button
          type="button"
          className="of-icon-button"
          aria-label="Add a row"
          data-testid="table-add-row"
          onMouseDown={keepFocus}
          onClick={() => {
            reshape('row', 1)
          }}
        >
          <PlusIcon />
        </button>
        <button
          type="button"
          className="of-icon-button"
          aria-label="Remove the last row"
          disabled={draft.rows.length <= 1}
          data-testid="table-remove-row"
          onMouseDown={keepFocus}
          onClick={() => {
            reshape('row', -1)
          }}
        >
          <MinusIcon />
        </button>
      </div>
      </Chrome>
    </div>
  )
}

export const tableView = defineObjectView<TableData>({
  type: 'table',
  Renderer: TableRenderer,
  InlineEditor: TableEditor,
})
