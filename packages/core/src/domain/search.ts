import type { BoardDocument } from './document.js'
import type { ObjectId } from './ids.js'
import type { AnyOpenFrameObject } from './object.js'
import type { ObjectTypeRegistry } from './registry.js'

/**
 * Searching a board.
 *
 * Reads `describe()` and nothing else. That is the single seam every type
 * already supplies — and until now nothing consumed it, which made every type's
 * `searchText` a declaration no test could falsify (rule 21). A search that
 * reached into `data` instead would need a case per type and would go blank for
 * the next one.
 */

/** One parsed term. Bare words match text; the rest match a named thing. */
export type QueryTerm =
  | { readonly kind: 'text'; readonly value: string }
  | { readonly kind: 'type'; readonly value: string }
  | { readonly kind: 'tag'; readonly value: string }

export interface SearchResult {
  readonly id: ObjectId
  readonly type: string
  readonly summary: string
}

/**
 * Splits a query into terms.
 *
 * `type:` and `tag:` are the two structured filters Phase 3 calls for. They are
 * deliberately the only ones: a query language grows a parser, and this one has
 * to stay small enough that the whole grammar fits in a placeholder string.
 *
 * A prefix with nothing after it (`type:`) is treated as TEXT, not as an empty
 * filter that matches everything — it is what a half-typed query looks like,
 * and a search that emptied the board mid-keystroke would be unusable.
 */
export function parseQuery(query: string): readonly QueryTerm[] {
  const terms: QueryTerm[] = []
  for (const raw of query.trim().split(/\s+/)) {
    if (raw === '') continue
    const lower = raw.toLowerCase()
    if (lower.startsWith('type:') && lower.length > 5) {
      terms.push({ kind: 'type', value: lower.slice(5) })
    } else if (lower.startsWith('tag:') && lower.length > 4) {
      terms.push({ kind: 'tag', value: lower.slice(4) })
    } else if (lower.startsWith('#') && lower.length > 1) {
      // `#pricing` is how people write a tag, so it means `tag:pricing`.
      terms.push({ kind: 'tag', value: lower.slice(1) })
    } else {
      terms.push({ kind: 'text', value: lower })
    }
  }
  return terms
}

/** Every array-valued field, flattened and lowercased. Tags, and anything like them. */
function listValues(fields: Readonly<Record<string, string | number | readonly string[]>>): string[] {
  const values: string[] = []
  for (const value of Object.values(fields)) {
    if (Array.isArray(value)) for (const entry of value) values.push(String(entry).toLowerCase())
  }
  return values
}

/**
 * The objects matching every term. An empty query matches NOTHING.
 *
 * All terms must match, not any: adding a word to a search narrows it, which is
 * what every search box a user has ever used does.
 *
 * Empty means nothing rather than everything, because the result of an empty
 * box is "you have not asked yet" — returning the whole board would flash every
 * object on screen the moment the panel opened.
 */
export function searchBoard(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  query: string,
): readonly SearchResult[] {
  const terms = parseQuery(query)
  if (terms.length === 0) return []

  const results: SearchResult[] = []
  for (const object of doc.objects.values()) {
    if (object.hidden) continue
    /*
     * Non-spatial objects are excluded. A relation has no place on the board,
     * so a result the user cannot be taken to is not a result — and `reveal`
     * would have nothing to pan to.
     */
    if (registry.get(object.type)?.capabilities.spatial === false) continue

    const description = registry.describeObject(object)
    const haystack = description.searchText.toLowerCase()
    const tags = listValues(description.fields)

    const matches = terms.every((term) => {
      if (term.kind === 'type') return object.type.toLowerCase() === term.value
      if (term.kind === 'tag') return tags.includes(term.value)
      return haystack.includes(term.value)
    })
    if (!matches) continue

    results.push({ id: object.id, type: object.type, summary: description.summary })
  }

  /*
   * Ordered by summary, not by document order.
   *
   * Document order is z-order — the order things were drawn — which is
   * meaningless as a result list and changes when anything is brought to front.
   * A stable alphabetical list is at least predictable between searches.
   */
  return results.sort((a, b) => a.summary.localeCompare(b.summary))
}

/** Convenience for callers holding an object rather than an id. */
export function matchesQuery(
  object: AnyOpenFrameObject,
  registry: ObjectTypeRegistry,
  query: string,
): boolean {
  const description = registry.describeObject(object)
  const tags = listValues(description.fields)
  const haystack = description.searchText.toLowerCase()
  return parseQuery(query).every((term) => {
    if (term.kind === 'type') return object.type.toLowerCase() === term.value
    if (term.kind === 'tag') return tags.includes(term.value)
    return haystack.includes(term.value)
  })
}
