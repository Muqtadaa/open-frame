import { type KeyboardEvent, type ReactNode } from 'react'
import { type AlignToken, type VAlignToken } from '@openframe/core'

import { RADIOS, stepFocus } from '../../controls/roving.js'

export const ALIGN_NAMES: Readonly<Record<AlignToken | VAlignToken, string>> = {
  start: 'Left',
  center: 'Centre',
  end: 'Right',
  top: 'Top',
  middle: 'Middle',
  bottom: 'Bottom',
}

/**
 * One row of alignment choices, as radios: one of three is always true, and
 * the arrows move along it as the record panel's own rows do.
 */
export function CellChoice<T extends AlignToken | VAlignToken>({
  label,
  name,
  options,
  current,
  onPick,
  render,
}: {
  readonly label: string
  readonly name: string
  readonly options: readonly T[]
  readonly current: T
  readonly onPick: (token: T) => void
  readonly render: (token: T) => ReactNode
}) {
  // A row, so Left and Right; Up and Down stay the table's.
  const step = (event: KeyboardEvent<HTMLDivElement>): void => {
    const moved = stepFocus(event, { items: RADIOS, orientation: 'horizontal' })
    const next = moved === null ? undefined : options[moved.index]
    if (next !== undefined) onPick(next)
  }
  return (
    <div className="of-choice" role="radiogroup" aria-label={label} onKeyDown={step}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          role="radio"
          className={`of-choice__item${option === current ? ' of-choice__item--on' : ''}`}
          aria-checked={option === current}
          aria-label={ALIGN_NAMES[option]}
          data-tip={ALIGN_NAMES[option]}
          tabIndex={option === current ? 0 : -1}
          data-testid={`${name}-${option}`}
          onClick={() => {
            onPick(option)
          }}
        >
          {render(option)}
        </button>
      ))}
    </div>
  )
}
