import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import { addAsker } from './add-asker.js'
import { POLL_VERSION, PollDataSchema, type PollData } from './schema.js'

export const POLL_TYPE = 'poll'

export const pollType = defineObjectType<typeof POLL_TYPE, PollData>({
  type: POLL_TYPE,

  schema: PollDataSchema,
  currentVersion: POLL_VERSION,
  migrations: { 2: addAsker },

  create: (init) => ({
    data: {
      text: init?.text ?? [{ text: '' }],
      options: init?.options ?? [
        { id: 'o1', label: 'Option 1' },
        { id: 'o2', label: 'Option 2' },
      ],
      multi: init?.multi ?? false,
      hideResults: init?.hideResults ?? false,
      closed: init?.closed ?? false,
      by: init?.by ?? null,
    },
    frame: { width: 300, height: 240 },
  }),

  capabilities: {
    resizable: true,
    rotatable: false,
    textEditable: true,
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    hollow: false,
    connectable: true,
    // Answered on the card itself; reactions and dots on top of it would be
    // a second way to say the same thing.
    markable: false,
    styleProps: ['color', 'textColor', 'font', 'opacity'],
  },

  /*
   * Not `closed`: closing is the asker's, on the card (`by`), and a checkbox
   * here would let anybody do it.
   */
  fields: [
    { key: 'options', meaning: 'record', label: 'Options', kind: 'choices' },
    { key: 'multi', meaning: 'record', label: 'Several answers each', kind: 'boolean' },
    { key: 'hideResults', meaning: 'record', label: 'Hide results until closed', kind: 'boolean' },
  ],

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    const labels = object.data.options.map((option) => option.label)
    return {
      searchText: [text, ...labels].filter(Boolean).join(' '),
      summary: text.trim() === '' ? 'Empty poll' : text.slice(0, 120),
      gist: text.trim().slice(0, 120),
      fields: {
        text,
        options: labels,
        multi: String(object.data.multi),
        hideResults: String(object.data.hideResults),
        closed: String(object.data.closed),
      },
    }
  },
})
