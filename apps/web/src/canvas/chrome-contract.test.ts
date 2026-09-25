import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The two things a piece of apparatus must not get wrong.
 *
 * Both have already gone wrong, repeatedly, which is why they are read off the
 * source rather than trusted to review.
 */
const read = (path: string): string => readFileSync(resolve(process.cwd(), path), 'utf8')

const LAYER = read('src/controls/AnchoredSurface.tsx')
const WORLD_LAYER = read('src/canvas/EditorChrome.tsx')
const GESTURES = read('src/canvas/use-canvas-gestures.ts')
const VIEWS = ['TableView', 'CodeView', 'RichTextEditor'].map((name) => ({
  name,
  source: read(`src/views/${name}.tsx`),
}))

/**
 * Everything that floats beside something.
 *
 * This WAS a hand-written list, and that was the flaw in it: the test could
 * only hold the files somebody had remembered to add, so a new floating
 * surface joined the codebase without joining the rule. The mentions bell
 * proved it — it placed itself in CSS for as long as it existed and this file
 * never had an opinion, right up until the same list appeared in a bar on the
 * bottom edge of the window and opened downward off the screen.
 *
 * The list is still here, because naming the callers is worth something. What
 * it is no longer relied on for is COVERAGE: the two rules at the end of this
 * file go looking instead.
 */
const FLOATERS = [
  { name: 'Toolbar', source: read('src/ui/Toolbar.tsx'), through: 'AnchoredSurface' },
  { name: 'Mentions', source: read('src/ui/Mentions.tsx'), through: 'AnchoredSurface' },
  { name: 'AccountControl', source: read('src/ui/AccountControl.tsx'), through: 'AnchoredSurface' },
  { name: 'ShareControl', source: read('src/ui/ShareControl.tsx'), through: 'AnchoredSurface' },
  { name: 'ContextMenu', source: read('src/ui/ContextMenu.tsx'), through: 'AnchoredSurface' },
  { name: 'Inspector', source: read('src/ui/Inspector.tsx'), through: 'AnchoredSurface' },
  { name: 'Swatches', source: read('src/controls/Swatches.tsx'), through: 'AnchoredSurface' },
  { name: 'ArrangeBar', source: read('src/canvas/ArrangeBar.tsx'), through: 'ChromeSurface' },
  /*
   * The crop overlay's RESET button. It was an ordinary button in world space
   * and did nothing at all: unmarked as apparatus, the press was read as a
   * board gesture, which cleared the selection, which ended crop mode, which
   * unmounted the button between `pointerdown` and `click`. Fifth time.
   */
  { name: 'CropOverlay', source: read('src/canvas/CropOverlay.tsx'), through: 'ChromeSurface' },
  { name: 'EditorChrome', source: WORLD_LAYER, through: 'AnchoredSurface' },
]

describe('the chrome layer', () => {
  /**
   * THE FOURTH-TIME RULE.
   *
   * The canvas blurs whatever is being typed into on any press it reads as a
   * board gesture, and `.of-editor-chrome` is the marker that says a press
   * belongs to an editor instead. That marker has been missed four times — the
   * format bar, the table's buttons, the code menu, and then the whole layer
   * when the apparatus was lifted out of the object. Every one of them
   * presented as a control that was visible and could not be used.
   *
   * There is one place to get it right now, so this asserts it is right there.
   */
  it('marks itself as editor chrome, so a press on it does not end the edit', () => {
    expect(GESTURES).toContain(".of-editor-chrome")
    // A literal or a template that STARTS with both markers — a menu adds a
    // layer modifier after them, and must not be able to drop either.
    expect(LAYER).toMatch(/className=\{?[`"]of-chrome of-editor-chrome[$` "]/)
  })

  /**
   * A view that places its own apparatus is a view back in world space.
   *
   * `position: absolute` plus a percentage offset is how all three of these
   * pinned a bar to an edge of their object, which is what made it scale with
   * the zoom and leave the window. Placement belongs to the layer; a view says
   * only what its apparatus belongs beside.
   */
  it.each(VIEWS)('$name does not counter-scale its own apparatus', ({ source }) => {
    // A counter-scale is the tell: it only makes sense inside the world.
    expect(source).not.toMatch(/scale\(\$\{String\(1 \/ zoom\)\}\)/)
  })

  /**
   * And the layer is the only thing that may place one. If a second placement
   * appears, the split this replaced has grown back.
   */
  it('is the only place that decides where apparatus goes', () => {
    expect(LAYER).toContain('placeAnchored')
    for (const { source } of [...VIEWS, ...FLOATERS]) {
      expect(source).not.toContain('placeAnchored')
    }
  })

  /**
   * And nothing places itself with CSS instead, which is how the rail's menus
   * got out of the window: `position: absolute` against their own slot is the
   * same second placement wearing a stylesheet.
   */
  it.each(FLOATERS)(
    '$name goes through the surface rather than positioning itself',
    ({ source, through }) => {
      expect(source).toContain(through)
    },
  )
})

/**
 * And the two rules that go LOOKING, so the list above cannot be the coverage.
 *
 * Both read a signature rather than a name, which is what makes them find a
 * surface nobody thought to declare.
 */
describe('nothing places itself', () => {
  const CSS = read('src/styles.css')

  /**
   * `calc(100% + n)` in an offset means exactly one thing: put me just outside
   * my parent's edge. That is anchoring, written in a stylesheet, with the
   * direction decided once and never revisited — which is how the mentions
   * list came to open downward out of a bar on the bottom of the window, and
   * how the colour picker came to open rightward out of a panel on the right.
   *
   * The exception is not a name, it is a PROPERTY: if you cannot touch it, it
   * is decoration rather than apparatus. A tooltip takes no presses, needs no
   * `.of-editor-chrome` marker to keep an editor alive through one, and has
   * nothing in it to reach for if it is half off the screen. Anything you can
   * put a pointer on belongs on the layer.
   */
  it('places nothing outside its parent in CSS unless it cannot be touched', () => {
    const offenders: string[] = []
    for (const [, selector, body] of CSS.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (selector === undefined || body === undefined) continue
      if (!/position:\s*(absolute|fixed)/.test(body)) continue
      if (!/(top|bottom|left|right):[^;]*calc\(100%/.test(body)) continue
      if (/pointer-events:\s*none/.test(body)) continue
      offenders.push(selector.trim().split('\n').pop()?.trim() ?? '?')
    }
    expect(offenders, 'these place themselves instead of going through the layer').toEqual([])
  })

  it('finds the stylesheet to read, so the rule above is not vacuous', () => {
    // The pattern matched nothing at all once, because the regex was wrong.
    // A rule that examines no rules passes every time.
    expect(CSS.match(/([^{}]+)\{([^{}]*)\}/g)?.length ?? 0).toBeGreaterThan(200)
    expect(CSS).toContain('calc(100%')
  })

  /**
   * The same mistake in JavaScript. `ui/` and `controls/` are the interface;
   * nothing in them has a position of its own to compute, because everything
   * in them is either in normal flow or anchored to something.
   *
   * Scoped to those two folders on purpose: `canvas/` and `views/` DO set a
   * left and a top in pixels, because that is how an object is put where its
   * frame says it goes, and that is not placement of apparatus.
   */
  it.each([
    'src/ui/Inspector.tsx',
    'src/ui/ContextMenu.tsx',
    'src/ui/Mentions.tsx',
    'src/ui/AccountControl.tsx',
    'src/ui/ShareControl.tsx',
    'src/ui/SearchPanel.tsx',
    'src/ui/Toolbar.tsx',
    'src/controls/Swatches.tsx',
    'src/controls/ColorPicker.tsx',
  ])('%s computes no screen position of its own', (path) => {
    const source = read(path)
    // A percentage is a position INSIDE a control — the pointer on a colour
    // field — and is not what this is about. Pixels are.
    expect(source).not.toMatch(/(left|top):\s*`\$\{String\([^)]*\)\}px`/)
    expect(source).not.toContain('window.innerWidth')
    expect(source).not.toContain('window.innerHeight')
  })
})
