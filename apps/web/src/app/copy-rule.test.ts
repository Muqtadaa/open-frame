import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Interface copy names things and states facts. It never coaches.
 *
 * "Press to take yours back", "Click anywhere to start", "Try again in a
 * moment": an instruction on a control that is plainly a control is copy
 * people read past every time they meet it, and hedging after a failure says
 * nothing they can act on. The owner's rule is that we do not write it, and
 * this is what holds the rule — it reads every string the interface can show.
 *
 * Comments are stripped first: explaining WHY in code is the house style, and
 * says "press" as often as it likes.
 */
const SRC = resolve(process.cwd(), 'src')

const COACHING: readonly RegExp[] = [
  /\b(press|click|tap|drag|double-click|hold|scroll)( \S+)? (to|for|anywhere|and then)\b/i,
  /\bhold \S+ while\b/i,
  /\b(enter|up and down|arrows?) to (choose|mention|select|move|pick)\b/i,
  /\btry again\b/i,
  /\b(type|use the|use at least) (a|an|@|the|arrows?|number|six)\b/i,
  /\bcheck the (connection|email)\b/i,
]

/**
 * Instructions that teach what nothing else on screen would: the cut is for
 * coaching people already know, never for the one way to find a feature or
 * get out of a failure. Each says why it stays.
 */
const NEEDED: readonly string[] = [
  // The override only a held key gives, mid-drag (rule 17).
  'while dragging to override',
  // The fit a column's border offers, invisible otherwise.
  'double-click to fit',
  // How a mention is made, the only way to learn it exists.
  'Type @ to mention',
  // How a comment is started, said where there are none yet.
  'Click the board to add one',
  // The way out when the clipboard refuses.
  'select it and copy it yourself',
  // A retry that is GATED: when the wait ends is the fact.
  'Too many attempts. Try again in',
  // What finishing a half-done delete takes, which nothing else would say.
  'Delete again to finish',
]

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return /\.tsx?$/.test(path) && !/\.test\.tsx?$/.test(path) ? [path] : []
  })
}

function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

function strings(source: string): string[] {
  return [...withoutComments(source).matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map(
    (match) => match[2] ?? '',
  )
}

describe('interface copy', () => {
  it('names and states, and never coaches', () => {
    const coaching = sources(SRC).flatMap((path) =>
      strings(readFileSync(path, 'utf8'))
        .filter((text) => COACHING.some((pattern) => pattern.test(text)))
        .filter((text) => !NEEDED.some((needed) => text.includes(needed)))
        .map((text) => `${relative(SRC, path)}: ${text}`),
    )
    expect(coaching).toEqual([])
  })
})
