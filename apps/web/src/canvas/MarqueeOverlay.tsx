import { rectFromPoints } from '@openframe/core'

import { useInteractionStore } from '../interaction/interaction-store.js'

/** The rubber-band selection rectangle. Pure interaction state — never persisted. */
export function MarqueeOverlay() {
  const drag = useInteractionStore((state) => state.drag)
  if (drag.kind !== 'marquee') return null

  const rect = rectFromPoints(drag.origin, drag.current)
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
