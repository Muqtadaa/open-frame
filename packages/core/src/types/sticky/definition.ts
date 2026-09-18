import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import { resizeTokens } from '../shared/resize-tokens.js'
import { textToSpans } from '../shared/text-to-spans.js'
import { STICKY_VERSION, StickyDataSchema, type StickyData } from './schema.js'

export const STICKY_TYPE = 'sticky'

export const stickyType = defineObjectType<typeof STICKY_TYPE, StickyData>({
  type: STICKY_TYPE,

  schema: StickyDataSchema,
  currentVersion: STICKY_VERSION,
  /*
   * v2: `text` was a plain string until spans (ADR 0012).
   * v3: the size scale widened, and its tokens were renamed.
   */
  migrations: { 2: textToSpans, 3: resizeTokens },

  create: (init) => ({
    data: { text: init?.text ?? [{ text: '' }] },
    frame: { width: 180, height: 180 },
  }),

  capabilities: {
    resizable: true,
    rotatable: false,
    textEditable: true,
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: true,
    /*
     * No `fill`. It was declared here and never implemented by the view, which
     * went unnoticed while `color` was the only property anything could set —
     * the inspector surfaced it immediately. Dropping it is the honest fix
     * rather than inventing a behaviour: a slip is defined by having a body,
     * and an unfilled sticky is just a text object, which already exists.
     */
    styleProps: ['color', 'font', 'align', 'opacity'],
  },

  /*
   * A note becomes evidence once the user knows what it was. This is the
   * "structure is earned, never demanded" principle in one line: nothing asks
   * for a classification up front, and the promotion keeps the object's
   * identity, so anything already citing it still does.
   */
  promotions: ['evidence', 'insight'],

  /*
   * Plain text is DERIVED here, never stored (ADR 0012). Keeping a flattened
   * copy beside the spans would be two sources of truth about the same
   * characters, and they would diverge the first time one path was updated and
   * the other was not.
   */
  /*
   * A cluster of plain notes becoming a claim is the most common synthesis
   * motion there is — people cluster stickies long before they classify any of
   * them. Requiring evidence first would be demanding the structure this
   * product says is earned.
   */
  derivations: [{ type: 'insight', predicate: 'cites' }],

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    return {
      searchText: text,
      summary: text.trim() === '' ? 'Empty sticky note' : text.slice(0, 120),
      fields: { text },
    }
  },
})
