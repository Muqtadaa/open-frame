import { worldToScreen } from '@openframe/core'
import { useMemo } from 'react'

import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { relationLines } from '../scene/relation-lines.js'

/**
 * What the selected object stands on, and what stands on it, drawn on the
 * board.
 *
 * Relations have no appearance of their own (ADR 0011) and were readable only
 * in the record panel, as names with nothing pointing at where they are. Drawn
 * for a single selection only — a board that drew every citation at once would
 * be a hairball on any real synthesis — and only at rest, since a line to
 * where something WAS is worse than none.
 *
 * Dashed and quiet so it can never be mistaken for a connector, which is a
 * thing on the board rather than a statement about two things on it. Apparatus,
 * so it is drawn outside the world transform and its stroke is a screen pixel
 * at every zoom (rule 24).
 */
export function RelationOverlay() {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const viewport = useInteractionStore((state) => state.viewport)
  const dragKind = useInteractionStore((state) => state.drag.kind)

  const [only] = selection.size === 1 ? [...selection] : []
  const lines = useMemo(() => {
    if (only === undefined) return []
    return relationLines(
      only,
      runtime.registry.relationsFrom(document, only),
      runtime.registry.relationsTo(document, only),
      (id) => {
        const object = document.objects.get(id)
        return object === undefined ? null : runtime.registry.boundsOf(object, document)
      },
    )
  }, [only, document, runtime.registry])

  if (lines.length === 0 || dragKind !== 'idle') return null

  const onScreen = lines.map((line) => ({
    ...line,
    from: worldToScreen(viewport, line.from),
    to: worldToScreen(viewport, line.to),
  }))

  return (
    <>
      <svg className="of-relations" aria-hidden="true" data-testid="relation-lines">
        <defs>
          <marker
            id="of-relation-arrow"
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="8"
            markerHeight="8"
            orient="auto-start-reverse"
          >
            <path d="M0 0 L8 4 L0 8 z" className="of-relation__head" />
          </marker>
        </defs>
        {onScreen.map((line) => (
          <g key={line.id}>
            {/* The halo first, so the dashes read over anything they cross. */}
            <line
              className="of-relation__halo"
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
            />
            <line
              className="of-relation"
              data-testid={`relation-${line.id}`}
              x1={line.from.x}
              y1={line.from.y}
              x2={line.to.x}
              y2={line.to.y}
              markerEnd="url(#of-relation-arrow)"
            />
          </g>
        ))}
      </svg>
      {onScreen.map((line) => (
        <span
          key={`label:${line.id}`}
          className="of-relation__label"
          data-testid={`relation-label-${line.id}`}
          style={{
            transform: `translate(${String((line.from.x + line.to.x) / 2)}px, ${String(
              (line.from.y + line.to.y) / 2,
            )}px) translate(-50%, -50%)`,
          }}
        >
          {line.predicate}
        </span>
      ))}
    </>
  )
}
