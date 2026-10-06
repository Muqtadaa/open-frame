import { useEffect, useRef, useState } from 'react'

import { previewRuntime, versionPreview } from '../app/version-preview.js'
import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { HistoryIcon } from '../controls/icons.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import type { VersionListing } from '../runtime/board-history.js'
import { useOpenFrame } from '../runtime/context.js'
import { versionTime } from './version-time.js'

/**
 * The board's earlier versions (ADR 0019), from the navigation bar.
 *
 * Choosing one puts it on the canvas, read-only, in place of the board as it
 * is now — `VersionPreviewBar` takes it from there. Anyone who can open the
 * board may look back through it; only an editor is offered the restore.
 *
 * On a phone-width window the bar has no room for it, and the list is
 * offered from the account sheet instead (`VersionList`), as the source link
 * is.
 */
export function VersionHistory() {
  const { history } = useOpenFrame()
  const [open, setOpen] = useState(false)
  const { ref: button, anchor, surface } = useAnchoredTo<HTMLButtonElement>(open)
  const sheet = useRef<HTMLDivElement>(null)

  // As the other sheets in the bar: Escape or a press elsewhere closes it,
  // and the keyboard goes back to the button.
  useEffect(() => {
    if (!open) return
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setOpen(false)
      button.current?.focus()
    }
    const outside = (event: Event): void => {
      if (!(event.target instanceof Node)) return
      if (sheet.current?.contains(event.target) === true) return
      if (button.current?.contains(event.target) === true) return
      setOpen(false)
    }
    window.addEventListener('keydown', escape, true)
    window.addEventListener('pointerdown', outside, true)
    return () => {
      window.removeEventListener('keydown', escape, true)
      window.removeEventListener('pointerdown', outside, true)
    }
  }, [open, button])

  if (history === null || history === undefined) return null

  return (
    <div className="of-agent-changes of-status__versions">
      <button
        ref={button}
        type="button"
        className="of-icon-button"
        aria-label="Version history"
        data-tip="Version history"
        aria-expanded={open}
        aria-haspopup="dialog"
        data-testid="history-button"
        onClick={() => {
          setOpen((current) => !current)
        }}
      >
        <HistoryIcon />
      </button>

      {open && (
        <AnchoredSurface
          anchor={anchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="history-surface"
        >
          <div ref={sheet} role="dialog" aria-label="Version history" tabIndex={-1}>
            <VersionList
              ready={anchor !== null}
              onChosen={() => {
                setOpen(false)
              }}
            />
          </div>
        </AnchoredSurface>
      )}
    </div>
  )
}

/**
 * The versions themselves, read when shown and never before: the list is a
 * request to the room (or a read of this browser's store), and a board nobody
 * is looking back through should not pay for it.
 */
export function VersionList({
  onChosen,
  ready = true,
}: {
  /** Called once a version is on the canvas, so whatever holds the list can close. */
  readonly onChosen: () => void
  /** Whether the list is placed on screen yet, so the keyboard can go into it. */
  readonly ready?: boolean
}) {
  const { runtime, history } = useOpenFrame()
  const [versions, setVersions] = useState<readonly VersionListing[] | null | 'loading'>('loading')
  const [failed, setFailed] = useState<string | null>(null)
  const list = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (history === null || history === undefined) return
    let current = true
    void history.list().then((listed) => {
      if (current) setVersions(listed)
    })
    return () => {
      current = false
    }
  }, [history])

  useEffect(() => {
    if (!ready) return
    list.current?.querySelector<HTMLElement>('button')?.focus()
  }, [ready, versions])

  if (history === null || history === undefined) return null

  const choose = async (version: VersionListing): Promise<void> => {
    const opened = await history.open(version.id)
    if (opened.status !== 'ok') {
      setFailed(
        opened.status === 'unreachable'
          ? 'That version could not be reached.'
          : opened.status === 'missing'
            ? 'That version is no longer kept.'
            : 'This version of OpenFrame cannot open that version.',
      )
      return
    }
    const preview = previewRuntime(runtime, opened)
    if (preview === null) {
      setFailed('This version of OpenFrame cannot open that version.')
      return
    }
    // Nothing selected on the board as it is now means anything there.
    useInteractionStore.getState().clearSelection()
    onChosen()
    versionPreview.show({
      id: version.id,
      at: version.at,
      runtime: preview,
      objects: opened.objects,
      title: opened.title,
    })
  }

  return (
    <div ref={list}>
      {versions === 'loading' ? (
        <p className="of-mentions__where" role="status">
          Loading versions
        </p>
      ) : versions === null ? (
        <p className="of-mentions__where" role="status">
          The versions could not be reached.
        </p>
      ) : versions.length === 0 ? (
        <p className="of-mentions__where" role="status">
          No earlier versions yet.
        </p>
      ) : (
        <ul className="of-mentions__list" data-testid="history-list">
          {versions.map((version) => (
            <li key={version.id}>
              <button
                type="button"
                className="of-history__version"
                data-testid="history-version"
                onClick={() => {
                  void choose(version)
                }}
              >
                <span className="of-mentions__who">{version.name ?? versionTime(version.at)}</span>
                {version.name !== undefined && (
                  <span className="of-mentions__where">{versionTime(version.at)}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {failed !== null && (
        <p className="of-mentions__where" role="alert" data-testid="history-failed">
          {failed}
        </p>
      )}
    </div>
  )
}
