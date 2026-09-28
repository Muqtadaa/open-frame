import { SHAPE_KINDS, type ShapeKind } from '@openframe/core'
import { useEffect, useRef } from 'react'

import { ShapeIcon } from './icons.js'

/**
 * The shape list as a menu a keyboard can walk: it takes focus on the checked
 * kind when it opens, and the arrows move through it and wrap, with Home and
 * End for the ends. The arrows stop here — on the board they nudge the
 * selection.
 */
export function ShapePicker({
  options,
  choose,
}: {
  readonly options: ShapeKind
  readonly choose: (kind: ShapeKind) => void
}) {
  const menu = useRef<HTMLDivElement>(null)

  useEffect(() => {
    menu.current?.querySelector<HTMLElement>('[role="menuitemradio"][tabindex="0"]')?.focus()
  }, [])

  const step = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitemradio"]')]
    const at = items.indexOf(document.activeElement as HTMLElement)
    const last = items.length - 1
    const next =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? at >= last
          ? 0
          : at + 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? at <= 0
            ? last
            : at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    event.stopPropagation()
    items[next]?.focus()
  }

  return (
    <div ref={menu} className="of-flyout" role="menu" aria-label="Shapes" onKeyDown={step}>
      {SHAPE_KINDS.map((kind: ShapeKind) => (
        <button
          key={kind}
          type="button"
          role="menuitemradio"
          tabIndex={options === kind ? 0 : -1}
          aria-checked={options === kind}
          className={`of-flyout__item${options === kind ? ' of-flyout__item--active' : ''}`}
          data-testid={`shape-${kind}`}
          onClick={() => {
            choose(kind)
          }}
        >
          <ShapeIcon kind={kind} />
          <span>{kind}</span>
        </button>
      ))}
    </div>
  )
}
