import { REACTION_MARK, type ObjectId } from '@openframe/core'
import { useCallback, useMemo, useSyncExternalStore } from 'react'

import { useOpenFrame } from '../runtime/context.js'
import { glyphOrder } from '../scene/reaction-glyphs.js'

export interface ReactionPerson {
  readonly key: string
  readonly name: string
  readonly hue: number
}

export interface ReactionGroup {
  readonly glyph: string
  readonly people: readonly ReactionPerson[]
}

/**
 * The reactions on one object, grouped by kind.
 *
 * Subscribed to the board's STRUCTURE, because a reaction is an object of its
 * own and arrives or leaves as one; the object it is on never changes. The
 * snapshot is a string so it compares by value (rule 9): a fresh array would
 * re-render every note on every structural change, and the lookup behind it is
 * the registry's mark index, O(1) per note (rule 10).
 */
export function useReactions(id: ObjectId): readonly ReactionGroup[] {
  const { runtime } = useOpenFrame()
  const subscribe = useCallback(
    (onChange: () => void) => runtime.store.subscribeToStructure(onChange),
    [runtime.store],
  )
  const getSnapshot = useCallback(() => {
    const doc = runtime.store.getDocument()
    const rows: ReactionRow[] = []
    for (const link of runtime.registry.marksOn(doc, id)) {
      if (link.edge.kind !== REACTION_MARK) continue
      const data = doc.objects.get(link.id)?.data as
        { by?: { name?: unknown; hue?: unknown } } | undefined
      rows.push({
        glyph: link.edge.value,
        key: link.edge.by,
        name: typeof data?.by?.name === 'string' ? data.by.name : 'Someone',
        hue: typeof data?.by?.hue === 'number' ? data.by.hue : 0,
      })
    }
    return encodeReactions(rows)
  }, [runtime, id])
  const signature = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return useMemo(() => groupReactions(signature), [signature])
}

export interface ReactionRow {
  readonly glyph: string
  readonly key: string
  readonly name: string
  readonly hue: number
}

/**
 * The rows as one string that compares by value. JSON rather than joining on
 * a tab and a newline: a name may hold either, and once read as a field or a
 * record of its own.
 */
export function encodeReactions(rows: readonly ReactionRow[]): string {
  if (rows.length === 0) return ''
  const tuples = rows.map((row) => [row.glyph, row.key, row.name, row.hue] as const)
  tuples.sort((a, b) => (a.join('\u0000') < b.join('\u0000') ? -1 : 1))
  return JSON.stringify(tuples)
}

/**
 * Grouped by kind, in the palette's order, with each person ONCE per kind: a
 * second record of the same reaction — an agent's, or two devices racing —
 * is one person, not two.
 */
export function groupReactions(signature: string): readonly ReactionGroup[] {
  if (signature === '') return []
  const tuples = JSON.parse(signature) as [string, string, string, number][]
  const groups = new Map<string, ReactionPerson[]>()
  for (const [glyph, key, name, hue] of tuples) {
    const people = groups.get(glyph) ?? []
    if (!people.some((person) => person.key === key)) people.push({ key, name, hue })
    groups.set(glyph, people)
  }
  return [...groups.entries()]
    .map(([glyph, people]) => ({ glyph, people }))
    .sort((a, b) => glyphOrder(a.glyph) - glyphOrder(b.glyph) || a.glyph.localeCompare(b.glyph))
}
