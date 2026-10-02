import { worldToScreen } from '@openframe/core'

import { useInteractionStore } from '../interaction/interaction-store.js'

/**
 * The guide lines shown while a drag is lining up with its neighbours.
 *
 * Pure interaction state. The guide is a world position drawn on the apparatus
 * layer, so its ENDS convert and its thickness is simply one screen pixel — a
 * hairline at any magnification, which is what a guide is. A world-space width
 * would be a stripe when zoomed in and gone when zoomed out.
 */
export function AlignmentOverlay() {
  const guides = useInteractionStore((state) => state.guides)
  const viewport = useInteractionStore((state) => state.viewport)

  if (guides.length === 0) return null

  const thickness = 1

  return (
    <>
      {guides.map((guide) => {
        const vertical = guide.axis === 'x'
        const from = worldToScreen(
          viewport,
          vertical ? { x: guide.position, y: guide.start } : { x: guide.start, y: guide.position },
        )
        const length = (guide.end - guide.start) * viewport.zoom
        return (
          <div
            key={`${guide.axis}:${String(guide.position)}:${String(guide.start)}`}
            className="of-guide"
            data-testid={`guide-${guide.axis}`}
            style={{
              transform: `translate(${String(from.x)}px, ${String(from.y)}px)`,
              width: `${String(vertical ? thickness : length)}px`,
              height: `${String(vertical ? length : thickness)}px`,
            }}
          />
        )
      })}
      {/* After the lines, so a measurement is never struck through by its own guide. */}
      {guides.flatMap((guide) =>
        guide.gaps.map((gap) => {
          const vertical = guide.axis === 'x'
          const middle = (gap.from + gap.to) / 2
          const at = worldToScreen(
            viewport,
            vertical ? { x: guide.position, y: middle } : { x: middle, y: guide.position },
          )
          return (
            <span
              key={`gap:${guide.axis}:${String(gap.from)}:${String(gap.to)}`}
              className="of-guide__gap"
              data-testid={`guide-gap-${guide.axis}`}
              // Centred on the line, at the middle of the stretch it measures.
              style={{
                transform: `translate(${String(at.x)}px, ${String(at.y)}px) translate(-50%, -50%)`,
              }}
            >
              {/* World units, which is what the record panel's sizes are in. */}
              {String(Math.round(gap.to - gap.from))}
            </span>
          )
        }),
      )}
    </>
  )
}
