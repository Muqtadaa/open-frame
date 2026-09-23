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
 * Everything else that floats beside something.
 *
 * The tool rail's two menus are here because they were the last holdout: they
 * placed themselves with `position: absolute` against the rail slot, unclamped,
 * and the table picker therefore ran off the bottom of a short window. Being
 * in the interface rather than on the board did not make that a different
 * problem.
 */
const FLOATERS = [
  // `ChromeSurface` is the world-space caller of `AnchoredSurface`, so going
  // through it is going through the surface — anchored to a board rectangle
  // rather than a screen one.
  { name: 'Toolbar', source: read('src/ui/Toolbar.tsx'), through: 'AnchoredSurface' },
  /*
   * The mentions bell. It opened downward with `top: calc(100% + 6px)`, which
   * was correct under the front door's header and put the whole list below the
   * bottom of the window the moment the same bell appeared in the status bar.
   * No one direction is right in both places — which is the tell that writing
   * a direction down was the mistake, not which direction was written.
   */
  { name: 'Mentions', source: read('src/ui/Mentions.tsx'), through: 'AnchoredSurface' },
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
    expect(LAYER).toMatch(/className="of-chrome of-editor-chrome"/)
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
