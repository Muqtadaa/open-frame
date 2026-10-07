import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react'

import { applyTheme, readTheme } from '../app/theme.js'
import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { ExpandIcon } from '../controls/icons.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useDismiss } from '../controls/use-dismiss.js'
import { useOpenFrame } from '../runtime/context.js'
import { useServices } from '../runtime/services.js'
import { VersionHistorySheet } from './VersionHistory.js'

/**
 * What can be done to the board as a whole, from beside its name.
 *
 * The name renames itself on a press, as it always has; this is the rest:
 * the board's history, which had a clock face of its own on the bar among
 * the session's tools, and — where there are no accounts to keep it in — the
 * page's theme. Offered only when there is something besides Rename, because
 * a menu holding one entry the name already does is a second way to the same
 * place.
 */
export function BoardMenu({ onRename }: { readonly onRename: (() => void) | null }) {
  const { history } = useOpenFrame()
  const { accounts } = useServices()
  const [open, setOpen] = useState<'menu' | 'history' | null>(null)
  const { ref, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open !== null)
  const menu = useRef<HTMLDivElement>(null)
  const close = useCallback(() => {
    setOpen(null)
    ref.current?.focus()
  }, [ref])
  useDismiss(menu, ref, close, open === 'menu')

  // Into the menu on arrival, at its first entry.
  useEffect(() => {
    if (open !== 'menu' || anchor === null) return
    menu.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus()
  }, [open, anchor])

  const hasHistory = history !== null && history !== undefined
  // The theme lives in the account sheet; without accounts it lives here.
  const worldHere = !accounts.enabled
  if (!hasHistory && !worldHere) return null

  const step = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Tab') {
      event.preventDefault()
      close()
      return
    }
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role^="menuitem"]')]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const last = items.length - 1
    const next =
      event.key === 'ArrowDown'
        ? at >= last
          ? 0
          : at + 1
        : event.key === 'ArrowUp'
          ? at <= 0
            ? last
            : at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    event.stopPropagation()
    items[next]?.focus()
  }

  const afterHours = readTheme() === 'after-hours'

  return (
    <>
      <button
        ref={ref}
        type="button"
        className="of-icon-button of-status__board-menu"
        aria-label="Board"
        data-tip="Board"
        aria-haspopup="menu"
        aria-expanded={open === 'menu'}
        data-testid="board-menu"
        onClick={() => {
          setOpen((was) => (was === null ? 'menu' : null))
        }}
      >
        <ExpandIcon />
      </button>

      {open === 'menu' && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="board-menu-surface"
        >
          <div
            ref={menu}
            className="of-menu of-surface"
            role="menu"
            aria-label="Board"
            onKeyDown={step}
          >
            {onRename !== null && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="of-menu__item"
                data-testid="board-menu-rename"
                onClick={() => {
                  setOpen(null)
                  onRename()
                }}
              >
                Rename
              </button>
            )}
            {hasHistory && (
              <button
                type="button"
                role="menuitem"
                tabIndex={-1}
                className="of-menu__item"
                aria-haspopup="dialog"
                data-testid="board-menu-history"
                onClick={() => {
                  setOpen('history')
                }}
              >
                Version history…
              </button>
            )}
            {worldHere && (
              <button
                type="button"
                role="menuitemcheckbox"
                tabIndex={-1}
                aria-checked={afterHours}
                className="of-menu__item"
                data-testid="board-menu-theme"
                onClick={() => {
                  applyTheme(afterHours ? 'notebook' : 'after-hours')
                  close()
                }}
              >
                After Hours theme
                <span className="of-menu__shortcut" aria-hidden="true">
                  {afterHours ? 'On' : 'Off'}
                </span>
              </button>
            )}
          </div>
        </AnchoredSurface>
      )}

      {open === 'history' && (
        <VersionHistorySheet anchor={anchor} surface={surface} trigger={ref} onClose={close} />
      )}
    </>
  )
}
