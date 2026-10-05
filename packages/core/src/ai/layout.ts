import type { NewObjectSpec } from '../commands/types.js'
import { copySpec } from '../commands/handlers/duplicate-objects.js'
import type { ObjectId } from '../domain/ids.js'
import type { AnyOpenFrameObject } from '../domain/object.js'
import { richFromPlain } from '../domain/rich-text.js'
import type { ClusterProposal } from './cluster.js'

/** What a copy says about the note it was made from. */
export const COPIED_FROM = 'copiedFrom'

/** Notes per row inside a theme. */
const ACROSS = 3
/** Themes per row inside the whole. */
const THEMES_ACROSS = 4
const PAD = 40
const GAP = 20
/** Room above a nested frame for its title, which is drawn above its edge. */
const TITLE_ROOM = 40
const THEME_GAP = 60

export interface ClusterLayout {
  /** Frames, then the copies inside them, then the relations: one `CreateObjects`. */
  readonly objects: readonly NewObjectSpec[]
  /** The frame holding everything, to select and show once it lands. */
  readonly outer: ObjectId
  readonly width: number
  readonly height: number
}

/**
 * Where a proposal goes on the board, as objects to make — and nothing about
 * the originals, which are never moved, changed or deleted (rule 3: this is
 * a list of things to create, applied as one command).
 *
 * An outer frame titled with the proposal; inside it one frame per theme, in
 * rows; inside each theme, COPIES of its notes in a grid, each with a
 * `copiedFrom` relation back to the original so it can always be traced.
 * Notes nothing claimed go in a last frame, "Other".
 */
export function planClusterLayout(
  proposal: ClusterProposal,
  notes: ReadonlyMap<string, AnyOpenFrameObject>,
  at: { readonly x: number; readonly y: number },
  ids: () => ObjectId,
): ClusterLayout {
  const groups = [
    ...proposal.clusters.map((cluster) => ({ label: cluster.label, refs: cluster.refs })),
    ...(proposal.unassigned.length === 0 ? [] : [{ label: 'Other', refs: proposal.unassigned }]),
  ]
    .map((group) => ({
      label: group.label,
      members: group.refs
        .map((ref) => notes.get(ref))
        .filter((note): note is AnyOpenFrameObject => note !== undefined),
    }))
    .filter((group) => group.members.length > 0)

  // Each theme's size, from the largest note in it.
  const sized = groups.map((group) => {
    const cellW = Math.max(...group.members.map((note) => note.frame.width))
    const cellH = Math.max(...group.members.map((note) => note.frame.height))
    const cols = Math.min(ACROSS, group.members.length)
    const rows = Math.ceil(group.members.length / ACROSS)
    return {
      ...group,
      cellW,
      cellH,
      width: PAD * 2 + cols * cellW + (cols - 1) * GAP,
      height: PAD * 2 + rows * cellH + (rows - 1) * GAP,
    }
  })

  // Themes in rows; each row as tall as its tallest theme.
  const outer = ids()
  const frames: NewObjectSpec[] = []
  const copies: NewObjectSpec[] = []
  const relations: NewObjectSpec[] = []
  let y = at.y + PAD + TITLE_ROOM
  let width = 0
  for (let start = 0; start < sized.length; start += THEMES_ACROSS) {
    const row = sized.slice(start, start + THEMES_ACROSS)
    let x = at.x + PAD
    for (const theme of row) {
      const frame = ids()
      frames.push({
        type: 'frame',
        id: frame,
        x,
        y,
        width: theme.width,
        height: theme.height,
        parentId: outer,
        data: { name: richFromPlain(theme.label) },
      })
      theme.members.forEach((note, index) => {
        const copy = ids()
        const cellX = x + PAD + (index % ACROSS) * (theme.cellW + GAP)
        const cellY = y + PAD + Math.floor(index / ACROSS) * (theme.cellH + GAP)
        copies.push({
          ...copySpec(note, cellX - note.frame.x, cellY - note.frame.y),
          id: copy,
          parentId: frame,
        })
        relations.push({
          type: 'relation',
          x: 0,
          y: 0,
          data: { from: copy, to: note.id, predicate: COPIED_FROM },
        })
      })
      x += theme.width + THEME_GAP
    }
    width = Math.max(width, x - THEME_GAP - at.x + PAD)
    y += Math.max(...row.map((theme) => theme.height)) + THEME_GAP + TITLE_ROOM
  }
  const height = y - THEME_GAP - TITLE_ROOM - at.y + PAD

  return {
    objects: [
      {
        type: 'frame',
        id: outer,
        x: at.x,
        y: at.y,
        width,
        height,
        data: { name: richFromPlain(proposal.title) },
      },
      ...frames,
      ...copies,
      ...relations,
    ],
    outer,
    width,
    height,
  }
}
