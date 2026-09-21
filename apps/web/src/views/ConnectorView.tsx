import { resolveEndpoints, type ConnectorData } from '@openframe/core'

import { connectorPath, pathMidpoint, routeAngles } from '../scene/connector-path.js'
import { capPath } from '../scene/connector-caps.js'
import { dashArray, inkColor, inkOf, strokeWidth } from '../scene/style-tokens.js'
import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'


/**
 * A connector draws itself in ABSOLUTE world coordinates.
 *
 * Unlike every other view, it ignores the positioning its wrapper applies: its
 * geometry comes from wherever its endpoints resolve to, not from a frame. The
 * wrapper compensates by placing connectors at the origin — see `ObjectView`.
 */
function ConnectorRenderer({ object, document: doc, zoom }: ObjectViewProps<ConnectorData>) {
  const { start, end } = resolveEndpoints(doc, object.data.from, object.data.to)
  const stroke = inkOf(object.style.strokeColor ?? object.style.color)
  const width = strokeWidth(object.style.stroke, 'medium')
  const path = connectorPath(start, end, object.data.routing, object.data.bend ?? null)
  const { departure, arrival } = routeAngles(start, end, object.data.routing, object.data.bend ?? null)
  const label = object.data.text
  const mid = pathMidpoint(start, end, object.data.routing, object.data.bend ?? null)

  // Both ends, resolved once. `angle` is the direction of travel as the line
  // arrives, so the near end is the same angle turned around.
  const caps = [
    { key: 'end', cap: capPath(object.data.endArrow, end, arrival) },
    // Turned around, so it faces back out of the line exactly as the end cap
    // faces into it.
    { key: 'start', cap: capPath(object.data.startArrow, start, departure + Math.PI) },
  ]

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
       * Caps are NOT dashed. The pattern says something about the relationship
       * the line represents; a broken-up arrowhead just looks like a rendering
       * fault.
       *
       * A filled cap takes the line's colour as its fill and draws no stroke:
       * stroking a solid shape as well thickens it by the stroke width, so a
       * thick connector would end in a blob noticeably bigger than a thin one.
       */}
      {caps.map(({ key, cap }) =>
        cap === null ? null : (
          <path
            key={key}
            d={cap.d}
            fill={cap.filled ? stroke : 'none'}
            stroke={cap.filled ? 'none' : stroke}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ),
      )}

      {label.trim() !== '' && (
        <g transform={`translate(${String(mid.x)} ${String(mid.y)}) scale(${String(1 / zoom)})`}>
          <text
            className="of-connector__label"
            textAnchor="middle"
            dominantBaseline="middle"
            // `fill`, not `color`: an SVG glyph is painted, not inked.
            fill={inkColor(object.style.textColor)}
          >
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
  const mid = pathMidpoint(start, end, object.data.routing, object.data.bend ?? null)
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
