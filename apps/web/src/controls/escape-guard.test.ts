import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Escape is read by one window listener: the stack in `escape-stack.ts`.
 *
 * Surfaces that listened for it on the window themselves fired ALONGSIDE the
 * stack, because `stopPropagation` does not stop other listeners on the same
 * target, so one Escape closed a rail menu and the Session sheet together.
 * The ones that read it on their own element fired AFTER the stack's capture
 * listener, which had already closed whatever was open beneath them.
 * `e2e/escape-order.spec.ts` holds the behaviour; this keeps the next
 * surface from bringing a listener of its own.
 *
 * Every file allowed a keydown listener on the window or the document, and
 * why. Nothing here reads Escape to close a surface.
 */
const ALLOWED = new Map([
  ['controls/escape-stack.ts', 'the stack itself'],
  ['interaction/use-keyboard-shortcuts.ts', "the board's keymap, under every surface"],
  ['canvas/use-canvas-gestures.ts', 'Escape abandons a gesture in flight, which no surface owns'],
  ['ui/Inspector.tsx', 'Shift held lets the record panel yield the pointer'],
  ['ui/SessionMusic.tsx', 'any key at all lets the music start in a browser that needs one'],
])

const SRC = resolve(process.cwd(), 'src')

function sources(): readonly string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' }).filter(
    (file) => /\.tsx?$/.test(file) && !/\.(test|fake)\.tsx?$/.test(file),
  )
}

describe('Escape', () => {
  it('reaches surfaces only through the one stack', () => {
    const listening = sources().filter((file) =>
      /(window|document)\.addEventListener\(\s*['"]keydown['"]/.test(
        readFileSync(join(SRC, file), 'utf8'),
      ),
    )
    expect(listening.filter((file) => !ALLOWED.has(file))).toEqual([])
  })

  it('is allowed nowhere it is no longer needed', () => {
    const listening = new Set(
      sources().filter((file) =>
        /addEventListener\(\s*['"]keydown['"]/.test(readFileSync(join(SRC, file), 'utf8')),
      ),
    )
    expect([...ALLOWED.keys()].filter((file) => !listening.has(file))).toEqual([])
  })
})
