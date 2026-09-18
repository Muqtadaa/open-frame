import { screenToWorld, type Point } from '@openframe/core'
import { useCallback, useEffect, type DragEvent, type RefObject } from 'react'

import { useImageImport } from '../hooks/use-image-import.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

function imageFilesOf(list: FileList | null | undefined): File[] {
  if (list === null || list === undefined) return []
  // Filtered by the `image/` prefix only as a first pass — what is actually
  // allowed is decided by the validator, which also checks the bytes.
  return [...list].filter((file) => file.type.startsWith('image/'))
}

export interface ImageDropHandlers {
  readonly onDragOver: (event: DragEvent<HTMLElement>) => void
  readonly onDrop: (event: DragEvent<HTMLElement>) => void
}

/**
 * Dropping and pasting images onto the board.
 *
 * Unlike `wheel`, drag events are not registered passively by React, so
 * `preventDefault` in these props does work — and it is required: without it on
 * `dragover` the browser navigates away to the dropped file, discarding the
 * board.
 *
 * Paste is a native window listener because a paste is not aimed at an element;
 * it goes to whatever has focus, which for a canvas is usually the body.
 */
export function useImageDrop(containerRef: RefObject<HTMLElement | null>): ImageDropHandlers {
  const importImages = useImageImport()

  const toWorld = useCallback(
    (clientX: number, clientY: number): Point => {
      const rect = containerRef.current?.getBoundingClientRect()
      return screenToWorld(useInteractionStore.getState().viewport, {
        x: clientX - (rect?.left ?? 0),
        y: clientY - (rect?.top ?? 0),
      })
    },
    [containerRef],
  )

  const onDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (event: DragEvent<HTMLElement>) => {
      const files = imageFilesOf(event.dataTransfer.files)
      if (files.length === 0) return
      event.preventDefault()
      void importImages(files, toWorld(event.clientX, event.clientY))
    },
    [importImages, toWorld],
  )

  useEffect(() => {
    const onPaste = (event: ClipboardEvent): void => {
      const files = imageFilesOf(event.clipboardData?.files)
      if (files.length === 0) return
      /*
       * Only prevented once an image is actually present, so pasting objects
       * copied from the board still reaches the keyboard shortcut. A paste that
       * carries both is treated as an image paste, since that is the richer
       * content and the one the user cannot get any other way.
       */
      event.preventDefault()

      // A pasted image has no drop point, so it lands in the middle of what the
      // user is currently looking at.
      const { viewport, canvasSize } = useInteractionStore.getState()
      const centre = screenToWorld(viewport, {
        x: canvasSize.width / 2,
        y: canvasSize.height / 2,
      })
      void importImages(files, centre)
    }

    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('paste', onPaste)
    }
  }, [importImages])

  return { onDragOver, onDrop }
}
