import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { importedParts } from './read-styles.js'

/**
 * The stylesheet is one file in several parts, and `index.css` is the only
 * thing that says how they go together.
 *
 * The tests that reason about the whole stylesheet read it through
 * `read-styles.ts`, which follows that list. So a part the list forgets is
 * a rule the app never ships AND no test reads, and a second entry point is a
 * stylesheet none of them can see. These hold the list to the directory.
 */

const ROOT = process.cwd()
const DIRECTORY = resolve(ROOT, 'src/styles')

function cssFilesUnder(directory: string): string[] {
  return readdirSync(resolve(ROOT, directory), { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.css'))
    .map((file) => `${directory}/${file}`)
}

describe('the stylesheet’s parts', () => {
  it('are listed in index.css, which holds nothing but the list', () => {
    const index = readFileSync(resolve(DIRECTORY, 'index.css'), 'utf8')
    const rules = index
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
      .split('\n')
    expect(rules.length).toBeGreaterThan(10)
    for (const line of rules) expect(line).toMatch(/^@import '\.\/[\w-]+\.css';$/)
  })

  it('are each imported exactly once', () => {
    const parts = importedParts()
    expect(new Set(parts).size).toBe(parts.length)
    const onDisk = readdirSync(DIRECTORY)
      .filter((file) => file.endsWith('.css') && file !== 'index.css')
      .sort()
    expect([...parts].sort()).toEqual(onDisk)
  })

  it('are the only CSS the app has, reached from one import', () => {
    expect(cssFilesUnder('src').sort()).toEqual(
      [...importedParts().map((file) => `src/styles/${file}`), 'src/styles/index.css'].sort(),
    )
    // Every source, not only the entry: a component that imported a part
    // itself would be a second way into the cascade, in an order `index.css`
    // does not state and the tests reading it cannot see.
    const imports = readdirSync(resolve(ROOT, 'src'), { recursive: true, encoding: 'utf8' })
      .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
      .flatMap((file) =>
        [
          ...readFileSync(resolve(ROOT, 'src', file), 'utf8').matchAll(
            /^\s*import\s+(?:[^'"]*\sfrom\s+)?['"]([^'"]+\.css)(?:\?[^'"]*)?['"]/gm,
          ),
        ].map((match) => `${file}: ${match[1] ?? ''}`),
      )
    expect(imports).toEqual(['main.tsx: ./styles/index.css'])
  })

  it('end on a rule, so joining them on a blank line is the stylesheet as written', () => {
    for (const file of importedParts()) {
      const css = readFileSync(resolve(DIRECTORY, file), 'utf8')
      expect(css, file).toMatch(/\}\n$/)
      expect(css, file).not.toMatch(/^\s*\n/)
    }
  })
})
