import { searchBoard, type SearchResult } from '@openframe/core'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useCommands } from '../hooks/use-commands.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'

/**
 * Enough to be useful, few enough to read. A search that returns four hundred
 * notes has not answered anything, and the query is the way to narrow it.
 */
const MAX_RESULTS = 40

/**
 * Finding things on a board by what they MEAN, not only by what they say.
 *
 * This is what `describe()` was always for. Every type has declared a
 * `searchText` since Phase 1 and nothing read it — so a piece of evidence's
 * source and participant were in the document, flattened, and unreachable.
 *
 * Opened with Cmd/Ctrl+F, claimed from the browser's own find-in-page, which
 * would search the DOM: only the objects currently culled in, and none of their
 * fields.
 */
export function SearchPanel() {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const open = useInteractionStore((state) => state.searchOpen)
  const setOpen = useInteractionStore((state) => state.setSearchOpen)
  const commands = useCommands()
  const panelRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  /*
   * Where the keyboard was before the panel opened. Enter and Escape both
   * left focus on the page's body — somebody searching by keyboard was put
   * back at the top of the document after every search.
   */
  const returnTo = useRef<HTMLElement | null>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (!open) return
    const was = window.document.activeElement
    returnTo.current = was instanceof HTMLElement && was !== window.document.body ? was : null
    inputRef.current?.focus()
  }, [open])

  const results = useMemo<readonly SearchResult[]>(
    () => (open ? searchBoard(document, runtime.registry, query) : []),
    [open, document, runtime.registry, query],
  )

  const close = useCallback((): void => {
    setOpen(false)
    setQuery('')
    setActive(0)
    returnTo.current?.focus()
  }, [setOpen])

  /*
   * A press anywhere else closes it, like every other surface that is
   * summoned. It stayed open over the board until Escape found it.
   */
  useEffect(() => {
    if (!open) return
    const outside = (event: Event): void => {
      if (event.target instanceof Node && panelRef.current?.contains(event.target) === true) return
      close()
    }
    window.addEventListener('pointerdown', outside, true)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
    }
  }, [open, close])

  if (!open) return null

  const shown = results.slice(0, MAX_RESULTS)
  const go = (index: number): void => {
    const result = shown[index]
    if (result === undefined) return
    // Selects it AND pans the minimum needed to see it, so a result is never
    // "found" somewhere the user cannot look at.
    commands.reveal(result.id)
    close()
  }
  const optionId = (index: number): string => `of-search-option-${String(index)}`

  return (
    /*
     * A COMBOBOX: the keyboard never leaves the box, and the list says which
     * result it is on through `aria-activedescendant`. The results were
     * buttons with a highlight only a sighted user could see — arrowing moved
     * a class, and a screen reader heard nothing.
     */
    <div
      ref={panelRef}
      className="of-search of-surface"
      data-testid="search-panel"
      role="dialog"
      aria-label="Find on board"
    >
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={shown.length > 0}
        aria-controls="of-search-results"
        aria-autocomplete="list"
        aria-activedescendant={shown.length > 0 ? optionId(active) : undefined}
        className="of-search__input"
        value={query}
        // The placeholder is the entire grammar. A query language that needs
        // documentation is too big for a box on a canvas.
        placeholder="Find…  type:evidence  #pricing"
        aria-label="Find on board"
        data-testid="search-input"
        onChange={(event) => {
          setQuery(event.target.value)
          setActive(0)
        }}
        onKeyDown={(event) => {
          // The board's own shortcuts must not fire while typing a query.
          event.stopPropagation()
          if (event.key === 'Escape') {
            event.preventDefault()
            close()
          }
          if (event.key === 'Enter') go(active)
          if (event.key === 'ArrowDown') {
            event.preventDefault()
            setActive((n) => Math.min(shown.length - 1, n + 1))
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            setActive((n) => Math.max(0, n - 1))
          }
        }}
      />

      {query.trim() !== '' && (
        <div className="of-search__count" data-testid="search-count" aria-live="polite">
          {results.length === 0
            ? // A way forward, not a dead end: the one filter that always narrows.
              'nothing found — try a kind, like type:sticky or type:evidence'
            : `${String(results.length)} found${results.length > shown.length ? `, showing ${String(shown.length)}` : ''}`}
        </div>
      )}

      <ul id="of-search-results" className="of-search__results" role="listbox" aria-label="Results">
        {shown.map((result, index) => {
          /*
           * What it SAYS, beside the type column — not the summary, which
           * names the type a second time ("frame  Frame: Discovery").
           */
          const object = document.objects.get(result.id)
          const gist = object === undefined ? '' : runtime.registry.describeObject(object).gist
          return (
            <li
              key={result.id}
              id={optionId(index)}
              role="option"
              aria-selected={index === active}
              className={`of-search__result${index === active ? ' of-search__result--on' : ''}`}
              data-testid={`search-result-${result.id}`}
              onPointerEnter={() => {
                setActive(index)
              }}
              // Pressed without taking focus from the box, so the keyboard
              // and the pointer drive the same list.
              onPointerDown={(event) => {
                event.preventDefault()
              }}
              onClick={() => {
                go(index)
              }}
            >
              {/* The type, so a result is legible when two objects say the
                  same words — which is exactly what promotion produces. */}
              <span className="of-search__type">{result.type}</span>
              <span className="of-search__summary">{gist !== '' ? gist : result.summary}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
