import { asObjectId } from '../../domain/ids.js'
import { defineObjectType } from '../../domain/registry.js'
import { VOTE_VERSION, VoteDataSchema, type VoteData } from './schema.js'

export const VOTE_TYPE = 'vote'

/** The kind of mark a vote is, in the mark index. Its value is the round. */
export const VOTE_MARK = 'vote'

export const voteType = defineObjectType<typeof VOTE_TYPE, VoteData>({
  type: VOTE_TYPE,

  schema: VoteDataSchema,
  currentVersion: VOTE_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      target: init?.target ?? asObjectId('obj_missing'),
      round: init?.round ?? asObjectId('obj_missing'),
      by: init?.by ?? { key: 'nobody', name: 'Nobody', hue: 0 },
    },
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

  // `within` the round: clearing a round takes its votes with it, in the
  // delete cascade every mark already rides.
  mark: (object) => ({
    target: object.data.target,
    kind: VOTE_MARK,
    value: object.data.round,
    by: object.data.by.key,
    within: object.data.round,
  }),

  dependencies: (object) => [object.data.target],

  describe: (object) => ({
    searchText: '',
    summary: `Vote by ${object.data.by.name}`,
    gist: '',
    fields: { target: object.data.target, round: object.data.round, by: object.data.by.name },
  }),
})

/**
 * The id of a person's `slot`th dot in a round.
 *
 * Numbered by slot rather than by note: a person casting from two devices at
 * once takes the same free slot on both, and the two writes converge on one
 * object — so nobody ever ends up with more dots than the round gives them.
 */
export function voteId(round: string, personKey: string, slot: number): string {
  return `vt_${round}_${personKey}_${String(slot)}`
}
