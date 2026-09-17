import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

const SRC = join(dirname(fileURLToPath(import.meta.url)))

function sourceFiles(dir: string): string[] {
  const found: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      found.push(...sourceFiles(full))
    } else if (extname(full) === '.ts' && !full.endsWith('.d.ts')) {
      found.push(full)
    }
  }
  return found
}

const files = sourceFiles(SRC)

const IMPORT_PATTERN = /^\s*(?:import|export)\b[^'"]*from\s*['"]([^'"]+)['"]/gm

/**
 * Strips comments so these checks read CODE, not prose. Several modules
 * deliberately name the anti-patterns they exist to prevent, and a scanner that
 * cannot tell an explanation from an occurrence reports its own documentation.
 *
 * `://` is preserved so URLs inside string literals are not mistaken for the
 * start of a line comment.
 */
function stripComments(contents: string): string {
  return contents.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

function importsOf(contents: string): string[] {
  return [...contents.matchAll(IMPORT_PATTERN)].map((match) => match[1] ?? '')
}

/**
 * The executable form of the architecture's central claim.
 *
 * If `@openframe/core` can reach React, the DOM, a database driver or a CRDT,
 * then the domain is no longer independent of them — and the promise that the
 * canvas renderer or the persistence layer can be replaced without rewriting
 * the product quietly stops being true. A lint config alone is skippable; this
 * fails `pnpm test`.
 *
 * `dependency-cruiser` enforces the same rule across the whole graph, including
 * transitive reach. This test is the fast, local one.
 */
describe('core purity', () => {
  const FORBIDDEN = [
    'react',
    'react-dom',
    'react/jsx-runtime',
    'zustand',
    'yjs',
    'y-protocols',
    'loro-crdt',
    '@automerge/automerge',
    'tldraw',
    '@tldraw/tldraw',
    '@excalidraw/excalidraw',
    'pg',
    'postgres',
    '@supabase/supabase-js',
    'idb',
  ]

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('imports no UI, renderer, CRDT, AI or database package', () => {
    const violations: string[] = []
    for (const file of files) {
      for (const specifier of importsOf(stripComments(readFileSync(file, 'utf8')))) {
        if (FORBIDDEN.some((f) => specifier === f || specifier.startsWith(`${f}/`))) {
          violations.push(`${file.slice(SRC.length + 1)} imports "${specifier}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('imports no Node built-ins outside of tests', () => {
    const violations: string[] = []
    for (const file of files) {
      if (file.endsWith('.test.ts')) continue
      for (const specifier of importsOf(stripComments(readFileSync(file, 'utf8')))) {
        if (specifier.startsWith('node:')) {
          violations.push(`${file.slice(SRC.length + 1)} imports "${specifier}"`)
        }
      }
    }
    expect(violations).toEqual([])
  })

  it('declares only the runtime dependencies the architecture allows', () => {
    const manifest = JSON.parse(readFileSync(join(SRC, '..', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
    }
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(['fractional-indexing', 'zod'])
  })

  /**
   * `switch (object.type)` is the anti-pattern the object type registry exists
   * to prevent. Behaviour that varies by object type belongs in the registry,
   * where a new semantic type picks it up for free; scattered switches mean
   * adding `evidence` becomes an archaeology exercise across the codebase.
   */
  it('never switches on an object type outside the registry', () => {
    const violations: string[] = []
    for (const file of files) {
      if (file.endsWith('.test.ts')) continue
      const contents = stripComments(readFileSync(file, 'utf8'))
      if (/switch\s*\(\s*[A-Za-z_$][\w$]*\.type\s*\)/.test(contents)) {
        violations.push(file.slice(SRC.length + 1))
      }
    }
    expect(violations).toEqual([])
  })
})
