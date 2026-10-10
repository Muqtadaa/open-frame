import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * A list of controls is walked by keys in one place: `roving.ts`.
 *
 * Twelve surfaces walked themselves, and each differed in some way that
 * mattered. The genres and the Inbox let an arrow go on to the board, which
 * read it as a nudge to the selected note; the shape flyout let Tab walk out
 * and stayed open behind. `e2e/list-keys.spec.ts` holds the behaviour; this
 * keeps the next list from bringing its own arrow handling.
 *
 * Every file allowed to name an arrow key itself, and why. Each moves by
 * something the shared keys cannot know: a position in two dimensions, or a
 * level in a tree or a menu.
 */
const ALLOWED = new Map([
  ['controls/roving.ts', 'the shared keys themselves'],
  ['controls/TableSizePicker.tsx', 'a grid that grows the size it offers, by column and row'],
  ['canvas/ReactionPicker.tsx', 'a grid eight wide, with its search field above the top row'],
  ['ui/BoardOverview.tsx', "a tree: Right and Left open and close a frame, as a tree's do"],
  ['ui/ContextMenu.tsx', 'Right and Left go into a submenu and back out of it'],
  ['views/TableView.tsx', "the spreadsheet's cell selection, in rows and columns"],
])

const SRC = resolve(process.cwd(), 'src')
const SCANNED = ['ui', 'canvas', 'controls', 'views']
/** An arrow key named as a string, or as a key in a table of moves. */
const ARROW = /['"]Arrow(?:Up|Down|Left|Right)['"]|\bArrow(?:Up|Down|Left|Right)\s*:/

function naming(): readonly string[] {
  return SCANNED.flatMap((folder) =>
    readdirSync(join(SRC, folder), { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file) && !/\.(test|fake)\.tsx?$/.test(file))
      .map((file) => `${folder}/${file}`)
      .filter((file) => ARROW.test(readFileSync(join(SRC, file), 'utf8'))),
  )
}

describe('arrow keys', () => {
  it('walk a list only through the shared keys', () => {
    expect(naming().filter((file) => !ALLOWED.has(file))).toEqual([])
  })

  it('are allowed nowhere they are no longer named', () => {
    const named = new Set(naming())
    expect([...ALLOWED.keys()].filter((file) => !named.has(file))).toEqual([])
  })
})
