import { useEffect, useState } from 'react'

import { versionPreview, type Previewed } from '../app/version-preview.js'
import { useCanEdit } from '../hooks/use-can-edit.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { versionTime } from './version-time.js'

/**
 * Across the top while an earlier version is on the canvas: when it is from,
 * and the two ways out — put the board back to it, or go back to the board
 * as it is now (ADR 0019).
 *
 * Rendered OUTSIDE the preview's context, so `useOpenFrame` here is the live
 * board: the restore is dispatched on the live dispatcher, and whether it is
 * offered is the live board's role, never the preview's read-only one.
 */
export function VersionPreviewBar({ preview }: { readonly preview: Previewed }) {
  const { runtime, history } = useOpenFrame()
  const canEdit = useCanEdit()
  const [busy, setBusy] = useState(false)

  const back = (): void => {
    versionPreview.show(null)
  }

  useEffect(() => {
    const escape = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      versionPreview.show(null)
    }
    window.addEventListener('keydown', escape, true)
    return () => {
      window.removeEventListener('keydown', escape, true)
    }
  }, [])

  const when = versionTime(preview.at)

  const restore = async (): Promise<void> => {
    if (history === null || history === undefined) return
    setBusy(true)
    /*
     * The board as it is now is kept FIRST, so a restore never loses what it
     * replaces — and if it cannot be kept, nothing is restored.
     */
    const kept = await history.keepNow()
    if (!kept) {
      setBusy(false)
      useInteractionStore
        .getState()
        .showToast('The board as it is now could not be kept, so nothing was restored.')
      return
    }
    const result = runtime.dispatcher.dispatch({
      kind: 'RestoreBoard',
      objects: preview.objects,
      title: preview.title ?? runtime.store.getDocument().meta.title,
    })
    setBusy(false)
    if (!result.ok) {
      useInteractionStore.getState().showToast(result.error.message)
      return
    }
    versionPreview.show(null)
    useInteractionStore.getState().announce(`Restored the version from ${when}`)
    useInteractionStore.getState().showToast(`Restored the version from ${when}`)
  }

  return (
    <nav className="of-status of-history-bar" aria-label="Version" data-testid="version-preview">
      <h1 className="of-status__heading of-history-bar__title">Viewing {when}</h1>
      {canEdit && (
        <button
          type="button"
          className="of-button of-button--primary"
          data-testid="version-restore"
          disabled={busy}
          onClick={() => {
            void restore()
          }}
        >
          Restore this version
        </button>
      )}
      <button type="button" className="of-button" data-testid="version-back" onClick={back}>
        Back to now
      </button>
    </nav>
  )
}
