import { useCallback } from 'react'

import { downloadText, fileNameFor } from '../controls/download.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { exportMarkdown, type ExportScope } from '../scene/export-markdown.js'

/**
 * Takes the board — or a frame, or a selection — out as a Markdown readout
 * (ADR 0020), as a file in the browser's downloads.
 *
 * Reads the document and writes nothing to it, so it needs no command and no
 * permission: somebody who can only view a board can still take a readout of
 * it to the meeting it was for.
 */
export function useExport(): (scope: ExportScope) => void {
  const { runtime } = useOpenFrame()
  return useCallback(
    (scope: ExportScope) => {
      const doc = runtime.store.getDocument()
      const text = exportMarkdown(doc, runtime.registry, {
        scope,
        exportedOn: new Date().toLocaleDateString(undefined, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }),
      })
      const name = fileNameFor([doc.meta.title, partOf(scope)], 'md')
      downloadText(name, text, 'text/markdown')
      useInteractionStore.getState().announce(`Exported ${name}`)

      /** What the file name says the export is a part of, beyond the board's own. */
      function partOf(chosen: ExportScope): string | null {
        if (chosen.kind === 'board') return null
        const [only] = chosen.ids
        const object = only === undefined ? undefined : doc.objects.get(only)
        if (chosen.ids.length === 1 && object !== undefined) {
          const gist = runtime.registry.describeObject(object).gist
          if (runtime.registry.get(object.type)?.capabilities.canHaveChildren === true) return gist
        }
        return 'selection'
      }
    },
    [runtime],
  )
}
