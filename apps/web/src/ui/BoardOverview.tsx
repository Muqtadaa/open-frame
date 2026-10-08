import {
  outlineBoard,
  type AnyOpenFrameObject,
  type ObjectId,
  type OutlineEntry,
} from '@openframe/core'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'

import { DisclosureIcon } from '../controls/icons.js'
import { useCommands } from '../hooks/use-commands.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { readingOrder } from '../scene/reading-order.js'
import { countOfType, typeTitle } from '../scene/type-noun.js'
import { wrapTab } from '../controls/wrap-tab.js'

/**
 * How many objects one level of the list shows before the rest are a single
 * "more" entry. A board of ten thousand notes is not read one at a time; the
 * frames are the way in, and search is the way to the rest.
 */
const MAX_LISTED = 200

/** Rows within this many world units of each other's tops read as one line, as Tab reads them. */
const ROW_BAND = 40

/** One row of the tree as drawn: an object, the group of claims citing nothing, or "more". */
interface Row {
  readonly key: string
  readonly depth: number
  readonly parent: string | null
  readonly label: string
  readonly content: ReactNode
  /** Undefined for a row that cannot be opened; otherwise whether it is. */
  readonly expanded?: boolean
  /** What choosing it does: go to an object, open or close the row, or search for the rest. */
  readonly action: { readonly go: ObjectId } | 'toggle' | 'search'
}

/**
 * The board told as a whole, for somebody who cannot see it — and useful to
 * anybody: what is on it, how it is organised, what it claims without grounds.
 *
 * Opened with Alt+S, where Miro puts its board summary. Tab already walks
 * every object in reading order and the announcer names each one; what was
 * missing was the overview, so somebody arriving on a board of three hundred
 * notes had to walk all of them to learn it had five frames.
 *
 * A TREE, because containment is the point: frames are listed closed, with
 * how much they hold, and opened on request. Choosing anything selects it,
 * pans to it and hands the keyboard back to the board, so Tab carries on from
 * there and the announcer says what was chosen.
 *
 * Read from the document, never the DOM: the canvas renders only what is in
 * view, and a frame's members are its siblings in the DOM, not its children.
 */
export function BoardOverview() {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const open = useInteractionStore((state) => state.overviewOpen)
  const setOpen = useInteractionStore((state) => state.setOverviewOpen)
  const setSearchOpen = useInteractionStore((state) => state.setSearchOpen)
  const commands = useCommands()
  const panelRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<HTMLUListElement>(null)
  const returnTo = useRef<HTMLElement | null>(null)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!open) return
    const was = window.document.activeElement
    /*
     * Never a place inside the panel. It mounts already open now that it
     * loads on request, and an effect that runs twice on mount (StrictMode
     * does it on purpose) found focus already in the tree the second time —
     * so Escape handed the keyboard to an element that was about to go.
     */
    if (
      was instanceof HTMLElement &&
      was !== window.document.body &&
      panelRef.current?.contains(was) !== true
    ) {
      returnTo.current = was
    }
    // An empty board has no tree; the panel itself takes the keyboard then.
    ;(treeRef.current ?? panelRef.current)?.focus()
  }, [open])

  // Worked out only while it is open, and once per document — never per frame.
  const outline = useMemo(
    () => (open ? outlineBoard(document, runtime.registry) : null),
    [open, document, runtime.registry],
  )

  const close = useCallback(
    (focus: 'back' | 'board'): void => {
      setOpen(false)
      setExpanded(new Set())
      setActive(0)
      const board = window.document.querySelector<HTMLElement>('[data-testid="canvas"]')
      // After choosing, the board: Tab carries on from what was chosen.
      ;(focus === 'board' ? board : (returnTo.current ?? board))?.focus()
    },
    [setOpen],
  )

  useEffect(() => {
    if (!open) return
    const outside = (event: Event): void => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target) === true) return
      close('back')
    }
    window.addEventListener('pointerdown', outside, true)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
    }
  }, [open, close])

  const rows = useMemo<readonly Row[]>(() => {
    if (outline === null) return []
    const out: Row[] = []

    const described = (object: AnyOpenFrameObject): string => {
      const gist = runtime.registry.describeObject(object).gist
      return gist === '' ? typeTitle(object.type) : `${typeTitle(object.type)}: ${gist}`
    }
    const inReadingOrder = (entries: readonly OutlineEntry[]): OutlineEntry[] => {
      const byId = new Map(entries.map((entry) => [entry.object.id as string, entry]))
      const placed = entries.map((entry) => {
        const bounds = runtime.registry.boundsOf(entry.object, document)
        return { id: entry.object.id, x: bounds.x, y: bounds.y }
      })
      return readingOrder(placed, ROW_BAND).flatMap((id) => byId.get(id) ?? [])
    }
    const more = (key: string, depth: number, parent: string | null, count: number): Row => ({
      key,
      depth,
      parent,
      label: `${String(count)} more`,
      content: `${String(count)} more — find on board`,
      action: 'search',
    })

    const walk = (entries: readonly OutlineEntry[], depth: number, parent: string | null) => {
      const ordered = inReadingOrder(entries)
      for (const entry of ordered.slice(0, MAX_LISTED)) {
        const key = entry.object.id as string
        const opens = entry.members.length > 0
        const label = described(entry.object)
        const held = entry.held === 1 ? '1 object' : `${String(entry.held)} objects`
        out.push({
          key,
          depth,
          parent,
          // A container says what it holds even when that is nothing.
          label: entry.holds ? `${label}, ${held}` : label,
          content: entry.holds ? (
            <>
              {label}
              <span className="of-overview__held">{held}</span>
            </>
          ) : (
            label
          ),
          ...(opens ? { expanded: expanded.has(key) } : {}),
          action: { go: entry.object.id },
        })
        if (opens && expanded.has(key)) walk(entry.members, depth + 1, key)
      }
      if (ordered.length > MAX_LISTED) {
        out.push(more(`${parent ?? 'top'}:more`, depth, parent, ordered.length - MAX_LISTED))
      }
    }

    // What the board claims without grounds comes first: it can be acted on.
    const bare = outline.unsupported.flatMap(({ ids }) =>
      ids.flatMap((id) => document.objects.get(id) ?? []),
    )
    if (bare.length > 0) {
      const key = 'citing-nothing'
      out.push({
        key,
        depth: 0,
        parent: null,
        label: `Citing nothing, ${String(bare.length)}`,
        content: (
          <>
            Citing nothing<span className="of-overview__held">{String(bare.length)}</span>
          </>
        ),
        expanded: expanded.has(key),
        action: 'toggle',
      })
      if (expanded.has(key)) {
        for (const object of bare.slice(0, MAX_LISTED)) {
          out.push({
            key: `${key}:${object.id}`,
            depth: 1,
            parent: key,
            label: described(object),
            content: described(object),
            action: { go: object.id },
          })
        }
        if (bare.length > MAX_LISTED)
          out.push(more(`${key}:more`, 1, key, bare.length - MAX_LISTED))
      }
    }
    walk(outline.top, 0, null)
    return out
  }, [outline, expanded, document, runtime.registry])

  if (!open || outline === null) return null

  const current = rows[Math.min(active, rows.length - 1)]
  const rowId = (row: Row): string => `of-overview-${row.key.replace(/[^A-Za-z0-9_-]/g, '_')}`
  const go = (index: number): void => {
    setActive(Math.max(0, Math.min(rows.length - 1, index)))
  }
  const indexOf = (key: string | null): number => rows.findIndex((row) => row.key === key)
  const choose = (row: Row): void => {
    if (row.action === 'toggle') {
      setExpanded((now) => toggled(now, row.key))
    } else if (row.action === 'search') {
      close('back')
      setSearchOpen(true)
    } else {
      commands.reveal(row.action.go)
      close('board')
    }
  }

  const summary =
    outline.total === 0
      ? 'Nothing on this board.'
      : `${String(outline.total)} ${outline.total === 1 ? 'object' : 'objects'}: ${outline.counts
          .map(({ type, count }) => countOfType(type, count))
          .join(', ')}.`
  const grounds =
    outline.unsupported.length === 0
      ? null
      : `Citing nothing: ${outline.unsupported
          .map(({ type, ids }) => countOfType(type, ids.length))
          .join(', ')}.`

  return (
    <div
      ref={panelRef}
      className="of-overview of-surface"
      data-testid="board-overview"
      role="dialog"
      aria-label="Board overview"
      aria-describedby="of-overview-summary"
      aria-modal="true"
      tabIndex={-1}
      onKeyDown={(event) => {
        wrapTab(event)
        if (event.key !== 'Escape') return
        event.stopPropagation()
        event.preventDefault()
        close('back')
      }}
    >
      <h2 className="of-overview__title">{document.meta.title}</h2>
      <div id="of-overview-summary">
        <p className="of-overview__summary" data-testid="overview-summary">
          {summary}
        </p>
        {grounds !== null && (
          <p className="of-overview__summary" data-testid="overview-grounds">
            {grounds}
          </p>
        )}
      </div>
      {rows.length > 0 && (
        <ul
          ref={treeRef}
          className="of-overview__tree"
          role="tree"
          aria-label="Objects"
          tabIndex={0}
          aria-activedescendant={current === undefined ? undefined : rowId(current)}
          data-testid="overview-tree"
          onKeyDown={(event) => {
            // The board's own keys must not fire while reading the list.
            event.stopPropagation()
            // The tree is the overview's only stop: Tab stays on it rather than
            // walking out while the overview is open.
            if (event.key === 'Tab') {
              event.preventDefault()
              return
            }
            if (current === undefined) return
            const at = indexOf(current.key)
            switch (event.key) {
              case 'ArrowDown':
                go(at + 1)
                break
              case 'ArrowUp':
                go(at - 1)
                break
              case 'Home':
                go(0)
                break
              case 'End':
                go(rows.length - 1)
                break
              case 'ArrowRight':
                if (current.expanded === false) setExpanded((now) => toggled(now, current.key))
                else if (current.expanded === true) go(at + 1)
                break
              case 'ArrowLeft':
                if (current.expanded === true) setExpanded((now) => toggled(now, current.key))
                else if (current.parent !== null) go(indexOf(current.parent))
                break
              case 'Enter':
                choose(current)
                break
              case 'Escape':
                close('back')
                break
              default:
                return
            }
            event.preventDefault()
          }}
        >
          {rows.map((row, index) => (
            <li
              key={row.key}
              id={rowId(row)}
              role="treeitem"
              aria-level={row.depth + 1}
              aria-label={row.label}
              aria-selected={index === active}
              {...(row.expanded === undefined ? {} : { 'aria-expanded': row.expanded })}
              className={`of-overview__row${index === active ? ' of-overview__row--on' : ''}`}
              style={{ '--of-depth': row.depth } as CSSProperties}
              data-testid={`overview-row-${row.key}`}
              onPointerEnter={() => {
                setActive(index)
              }}
              onPointerDown={(event) => {
                // The tree keeps the keyboard; the pointer drives the same rows.
                event.preventDefault()
              }}
              onClick={(event) => {
                /*
                 * The arrow opens what a row holds; the row itself goes there,
                 * as Enter does. A click anywhere on a frame used to only open
                 * it, so visiting a frame took a press and then a second one
                 * on a row that had moved.
                 */
                const onArrow =
                  event.target instanceof Element &&
                  event.target.closest('.of-overview__twisty') !== null
                if (onArrow && row.expanded !== undefined)
                  setExpanded((now) => toggled(now, row.key))
                else choose(row)
              }}
            >
              {row.expanded !== undefined && (
                <span
                  className="of-overview__twisty"
                  data-testid="overview-twisty"
                  aria-hidden="true"
                >
                  {/*
                    Drawn, not typed: the rest of the interface draws its
                    disclosure, and a font's triangles sit at its own size and
                    weight (audit 2026-10-08).
                  */}
                  <DisclosureIcon />
                </span>
              )}
              {row.content}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function toggled(set: ReadonlySet<string>, key: string): ReadonlySet<string> {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}
