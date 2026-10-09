import { MAX_VERSION_NAME, versionName } from '@openframe/core/history'
import { useEffect, useRef, useState, type RefObject } from 'react'

import { previewRuntime, versionPreview } from '../app/version-preview.js'
import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { wrapTab } from '../controls/wrap-tab.js'
import { useDismiss } from '../controls/use-dismiss.js'
import { useCanEdit } from '../hooks/use-can-edit.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import type { VersionListing } from '../runtime/board-history.js'
import { useOpenFrame } from '../runtime/context.js'
import type { Size } from '../scene/anchoring.js'
import { versionTime } from './version-time.js'

/**
 * Versions drawn at a time. A board edited for months keeps about a thousand,
 * and the sheet used to draw every row at once (audit 2026-10-08); the newest
 * are what people look back for, and the rest are a press away.
 */
const PAGE = 50

/**
 * The board's earlier versions (ADR 0019), opened from the menu on the
 * board's name.
 *
 * Choosing one puts it on the canvas, read-only, in place of the board as it
 * is now — `VersionPreviewBar` takes it from there. Anyone who can open the
 * board may look back through it; only an editor is offered the restore.
 */
export function VersionHistorySheet({
  anchor,
  surface,
  trigger,
  onClose,
}: {
  readonly anchor: DOMRect | null
  readonly surface: Size
  readonly trigger: RefObject<HTMLElement | null>
  readonly onClose: () => void
}) {
  const sheet = useRef<HTMLDivElement>(null)
  // As the other sheets in the bar: Escape or a press elsewhere closes it.
  useDismiss(sheet, trigger, onClose)
  return (
    <AnchoredSurface
      anchor={anchor}
      surface={surface}
      prefer={['below', 'above']}
      testId="history-surface"
    >
      <div
        ref={sheet}
        className="of-sheet"
        role="dialog"
        aria-label="Version history"
        tabIndex={-1}
        // Tab stays in the sheet while it is open, as in every other sheet;
        // it walked out to the rail with this one still open (audit 2026-10-08).
        onKeyDown={wrapTab}
      >
        <VersionList ready={anchor !== null} onChosen={onClose} />
      </div>
    </AnchoredSurface>
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
  const canEdit = useCanEdit()
  const [versions, setVersions] = useState<readonly VersionListing[] | null | 'loading'>('loading')
  const [failed, setFailed] = useState<string | null>(null)
  const [name, setName] = useState('')
  /** Bumped after a version is named or deleted, so the list is read again. */
  const [reads, setReads] = useState(0)
  const [busy, setBusy] = useState(false)
  /*
   * Deleting a NAME cannot be undone — the board is untouched, but the point
   * it marked is gone — so the first press asks, on the same button, and the
   * second does it.
   */
  const [doomed, setDoomed] = useState<string | null>(null)
  const [shown, setShown] = useState(PAGE)
  /** The first row a "Show earlier" press revealed, which then takes the keyboard. */
  const revealFrom = useRef<number | null>(null)
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
  }, [history, reads])

  useEffect(() => {
    if (!ready) return
    // The versions are what the list is for, so the keyboard lands on the
    // newest — not on the name field above it, which an editor reaches by
    // going back one.
    const target =
      list.current?.querySelector<HTMLElement>('[data-testid="history-version"]') ??
      list.current?.querySelector<HTMLElement>('input, button')
    target?.focus()
  }, [ready, versions])

  useEffect(() => {
    // The button that was pressed may be gone once the last page is out, and
    // focus with it; the first row it brought in is where reading carries on.
    const from = revealFrom.current
    if (from === null) return
    revealFrom.current = null
    list.current?.querySelectorAll<HTMLElement>('[data-testid="history-version"]')[from]?.focus()
  }, [shown])

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

  const keep = async (): Promise<void> => {
    const chosen = versionName(name)
    if (chosen === null || busy) return
    setBusy(true)
    const kept = await history.name(chosen)
    setBusy(false)
    if (!kept) {
      setFailed('That version could not be kept.')
      return
    }
    setFailed(null)
    setName('')
    setReads((count) => count + 1)
    useInteractionStore.getState().announce(`Kept as ${chosen}`)
  }

  const forget = async (version: VersionListing): Promise<void> => {
    if (busy) return
    if (doomed !== version.id) {
      setDoomed(version.id)
      return
    }
    setDoomed(null)
    setBusy(true)
    const forgotten = await history.forget(version.id)
    setBusy(false)
    if (!forgotten) {
      setFailed('That version could not be deleted.')
      return
    }
    setFailed(null)
    setReads((count) => count + 1)
    useInteractionStore.getState().announce(`Deleted ${version.name ?? versionTime(version.at)}`)
  }

  return (
    <div ref={list}>
      {canEdit && (
        <form
          className="of-history__name"
          onSubmit={(event) => {
            event.preventDefault()
            void keep()
          }}
        >
          <label className="of-visually-hidden" htmlFor="of-version-name">
            Version name
          </label>
          <input
            id="of-version-name"
            className="of-input"
            type="text"
            autoComplete="off"
            placeholder="Name this version"
            maxLength={MAX_VERSION_NAME}
            value={name}
            readOnly={busy}
            onChange={(event) => {
              setName(event.target.value)
            }}
            data-testid="history-name"
          />
          <button
            type="submit"
            className="of-button"
            disabled={versionName(name) === null}
            data-testid="history-name-save"
          >
            Save
          </button>
        </form>
      )}
      {versions === 'loading' ? (
        <p className="of-history__status" role="status">
          Loading versions
        </p>
      ) : versions === null ? (
        <p className="of-history__status" role="status">
          The versions could not be reached.
        </p>
      ) : versions.length === 0 ? (
        <p className="of-history__status" role="status">
          No earlier versions yet.
        </p>
      ) : (
        <ul className="of-history__list" data-testid="history-list">
          {versions.slice(0, shown).map((version) => (
            <li key={version.id} className="of-history__row">
              <button
                type="button"
                className="of-history__version"
                data-testid="history-version"
                onClick={() => {
                  void choose(version)
                }}
              >
                <span className="of-history__label">{version.name ?? versionTime(version.at)}</span>
                {version.name !== undefined && (
                  <span className="of-history__when">{versionTime(version.at)}</span>
                )}
              </button>
              {canEdit && version.kind === 'named' && (
                <button
                  type="button"
                  className="of-button of-button--ghost of-history__delete"
                  aria-label={`Delete ${version.name ?? versionTime(version.at)}${
                    doomed === version.id ? ' for good' : ''
                  }`}
                  data-testid="history-delete"
                  data-asking={doomed === version.id}
                  onClick={() => {
                    void forget(version)
                  }}
                  onBlur={() => {
                    if (doomed === version.id) setDoomed(null)
                  }}
                >
                  {doomed === version.id ? 'Delete for good' : 'Delete'}
                </button>
              )}
            </li>
          ))}
          {versions.length > shown && (
            <li className="of-history__more">
              <button
                type="button"
                className="of-button of-button--ghost"
                data-testid="history-more"
                onClick={() => {
                  revealFrom.current = shown
                  setShown((count) => count + PAGE)
                }}
              >
                Show earlier versions
              </button>
            </li>
          )}
        </ul>
      )}
      {failed !== null && (
        <p className="of-history__status" role="alert" data-testid="history-failed">
          {failed}
        </p>
      )}
    </div>
  )
}
