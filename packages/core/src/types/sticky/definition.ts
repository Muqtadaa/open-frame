import { defineObjectType } from '../../domain/registry.js'
import { STICKY_VERSION, StickyDataSchema, type StickyData } from './schema.js'

export const STICKY_TYPE = 'sticky'

export const stickyType = defineObjectType<typeof STICKY_TYPE, StickyData>({
  type: STICKY_TYPE,

  schema: StickyDataSchema,
  currentVersion: STICKY_VERSION,
  migrations: {},

  create: (init) => ({
    data: { text: init?.text ?? '' },
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
  promotions: ['evidence'],

  describe: (object) => ({
    searchText: object.data.text,
    summary: object.data.text.trim() === '' ? 'Empty sticky note' : object.data.text.slice(0, 120),
    fields: { text: object.data.text },
  }),
})
