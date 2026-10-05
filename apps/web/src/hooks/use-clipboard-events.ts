import { ClipboardContentSchema, type ClipboardContent } from '@openframe/core'
import { useEffect } from 'react'

import {
  fromClipboard,
  writeSystemClipboard,
  type ClipboardPayload,
} from '../interaction/clipboard-format.js'
import { pasteArrived, takeKeyCopy } from '../interaction/clipboard-keys.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { isTextEntry } from '../interaction/use-keyboard-shortcuts.js'
import { readOutside } from './outside-paste.js'
import { useCommands } from './use-commands.js'

/**
 * The browser's own `copy`, `cut` and `paste`, which is where a page may write
 * and read the system clipboard without a permission prompt — and so how a
 * selection reaches another tab, another board or a document.
 *
 * A field being typed in keeps all three: copying a word out of a note is the
 * field's business, not the board's. Anything pasted from another application
 * — words, formatted or not, or a spreadsheet range — is `readOutside`'s. Pictures pasted from outside are handled
 * by `use-image-drop.ts`, which listens for the same event.
 */
/** Where this browser's OpenFrame tabs tell each other about copies. */
const CHANNEL = 'openframe.clipboard'
const ASK = 'openframe.clipboard:ask'

export function useClipboardEvents(): void {
  const commands = useCommands()

  useEffect(() => {
    const write = (event: ClipboardEvent, payload: ClipboardPayload | null): void => {
      if (payload === null || event.clipboardData === null) return
      event.clipboardData.setData('text/plain', payload.text)
      event.clipboardData.setData('text/html', payload.html)
      event.preventDefault()
      // A picture cannot go through the event, which carries strings only; it
      // follows in a write of its own, and the words stand if that is refused.
      if (payload.picture !== undefined) void writeSystemClipboard(payload)
    }

    const onCopy = (event: ClipboardEvent): void => {
      if (isTextEntry(event.target)) return
      write(event, takeKeyCopy() ?? commands.copySelection())
    }

    // After a key, the cut has already happened and the selection is gone:
    // what it took is what the key recorded.
    const onCut = (event: ClipboardEvent): void => {
      if (isTextEntry(event.target)) return
      write(event, takeKeyCopy() ?? commands.cutSelection())
    }

    const onPaste = (event: ClipboardEvent): void => {
      if (isTextEntry(event.target)) return
      const plain = pasteArrived()
      const data = event.clipboardData
      if (data === null) {
        void commands.paste()
        return
      }
      // Board content first: a copied picture carries its PNG as well, and
      // the board's own copy of it is the one that keeps everything else.
      const html = data.getData('text/html')
      const content = plain ? undefined : fromClipboard(html)
      if (content !== undefined) {
        event.preventDefault()
        void commands.pasteContent(content)
        return
      }
      // Files are pictures from outside, and the image importer's.
      if (data.files.length > 0) return
      // Words, formatted or not, or a spreadsheet range from another
      // application — or a board copy's own words, when asked for plainly.
      const outside = readOutside(html, data.getData('text/plain'), plain)
      if (outside !== null) {
        event.preventDefault()
        commands.pasteOutside(outside)
        return
      }
      /*
       * Nothing from a board. An EMPTY clipboard is what a browser hands a
       * page it will not show the clipboard to, so this tab's own copy is
       * pasted; anything else was copied from elsewhere after it, and pasting
       * the older board copy instead would be pasting the wrong thing.
       */
      if (data.types.length === 0) void commands.paste()
    }

    /*
     * Every copy made here is shared with this browser's other OpenFrame tabs,
     * and theirs with this one, so the menu's Paste — which has no clipboard
     * event to read through, and would make Firefox and Safari ask the person
     * each time if it read the clipboard itself — pastes the latest copy from
     * any of them. Same origin only; what arrives is still read by
     * `PasteObjects` like anything else pasted.
     */
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL)
    let arriving = false
    const unsubscribe = useInteractionStore.subscribe((state, previous) => {
      if (arriving || state.clipboard === previous.clipboard || state.clipboard === null) return
      channel?.postMessage(state.clipboard)
    })
    const onShared = (event: MessageEvent): void => {
      // A tab opened after the copy asks for it; any tab holding one answers.
      if (event.data === ASK) {
        const held = useInteractionStore.getState().clipboard
        if (held !== null) channel?.postMessage(held)
        return
      }
      const shared = ClipboardContentSchema.safeParse(event.data)
      if (!shared.success) return
      arriving = true
      useInteractionStore.getState().setClipboard(event.data as ClipboardContent)
      arriving = false
    }
    channel?.addEventListener('message', onShared)
    if (useInteractionStore.getState().clipboard === null) channel?.postMessage(ASK)

    window.addEventListener('copy', onCopy)
    window.addEventListener('cut', onCut)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('copy', onCopy)
      window.removeEventListener('cut', onCut)
      window.removeEventListener('paste', onPaste)
      unsubscribe()
      channel?.close()
    }
  }, [commands])
}
