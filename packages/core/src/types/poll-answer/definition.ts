import { asObjectId } from '../../domain/ids.js'
import { defineObjectType } from '../../domain/registry.js'
import { POLL_ANSWER_VERSION, PollAnswerDataSchema, type PollAnswerData } from './schema.js'

export const POLL_ANSWER_TYPE = 'poll-answer'

/** The kind of mark an answer is, in the mark index. Its value is the option. */
export const POLL_MARK = 'poll-answer'

export const pollAnswerType = defineObjectType<typeof POLL_ANSWER_TYPE, PollAnswerData>({
  type: POLL_ANSWER_TYPE,

  schema: PollAnswerDataSchema,
  currentVersion: POLL_ANSWER_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      poll: init?.poll ?? asObjectId('obj_missing'),
      option: init?.option ?? 'o1',
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

  // Marked on the poll, so it dies with it in the delete cascade.
  mark: (object) => ({
    target: object.data.poll,
    kind: POLL_MARK,
    value: object.data.option,
    by: object.data.by.key,
  }),

  dependencies: (object) => [object.data.poll],

  describe: (object) => ({
    searchText: '',
    summary: `Answer by ${object.data.by.name}`,
    gist: '',
    fields: { poll: object.data.poll, option: object.data.option, by: object.data.by.name },
  }),
})

/**
 * The one id a person's pick of an option can have, so the same person
 * answering from two devices at once writes one object rather than two.
 */
export function pollAnswerId(poll: string, option: string, personKey: string): string {
  return `pa_${poll}_${option}_${personKey}`
}
