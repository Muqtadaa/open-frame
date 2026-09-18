import { resolveEndpoints, type ConnectorData } from '@openframe/core'

import { ARROW_SIZE, arrivalAngle, connectorPath, pathMidpoint } from '../scene/connector-path.js'
import { COLOR_VARS, dashArray } from '../scene/style-tokens.js'
import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'

const STROKE_WIDTHS = { none: 0, thin: 1, medium: 2, thick: 4 }

/**
 * A connector draws itself in ABSOLUTE world coordinates.
 *
 * Unlike every other view, it ignores the positioning its wrapper applies: its
 * geometry comes from wherever its endpoints resolve to, not from a frame. The
 * wrapper compensates by placing connectors at the origin — see `ObjectView`.
 */
function ConnectorRenderer({ object, document: doc, zoom }: ObjectViewProps<ConnectorData>) {
  const { start, end } = resolveEndpoints(doc, object.data.from, object.data.to)
  const stroke = COLOR_VARS[object.style.color ?? 'gray']
  const width = STROKE_WIDTHS[object.style.stroke ?? 'medium']
  const path = connectorPath(start, end, object.data.routing)
  const angle = arrivalAngle(start, end, object.data.routing)
  const label = object.data.text
  const mid = pathMidpoint(start, end)

  const arrow = (at: { x: number; y: number }, rotation: number) =>
    `M ${String(at.x)} ${String(at.y)} ` +
    `L ${String(at.x - ARROW_SIZE * Math.cos(rotation - 0.4))} ${String(at.y - ARROW_SIZE * Math.sin(rotation - 0.4))} ` +
    `M ${String(at.x)} ${String(at.y)} ` +
    `L ${String(at.x - ARROW_SIZE * Math.cos(rotation + 0.4))} ${String(at.y - ARROW_SIZE * Math.sin(rotation + 0.4))}`

  return (
    <svg
      className="of-connector"
      aria-label={label.trim() === '' ? 'Connector' : `Connector: ${label}`}
      role="group"
      style={{ opacity: object.style.opacity ?? 1 }}
    >
      {/* Invisible fat stroke so a thin line is still comfortably clickable. */}
      <path d={path} fill="none" stroke="transparent" strokeWidth={Math.max(12, width * 4)} />
      <path
        className="of-connector__line"
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth={width}
        strokeLinecap="round"
        strokeDasharray={dashArray(object.style.dash, width)}
      />

      {/*
        * Arrowheads are NOT dashed. The pattern says something about the
        * relationship the line represents; a broken-up arrowhead just looks
        * like a rendering fault.
        */}
      {object.data.endArrow === 'arrow' && (
        <path
          d={arrow(end, angle)}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
        />
      )}
      {object.data.startArrow === 'arrow' && (
        <path
          d={arrow(start, angle + Math.PI)}
          fill="none"
          stroke={stroke}
          strokeWidth={width}
          strokeLinecap="round"
        />
      )}

      {label.trim() !== '' && (
        <g transform={`translate(${String(mid.x)} ${String(mid.y)}) scale(${String(1 / zoom)})`}>
          <text className="of-connector__label" textAnchor="middle" dominantBaseline="middle">
            {label}
          </text>
        </g>
      )}
    </svg>
  )
}

function ConnectorEditor({
  object,
  document: doc,
  onCommit,
  onCancel,
}: ObjectEditorProps<ConnectorData>) {
  const { start, end } = resolveEndpoints(doc, object.data.from, object.data.to)
  const mid = pathMidpoint(start, end)
  return (
    <div
      className="of-connector__editor-wrap"
      style={{ transform: `translate(${String(mid.x)}px, ${String(mid.y)}px)` }}
    >
      <InlineTextEditor
        initialText={object.data.text}
        className="of-connector__editor"
        ariaLabel="Edit connector label"
        onCommit={(text) => onCommit({ text })}
        onCancel={onCancel}
      />
    </div>
  )
}

export const connectorView = defineObjectView<ConnectorData>({
  type: 'connector',
  Renderer: ConnectorRenderer,
  InlineEditor: ConnectorEditor,
})
