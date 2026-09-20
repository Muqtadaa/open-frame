import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The highlighter must reach the browser only when a board has code on it.
 *
 * Verified in the built output once — the main bundle carries no trace of it,
 * and the core plus each language are separate chunks. That check does not
 * survive on its own: one ordinary `import` anywhere pulls the whole thing
 * back into the bundle everybody downloads, the build still succeeds, and
 * nothing says so.
 *
 * So the rule is enforced at its cause instead. A VALUE import of
 * `highlight.js` is what collapses the split; `import type` is erased at
 * compile time and is how the engine's type is named without loading it.
 */

const SRC = resolve(process.cwd(), 'src')

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) {
      found.push(...sourceFiles(path))
    } else if (path.endsWith('.ts') || path.endsWith('.tsx')) {
      found.push(path)
    }
  }
  return found
}

/** A static `import ... from 'highlight.js/...'` that is not a type import. */
const STATIC_VALUE_IMPORT = /^\s*import\s+(?!type\s)[^\n]*?from\s+['"]highlight\.js/m

describe('the highlighter is loaded on demand', () => {
  const files = sourceFiles(SRC).map((path) => ({
    path,
    source: readFileSync(path, 'utf8'),
  }))

  it('has sources to check, so this cannot pass by finding nothing', () => {
    expect(files.length).toBeGreaterThan(50)
  })

  it('is never imported for its value at the top of a module', () => {
    const offenders = files
      .filter((file) => STATIC_VALUE_IMPORT.test(file.source))
      .map((file) => file.path.slice(SRC.length + 1))

    expect(offenders).toEqual([])
  })

  /**
   * And it IS imported dynamically somewhere — otherwise the rule above passes
   * because the feature was deleted, which is the vacuous form of every rule
   * in this codebase.
   */
  it('is imported dynamically', () => {
    const dynamic = files.filter((file) => /import\(['"]highlight\.js/.test(file.source))
    expect(dynamic.length).toBeGreaterThan(0)
  })
})
