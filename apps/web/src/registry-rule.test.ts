import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { createDefaultRegistry } from '@openframe/core'
import { describe, expect, it } from 'vitest'

/**
 * Rule 5, in the web app (tracks A-6).
 *
 * The core scan looks for `switch (x.type)` in core's own files, and nothing
 * looked here at all — so `object.type === 'connector'` sat in the canvas,
 * deciding for every type whether it is drawn from its ends, and the next type
 * drawn that way would have been placed wrong until somebody found the line.
 * Behaviour that varies by type is asked of the registry.
 *
 * The names are the registry's own, never a list written here: a list would
 * miss the next type exactly as the canvas did. Views are exempt — one view is
 * one type, and naming it there is the point.
 */
const SRC = resolve(process.cwd(), 'src')
const TYPES = createDefaultRegistry()
  .list()
  .map((definition) => definition.type)

function sources(): readonly string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file))
    .filter((file) => !file.startsWith('views/'))
    .map((file) => join(SRC, file))
}

// Blanks comments out line for line, so a violation is reported where it is.
const stripComments = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (comment) => comment.replace(/[^\n]/g, ''))
    .replace(/^\s*\/\/.*$/gm, '')

const escape = (name: string): string => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

describe('the web app asks the registry what a type does', () => {
  it('reads the type names from the registry', () => {
    // Not vacuous: the scan knows the types it is looking for.
    expect(TYPES).toContain('connector')
    expect(TYPES).toContain('group')
  })

  it('never branches on an object type outside a view', () => {
    const names = TYPES.map(escape).join('|')
    const compared = new RegExp(
      `\\.type\\s*[!=]==?\\s*['"\`](?:${names})['"\`]|['"\`](?:${names})['"\`]\\s*[!=]==?\\s*[\\w$.?]*\\.type\\b`,
    )
    const switched = /switch\s*\(\s*[\w$.?]*\.type\s*\)/
    const violations: string[] = []
    for (const file of sources()) {
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
      lines.forEach((line, index) => {
        if (compared.test(line) || switched.test(line)) {
          violations.push(`${file.slice(SRC.length + 1)}:${String(index + 1)}: ${line.trim()}`)
        }
      })
    }
    expect(violations).toEqual([])
  })
})
