import {
  escapeMarkdown,
  groupByParent,
  outlineBoard,
  richTextToMarkdown,
  type AnyOpenFrameObject,
  type BoardDocument,
  type FieldDefinition,
  type ObjectId,
  type ObjectTypeRegistry,
} from '@openframe/core'

import { readingOrder } from './reading-order.js'
import { typeLabel } from './type-noun.js'

/**
 * A board as a readout (ADR 0020): what it says, organised the way it is, with
 * each claim's grounds beside it.
 *
 * Not a picture of the board in text. A frame is a heading and what it holds
 * is listed under it; a record carries the fields its type declares, under the
 * type's own labels (rule 21); and every object names what it stands on and
 * what stands on it, which is the one thing a readout from OpenFrame can say
 * that a screenshot of sticky notes cannot.
 *
 * Read entirely off the registry — `describe`, the declared fields, the
 * relation index — so no type is named here (rule 5) and a type added tomorrow
 * exports without this file changing. One `groupByParent` and the registry's
 * relation index, both built once (rule 10): the board somebody exports for a
 * readout is the big one.
 */
export type ExportScope =
  | { readonly kind: 'board' }
  /** A frame, a group or a selection: these and everything they hold. */
  | { readonly kind: 'objects'; readonly ids: readonly ObjectId[] }

export interface ExportOptions {
  readonly scope: ExportScope
  /** As the reader's calendar says it. Passed in, so the export is a pure function. */
  readonly exportedOn: string
}

/** Tops within this many world units read as one line, as Tab and the overview read them. */
const ROW_BAND = 40

/** Markdown has six levels; a seventh frame deep is still a heading, at the sixth. */
const DEEPEST = 6

export function exportMarkdown(
  doc: BoardDocument,
  registry: ObjectTypeRegistry,
  options: ExportOptions,
): string {
  const byParent = groupByParent(doc)
  const capabilitiesOf = (object: AnyOpenFrameObject) => registry.get(object.type)?.capabilities
  const placed = (object: AnyOpenFrameObject): boolean => capabilitiesOf(object)?.spatial === true
  const holds = (object: AnyOpenFrameObject): boolean =>
    capabilitiesOf(object)?.canHaveChildren === true

  /*
   * What is shown, as the overview counts it: hiding a frame hides the frame,
   * not what is in it, so a hidden object hands its place to what it holds.
   * Unlike the overview, a group's members ARE listed — a readout of a group
   * that said only "Group" would have exported nothing anybody wrote.
   */
  const shown = (objects: readonly AnyOpenFrameObject[]): AnyOpenFrameObject[] =>
    objects.flatMap((object) => {
      if (!placed(object)) return []
      if (!object.hidden) return [object]
      return shown(byParent.get(object.id) ?? [])
    })
  const inside = (object: AnyOpenFrameObject): AnyOpenFrameObject[] =>
    holds(object) ? shown(byParent.get(object.id) ?? []) : []

  const roots =
    options.scope.kind === 'board'
      ? shown(byParent.get(null) ?? [])
      : rootsOf(doc, options.scope.ids, placed)

  // Everything exported, for the count and for "not in this export".
  const exported = new Set<ObjectId>()
  const collect = (objects: readonly AnyOpenFrameObject[]): void => {
    for (const object of objects) {
      exported.add(object.id)
      collect(inside(object))
    }
  }
  collect(roots)

  const label = (object: AnyOpenFrameObject): string => typeLabel(object.type)
  const gist = (object: AnyOpenFrameObject): string =>
    escapeMarkdown(registry.describeObject(object).gist)
  const named = (object: AnyOpenFrameObject): string => {
    const said = gist(object)
    return said === '' ? label(object) : `${label(object)}: ${said}`
  }

  /*
   * Loose things first, then the frames: a note listed after a frame's heading
   * reads as inside that frame, which Markdown gives no way to undo. Each group
   * is in reading order — rows from the top, each from the left.
   */
  const ordered = (objects: readonly AnyOpenFrameObject[]): AnyOpenFrameObject[] => {
    const byId = new Map(objects.map((object) => [object.id as string, object]))
    const read = readingOrder(
      objects.map((object) => {
        const bounds = registry.boundsOf(object, doc)
        return { id: object.id, x: bounds.x, y: bounds.y }
      }),
      ROW_BAND,
    ).flatMap((id) => byId.get(id) ?? [])
    return [...read.filter((object) => !holds(object)), ...read.filter(holds)]
  }

  const item = (object: AnyOpenFrameObject): string | null => {
    const description = registry.describeObject(object)
    const said =
      description.body === undefined
        ? escapeMarkdown(description.gist)
        : richTextToMarkdown(description.body)
    const details = [
      ...recordLines(object, registry.get(object.type)?.fields ?? []),
      ...registry.relationsFrom(doc, object.id).flatMap((link) => {
        const other = doc.objects.get(link.edge.to)
        if (other === undefined) return []
        const words = predicateWords(link.edge.predicate)
        return [`${capitalised(words)}: ${named(other)}${outside(other)}`]
      }),
      ...registry.relationsTo(doc, object.id).flatMap((link) => {
        const other = doc.objects.get(link.edge.from)
        if (other === undefined) return []
        const words = predicateWords(link.edge.predicate)
        return [`${label(other)} that ${words} this: ${gist(other)}${outside(other)}`]
      }),
    ]
    // Nothing written and nothing recorded: a bare shape or line. Counted, not listed.
    if (said === '' && details.length === 0) return null

    const [first = '', ...rest] = said.split('\n')
    const head = first === '' ? `- **${label(object)}**` : `- **${label(object)}:** ${first}`
    return [
      head,
      ...rest.map((line) => (line === '' ? '' : `  ${line}`)),
      ...details.map((line) => `  - ${line}`),
    ].join('\n')
  }
  const outside = (object: AnyOpenFrameObject): string =>
    exported.has(object.id) ? '' : ' (not in this export)'

  const blocks: string[] = []
  const level = (objects: readonly AnyOpenFrameObject[], depth: number): void => {
    const all = ordered(objects)
    const items = all.filter((object) => !holds(object)).flatMap((object) => item(object) ?? [])
    if (items.length > 0) blocks.push(items.join('\n'))
    for (const container of all.filter(holds)) {
      blocks.push(`${'#'.repeat(Math.min(depth + 2, DEEPEST))} ${named(container)}`)
      level(inside(container), depth + 1)
    }
  }

  const title = escapeMarkdown(doc.meta.title)
  const heading =
    options.scope.kind === 'board'
      ? title
      : roots.length === 1 && roots[0] !== undefined && holds(roots[0])
        ? `${title} — ${gist(roots[0]) || label(roots[0])}`
        : `${title} — ${String(roots.length)} selected`
  const count =
    exported.size === 0
      ? options.scope.kind === 'board'
        ? 'nothing on this board'
        : 'nothing'
      : exported.size === 1
        ? '1 object'
        : `${String(exported.size)} objects`
  blocks.push(`# ${heading}`, `Exported ${options.exportedOn} · ${count}`)
  level(roots, 0)

  // What the board claims without grounds is what a readout's reader should check first.
  if (options.scope.kind === 'board') {
    const bare = outlineBoard(doc, registry).unsupported.flatMap(({ ids }) =>
      ids.flatMap((id) => doc.objects.get(id) ?? []),
    )
    if (bare.length > 0) {
      blocks.push('## Citing nothing', bare.map((object) => `- ${named(object)}`).join('\n'))
    }
  }

  return `${blocks.join('\n\n')}\n`
}

/**
 * What a partial export starts from. One that sits inside another chosen one
 * is left to come with it, rather than listed twice.
 */
function rootsOf(
  doc: BoardDocument,
  ids: readonly ObjectId[],
  placed: (object: AnyOpenFrameObject) => boolean,
): AnyOpenFrameObject[] {
  const chosen = new Set(ids)
  const within = (object: AnyOpenFrameObject): boolean => {
    let parent = object.parentId
    while (parent !== null) {
      if (chosen.has(parent)) return true
      parent = doc.objects.get(parent)?.parentId ?? null
    }
    return false
  }
  return ids.flatMap((id) => {
    const object = doc.objects.get(id)
    return object !== undefined && placed(object) && !within(object) ? [object] : []
  })
}

/** A record's fields, under the labels its type declares, as list items. */
function recordLines(object: AnyOpenFrameObject, fields: readonly FieldDefinition[]): string[] {
  const data = object.data as Readonly<Record<string, unknown>>
  return fields.flatMap((field) => {
    if (field.meaning !== 'record') return []
    const value = data[field.key]
    if (typeof value === 'boolean') return value ? [escapeMarkdown(field.label)] : []
    if (typeof value === 'number') return [`${escapeMarkdown(field.label)}: ${String(value)}`]
    if (typeof value === 'string') {
      const lines = value
        .trim()
        .split(/\n+/)
        .filter((line) => line.trim() !== '')
      if (lines.length === 0) return []
      return [`${escapeMarkdown(field.label)}: ${lines.map(escapeMarkdown).join('\n    ')}`]
    }
    if (Array.isArray(value)) {
      const words = value.flatMap((entry: unknown) => {
        if (typeof entry === 'string') return entry.trim() === '' ? [] : [entry]
        // A list of choices names each by its label (a poll's options).
        if (typeof entry === 'object' && entry !== null && 'label' in entry) {
          const said: unknown = entry.label
          return typeof said === 'string' && said.trim() !== '' ? [said] : []
        }
        return []
      })
      if (words.length === 0) return []
      const separator = value.some((entry) => typeof entry === 'object') ? '; ' : ', '
      return [`${escapeMarkdown(field.label)}: ${words.map(escapeMarkdown).join(separator)}`]
    }
    return []
  })
}

/** "derivesFrom" as a person says it: "derives from". */
function predicateWords(predicate: string): string {
  return predicate.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
}

function capitalised(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}
