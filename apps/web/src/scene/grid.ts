import { GRID_SIZE } from './snapping.js'

/**
 * The three background properties the ruling needs, named structurally.
 *
 * Not React's `CSSProperties`: `scene/` is pure view geometry and a leaf, and
 * a type import is still an import — the point of the layer is that none of it
 * knows a renderer exists.
 */
export interface GridStyle {
  readonly backgroundImage: string
  readonly backgroundSize: string
  readonly backgroundPosition: string
}

/**
 * The ruled ground, as CSS background layers.
 *
 * The fine rule is 10 world units, so at 100% it lands every 10 screen pixels.
 * That density is correct — it is what quadrille IS — but only at the right
 * weight: drawn as strongly as the decade it reads as noise, and dropping it
 * instead leaves 100px cells that read as tiles rather than as a ruled page.
 * The answer was ink, not spacing, so every weight is faint.
 *
 * The ruling is CONTINUOUS in zoom, not switched at thresholds. It used to
 * appear and disappear at fixed zooms — the fine rule at 70%, a century rule
 * below 12% — and the board visibly jumped between two different pages as you
 * scrolled through those points. What a rule costs is not its zoom but its CELL
 * SIZE ON SCREEN: below a handful of pixels any ruling reads as a grey wash,
 * however faint its ink.
 *
 * So the levels are decades of world units, chosen by where the zoom currently
 * sits WITHIN a decade, and three of them are drawn at once: the level below
 * comfortable fades out as its cells shrink, the comfortable one is solid, and
 * the level above fades in to replace it. At the moment the decade rolls over,
 * every layer already matches what the next arrangement draws, so nothing
 * changes discontinuously. Weight is interpolated the same way — a layer's ink
 * darkens as its cells grow — because switching weights at the rollover would
 * reintroduce the pop the fade exists to remove.
 */

/**
 * The cell size, in screen pixels, at which a rule is drawn at full strength.
 *
 * Also the unit of the whole scheme: every visible level is this times a power
 * of ten, and the fade runs across one decade below it.
 */
const COMFORTABLE_CELL_PX = 12

/** World units per decade step. The fine rule is `GRID_SIZE`, so decades of it. */
const DECADE = 10

export function gridStyle(viewport: { x: number; y: number; zoom: number }): GridStyle {
  const offsetX = -viewport.x * viewport.zoom
  const offsetY = -viewport.y * viewport.zoom

  /*
   * Where this zoom sits inside its decade, as a fraction. The comfortable
   * level has a cell of COMFORTABLE_CELL_PX * 10^frac, so `frac` is both the
   * position within the decade and the opacity of the level below it — which is
   * what makes the hand-over continuous.
   */
  const decades = Math.log10((GRID_SIZE * viewport.zoom) / COMFORTABLE_CELL_PX)
  const frac = decades - Math.floor(decades)

  const layers: string[] = []
  const sizes: string[] = []

  for (const step of [-1, 0, 1]) {
    const cell = COMFORTABLE_CELL_PX * DECADE ** (frac + step)
    // -1 fades in as the decade advances, +1 fades out; 0 carries the page.
    const alpha = step === -1 ? frac : step === 1 ? 1 - frac : 1
    /*
     * A fully faded layer is still emitted. Dropping it would change the NUMBER
     * of background layers as the zoom crosses a decade, which is a
     * discontinuity of exactly the kind this scheme exists to remove — and it
     * would make the browser rebuild the layer list at the one moment the user
     * is watching the ruling closely.
     */

    /*
     * Ink follows cell size, not level index. A layer drawn at the fine weight
     * one frame and the decade weight the next would pop at exactly the
     * rollover the fade exists to smooth, so the two tokens are mixed by how
     * far through the decade this layer's cells are.
     */
    const weight = Math.min(1, Math.max(0, (step + 1) / 2))
    const ink = `color-mix(in srgb, var(--of-rule-decade) ${String(Math.round(weight * 100))}%, var(--of-rule))`
    const paint = `color-mix(in srgb, ${ink} ${String(Math.round(alpha * 100))}%, transparent)`

    layers.push(
      `linear-gradient(to right, ${paint} 1px, transparent 1px)`,
      `linear-gradient(to bottom, ${paint} 1px, transparent 1px)`,
    )
    sizes.push(`${String(cell)}px ${String(cell)}px`, `${String(cell)}px ${String(cell)}px`)
  }

  return {
    backgroundImage: layers.join(', '),
    backgroundSize: sizes.join(', '),
    backgroundPosition: layers.map(() => `${String(offsetX)}px ${String(offsetY)}px`).join(', '),
  }
}
