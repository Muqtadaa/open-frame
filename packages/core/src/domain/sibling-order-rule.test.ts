import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

/**
 * Siblings are ordered in ONE place: `compareSiblings` in `order.ts`.
 *
 * There were four. Two compared keys alone, so a pair that shared a key — two
 * people adding on top at once — stacked differently on each client; one was
 * the same idea written out again; and the MCP server's used `localeCompare`,
 * which folds case and read the board in an order nobody had stacked it in.
 * A fifth would come back the same way: written inline, correct on every board
 * its author tried. So comparing two objects' keys anywhere else fails here.
 */

const REPO = join(dirname(fileURLToPath(import.meta.url)), '../../../..')
const HOME = 'packages/core/src/domain/order.ts'

/** Two objects' keys compared directly, or a key compared by locale. */
const COMPARISONS = [/\.order\.localeCompare\(/, /\.order\s*[<>]=?\s*[\w.?]+\.order\b/]

function sources(directory: string): string[] {
  return readdirSync(join(REPO, directory), { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .filter((file) => !file.split(/[\\/]/).includes('node_modules'))
    .map((file) => join(directory, file))
}

const ROOTS = [
  'packages/core/src',
  'packages/collab/src',
  'apps/web/src',
  'apps/mcp/src',
  'apps/rooms/src',
]

function offenders(files: readonly { path: string; text: string }[]): string[] {
  return files.flatMap(({ path, text }) =>
    text
      .split('\n')
      .map((line, index) => ({ line, at: index + 1 }))
      .filter(({ line }) => COMPARISONS.some((pattern) => pattern.test(line)))
      .map(({ at }) => `${path}:${String(at)}`),
  )
}

describe('sibling order', () => {
  it('is decided by compareSiblings and nothing else', () => {
    const files = ROOTS.flatMap(sources)
      .filter((path) => relative(REPO, join(REPO, path)) !== HOME)
      .map((path) => ({ path, text: readFileSync(join(REPO, path), 'utf8') }))
    // Not vacuous: the whole of every workspace is read.
    expect(files.length).toBeGreaterThan(300)
    expect(offenders(files)).toEqual([])
  })

  it('catches both shapes it exists for', () => {
    expect(
      offenders([
        { path: 'inline', text: 'list.sort((a, b) => (a.order < b.order ? -1 : 1))' },
        { path: 'locale', text: 'list.sort((a, b) => a.order.localeCompare(b.order))' },
        { path: 'fine', text: 'if (last === null || object.order > last) last = object.order' },
      ]),
    ).toEqual(['inline:1', 'locale:1'])
  })
})
