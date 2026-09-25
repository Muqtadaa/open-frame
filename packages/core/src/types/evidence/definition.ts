import { plainTextOf } from '../../domain/rich-text.js'
import { defineObjectType } from '../../domain/registry.js'
import { resizeTokens } from '../shared/resize-tokens.js'
import { textToSpans } from '../shared/text-to-spans.js'
import { EVIDENCE_VERSION, EvidenceDataSchema, type EvidenceData } from './schema.js'

export const EVIDENCE_TYPE = 'evidence'

export const evidenceType = defineObjectType<typeof EVIDENCE_TYPE, EvidenceData>({
  type: EVIDENCE_TYPE,

  schema: EvidenceDataSchema,
  currentVersion: EVIDENCE_VERSION,
  /*
   * v2: `text` was a plain string until spans (ADR 0012).
   * v3: the size scale widened, and its tokens were renamed.
   */
  migrations: { 2: textToSpans, 3: resizeTokens },

  create: (init) => ({
    data: {
      text: init?.text ?? [{ text: '' }],
      source: init?.source ?? '',
      participant: init?.participant ?? '',
      tags: init?.tags ?? [],
    },
    // Same footprint as a sticky. An evidence card is what a sticky note turns
    // out to have been, so promoting one must not move the board around.
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
    styleProps: ['color', 'textColor', 'font', 'align', 'verticalAlign', 'opacity'],
  },

  /**
   * The fields the inspector renders. `text` is absent on purpose: it is edited
   * on the card itself, where the user is looking, and a second editor for the
   * same string in a panel two hundred pixels away is a way to lose an edit.
   */
  fields: [
    { key: 'source', meaning: 'record', label: 'Source', kind: 'text', placeholder: 'September usability study' },
    { key: 'participant', meaning: 'record', label: 'Participant', kind: 'text', placeholder: 'P07' },
    { key: 'tags', meaning: 'record', label: 'Tags', kind: 'tags', placeholder: 'pricing' },
  ],

  /*
   * The synthesis motion: a cluster of evidence becomes a claim that can be
   * asked what it stands on.
   */
  derivations: [{ type: 'insight', predicate: 'cites' }],

  describe: (object) => {
    const { source, participant, tags } = object.data
    const text = plainTextOf(object.data.text)
    return {
      // Everything a user might search for, flattened — including the source,
      // which is how "what did we learn in the September study?" is answered
      // without any query language existing yet.
      searchText: [text, source, participant, ...tags].filter(Boolean).join(' '),
      summary:
        text.trim() === ''
          ? source.trim() === ''
            ? 'Empty evidence'
            : `Evidence from ${source}`
          : text.slice(0, 120),
      fields: { text, source, participant, tags },
    }
  },
})
