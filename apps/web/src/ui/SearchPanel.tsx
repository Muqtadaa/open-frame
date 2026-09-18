import { searchBoard, type SearchResult } from '@openframe/core'
import { useEffect, useMemo, useRef, useState } from 'react'

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
  const inputRef = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  const results = useMemo<readonly SearchResult[]>(
    () => (open ? searchBoard(document, runtime.registry, query) : []),
    [open, document, runtime.registry, query],
  )

  if (!open) return null

  const shown = results.slice(0, MAX_RESULTS)
  const close = (): void => {
    setOpen(false)
    setQuery('')
    setActive(0)
  }
  const go = (index: number): void => {
    const result = shown[index]
    if (result === undefined) return
    // Selects it AND pans the minimum needed to see it, so a result is never
    // "found" somewhere the user cannot look at.
    commands.reveal(result.id)
    close()
  }

  return (
    <div className="of-search" data-testid="search-panel" role="dialog" aria-label="Find on board">
      <input
        ref={inputRef}
        type="search"
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
          if (event.key === 'Escape') close()
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
            ? 'nothing found'
            : `${String(results.length)} found${results.length > shown.length ? `, showing ${String(shown.length)}` : ''}`}
        </div>
      )}

      <ul className="of-search__results" aria-label="Results">
        {shown.map((result, index) => (
          <li key={result.id}>
            <button
              type="button"
              className={`of-search__result${index === active ? ' of-search__result--on' : ''}`}
              data-testid={`search-result-${result.id}`}
              onMouseEnter={() => {
                setActive(index)
              }}
              onClick={() => {
                go(index)
              }}
            >
              {/* The type, so a result is legible when two objects say the
                  same words — which is exactly what promotion produces. */}
              <span className="of-search__type">{result.type}</span>
              <span className="of-search__summary">{result.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
