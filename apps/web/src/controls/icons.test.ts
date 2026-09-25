import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * Icons are drawn once, in one place (DESIGN.md, Shapes).
 *
 * The set lives in `controls/icons.tsx` — on the 24×24 grid at 1.6, in
 * `currentColor` — and a leaf layer, so a view can use it without reaching into
 * `ui/`. Before that it was in `ui/`, and the private copies that grew beside it
 * (a plus at 1.8 in the workspace bar, a dropper in the colour picker) did so
 * partly because the one set was out of reach.
 *
 * An `<svg>` anywhere else must be DRAWING something rather than labelling a
 * control, and says so here.
 */
const SRC = resolve(process.cwd(), 'src')

const DRAWINGS: Record<string, string> = {
  'canvas/ConnectorPreview.tsx': 'the line being drawn',
  'canvas/DrawPreview.tsx': 'the shape being drawn',
  'canvas/PresenceLayer.tsx': "a peer's pointer, in their colour",
  'controls/Swatches.tsx': 'specimens: a rule at outline weight, and the colour wheel itself',
  'views/ConnectorView.tsx': 'a connector',
  'views/ShapeView.tsx': 'a shape',
}

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) return sources(path)
    return path.endsWith('.tsx') && !path.endsWith('.test.tsx') ? [path] : []
  })
}

describe('icons are drawn once', () => {
  const drawing = sources(SRC)
    .filter((path) => readFileSync(path, 'utf8').includes('<svg'))
    .map((path) => relative(SRC, path))

  it('draws no icon outside the set', () => {
    const stray = drawing.filter((path) => path !== 'controls/icons.tsx' && !(path in DRAWINGS))
    expect(stray).toEqual([])
  })

  it('lists only files that still draw', () => {
    expect(Object.keys(DRAWINGS).filter((path) => !drawing.includes(path))).toEqual([])
  })
})
