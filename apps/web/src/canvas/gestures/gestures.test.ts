import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { HANDLERS } from './index.js'
import { GESTURE_MODES } from './types.js'

/**
 * What a gesture mode does is its own module (`canvas/gestures/`).
 *
 * The hook that turns pointer events into commands had grown to 1,659 lines,
 * with every mode interleaved through four handlers: a change to how a crop
 * previews meant reading how a connector commits. The hook now dispatches to
 * `HANDLERS[active.mode]` and names no mode itself.
 */
const HOOK = readFileSync(resolve(process.cwd(), 'src/canvas/use-canvas-gestures.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')

describe('gesture modes', () => {
  it('have a handler each', () => {
    expect(Object.keys(HANDLERS).sort()).toEqual([...GESTURE_MODES].sort())
  })

  it('are not branched on by name in the hook', () => {
    const names = GESTURE_MODES.join('|')
    const branched = new RegExp(
      `\\bmode\\s*[!=]==\\s*'(?:${names})'|case\\s+'(?:${names})'\\s*:`,
      'g',
    )
    expect(HOOK.match(branched) ?? []).toEqual([])
  })
})
