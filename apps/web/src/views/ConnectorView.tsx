import { plainTextOf, resolveEndpoints, type ConnectorData } from '@openframe/core'

import { connectorPath, pathMidpoint, routeAngles } from '../scene/connector-path.js'
import { capPath } from '../scene/connector-caps.js'
import { dashArray, inkColor, inkOf, strokeWidth, surfaceColor } from '../scene/style-tokens.js'
import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'

/**
 * The room a label is laid out in, in screen pixels either side of its middle.
 *
 * A `foreignObject` needs a box, and the label's own size is only known once
 * it is laid out; so it gets a generous one and centres itself in it. The box
 * takes no pointer events, so its size is never a target.
 */
const LABEL_ROOM = 1000

/**
 * A connector draws itself in ABSOLUTE world coordinates.
 *
 * Unlike every other view, it ignores the positioning its wrapper applies: its
 * geometry comes from wherever its endpoints resolve to, not from a frame. The
 * wrapper compensates by placing connectors at the origin — see `ObjectView`.
 */
function ConnectorRenderer({
  object,
  document: doc,
  zoom,
  boundsOf,
}: ObjectViewProps<ConnectorData>) {
  /*
   * `boundsOf`, never `other.frame` — a group's frame is 0x0 and its extent is
   * its children's, so a line joined to a group used to run to the group's
   * origin instead of to its edge (rule 16).
   */
  const ends = resolveEndpoints(doc, object.data.from, object.data.to, boundsOf)
  const { start, end, startNormal, endNormal } = ends
  /*
   * WHICH WAY each end faces, carried into the route so the line leaves and
   * arrives perpendicular to whatever it is attached to. The caps are oriented
   * by the route's own first and last segments, so they follow for free — and
   * without this they pointed along the object rather than into it.
   */
  const normals = { start: startNormal, end: endNormal }
  /*
   * And the two shapes it joins, so the route can get round them. The same
   * list the domain uses to decide the bounds and the hit test — a view that
   * worked its own out would draw a line somewhere it cannot be clicked.
   */
  const avoiding = [ends.startBox, ends.endBox].filter((box) => box !== null)
  const stroke = inkOf(object.style.strokeColor ?? object.style.color)
  const width = strokeWidth(object.style.stroke, 'medium')
  const held = object.data.points
  const path = connectorPath(start, end, object.data.routing, held, normals, avoiding)
  const { departure, arrival } = routeAngles(
    start,
    end,
    object.data.routing,
    held,
    normals,
    avoiding,
  )
  const label = plainTextOf(object.data.text)
  const mid = pathMidpoint(
    start,
    end,
    object.data.routing,
    held,
    normals,
    avoiding,
    object.data.label,
  )

  // `none` is a colour property's way of saying there is nothing there, which
  // is how a background that has been turned off is stored (see `sanitizeStyle`).
  const chosen = object.style.labelFill
  const ground = chosen === undefined || chosen === 'none' ? undefined : surfaceColor(chosen)
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
          {/*
           * HTML, in the SVG, so the label is rich text like every other
           * (ADR 0014): an SVG `<text>` has no paragraphs and no `<strong>`.
           * Counter-scaled by the group, so it is the same size on the glass
           * at every zoom (rule 24).
           *
           * The PLATE, when one has been asked for, is the label's own
           * background — sized by the text because it IS the text's box, where
           * an SVG rect had to be measured on the frame after and drawn behind.
           */}
          <foreignObject
            x={-LABEL_ROOM}
            y={-LABEL_ROOM}
            width={LABEL_ROOM * 2}
            height={LABEL_ROOM * 2}
            className="of-connector__label-room"
          >
            <div className="of-connector__label-centre">
              <div
                className={`of-connector__label${ground === undefined ? '' : ' of-connector__label--plated'}`}
                style={{
                  ...(object.style.textColor === undefined
                    ? {}
                    : { color: inkColor(object.style.textColor) }),
                  ...(ground === undefined ? {} : { background: ground }),
                }}
              >
                <RichTextView value={object.data.text} />
              </div>
            </div>
          </foreignObject>
        </g>
      )}
    </svg>
  )
}

function ConnectorEditor({
  object,
  document: doc,
  boundsOf,
  Chrome,
  onCommit,
}: ObjectEditorProps<ConnectorData>) {
  // The label's place is the middle of the DRAWN route, which now depends on
  // which way each end leaves — same call as the renderer, same answer.
  const ends = resolveEndpoints(doc, object.data.from, object.data.to, boundsOf)
  const { start, end, startNormal, endNormal } = ends
  const mid = pathMidpoint(
    start,
    end,
    object.data.routing,
    object.data.points,
    { start: startNormal, end: endNormal },
    [ends.startBox, ends.endBox].filter((box) => box !== null),
    object.data.label,
  )
  return (
    <div
      className="of-connector__editor-wrap"
      style={{ transform: `translate(${String(mid.x)}px, ${String(mid.y)}px)` }}
    >
      <RichTextEditor
        initialText={object.data.text}
        className="of-connector__editor"
        ariaLabel="Edit connector label"
        Chrome={Chrome}
        onCommit={(text) => {
          onCommit({ text })
        }}
      />
    </div>
  )
}

export const connectorView = defineObjectView<ConnectorData>({
  type: 'connector',
  defaultColor: 'gray',
  Renderer: ConnectorRenderer,
  InlineEditor: ConnectorEditor,
})
