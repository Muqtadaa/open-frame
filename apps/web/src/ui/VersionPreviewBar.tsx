import { useEffect, useRef, useState } from 'react'

import { versionPreview, type Previewed } from '../app/version-preview.js'
import { useEscapeToClose } from '../controls/escape-stack.js'
import { useCanEdit } from '../hooks/use-can-edit.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { focusTheBoard } from './hand-back-focus.js'
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

  const heading = useRef<HTMLHeadingElement>(null)
  const when = versionTime(preview.at)

  /*
   * The keyboard comes to what is being looked at, and the change is said.
   * Choosing a version closed the sheet it was chosen from, so focus fell to
   * the page and nothing told a screen reader the board had changed under it.
   */
  useEffect(() => {
    heading.current?.focus()
    useInteractionStore.getState().announce(`Viewing ${when}`)
  }, [when])

  const back = (): void => {
    versionPreview.show(null)
    useInteractionStore.getState().announce('Back to the board as it is now')
    focusTheBoard()
  }

  // Escape goes back to now, through the one stack: anything opened over the
  // preview closes first, and only then the preview itself.
  useEscapeToClose(back)

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
    focusTheBoard()
    useInteractionStore.getState().announce(`Restored the version from ${when}`)
    // Says where the board it replaced went: kept, and one undo away.
    useInteractionStore
      .getState()
      .showToast(`Restored the version from ${when}; the board as it was is kept in the history`)
  }

  return (
    <nav className="of-status of-history-bar" aria-label="Version" data-testid="version-preview">
      <h1 ref={heading} tabIndex={-1} className="of-status__heading of-history-bar__title">
        Viewing {when}
      </h1>
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
