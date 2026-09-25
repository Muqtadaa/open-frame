import {
  ALIGN_TOKENS,
  VALIGN_TOKENS,
  DASH_TOKENS,
  RADIUS_TOKENS,
  FILL_TOKENS,
  FONT_TOKENS,
  TEXT_SIZE_TOKENS,
  STROKE_TOKENS,
  unionAll,
  worldToScreen,
  type AlignToken,
  type VAlignToken,
  type AnyOpenFrameObject,
  type DashToken,
  type RadiusToken,
  type FieldDefinition,
  type OfferedAction,
  type TextSizeToken,
  type FillToken,
  type FontToken,
  type ObjectStyle,
  type Rect,
  type StrokeToken,
  type StyleProp,
} from '@openframe/core'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useCommands } from '../hooks/use-commands.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { PANEL_CLEARANCE_PX } from '../scene/connect-points.js'
import { useOpenFrame } from '../runtime/context.js'
import { Swatches, groundOf, type SwatchKind } from '../controls/Swatches.js'
import { AlignIcon, VAlignIcon, DashIcon,
  RadiusIcon, FillIcon, StrokeIcon, TrashIcon } from '../controls/icons.js'
import { Provenance } from './Provenance.js'
import { RecordFields } from './RecordFields.js'

/** Clearance between the selection and the panel, in screen pixels. */
const GAP_PX = PANEL_CLEARANCE_PX
/*
 * Wide enough for a full row of the swatch grid. At 248 the row wrapped 5 + 2,
 * which reads as an accident rather than a grid — and a wrapped swatch row is
 * exactly what this panel exists to stop. `design-tokens.test.ts` does the
 * arithmetic against the grid's own column count.
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
/*
 * There WAS a PANEL_HEIGHT_PX here — 420, "roughly the panel's tallest form" —
 * because the placement it fed could not measure. A guess that must never
 * under-estimate is a guess that always over-estimates, so the panel was kept
 * further from the bottom edge than it needed to be, by an amount nobody could
 * name. `AnchoredSurface` measures what it is placing, so the guess is gone
 * rather than moved.
 */

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
/**
 * The colour properties a type can declare, in the order they are offered.
 *
 * `label` is what the selector shows; `name` names the grid for a screen
 * reader, where "surface" and "text" alone would be two identically announced
 * groups.
 */
type PaintProp = 'color' | 'textColor' | 'strokeColor' | 'labelFill'

const PAINTABLE: readonly { prop: PaintProp; label: string; name: string }[] = [
  { prop: 'color', label: 'fill', name: 'Colour' },
  { prop: 'textColor', label: 'text', name: 'Text colour' },
  { prop: 'strokeColor', label: 'line', name: 'Line colour' },
  { prop: 'labelFill', label: 'label', name: 'Label background' },
]

/*
 * What each property's swatches are a specimen of. A fill is a slip; text is a
 * letter; a line is a rule. Text and line resolve to the same colour — a token
 * has only two answers — and differ in what they DRAW, because a swatch has to
 * say which property it sets.
 */
const PAINT_KIND: Readonly<Record<PaintProp, SwatchKind>> = {
  color: 'surface',
  textColor: 'ink',
  strokeColor: 'line',
  labelFill: 'surface',
}

/**
 * The whole-object text marks, in the order they are shown.
 *
 * A GROUP of toggles rather than a radio row: they combine, where every other
 * control in this panel is a choice of one. Bold and italic together is the
 * commonest pair there is.
 */
const MARK_PROPS: readonly { prop: 'bold' | 'italic' | 'underline'; name: string; glyph: string }[] =
  [
    { prop: 'bold', name: 'Bold', glyph: 'B' },
    { prop: 'italic', name: 'Italic', glyph: 'I' },
    { prop: 'underline', name: 'Underline', glyph: 'U' },
  ]

/** Stable test handles, so a renamed label never renames a selector. */
const PAINT_PREFIX: Readonly<Record<PaintProp, string>> = {
  color: 'swatch',
  textColor: 'ink',
  strokeColor: 'line',
  labelFill: 'label',
}

export function Inspector() {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const viewport = useInteractionStore((state) => state.viewport)
  const canvasSize = useInteractionStore((state) => state.canvasSize)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)
  const commands = useCommands()
  /*
   * A style being aimed at: a colour dragged across the picker, an opacity
   * slid. Previewed on the selection and written ONCE when the gesture ends
   * (rules 4 and 14) — to the objects it was previewed on, not to whatever is
   * selected by the time it settles, because the gesture can end on a click
   * that selects something else.
   */
  const previewStyle = useInteractionStore((state) => state.previewStyle)
  const clearStylePreview = useInteractionStore((state) => state.clearStylePreview)
  /*
   * What is being aimed at, so the panel's own controls show it too — the
   * custom swatch its colour, the slider where it is. The store holds the same
   * object between updates, so the reference is stable (rule 9).
   */
  const aimed = useInteractionStore((state) => state.stylePreview?.style)
  const settle = useCallback((): void => {
    const aimed = useInteractionStore.getState().stylePreview
    if (aimed === null) return
    commands.setStyle([...aimed.ids], aimed.style)
    clearStylePreview()
  }, [commands, clearStylePreview])
  // A panel that closes mid-gesture still lands what was aimed at.
  useEffect(() => settle, [settle])

  /*
   * Shift held on the board means "add to the selection", and the next object
   * is usually under this panel. Not while typing or tabbing inside the panel
   * (Shift is a capital letter there), nor in any other editor.
   */
  const [yielding, setYielding] = useState(false)
  useEffect(() => {
    const busy = (): boolean => {
      const focused = window.document.activeElement
      if (!(focused instanceof HTMLElement)) return false
      return (
        focused.closest('[data-testid="inspector"]') !== null ||
        focused.isContentEditable ||
        focused instanceof HTMLInputElement ||
        focused instanceof HTMLTextAreaElement
      )
    }
    const down = (event: KeyboardEvent): void => {
      if (event.key === 'Shift' && !busy()) setYielding(true)
    }
    const up = (event: KeyboardEvent): void => {
      if (event.key === 'Shift') setYielding(false)
    }
    const away = (): void => {
      setYielding(false)
    }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    window.addEventListener('blur', away)
    return () => {
      window.removeEventListener('keydown', down)
      window.removeEventListener('keyup', up)
      window.removeEventListener('blur', away)
    }
  }, [])

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

  /**
   * What this object can be asked to DO, from the registry.
   *
   * Only what it would change right now — a connector with no stops on it
   * offers no reset — and only for a single selection, for the same reason
   * fields are: one command addresses one object, so five at once would be
   * five undo entries for what somebody did once.
   */
  const actions = useMemo<readonly OfferedAction[]>(() => {
    if (objects.length !== 1) return []
    const target = objects[0]
    if (target === undefined) return []
    return runtime.registry.actionsOf(target)
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
  /*
   * Which colour the palette is painting. Panel state, not document state: it
   * is where you are looking, and storing it would make a saved board carry
   * which tab somebody last used.
   *
   * UP HERE with the other hooks, and that is not a style preference. This
   * panel returns `null` four times before it renders anything — no selection,
   * mid-gesture, a locked object, nothing to show — so a `useState` placed
   * beside the value it feeds ran on some renders and not others, which is the
   * one thing React cannot survive. It took the whole app down on every
   * selection.
   */
  const [paint, setPaint] = useState<PaintProp>('color')

  const props = useMemo<ReadonlySet<StyleProp>>(() => {
    // Asked of the REGISTRY per object, not read off the type's capabilities:
    // `shape` offers a corner radius on every kind but the ellipse, and only
    // the registry knows that.
    const lists = objects.map((object) => runtime.registry.stylePropsOf(object))
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
  if (
    props.size === 0 &&
    fields.length === 0 &&
    actions.length === 0 &&
    cites.length === 0 &&
    citedBy.length === 0
  ) {
    return null
  }

  const topLeft = worldToScreen(viewport, { x: bounds.x, y: bounds.y })
  const bottomRight = worldToScreen(viewport, {
    x: bounds.x + bounds.width,
    y: bounds.y + bounds.height,
  })

  /*
   * The selection, in screen pixels. Converted here because this panel is the
   * one piece of apparatus in `ui/` anchored to something on the BOARD, and
   * `ui` may not import the canvas — `ChromeSurface`, which does this
   * conversion for a view, is on the wrong side of that line.
   */
  const selectionBox = {
    x: topLeft.x,
    y: topLeft.y,
    width: bottomRight.x - topLeft.x,
    height: bottomRight.y - topLeft.y,
  }

  const value = <K extends StyleProp>(prop: K): ObjectStyle[K] | undefined => {
    const pending = aimed?.[prop]
    if (pending !== undefined) return pending
    const first = objects[0]?.style[prop]
    return objects.every((object) => object.style[prop] === first) ? first : undefined
  }

  const apply = (style: ObjectStyle): void => {
    const aimed = useInteractionStore.getState().stylePreview
    commands.setStyle(aimed === null ? objects.map((object) => object.id) : [...aimed.ids], style)
    if (aimed !== null) clearStylePreview()
  }

  const preview = (style: ObjectStyle | null): void => {
    if (style === null) clearStylePreview()
    else previewStyle(new Set(objects.map((object) => object.id)), style)
  }

  /*
   * Which colours this selection can be given, from the registry. `fill` is
   * not here: it is a separate field with its own control, because "none,
   * tint, solid" is a different question from "which colour".
   */
  const paintTargets = PAINTABLE.filter((option) => props.has(option.prop))
  const painting = paintTargets.find((option) => option.prop === paint) ?? paintTargets[0]

  const label =
    objects.length === 1 ? (objects[0]?.type ?? '') : `${String(objects.length)} objects`

  return (
    <AnchoredSurface
      anchor={selectionBox}
      surface={canvasSize}
      /*
       * Beside the selection first, because the panel follows the object
       * rather than parking in a corner — that is the whole reason it floats.
       * Under it next: covering a neighbour is a cost of floating, covering
       * the thing you have just selected is not.
       */
      prefer={['right', 'left', 'below', 'above']}
      gap={GAP_PX}
      margin={MARGIN_PX}
      keepClearLeft={RAIL_CLEARANCE_PX}
      testId="inspector-surface"
    >
    <div
      className={`of-inspector of-surface${yielding ? ' of-inspector--yielding' : ''}`}
      data-testid="inspector"
      role="group"
      aria-label="Selected object properties"
      style={{ width: `${String(PANEL_WIDTH)}px` }}
    >
      <div className="of-inspector__head">
        <span className="of-inspector__subject">{label}</span>
        <button
          type="button"
          className="of-icon-button of-icon-button--destructive"
          data-tip="Delete (Del)"
          aria-description="Delete (Del)"
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

      {actions.length > 0 && only !== undefined && (
        <div className="of-inspector__actions">
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="of-button"
              data-testid={`action-${action.id}`}
              onClick={() => {
                const patch = runtime.registry.applyAction(only, action.id)
                if (patch !== null) commands.updateData(only.id, patch)
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
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

      {/*
        * ONE palette, and what it paints.
        *
        * Two grids of eleven made this panel 68px taller, and a floating panel
        * that grows covers more board — measured, not guessed: the opacity
        * slider ended up over an object 350px away, which is a thing you can
        * no longer pick up. The alignment suite caught it before a person did.
        *
        * Still driven by the registry. The targets ARE `styleProps`: a type
        * that declares only `color` gets the palette with no selector, and one
        * that declares both gets the choice. This is a presentation of the
        * same declaration, not a second source of truth about it — and it is
        * the control a table's cells already use, so the two agree.
        */}
      {painting !== undefined && (
        <Field name="colour">
          <div className="of-paint">
            {paintTargets.length > 1 && (
              <div
                className="of-choice of-choice--text of-paint__target"
                role="group"
                aria-label="What to colour"
              >
                {paintTargets.map((option) => (
                  <button
                    key={option.prop}
                    type="button"
                    className={`of-choice__item${paint === option.prop ? ' of-choice__item--on' : ''}`}
                    aria-pressed={paint === option.prop}
                    data-testid={`paint-${option.prop}`}
                    onClick={() => {
                      setPaint(option.prop)
                    }}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            )}
            <Swatches
              kind={PAINT_KIND[painting.prop]}
              label={painting.name}
              testPrefix={PAINT_PREFIX[painting.prop]}
              /*
               * `none` reads as nothing selected, because that is what it
               * means — the swatch marked on is the one for no background.
               */
              current={(() => {
                const picked = value(painting.prop)
                return picked === 'none' ? undefined : picked
              })()}
              /*
               * An ink is read against what it will sit on: the object's own
               * surface when the selection agrees on one, the board otherwise.
               */
              against={painting.prop === 'textColor' ? groundOf(value('color')) : null}
              onPick={(colour) => apply({ [painting.prop]: colour })}
              onPreview={(colour) => preview(colour === null ? null : { [painting.prop]: colour })}
              /*
               * Only a label's background can be nothing at all. Cleared by
               * being SET to none rather than to undefined, which a style
               * command drops (see `sanitizeStyle`).
               */
              {...(painting.prop === 'labelFill'
                ? { onNone: () => apply({ labelFill: 'none' }) }
                : {})}
            />
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

      {(props.has('bold') || props.has('italic') || props.has('underline')) && (
        <Field name="text">
          <div className="of-choice" role="group" aria-label="Text style">
            {MARK_PROPS.filter((mark) => props.has(mark.prop)).map((mark) => {
              const on = value(mark.prop) === true
              return (
                <button
                  key={mark.prop}
                  type="button"
                  aria-pressed={on}
                  aria-label={mark.name}
                  data-tip={mark.name}
                  aria-description={mark.name}
                  data-testid={`mark-${mark.prop}`}
                  className={`of-choice__item${on ? ' of-choice__item--on' : ''}`}
                  onClick={() => apply({ [mark.prop]: !on })}
                >
                  <span className={`of-mark of-mark--${mark.prop}`}>{mark.glyph}</span>
                </button>
              )
            })}
          </div>
        </Field>
      )}

      {props.has('textSize') && (
        <Field name="size">
          <Choice<TextSizeToken>
            options={TEXT_SIZE_TOKENS}
            current={value('textSize') ?? 'medium'}
            name="size"
            onPick={(textSize) => apply({ textSize })}
            render={(token) => <span className={`of-size of-size--${token}`}>A</span>}
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

      {props.has('verticalAlign') && (
        <Field name="down">
          <Choice<VAlignToken>
            options={VALIGN_TOKENS}
            current={value('verticalAlign') ?? 'top'}
            name="verticalAlign"
            onPick={(verticalAlign) => apply({ verticalAlign })}
            render={(token) => <VAlignIcon variant={token} />}
          />
        </Field>
      )}

      {props.has('radius') && (
        <Field name="corners">
          <Choice<RadiusToken>
            options={RADIUS_TOKENS}
            current={value('radius') ?? 'none'}
            name="corners"
            onPick={(radius) => apply({ radius })}
            render={(token) => <RadiusIcon variant={token} />}
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
              onChange={(event) => preview({ opacity: Number(event.target.value) / 100 })}
              // Released, or left with the keyboard: one undo entry either way.
              onPointerUp={settle}
              onBlur={settle}
            />
            <span className="of-inspector__reading">
              {Math.round((value('opacity') ?? 1) * 100)}%
            </span>
          </div>
        </Field>
      )}
    </div>
    </AnchoredSurface>
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
          data-tip={option}
          aria-description={option}
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
