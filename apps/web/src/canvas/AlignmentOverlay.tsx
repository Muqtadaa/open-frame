import { useInteractionStore } from '../interaction/interaction-store.js'

/**
 * The guide lines shown while a drag is lining up with its neighbours.
 *
 * Pure interaction state, drawn inside the world layer so it pans and zooms
 * with the content. Thickness is divided by the zoom so a guide stays a hairline
 * on screen at any magnification — a world-space width would become a stripe
 * when zoomed in and vanish when zoomed out.
 */
export function AlignmentOverlay() {
  const guides = useInteractionStore((state) => state.guides)
  const zoom = useInteractionStore((state) => state.viewport.zoom)

  if (guides.length === 0) return null

  const thickness = 1 / zoom

  return (
    <>
      {guides.map((guide) => {
        const vertical = guide.axis === 'x'
        const length = guide.end - guide.start
        return (
          <div
            key={`${guide.axis}:${String(guide.position)}:${String(guide.start)}`}
            className="of-guide"
            data-testid={`guide-${guide.axis}`}
            style={{
              transform: vertical
                ? `translate(${String(guide.position)}px, ${String(guide.start)}px)`
                : `translate(${String(guide.start)}px, ${String(guide.position)}px)`,
              width: `${String(vertical ? thickness : length)}px`,
              height: `${String(vertical ? length : thickness)}px`,
            }}
          />
        )
      })}
    </>
  )
}
