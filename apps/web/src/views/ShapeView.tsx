import { SHAPE_KINDS, type ObjectBase, type ShapeData, type ShapeKind } from '@openframe/core'

import { ShapeIcon } from '../controls/icons.js'
import { ShapePicker } from '../controls/ShapePicker.js'
import type { Mark } from '../scene/tools.js'
import {
  defineObjectView,
  type ObjectEditorProps,
  type ObjectTool,
  type ObjectViewProps,
} from './registry.js'
import { RichTextEditor } from './RichTextEditor.js'
import { RichTextView } from './RichTextView.js'
import {
  ELLIPSE,
  ELLIPSE_MARGIN,
  labelInset,
  roundedShapePath,
  shapePath,
} from '../scene/shape-geometry.js'
import { plainTextOf } from '@openframe/core'

import {
  dashArray,
  fontFamily,
  inkColor,
  lineOf,
  justifyAlign,
  readableInkOn,
  surfaceOf,
  textAlign,
  verticalAlign,
  strokeWidth,
} from '../scene/style-tokens.js'
import { lineClamp } from './line-clamp.js'

function ShapeOutline({ object }: { object: ObjectBase<string, ShapeData> }) {
  // `strokeColor` when it is set, the object's own colour otherwise — which
  // is what every shape drawn before the property existed still gets.
  const stroke = lineOf(object.style.strokeColor ?? object.style.color)
  const filled = (object.style.fill ?? 'tint') !== 'none'
  const fill = filled ? surfaceOf(object.style.color, 'gray') : 'transparent'
  const lineWidth = strokeWidth(object.style.stroke, 'medium')

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
      data-testid="shape-outline"
      viewBox={`0 0 ${String(width)} ${String(height)}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      focusable="false"
    >
      {/*
       * BOTH branches take the pattern and the round cap.
       *
       * Neither did. The path — which is every shape but the ellipse, so
       * rectangle, diamond, triangle, hexagon and parallelogram — had no
       * `strokeDasharray` at all, so setting a line style on five of the six
       * variants did nothing whatsoever. The ellipse had the pattern but no
       * cap, and `dotted` is a ZERO-LENGTH dash: under the default butt cap
       * it draws nothing, so the one variant that read the setting went
       * invisible instead.
       *
       * `shape` declares `dash` and the inspector offers it on that
       * declaration alone, which is rule 21's warning about a capability no
       * view honours — the same shape of bug as `sticky` claiming `fill`.
       */}
      {path === null ? (
        <ellipse
          cx={width / 2}
          cy={height / 2}
          rx={Math.max(0, width / 2 - ELLIPSE_MARGIN)}
          ry={Math.max(0, height / 2 - ELLIPSE_MARGIN)}
          fill={fill}
          stroke={stroke}
          strokeWidth={lineWidth}
          strokeLinecap="round"
          strokeDasharray={dashArray(object.style.dash, lineWidth)}
        />
      ) : (
        <path
          d={path}
          fill={fill}
          stroke={stroke}
          strokeWidth={lineWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
          strokeDasharray={dashArray(object.style.dash, lineWidth)}
        />
      )}
    </svg>
  )
}

/*
 * A label names the shape it is in, so it sits in the middle of it. Unset
 * alignment used to fall through to `flex-start` and override the centring
 * the stylesheet gave it.
 */
const LABEL_ALIGN = 'center'
const LABEL_VALIGN = 'middle'

function ShapeRenderer({ object }: ObjectViewProps<ShapeData>) {
  const label = object.data.text
  const plain = plainTextOf(label)
  return (
    <div
      className="of-shape"
      style={{ opacity: object.style.opacity ?? 1 }}
      role="group"
      aria-label={`${object.data.shape} shape`}
    >
      <ShapeOutline object={object} />
      {plain.trim() !== '' && (
        <div
          className="of-shape__label"
          data-testid="shape-label"
          style={{
            // Per shape, not a uniform 10%: a label centred in the bounding box
            // runs straight out through any sloped edge.
            inset: labelInset(object.data.shape),
            fontFamily: fontFamily(object.style.font),
            // Both, and for different jobs: `justifyContent` places the text
            // block inside the flex box, `textAlign` places each line inside
            // the block. Without the first, a shape label is permanently
            // centred no matter what the panel says.
            justifyContent: justifyAlign(object.style.align ?? LABEL_ALIGN),
            /*
             * The shape's label box is a COLUMN of one item, so the cross axis
             * is the horizontal one and `alignItems` is what places the text
             * up and down — the opposite of every other view here, where the
             * box stacks downward.
             */
            alignItems: verticalAlign(object.style.verticalAlign ?? LABEL_VALIGN),
            textAlign: textAlign(object.style.align ?? LABEL_ALIGN),
            color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color),
          }}
        >
          {/*
           * The text is its own element rather than a bare string. As an
           * anonymous flex item it had no box anything could measure, so the
           * alignment it is placed with was invisible to tests — which is part
           * of why "shape labels are permanently centred" reached a deployed
           * build. Layout is unchanged: one flex item either way.
           */}
          <div
            className="of-shape__label-text"
            data-testid="shape-label-text"
            data-fit-text
            ref={lineClamp}
          >
            <RichTextView value={label} />
          </div>
        </div>
      )}
    </div>
  )
}

function ShapeEditor({ object, Chrome, onCommit }: ObjectEditorProps<ShapeData>) {
  return (
    <div className="of-shape" style={{ opacity: object.style.opacity ?? 1 }}>
      <ShapeOutline object={object} />
      <RichTextEditor
        initialText={object.data.text}
        Chrome={Chrome}
        className="of-shape__label of-shape__editor"
        style={{
          inset: labelInset(object.data.shape),
          /*
           * Placed where the label draws it, defaults included: the editor
           * started at the top of the box while the label was centred, so a
           * double-click moved the word somebody was aiming at. A column, so
           * `justifyContent` is the vertical axis here.
           */
          display: 'flex',
          flexDirection: 'column',
          justifyContent: verticalAlign(object.style.verticalAlign ?? LABEL_VALIGN),
          textAlign: textAlign(object.style.align ?? LABEL_ALIGN),
          fontFamily: fontFamily(object.style.font),
          color: inkColor(object.style.textColor) ?? readableInkOn(object.style.color),
        }}
        ariaLabel="Edit shape label"
        onCommit={(text) => onCommit({ text })}
      />
    </div>
  )
}

/**
 * The shape tool's cursor, which follows the variant the rail is showing.
 *
 * Drawn from `shapePath`, the same geometry the object itself is drawn from,
 * so a new shape kind arrives with a cursor rather than needing one. That
 * geometry is on a 0–100 grid, hence the scale back onto the 24 the other
 * marks use.
 */
function shapeMark(kind: ShapeKind): Mark {
  const path = shapePath(kind)
  const inner =
    path === null
      ? `<ellipse cx="${String(ELLIPSE.cx)}" cy="${String(ELLIPSE.cy)}" rx="${String(ELLIPSE.rx)}" ry="${String(ELLIPSE.ry)}"/>`
      : `<path d="${path}"/>`
  // Onto the same ink box as every other mark: the geometry is a 0-100 grid
  // and the marks are drawn in 3..21 of a 24 one.
  return { body: `<g transform="translate(3 3) scale(0.18)">${inner}</g>` }
}

/**
 * Drawn, like a frame. The variant is chosen before drawing: U arms the tool
 * and then walks the kinds — one key reaching four shapes without four
 * bindings — and pressing the armed button opens the list.
 */
const shapeTool: ObjectTool<ShapeKind> = {
  label: 'Shape',
  keys: [],
  order: 30,
  place: 'draw',
  initial: 'rectangle',
  data: (kind) => ({ shape: kind }),
  cycleKey: 'u',
  cycle: (kind) => SHAPE_KINDS[(SHAPE_KINDS.indexOf(kind) + 1) % SHAPE_KINDS.length] ?? 'rectangle',
  cursor: shapeMark,
  Icon: ({ options }) => <ShapeIcon kind={options} />,
  options: {
    label: 'Choose shape',
    popup: 'menu',
    testIds: { disclosure: 'shape-menu', surface: 'shape-flyout' },
    Picker: ShapePicker,
  },
}

export const shapeView = defineObjectView<ShapeData, ShapeKind>({
  type: 'shape',
  tool: shapeTool,
  defaultColor: 'gray',
  defaultAlign: LABEL_ALIGN,
  defaultVerticalAlign: LABEL_VALIGN,
  Renderer: ShapeRenderer,
  InlineEditor: ShapeEditor,
})
