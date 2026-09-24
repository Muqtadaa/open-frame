import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * WHICH COORDINATE SYSTEM EACH LAYER IS IN, held to by reading the source.
 *
 * The board is drawn by one `scale(zoom)` on a wrapper, so a CSS length
 * written inside it is a WORLD unit. Apparatus is the opposite: a handle is 9
 * screen pixels at 5% and at 1600% alike. For a long time that was done by
 * dividing every length by the zoom — and it works down to one pixel and then
 * silently stops, because a border, an outline and a shadow cannot be painted
 * thinner than 1px in their own coordinate space.
 *
 * At 1600% a `1 / zoom` border came back as one world pixel — sixteen on
 * screen — and `box-sizing: border-box` then made the border the whole
 * element: a 9px resize handle measured 32. The selection's 1.5px outline and
 * the rotate grip's 1px ring were never divided at all and were sixteen times
 * over on their own. The grips above a selected object ran into each other,
 * which is how it was found; the arithmetic had been wrong at every zoom past
 * about 2× for as long as it had existed.
 *
 * So apparatus lives OUTSIDE the transform, on `.of-apparatus`, and converts
 * its positions once. This reads the composition root to find out what is on
 * which layer, rather than holding a list somebody has to remember to update —
 * the same discovery the chrome contract had to grow for the same reason.
 */
const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

const CANVAS = read('src/canvas/Canvas.tsx')

/**
 * The components rendered between two markers in `Canvas.tsx`.
 *
 * Between the class name that opens a layer and the one that opens the next,
 * which is all the structure needed and all that is stable: the alternative is
 * matching JSX with a regular expression.
 */
function renderedBetween(from: string, to: string): string[] {
  const start = CANVAS.indexOf(from)
  const end = CANVAS.indexOf(to)
  if (start < 0 || end < 0 || end <= start) return []
  const found = [...CANVAS.slice(start, end).matchAll(/<([A-Z][A-Za-z]*)\b/g)].map(
    (match) => match[1] ?? '',
  )
  return [...new Set(found)]
}

const IN_WORLD = renderedBetween('`of-world', 'className="of-apparatus"')
const ON_APPARATUS = renderedBetween('className="of-apparatus"', 'className="of-chrome-layer"')

/** Where a canvas component's source lives, or null if it is somewhere else. */
function sourceOf(name: string): string | null {
  const path = `src/canvas/${name}.tsx`
  return existsSync(resolve(process.cwd(), path)) ? read(path) : null
}

/**
 * Dividing by the zoom, however the zoom is spelled.
 *
 * `(?:[\w.]+\.)?zoom` and not `zoom`, because this rule first went in reading
 * only the latter and then passed when it was broken on purpose: a component
 * that holds the whole `viewport` writes `/ viewport.zoom`, which is the same
 * mistake and was invisible to it. Every one of these files now holds the
 * viewport rather than the zoom, so that spelling is the LIKELY one.
 */
const BY_ZOOM = String.raw`\/ *(?:[\w.]+\.)?zoom\b`

/**
 * A length computed that way, in either of the two forms it gets written in: a
 * `px` string, or a bare number handed to a style property.
 */
const DIVIDED_LENGTH = [
  new RegExp(String.raw`\$\{String\([^}]*` + BY_ZOOM + String.raw`[^}]*\)\}px`),
  new RegExp(String.raw`: *[\w.]+ *` + BY_ZOOM),
]

describe('the world holds world units', () => {
  it('reads the composition root, so the rules below are not vacuous', () => {
    expect(IN_WORLD).toContain('ObjectLayer')
    expect(ON_APPARATUS).toContain('SelectionOverlay')
    expect(ON_APPARATUS.length).toBeGreaterThan(5)
    // Every name resolves to a file, or this is matching something else.
    const missing = [...IN_WORLD, ...ON_APPARATUS].filter((name) => sourceOf(name) === null)
    expect(missing, 'these are not components of the canvas at all').toEqual([])
  })

  /**
   * Inside the transform there is exactly ONE way to be a constant size on
   * screen, and it is not this. A `transform: scale(1 / zoom)` works, because
   * the element is laid out at its written size and only painted smaller, so
   * nothing is ever asked for a sub-pixel border. A divided LENGTH is the one
   * that fails, and it fails quietly.
   */
  it.each(IN_WORLD)('%s does not counter-scale a length', (name) => {
    const source = sourceOf(name)
    if (source === null) return
    for (const pattern of DIVIDED_LENGTH) {
      expect(source, `${name} divides a length by the zoom inside .of-world`).not.toMatch(pattern)
    }
  })

  /**
   * And out here nothing divides by the zoom at all: every length on the
   * apparatus layer is already a screen measurement. Multiplying BY the zoom
   * is the conversion in the other direction and is how a world position gets
   * here, so only division is the tell.
   */
  it.each(ON_APPARATUS)('%s is measured in screen pixels', (name) => {
    const source = sourceOf(name)
    if (source === null) return
    expect(source, `${name} still measures itself in world units`).not.toMatch(
      new RegExp(String.raw`[\w.)] *` + BY_ZOOM),
    )
  })
})
