import type { ObjectBase, ShapeData } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'
import { ELLIPSE, labelInset, shapePath } from '../scene/shape-geometry.js'
import { COLOR_VARS, SURFACE_VARS, fontFamily, textAlign } from '../scene/style-tokens.js'

function ShapeOutline({ object }: { object: ObjectBase<string, ShapeData> }) {
  const stroke = COLOR_VARS[object.style.color ?? 'gray']
  const filled = (object.style.fill ?? 'tint') !== 'none'
  const fill = filled ? SURFACE_VARS[object.style.color ?? 'gray'] : 'transparent'
  const strokeWidth = { none: 0, thin: 1, medium: 2, thick: 4 }[object.style.stroke ?? 'medium']

  // Null means the ellipse, which is the one shape that is not a polygon.
  const path = shapePath(object.data.shape)

  return (
    <svg
      className="of-shape__svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {path === null ? (
        <ellipse
          cx={ELLIPSE.cx}
          cy={ELLIPSE.cy}
          rx={ELLIPSE.rx}
          ry={ELLIPSE.ry}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
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
  return (
    <div
      className="of-shape"
      style={{ opacity: object.style.opacity ?? 1 }}
      role="group"
      aria-label={
        label.trim() === '' ? `${object.data.shape} shape` : `${object.data.shape}: ${label}`
      }
    >
      <ShapeOutline object={object} />
      {label.trim() !== '' && (
        <span
          className="of-shape__label"
          style={{
            // Per shape, not a uniform 10%: a label centred in the bounding box
            // runs straight out through any sloped edge.
            inset: labelInset(object.data.shape),
            fontFamily: fontFamily(object.style.font),
            textAlign: textAlign(object.style.align),
          }}
        >
          {label}
        </span>
      )}
    </div>
  )
}

function ShapeEditor({ object, onCommit, onCancel }: ObjectEditorProps<ShapeData>) {
  return (
    <div className="of-shape" style={{ opacity: object.style.opacity ?? 1 }}>
      <ShapeOutline object={object} />
      <InlineTextEditor
        initialText={object.data.text}
        className="of-shape__label of-shape__editor"
        style={{ inset: labelInset(object.data.shape), fontFamily: fontFamily(object.style.font) }}
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
