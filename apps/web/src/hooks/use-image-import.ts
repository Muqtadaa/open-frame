import type { ObjectId, Point } from '@openframe/core'
import { useCallback } from 'react'

import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { useCommands } from './use-commands.js'

/** How far apart several images dropped at once are staggered, in world units. */
const MULTI_DROP_OFFSET = 24

export type ImportImages = (files: readonly File[], at: Point) => Promise<void>

/**
 * Brings image files onto the board.
 *
 * Upload and object creation are deliberately separate steps. The bytes go to
 * the asset store first and the document only learns about an image once its
 * bytes are safely stored, so a failed or rejected upload can never leave an
 * object on the board pointing at nothing.
 */
export function useImageImport(): ImportImages {
  const { runtime } = useOpenFrame()
  const commands = useCommands()

  return useCallback(
    async (files, at) => {
      if (runtime.readOnly) {
        useInteractionStore.getState().showToast('This board is read-only.')
        return
      }

      const created: ObjectId[] = []
      const rejected: string[] = []

      /*
       * Sequential rather than `Promise.all`. Decoding a 20MB image is not
       * free, and several at once on a phone is how a tab gets killed; the
       * ordering also keeps a multi-file drop laid out predictably.
       */
      let index = 0
      for (const file of files) {
        const result = await runtime.assets.upload(file)
        if (!result.ok) {
          rejected.push(result.message)
          continue
        }

        const { ref, naturalWidth, naturalHeight, name } = result.image
        const offset = index * MULTI_DROP_OFFSET
        const id = commands.createObject(
          'image',
          { x: at.x + offset, y: at.y + offset },
          {
            asset: ref,
            naturalWidth,
            naturalHeight,
            // The filename is a poor description but a much better starting
            // point than nothing, and it makes the alt editor feel like editing
            // rather than filling in a blank.
            alt: name.replace(/\.[^.]+$/, ''),
          },
        )
        if (id !== null) created.push(id)
        index += 1
      }

      const store = useInteractionStore.getState()
      if (created.length > 0) store.setSelection(created)
      store.showToast(rejected[0] ?? null)
    },
    [commands, runtime],
  )
}
