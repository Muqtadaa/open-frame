import { asObjectId } from '../../domain/ids.js'
import { defineObjectType } from '../../domain/registry.js'
import { REACTION_VERSION, ReactionDataSchema, type ReactionData } from './schema.js'

export const REACTION_TYPE = 'reaction'

/** The kind of mark a reaction is, in the mark index. */
export const REACTION_MARK = 'reaction'

export const reactionType = defineObjectType<typeof REACTION_TYPE, ReactionData>({
  type: REACTION_TYPE,

  schema: ReactionDataSchema,
  currentVersion: REACTION_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      target: init?.target ?? asObjectId('obj_missing'),
      glyph: init?.glyph ?? 'plus-one',
      by: init?.by ?? { key: 'nobody', name: 'Nobody', hue: 0 },
    },
    // Not anywhere: `spatial: false` keeps it off the board, and the zero
    // frame means there is nothing to misread.
    frame: { width: 0, height: 0 },
  }),

  capabilities: {
    resizable: false,
    rotatable: false,
    textEditable: false,
    spatial: false,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: false,
    markable: false,
    styleProps: [],
  },

  mark: (object) => ({
    target: object.data.target,
    kind: REACTION_MARK,
    value: object.data.glyph,
    by: object.data.by.key,
  }),

  /** Redraw the note it is on when the note changes. */
  dependencies: (object) => [object.data.target],

  describe: (object) => ({
    // A reaction is not something anybody searches the board for.
    searchText: '',
    summary: `Reaction: ${object.data.glyph} by ${object.data.by.name}`,
    gist: object.data.glyph,
    fields: { target: object.data.target, glyph: object.data.glyph, by: object.data.by.name },
  }),
})

/**
 * The one id a person's reaction of one kind to one object can have.
 *
 * Deterministic, so the same person reacting from two devices at once writes
 * the same object rather than two, and toggling it off finds it without a
 * search.
 */
export function reactionId(target: string, glyph: string, personKey: string): string {
  return `rx_${target}_${glyph}_${personKey}`
}
