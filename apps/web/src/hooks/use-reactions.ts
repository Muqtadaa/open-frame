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
    const lines: string[] = []
    for (const link of runtime.registry.marksOn(doc, id)) {
      if (link.edge.kind !== REACTION_MARK) continue
      const data = doc.objects.get(link.id)?.data as
        { by?: { name?: unknown; hue?: unknown } } | undefined
      const name = typeof data?.by?.name === 'string' ? data.by.name : 'Someone'
      const hue = typeof data?.by?.hue === 'number' ? data.by.hue : 0
      lines.push([link.edge.value, link.edge.by, name, String(hue)].join('\t'))
    }
    return lines.sort().join('\n')
  }, [runtime, id])
  const signature = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

  return useMemo(() => {
    if (signature === '') return []
    const groups = new Map<string, ReactionPerson[]>()
    for (const line of signature.split('\n')) {
      const [glyph = '', key = '', name = '', hue = '0'] = line.split('\t')
      const people = groups.get(glyph) ?? []
      people.push({ key, name, hue: Number(hue) })
      groups.set(glyph, people)
    }
    return [...groups.entries()]
      .map(([glyph, people]) => ({ glyph, people }))
      .sort((a, b) => glyphOrder(a.glyph) - glyphOrder(b.glyph) || a.glyph.localeCompare(b.glyph))
  }, [signature])
}
