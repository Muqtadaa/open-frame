import type { ObjectId } from '@openframe/core'
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useCommands } from '../hooks/use-commands.js'
import { useMe } from '../hooks/use-me.js'
import { useOptionsPanelRect } from './options-panel.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { emojiKey } from '../scene/reaction-glyphs.js'
import {
  loadEmojiLibrary,
  searchEmoji,
  type LibraryEmoji,
  type LibraryGroup,
} from './emoji-library.js'
import { wrapTab } from '../controls/wrap-tab.js'

/** Emoji per row, which is also how far Up and Down move. */
const COLUMNS = 8

/**
 * Every standard emoji, for a reaction the bar does not offer.
 *
 * Opened from the bar's More button or the context menu's React submenu, and
 * reacts to whatever it was opened for. It is a MENU on the chrome layer: it
 * paints over everything, closes on Escape or a press outside, and gives focus
 * back to whatever opened it.
 *
 * Type to search by name; the arrows walk the grid, so reaching the six
 * hundredth emoji is not six hundred presses of Tab.
 */
export function ReactionPicker() {
  const picker = useInteractionStore((state) => state.reactionPicker)
  if (picker === null) return null
  return <Picker targets={picker.targets} anchor={picker.anchor} />
}

function Picker({
  targets,
  anchor,
}: {
  readonly targets: readonly ObjectId[]
  readonly anchor: { x: number; y: number; width: number; height: number }
}) {
  const panel = useOptionsPanelRect()
  const close = useInteractionStore((state) => state.closeReactionPicker)
  const canvasSize = useInteractionStore((state) => state.canvasSize)
  const commands = useCommands()
  const me = useMe()
  const [library, setLibrary] = useState<readonly LibraryGroup[] | null>(null)
  const [failed, setFailed] = useState(false)
  const [query, setQuery] = useState('')
  const root = useRef<HTMLDivElement>(null)
  const search = useRef<HTMLInputElement>(null)
  // Where focus was when the picker opened, to give it back on the way out.
  const opener = useRef<Element | null>(document.activeElement)

  useEffect(() => {
    let live = true
    loadEmojiLibrary().then(
      (groups) => {
        if (live) setLibrary(groups)
      },
      () => {
        if (live) setFailed(true)
      },
    )
    return () => {
      live = false
    }
  }, [])

  useEffect(() => {
    search.current?.focus()
  }, [])

  const dismiss = (): void => {
    close()
    const back = opener.current
    if (back instanceof HTMLElement && back.isConnected) back.focus()
  }

  useEffect(() => {
    const outside = (event: PointerEvent): void => {
      if (event.target instanceof Node && root.current?.contains(event.target)) return
      close()
    }
    // Capture phase, as the context menu does: the canvas would take the
    // press first and treat it as a board gesture.
    window.addEventListener('pointerdown', outside, true)
    return () => {
      window.removeEventListener('pointerdown', outside, true)
    }
  }, [close])

  const results = useMemo(
    () => (library === null ? [] : searchEmoji(library, query)),
    [library, query],
  )
  const searching = query.trim() !== ''

  const pick = (item: LibraryEmoji): void => {
    if (me !== null) commands.toggleReaction(targets, emojiKey(item.emoji), me)
    dismiss()
  }

  const cells = (): HTMLButtonElement[] => [
    ...(root.current?.querySelectorAll<HTMLButtonElement>('[data-emoji-cell]') ?? []),
  ]

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    wrapTab(event)
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopPropagation()
      dismiss()
      return
    }
    const all = cells()
    const at = all.indexOf(document.activeElement as HTMLButtonElement)
    const step =
      event.key === 'ArrowRight'
        ? 1
        : event.key === 'ArrowLeft'
          ? -1
          : event.key === 'ArrowDown'
            ? COLUMNS
            : event.key === 'ArrowUp'
              ? -COLUMNS
              : 0
    if (step === 0) return
    // From the search field, Down goes into the grid; Up from the top row
    // goes back to the field.
    if (at === -1) {
      if (event.key !== 'ArrowDown') return
      event.preventDefault()
      all[0]?.focus()
      return
    }
    event.preventDefault()
    const next = at + step
    if (next < 0) search.current?.focus()
    else all[Math.min(next, all.length - 1)]?.focus()
  }

  /*
   * The first emoji in view takes Tab, the rest are walked with the arrows.
   * With every cell out of the tab order, Tab went from the search field
   * straight past the list, and nothing in the scrolling region could be
   * reached without knowing the arrows (axe, audit 2026-10-08).
   */
  const first = searching ? results[0]?.slug : library?.[0]?.emojis[0]?.slug
  const cell = (item: LibraryEmoji) => (
    <button
      key={item.slug}
      type="button"
      className="of-emoji-picker__cell"
      data-emoji-cell=""
      data-testid={`emoji-${item.slug}`}
      aria-label={item.name}
      tabIndex={item.slug === first ? 0 : -1}
      onClick={() => {
        pick(item)
      }}
    >
      {item.emoji}
    </button>
  )

  return (
    <AnchoredSurface
      anchor={anchor}
      surface={canvasSize}
      prefer={['below', 'above', 'right', 'left']}
      layer="menu"
      // Off the record panel: it opened over the swatches beside the note.
      avoid={panel}
      testId="reaction-picker"
    >
      <div
        ref={root}
        className="of-emoji-picker of-surface"
        role="dialog"
        aria-label="Emoji"
        onKeyDown={onKeyDown}
      >
        <input
          ref={search}
          type="search"
          className="of-input of-emoji-picker__search"
          aria-label="Search emoji"
          placeholder="Search emoji"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
          }}
        />
        <div className="of-emoji-picker__list" data-scroll="">
          {failed ? (
            <p className="of-emoji-picker__note">The emoji could not be loaded.</p>
          ) : library === null ? (
            <p className="of-emoji-picker__note">Loading…</p>
          ) : searching ? (
            results.length === 0 ? (
              <p className="of-emoji-picker__note" role="status">
                No matches
              </p>
            ) : (
              <div className="of-emoji-picker__grid" role="group" aria-label="Results">
                {results.map(cell)}
              </div>
            )
          ) : (
            library.map((group) => (
              <section key={group.name} className="of-emoji-picker__group">
                <h3 className="of-emoji-picker__heading">{group.name}</h3>
                <div className="of-emoji-picker__grid" role="group" aria-label={group.name}>
                  {group.emojis.map(cell)}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </AnchoredSurface>
  )
}
