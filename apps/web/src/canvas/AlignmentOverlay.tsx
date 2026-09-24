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
    </>
  )
}
