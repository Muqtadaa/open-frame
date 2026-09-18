import { visibleWorldRect } from '@openframe/core'
import { useMemo } from 'react'

import { useOpenFrame } from '../runtime/context.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { cullToViewport } from '../scene/culling.js'
import { ObjectView } from './ObjectView.js'

interface Props {
  readonly width: number
  readonly height: number
}

/** Objects just outside the viewport are kept mounted so panning does not flicker. */
const CULL_PADDING_PX = 200

export function ObjectLayer({ width, height }: Props) {
  const { runtime, views } = useOpenFrame()
  const viewport = useInteractionStore((state) => state.viewport)
  const document = useBoardDocument()

  const visible = useMemo(
    () =>
      cullToViewport(
        document,
        runtime.registry,
        visibleWorldRect(viewport, width, height),
        CULL_PADDING_PX / viewport.zoom,
      ),
    [document, runtime.registry, viewport, width, height],
  )

  return (
    <div className="of-object-layer" data-visible-count={visible.length}>
      {visible.map((object) => (
        <ObjectView key={object.id} id={object.id} views={views} />
      ))}
    </div>
  )
}
