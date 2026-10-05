import { groupByParent, type BoardDocument } from './document.js'
import type { ObjectId } from './ids.js'
import type { AnyOpenFrameObject } from './object.js'
import type { ObjectTypeRegistry } from './registry.js'

/**
 * A board as somebody who cannot see it would want it told: what is on it,
 * how it is organised, and what it claims without grounds.
 *
 * Read for a person, not an agent. It counts what is ON the board — visible
 * objects that occupy a place — where an agent's `get_board` counts every
 * object it can address, relations and hidden ones included. The two answer
 * different questions and are deliberately not one function.
 *
 * One pass over the document (`groupByParent` and the registry's relation
 * index, both built once per document), never a per-object document helper
 * (rule 10): the boards this is most needed on are the big ones.
 */
export interface BoardOutline {
  /** Objects on the board by type, most numerous first. */
  readonly counts: readonly { readonly type: string; readonly count: number }[]
  /** How many objects that is. */
  readonly total: number
  /** What sits at the top level, containers and loose objects alike, in paint order. */
  readonly top: readonly OutlineEntry[]
  /**
   * Claims that stand on nothing, by type: objects of a type something can be
   * derived INTO — a conclusion drawn from something else — that cite nothing.
   * Named by the registry's derivations, so no type is named here.
   */
  readonly unsupported: readonly {
    readonly type: string
    readonly ids: readonly ObjectId[]
  }[]
}

export interface OutlineEntry {
  readonly object: AnyOpenFrameObject
  /**
   * What it holds, for a container, in paint order; empty for anything else.
   * A member that is selected as a unit (a group) is one entry, as Tab treats
   * it, and its own members are not listed.
   */
  readonly members: readonly OutlineEntry[]
  /** Everything inside it, at any depth: what "12 objects" on a frame means. */
  readonly held: number
}

export function outlineBoard(doc: BoardDocument, registry: ObjectTypeRegistry): BoardOutline {
  const byParent = groupByParent(doc)
  const shown = (object: AnyOpenFrameObject): boolean =>
    !object.hidden && registry.get(object.type)?.capabilities.spatial === true

  /*
   * A derivation's relation runs FROM what was derived TO what it was derived
   * from (`DeriveObject`), so a claim that stands on something is the `from`
   * of a relation whose other end is still on the board.
   */
  const derived = new Set(
    registry.list().flatMap((definition) => (definition.derivations ?? []).map((d) => d.type)),
  )
  const unsupported = new Map<string, ObjectId[]>()
  const counts = new Map<string, number>()
  let total = 0

  const entryOf = (object: AnyOpenFrameObject): OutlineEntry => {
    total += 1
    counts.set(object.type, (counts.get(object.type) ?? 0) + 1)
    if (derived.has(object.type)) {
      const grounded = registry
        .relationsFrom(doc, object.id)
        .some((link) => doc.objects.has(link.edge.to))
      if (!grounded)
        unsupported.set(object.type, [...(unsupported.get(object.type) ?? []), object.id])
    }
    const capabilities = registry.get(object.type)?.capabilities
    const inside = (byParent.get(object.id) ?? []).filter(shown)
    if (capabilities?.canHaveChildren !== true || inside.length === 0) {
      return { object, members: [], held: 0 }
    }
    // Every member is read — counted, and checked for grounds — even inside a
    // unit, which is then listed as one thing, as Tab reaches it.
    const members = inside.map(entryOf)
    const held = members.reduce((sum, member) => sum + 1 + member.held, 0)
    return { object, members: capabilities.selectsAsUnit ? [] : members, held }
  }
  const top = (byParent.get(null) ?? []).filter(shown).map(entryOf)

  return {
    counts: [...counts]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count || (a.type < b.type ? -1 : a.type > b.type ? 1 : 0)),
    total,
    top,
    unsupported: [...unsupported].map(([type, ids]) => ({ type, ids })),
  }
}
