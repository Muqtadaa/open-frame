import { defineObjectType } from '../../domain/registry.js'
import { unionAll } from '../../geometry/rect.js'
import { GROUP_VERSION, GroupDataSchema, type GroupData } from './schema.js'

export const GROUP_TYPE = 'group'

/** What an empty group occupies. It should not survive long enough to matter. */
const EMPTY_BOUNDS = { x: 0, y: 0, width: 0, height: 0 }

export const groupType = defineObjectType<typeof GROUP_TYPE, GroupData>({
  type: GROUP_TYPE,

  schema: GroupDataSchema,
  currentVersion: GROUP_VERSION,
  migrations: {},

  create: () => ({
    data: {},
    // Like a connector, a group has no frame of its own — `getBounds` is the
    // real answer, and it comes from the children.
    frame: { width: 0, height: 0 },
  }),

  capabilities: {
    /*
     * Not resizable or rotatable, deliberately. Both would mean transforming
     * every descendant, which is a different and much larger feature than
     * grouping — and shipping a handle that silently does nothing, or does
     * something surprising, is worse than not showing one.
     */
    resizable: false,
    rotatable: false,
    textEditable: false,
    canHaveChildren: true,
    /** The whole point: clicking a member selects the group. */
    selectsAsUnit: true,
    connectable: true,
    styleProps: [],
  },

  /**
   * The union of the children's bounds.
   *
   * `boundsOf` is used rather than each child's `frame` so that a group
   * containing a connector — a diagram grouped with its arrows, which is the
   * obvious thing to do — gets the connector's derived extent instead of the
   * 0×0 frame it nominally has.
   */
  getBounds: (object, _doc, { boundsOf, childrenOf }) =>
    unionAll(childrenOf(object.id).map(boundsOf)) ?? EMPTY_BOUNDS,

  /**
   * A group is never hit directly — only through a member.
   *
   * Its bounds span everything it contains, so default bounds containment would
   * make a click in the empty space between two members select the group, and a
   * click on genuinely empty canvas inside that rectangle select it too instead
   * of deselecting. Members are painted after their parent and hit-tested
   * first, so returning false costs nothing and removes the dead zone.
   */
  hitTest: () => false,

  /*
   * Nothing to describe. `describe` receives only the object, not the document,
   * so a group cannot count its own members here — and it should not want to:
   * search and AI context care about the members themselves, each of which
   * describes itself.
   */
  describe: () => ({ searchText: '', summary: 'Group', fields: {} }),
})
