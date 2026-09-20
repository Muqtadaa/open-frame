import type { ObjectBase, ShapeData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'
import { ELLIPSE_MARGIN, labelInset, roundedShapePath } from '../scene/shape-geometry.js'
import { plainTextOf } from '@openframe/core'

import {
  COLOR_VARS,
  SURFACE_VARS,
  fontFamily,
  inkColor,
  dashArray,
  justifyAlign,
  textAlign,
} from '../scene/style-tokens.js'

function ShapeOutline({ object }: { object: ObjectBase<string, ShapeData> }) {
  const stroke = COLOR_VARS[object.style.color ?? 'gray']
  const filled = (object.style.fill ?? 'tint') !== 'none'
  const fill = filled ? SURFACE_VARS[object.style.color ?? 'gray'] : 'transparent'
  const strokeWidth = { none: 0, thin: 1, medium: 2, thick: 4 }[object.style.stroke ?? 'medium']

  /*
   * DRAWN IN FRAME UNITS, not in the normalised 0-100 box.
   *
   * The box used to be stretched to the frame with
   * `preserveAspectRatio="none"`, which stretched everything drawn in it. A
   * corner radius in box units comes out four times wider than it is tall on a
   * 400x100 rectangle — and the same stretch was already making a stroke
   * thicker on the vertical edges of a wide shape than on its horizontal ones,
   * quietly, for every shape on every board.
   *
   * With the viewBox matching the frame, the mapping is 1:1 and both are
   * simply right.
   */
  const { width, height } = object.frame
  // Null means the ellipse, which is the one shape that is not a polygon.
  const path = roundedShapePath(object.data.shape, { width, height }, object.style.radius ?? 'none')

  return (
    <svg
      className="of-shape__svg"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {path === null ? (
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={Math.max(0, width / 2 - ELLIPSE_MARGIN)}
          ry={Math.max(0, height / 2 - ELLIPSE_MARGIN)}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeDasharray={dashArray(object.style.dash, strokeWidth)}
        />
      ) : (
        <path
          d={path}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function ShapeRenderer({ object }: ObjectViewProps<ShapeData>) {
  const label = object.data.text
  const plain = plainTextOf(label)
  return (
    <div
      className="of-shape"
      style={{ opacity: object.style.opacity ?? 1 }}
      role="group"
      aria-label={
        plain.trim() === '' ? `${object.data.shape} shape` : `${object.data.shape}: ${plain}`
      }
    >
      <ShapeOutline object={object} />
      {plain.trim() !== '' && (
        <span
          className="of-shape__label"
          style={{
            // Per shape, not a uniform 10%: a label centred in the bounding box
            // runs straight out through any sloped edge.
            inset: labelInset(object.data.shape),
            fontFamily: fontFamily(object.style.font),
            // Both, and for different jobs: `justifyContent` places the text
            // block inside the flex box, `textAlign` places each line inside
            // the block. Without the first, a shape label is permanently
            // centred no matter what the panel says.
            justifyContent: justifyAlign(object.style.align),
            textAlign: textAlign(object.style.align),
            color: inkColor(object.style.textColor),
          }}
        >
          {/*
           * The text is its own element rather than a bare string. As an
           * anonymous flex item it had no box anything could measure, so the
           * alignment it is placed with was invisible to tests — which is part
           * of why "shape labels are permanently centred" reached a deployed
           * build. Layout is unchanged: one flex item either way.
           */}
          <span className="of-shape__label-text">
            <RichTextView value={label} />
          </span>
        </span>
      )}
    </div>
  )
}

function ShapeEditor({ object, zoom, onCommit, onCancel }: ObjectEditorProps<ShapeData>) {
  return (
    <div className="of-shape" style={{ opacity: object.style.opacity ?? 1 }}>
      <ShapeOutline object={object} />
      <RichTextEditor
        initialText={object.data.text}
        zoom={zoom}
        className="of-shape__label of-shape__editor"
        style={{
          inset: labelInset(object.data.shape),
          fontFamily: fontFamily(object.style.font),
          color: inkColor(object.style.textColor),
        }}
        ariaLabel="Edit shape label"
        onCommit={(text) => onCommit({ text })}
        onCancel={onCancel}
      />
    </div>
  )
}

export const shapeView = defineObjectView<ShapeData>({
  type: 'shape',
  Renderer: ShapeRenderer,
  InlineEditor: ShapeEditor,
})
