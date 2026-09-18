import type { ShapeData, ShapeKind } from '@openframe/core'

import { defineObjectView, type ObjectEditorProps, type ObjectViewProps } from './registry.js'
import { InlineTextEditor } from './shared-editor.js'
import { COLOR_VARS, SURFACE_VARS, fontFamily, textAlign } from '../scene/style-tokens.js'

/**
 * Shape outlines in a normalised 0–100 box.
 *
 * `preserveAspectRatio="none"` lets one path definition stretch to any frame,
 * so resizing needs no geometry recalculation and no per-shape special cases.
 */
const PATHS: Record<ShapeKind, string> = {
  rectangle: 'M2 2 H98 V98 H2 Z',
  diamond: 'M50 2 L98 50 L50 98 L2 50 Z',
  triangle: 'M50 2 L98 98 H2 Z',
  ellipse: '',
}

function ShapeOutline({ object }: ObjectViewProps<ShapeData>) {
  const stroke = COLOR_VARS[object.style.color ?? 'gray']
  const filled = (object.style.fill ?? 'tint') !== 'none'
  const fill = filled ? SURFACE_VARS[object.style.color ?? 'gray'] : 'transparent'
  const strokeWidth = { none: 0, thin: 1, medium: 2, thick: 4 }[object.style.stroke ?? 'medium']

  return (
    <svg
      className="of-shape__svg"
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {object.data.shape === 'ellipse' ? (
        <ellipse
          cx="50"
          cy="50"
          rx="48"
          ry="48"
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : (
        <path
          d={PATHS[object.data.shape]}
          fill={fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinejoin="round"
        />
      )}
    </svg>
  )
}

function ShapeRenderer(props: ObjectViewProps<ShapeData>) {
  const { object } = props
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
      <ShapeOutline {...props} />
      {label.trim() !== '' && (
        <span
          className="of-shape__label"
          style={{
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
      <ShapeOutline object={object} selected={false} zoom={1} />
      <InlineTextEditor
        initialText={object.data.text}
        className="of-shape__label of-shape__editor"
        style={{ fontFamily: fontFamily(object.style.font) }}
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
