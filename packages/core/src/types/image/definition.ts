import type { AssetRef } from '../../domain/document.js'
import { asAssetId } from '../../domain/ids.js'
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
      data: { asset, naturalWidth, naturalHeight, alt: init?.alt ?? '' },
      frame: placedSize(naturalWidth, naturalHeight),
    }
  },

  capabilities: {
    resizable: true,
    rotatable: true,
    // The editable text is the ALT text, not a caption — accessibility is the
    // thing images most often lack, so it is the thing the editor edits.
    textEditable: true,
    canHaveChildren: false,
    connectable: true,
    styleProps: ['opacity'],
  },

  describe: (object) => ({
    searchText: object.data.alt,
    summary: object.data.alt.trim() === '' ? 'Image (no description)' : `Image: ${object.data.alt}`,
    fields: { alt: object.data.alt },
  }),
})
