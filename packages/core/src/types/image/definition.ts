import type { AssetRef } from '../../domain/document.js'
import { asAssetId } from '../../domain/ids.js'
import { FULL_CROP } from './crop.js'
import { defineObjectType } from '../../domain/registry.js'
import { IMAGE_VERSION, ImageDataSchema, type ImageData } from './schema.js'

export const IMAGE_TYPE = 'image'

/** Largest edge a newly placed image gets, so a photo does not swamp the board. */
export const IMAGE_MAX_PLACED_EDGE = 420

/** Fits an intrinsic size within the placement limit, preserving aspect ratio. */
export function placedSize(
  naturalWidth: number,
  naturalHeight: number,
): { width: number; height: number } {
  const longest = Math.max(naturalWidth, naturalHeight)
  const scale = longest > IMAGE_MAX_PLACED_EDGE ? IMAGE_MAX_PLACED_EDGE / longest : 1
  return {
    width: Math.max(1, Math.round(naturalWidth * scale)),
    height: Math.max(1, Math.round(naturalHeight * scale)),
  }
}

export const imageType = defineObjectType<typeof IMAGE_TYPE, ImageData>({
  type: IMAGE_TYPE,

  schema: ImageDataSchema,
  currentVersion: IMAGE_VERSION,
  migrations: {},

  create: (init) => {
    const naturalWidth = init?.naturalWidth ?? 1
    const naturalHeight = init?.naturalHeight ?? 1
    /*
     * A placeholder ref rather than a throw. `create` is also how the registry
     * contract test and a paste of unknown provenance build an object, and an
     * image whose bytes cannot be found already has to render as missing — so
     * that path is exercised rather than special-cased.
     */
    const asset: AssetRef = init?.asset ?? {
      id: asAssetId('ast_missing'),
      mimeType: 'application/octet-stream',
      byteSize: 0,
      locator: 'missing:',
    }
    return {
      data: {
        asset,
        naturalWidth,
        naturalHeight,
        alt: init?.alt ?? '',
        // The whole picture, which is what `null` means everywhere it appears.
        crop: init?.crop ?? null,
      },
      frame: placedSize(naturalWidth, naturalHeight),
    }
  },

  capabilities: {
    resizable: true,
    rotatable: true,
    // The editable text is the ALT text, not a caption — accessibility is the
    // thing images most often lack, so it is the thing the editor edits.
    textEditable: true,
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: true,
    styleProps: ['strokeColor', 'stroke', 'opacity'],
  },

  /**
   * How much of the picture is on show, which is what gives an image its crop
   * handles. A type that declares nothing here has none.
   */
  cropWindow: (object) => object.data.crop ?? FULL_CROP,

  /**
   * ALT TEXT AS A NAMED FIELD, not an inline editor.
   *
   * It used to be what double-click edited, on the argument that describing an
   * image should sit on the path of least resistance rather than in a panel
   * nobody opens. Double-click now crops, so the argument has to be honoured a
   * different way — and a labelled field in the panel is arguably the better
   * home for it: "alt text" said out loud teaches what the box is for, where
   * an unlabelled caret in the middle of a photograph does not.
   */
  fields: [{ key: 'alt', meaning: 'record', label: 'Alt text', kind: 'longText' }],

  describe: (object) => ({
    searchText: object.data.alt,
    summary: object.data.alt.trim() === '' ? 'Image (no description)' : `Image: ${object.data.alt}`,
    fields: { alt: object.data.alt },
  }),
})
