import {
  ALIGN_TOKENS,
  COLOR_TOKENS,
  DASH_TOKENS,
  FILL_TOKENS,
  FONT_TOKENS,
  STROKE_TOKENS,
  unionAll,
  worldToScreen,
  type AlignToken,
  type AnyOpenFrameObject,
  type ColorToken,
  type DashToken,
  type FieldDefinition,
  type FillToken,
  type FontToken,
  type ObjectStyle,
  type Rect,
  type StrokeToken,
  type StyleProp,
} from '@openframe/core'
import { useMemo } from 'react'

import { useCommands } from '../hooks/use-commands.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { SURFACE_VARS } from '../scene/style-tokens.js'
import { AlignIcon, DashIcon, FillIcon, StrokeIcon, TrashIcon } from './icons.js'
import { Provenance } from './Provenance.js'
import { RecordFields } from './RecordFields.js'

/** Clearance between the selection and the panel, in screen pixels. */
const GAP_PX = 14
/*
 * Wide enough for all seven colours on ONE row. At 248 the row wrapped 5 + 2,
 * which reads as an accident rather than a grid — and a wrapped swatch row is
 * exactly what this panel exists to stop.
 *
 * Grown from 276 with the label column, which had to widen to stop type-declared
 * field labels being clipped. The two are linked: the swatch row lives in the
 * control column, so taking 24px for labels without giving it back here would
 * have wrapped the swatches again.
 */
const PANEL_WIDTH = 360
/** Keeps the panel off the viewport edge when the selection is near one. */
const MARGIN_PX = 12
/**
 * The tool rail's footprint. A selection wide enough to push the panel off both
 * sides — a connector spanning the board is enough — used to clamp it to the
 * left margin, which parked it squarely on top of the rail.
 */
const RAIL_CLEARANCE_PX = 84
/**
 * Roughly the panel's tallest form: a structured type's semantic fields plus
 * every style control. Only used to keep the panel inside the viewport, so an
 * approximation is enough and measuring would cost a layout read on every
 * render — but it must not UNDER-estimate, or the bottom of the panel leaves
 * the window on a selection near the lower edge.
 */
const PANEL_HEIGHT_PX = 420

/**
 * The record panel: the fields of whatever is selected.
 *
 * Which fields appear comes from the REGISTRY — `capabilities.styleProps` —
 * never from a list maintained here. Before this existed the only reachable
 * style property was `color`, while six object types declared five more between
 * them; a panel with a hardcoded set would have recreated that gap the first
 * time a type declared something new.
 *
 * A mixed selection shows the intersection of what every member honours, which
 * is the only set where one control means one thing.
 */
export function Inspector() {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const viewport = useInteractionStore((state) => state.viewport)
  const canvasSize = useInteractionStore((state) => state.canvasSize)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)
  const commands = useCommands()

  const objects = useMemo<AnyOpenFrameObject[]>(
    () =>
      [...selection]
        .map((id) => document.objects.get(id))
        .filter((object): object is AnyOpenFrameObject => object !== undefined),
    [selection, document],
  )

  const bounds = useMemo<Rect | null>(
    () => unionAll(objects.map((object) => runtime.registry.boundsOf(object, document))),
    [objects, runtime.registry, document],
  )

  /**
   * A type's own semantic fields, shown only for a single selection.
   *
   * Not an intersection like `styleProps` above, for two reasons. Two types'
   * `source` fields are not necessarily the same field, so intersecting by key
   * would put one control over two different meanings — the exact thing the
   * intersection rule exists to prevent. And `UpdateObjectData` addresses ONE
   * object, so editing five at once would be five commands and five undo
   * entries for what the user did once. Bulk editing is a real want and needs a
   * `transact` composite; it is not this.
   */
  const fields = useMemo<readonly FieldDefinition[]>(() => {
    if (objects.length !== 1) return []
    const only = objects[0]
    if (only === undefined) return []
    return runtime.registry.get(only.type)?.fields ?? []
  }, [objects, runtime.registry])

  /*
   * The relation index answers both directions in O(1) after one pass per
   * document version, so asking it on every render is not the O(n) scan rule 10
   * forbids — the pass is shared with every other consumer of the same
   * document.
   */
  const only = objects.length === 1 ? objects[0] : undefined
  const cites = useMemo(
    () => (only === undefined ? [] : runtime.registry.relationsFrom(document, only.id)),
    [only, document, runtime.registry],
  )
  const citedBy = useMemo(
    () => (only === undefined ? [] : runtime.registry.relationsTo(document, only.id)),
    [only, document, runtime.registry],
  )

  /** Only properties EVERY selected object honours — see the note above. */
  const props = useMemo<ReadonlySet<StyleProp>>(() => {
    const lists = objects.map(
      (object) => runtime.registry.get(object.type)?.capabilities.styleProps ?? [],
    )
    const [first, ...rest] = lists
    if (first === undefined) return new Set()
    return new Set(first.filter((prop) => rest.every((list) => list.includes(prop))))
  }, [objects, runtime.registry])

  // Hidden mid-gesture and while editing: a panel that jumps around under the
  // pointer is worse than no panel.
  if (objects.length === 0 || bounds === null) return null
  if (dragKind !== 'idle' || editingId !== null) return null
  if (objects.some((object) => object.locked)) return null
  // A type with fields or a trail but no style properties still has a panel
  // worth showing; one with none of the three has nothing to say.
  if (props.size === 0 && fields.length === 0 && cites.length === 0 && citedBy.length === 0) {
    return null
  }

  const topLeft = worldToScreen(viewport, { x: bounds.x, y: bounds.y })
  const bottomRight = worldToScreen(viewport, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  })

  /*
   * Prefer the right of the selection, then its left, then the right edge of
   * the viewport. The panel follows the object rather than parking in a corner,
   * which is the whole reason it floats — but it never crosses the rail, and it
   * never leaves the viewport.
   */
  const rightmost = canvasSize.width - PANEL_WIDTH - MARGIN_PX
  const fitsRight = bottomRight.x + GAP_PX <= rightmost
  const fitsLeft = topLeft.x - GAP_PX - PANEL_WIDTH >= RAIL_CLEARANCE_PX
  const beside = fitsRight || fitsLeft

  const preferred = fitsRight ? bottomRight.x + GAP_PX : topLeft.x - GAP_PX - PANEL_WIDTH
  const left = beside
    ? preferred
    : // Neither side has room — a narrow window, or a selection nearly as wide
      // as one. Sit under the selection instead of on top of it: covering a
      // neighbour is a cost of floating, covering the thing you just selected
      // is not.
      Math.min(Math.max(topLeft.x, RAIL_CLEARANCE_PX), Math.max(rightmost, RAIL_CLEARANCE_PX))

  const below = bottomRight.y + GAP_PX
  const lowest = canvasSize.height - PANEL_HEIGHT_PX - MARGIN_PX
  const top = beside
    ? Math.min(Math.max(MARGIN_PX, topLeft.y), Math.max(MARGIN_PX, lowest))
    : // Under the selection, or above it when there is no room underneath.
      below <= lowest
      ? below
      : Math.max(MARGIN_PX, topLeft.y - GAP_PX - PANEL_HEIGHT_PX)

  const value = <K extends StyleProp>(prop: K): ObjectStyle[K] | undefined => {
    const first = objects[0]?.style[prop]
    return objects.every((object) => object.style[prop] === first) ? first : undefined
  }

  const apply = (style: ObjectStyle): void => {
    commands.setStyle(
      objects.map((object) => object.id),
      style,
    )
  }

  const label =
    objects.length === 1 ? (objects[0]?.type ?? '') : `${String(objects.length)} objects`

  return (
    <div
      className="of-inspector"
      data-testid="inspector"
      role="group"
      aria-label="Selected object properties"
      style={{
        left: `${String(left)}px`,
        top: `${String(top)}px`,
        width: `${String(PANEL_WIDTH)}px`,
      }}
    >
      <div className="of-inspector__head">
        <span className="of-inspector__subject">{label}</span>
        <button
          type="button"
          className="of-inspector__remove"
          title="Delete (Del)"
          aria-label="Delete selection"
          data-testid="inspector-delete"
          onClick={() => commands.deleteSelection()}
        >
          <TrashIcon />
        </button>
      </div>

      {fields.length > 0 && only !== undefined && (
        <RecordFields
          object={only}
          fields={fields}
          onCommit={(id, patch) => {
            commands.updateData(id, patch)
          }}
        />
      )}

      {/*
       * What the object stands on, and what stands on it. Relations have no
       * appearance on the board by design (ADR 0011), so this is the only
       * place they are visible at all.
       */}
      <Provenance
        doc={document}
        registry={runtime.registry}
        cites={cites}
        citedBy={citedBy}
        onReveal={(id) => {
          commands.reveal(id)
        }}
      />

      {props.size > 0 && (fields.length > 0 || cites.length > 0 || citedBy.length > 0) && (
        <hr className="of-inspector__rule" />
      )}

      {props.has('color') && (
        <Field name="colour">
          <div className="of-swatches" role="group" aria-label="Colour">
            {COLOR_TOKENS.map((token: ColorToken) => (
              <button
                key={token}
                type="button"
                className={`of-swatch${value('color') === token ? ' of-swatch--on' : ''}`}
                style={{ background: SURFACE_VARS[token] }}
                aria-label={token}
                aria-pressed={value('color') === token}
                title={token}
                data-testid={`swatch-${token}`}
                onClick={() => apply({ color: token })}
              />
            ))}
          </div>
        </Field>
      )}

      {props.has('fill') && (
        <Field name="fill">
          <Choice<FillToken>
            options={FILL_TOKENS}
            current={value('fill') ?? 'tint'}
            name="fill"
            onPick={(fill) => apply({ fill })}
            render={(token) => <FillIcon variant={token} />}
          />
        </Field>
      )}

      {props.has('stroke') && (
        <Field name="stroke">
          <Choice<StrokeToken>
            options={STROKE_TOKENS}
            current={value('stroke') ?? 'medium'}
            name="stroke"
            onPick={(stroke) => apply({ stroke })}
            render={(token) => <StrokeIcon variant={token} />}
          />
        </Field>
      )}

      {props.has('dash') && (
        <Field name="line">
          <Choice<DashToken>
            options={DASH_TOKENS}
            current={value('dash') ?? 'solid'}
            name="line"
            onPick={(dash) => apply({ dash })}
            render={(token) => <DashIcon variant={token} />}
          />
        </Field>
      )}

      {props.has('font') && (
        <Field name="face">
          <Choice<FontToken>
            options={FONT_TOKENS}
            current={value('font') ?? 'sans'}
            name="face"
            onPick={(font) => apply({ font })}
            render={(token) => <span className={`of-face of-face--${token}`}>Aa</span>}
          />
        </Field>
      )}

      {props.has('align') && (
        <Field name="align">
          <Choice<AlignToken>
            options={ALIGN_TOKENS}
            current={value('align') ?? 'start'}
            name="align"
            onPick={(align) => apply({ align })}
            render={(token) => <AlignIcon variant={token} />}
          />
        </Field>
      )}

      {props.has('opacity') && (
        <Field name="opacity">
          <div className="of-inspector__slider">
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={Math.round((value('opacity') ?? 1) * 100)}
              aria-label="Opacity"
              data-testid="opacity"
              onChange={(event) => apply({ opacity: Number(event.target.value) / 100 })}
            />
            <span className="of-inspector__reading">
              {Math.round((value('opacity') ?? 1) * 100)}%
            </span>
          </div>
        </Field>
      )}
    </div>
  )
}

/** One record row: a mono label in the left column, the control in the right. */
function Field({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="of-field">
      <span className="of-field__label">{name}</span>
      <div className="of-field__control">{children}</div>
    </div>
  )
}

interface ChoiceProps<T extends string> {
  readonly options: readonly T[]
  readonly current: T
  readonly name: string
  readonly onPick: (value: T) => void
  readonly render: (value: T) => React.ReactNode
}

/** A segmented row of mutually exclusive options, as a real radio group. */
function Choice<T extends string>({ options, current, name, onPick, render }: ChoiceProps<T>) {
  return (
    <div className="of-choice" role="radiogroup" aria-label={name}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          aria-checked={option === current}
          aria-label={option}
          title={option}
          data-testid={`${name}-${option}`}
          className={`of-choice__item${option === current ? ' of-choice__item--on' : ''}`}
          onClick={() => onPick(option)}
        >
          {render(option)}
        </button>
      ))}
    </div>
  )
}
