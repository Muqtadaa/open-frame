import { FULL_CROP, type ImageData } from '@openframe/core'

import { defineObjectView, type ObjectViewProps } from './registry.js'
import { inkColor, strokeWidth } from '../scene/style-tokens.js'

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

  const crop = object.data.crop ?? FULL_CROP

  return (
    /*
     * A WINDOW and a picture, rather than one element.
     *
     * A crop cannot be expressed with `object-fit` — that chooses how a whole
     * picture sits in a box, not which part of it survives. So the frame
     * clips, and the picture inside is blown up by the reciprocal of the
     * visible fraction and slid back by where that fraction starts. At the
     * full window both come out as 100% and 0, which is the uncropped case
     * falling out of the same arithmetic rather than being special-cased.
     */
    <div
      className="of-image-frame"
      style={{
        opacity: object.style.opacity ?? 1,
        // Asked of the style, so the inspector's stroke controls reach it —
        // declaring `strokeColor` and never honouring it is the exact fault
        // rule 21 is written about.
        ...(object.style.strokeColor === undefined
          ? {}
          : { borderColor: inkColor(object.style.strokeColor) }),
        /*
         * `none` by DEFAULT, unlike a shape or a connector. Those are lines by
         * nature; an image is not, and giving every image already on a board a
         * border nobody asked for is a change to somebody's work rather than a
         * new feature.
         */
        borderWidth: `${String(strokeWidth(object.style.stroke, 'none'))}px`,
      }}
    >
      <img
        className="of-image"
        src={state.url}
        alt={object.data.alt}
        style={{
          width: `${String(100 / crop.width)}%`,
          height: `${String(100 / crop.height)}%`,
          left: `${String((-crop.x / crop.width) * 100)}%`,
          top: `${String((-crop.y / crop.height) * 100)}%`,
        }}
        draggable={false}
      />
    </div>
  )
}

export const imageView = defineObjectView<ImageData>({
  type: 'image',
  usesAssets: true,
  Renderer: ImageRenderer,
  /*
   * NO INLINE EDITOR. Double-click on an image crops it, and alt text is a
   * named field in the options panel — where "alt text" said out loud teaches
   * what the box is for, which an unlabelled caret over a photograph did not.
   */
})
