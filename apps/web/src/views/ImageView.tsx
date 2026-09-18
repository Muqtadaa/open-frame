import type { ImageData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'

function ImageRenderer({ object, assetUrl }: ObjectViewProps<ImageData>) {
  const state = assetUrl(object.data.asset)
  const label = object.data.alt.trim() === '' ? 'Image' : `Image: ${object.data.alt}`

  if (state.status !== 'ready') {
    return (
      <div
        className={`of-image of-image--${state.status}`}
        role="img"
        aria-label={state.status === 'missing' ? `${label} (unavailable)` : `${label} (loading)`}
        aria-busy={state.status === 'loading'}
        style={{ opacity: object.style.opacity ?? 1 }}
      >
        <span className="of-image__placeholder">
          {state.status === 'missing' ? 'Image unavailable' : ''}
        </span>
      </div>
    )
  }

  return (
    <img
      className="of-image"
      src={state.url}
      alt={object.data.alt}
      /*
       * The object's frame is the size, and the aspect ratio is the user's to
       * break by resizing. `object-fit: fill` is therefore correct here where it
       * is usually wrong: letterboxing would leave dead space inside the
       * selection box that still counts as part of the object.
       */
      style={{ opacity: object.style.opacity ?? 1 }}
      draggable={false}
    />
  )
}

/**
 * The inline editor edits ALT TEXT, not a caption.
 *
 * Images are the content most likely to be meaningless to a screen reader, and
 * a board is a document someone else will read. Putting alt text behind the
 * ordinary double-click-to-edit gesture is what makes describing an image the
 * path of least resistance rather than a settings panel nobody opens.
 */
function ImageAltEditor({ object, onCommit, onCancel }: ObjectEditorProps<ImageData>) {
  return (
    <InlineTextEditor
      initialText={object.data.alt}
      className="of-image__alt-editor"
      ariaLabel="Describe this image"
      onCommit={(alt) => onCommit({ alt })}
      onCancel={onCancel}
    />
  )
}

export const imageView = defineObjectView<ImageData>({
  type: 'image',
  usesAssets: true,
  Renderer: ImageRenderer,
  InlineEditor: ImageAltEditor,
})
