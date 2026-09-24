import { rectFromPoints, worldRectToScreen } from '@openframe/core'

import { useInteractionStore } from '../interaction/interaction-store.js'

/**
 * The rubber-band selection rectangle. Pure interaction state — never
 * persisted.
 *
 * The drag is in world coordinates and the band is drawn on the apparatus
 * layer, so it converts: its 1px border is a screen pixel, which inside the
 * world transform it could not have been.
 */
export function MarqueeOverlay() {
  const drag = useInteractionStore((state) => state.drag)
  const viewport = useInteractionStore((state) => state.viewport)
  if (drag.kind !== 'marquee') return null

  const rect = worldRectToScreen(viewport, rectFromPoints(drag.origin, drag.current))
  return (
    <div
      className="of-marquee"
      style={{
        transform: `translate(${String(rect.x)}px, ${String(rect.y)}px)`,
        width: `${String(rect.width)}px`,
        height: `${String(rect.height)}px`,
      }}
    />
  )
}
