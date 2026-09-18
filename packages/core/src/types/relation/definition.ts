import { asObjectId } from '../../domain/ids.js'
import { defineObjectType } from '../../domain/registry.js'
import { RELATION_VERSION, RelationDataSchema, type RelationData } from './schema.js'

export const RELATION_TYPE = 'relation'

export const relationType = defineObjectType<typeof RELATION_TYPE, RelationData>({
  type: RELATION_TYPE,

  schema: RelationDataSchema,
  currentVersion: RELATION_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      from: init?.from ?? asObjectId('obj_missing'),
      to: init?.to ?? asObjectId('obj_missing'),
      predicate: init?.predicate ?? 'relates-to',
    },
    // No geometry at all. `spatial: false` is what actually keeps it off the
    // board; the zero frame just means there is nothing to misread.
    frame: { width: 0, height: 0 },
  }),

  capabilities: {
    resizable: false,
    rotatable: false,
    textEditable: false,
    /** The whole point: a relation is not anywhere. */
    spatial: false,
    canHaveChildren: false,
    selectsAsUnit: false,
    connectable: false,
    styleProps: [],
  },

  /** What makes this object join the relation index. */
  relation: (object) => ({
    from: object.data.from,
    to: object.data.to,
    predicate: object.data.predicate,
  }),

  /**
   * Redraw whatever it joins when either end changes, so a provenance view
   * stays live under per-object subscriptions.
   */
  dependencies: (object) => [object.data.from, object.data.to],

  describe: (object) => ({
    searchText: object.data.predicate,
    summary: `Relation: ${object.data.predicate}`,
    fields: { from: object.data.from, to: object.data.to, predicate: object.data.predicate },
  }),
})
