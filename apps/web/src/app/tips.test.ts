import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A tip a keyboard can summon (DESIGN.md: "a tooltip only a mouse can summon
 * is not a label").
 *
 * The browser's `title` never appears on focus, so forty-two controls had a
 * label only a mouse could reach. They carry `data-tip` — drawn by the
 * stylesheet on hover and on `:focus-visible` — and the same text as an
 * `aria-description`. `title` survives only where it reveals CONTENT rather
 * than naming a control, and each of those says why here.
 */
const SRC = resolve(process.cwd(), 'src')

const CONTENT: Record<string, string> = {
  'ui/RecordFields.tsx': 'a type-declared field label that ellipsises: the whole of it',
  'canvas/CommentLayer.tsx': "a comment pin's excerpt of what was said",
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : []
  })
}

describe('tips a keyboard can summon', () => {
  const files = sources(SRC).map((path) => ({
    path: relative(SRC, path),
    source: readFileSync(path, 'utf8'),
  }))

  it('labels no control with a title only a mouse can reach', () => {
    const titled = files
      .filter(({ source }) => /\stitle=[{"]/.test(source.replace(/<BoardTitle title=/g, '')))
      .map(({ path }) => path)
      .filter((path) => !(path in CONTENT))
    expect(titled).toEqual([])
  })

  it('gives every tip to assistive tech as well', () => {
    const silent = files.flatMap(({ path, source }) => {
      const tips = source.match(/data-tip=/g)?.length ?? 0
      const described = source.match(/aria-description=/g)?.length ?? 0
      return tips > described ? [path] : []
    })
    expect(silent).toEqual([])
  })
})
