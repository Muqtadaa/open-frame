import { useId, useState, type KeyboardEvent } from 'react'

import { applyTheme, readTheme, type Theme } from '../app/theme.js'
import { RADIOS, stepFocus } from '../controls/roving.js'

const WORLDS: readonly { readonly theme: Theme; readonly name: string }[] = [
  { theme: 'notebook', name: 'Notebook' },
  { theme: 'after-hours', name: 'After Hours' },
]

/**
 * Which world the page is drawn in, named by both of its worlds.
 *
 * In the account sheet rather than on the board's bar: it is chosen once and
 * kept, and on the bar it was an unlabelled moon among the board's own
 * controls. Two named choices rather than a toggle, because "After Hours —
 * off" left the other world without a name.
 */
export function WorldSwitch() {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const label = useId()
  const choose = (next: Theme): void => {
    setTheme(next)
    applyTheme(next)
  }
  const step = (event: KeyboardEvent<HTMLDivElement>): void => {
    const moved = stepFocus(event, { items: RADIOS, orientation: 'both' })
    const next = moved === null ? undefined : WORLDS[moved.index]
    if (next !== undefined) choose(next.theme)
  }
  return (
    <div className="of-theme-choice">
      <span className="of-theme-choice__label" id={label}>
        Theme
      </span>
      <div
        className="of-choice of-choice--text"
        role="radiogroup"
        aria-labelledby={label}
        data-testid="theme-switch"
        onKeyDown={step}
      >
        {WORLDS.map(({ theme: world, name }) => (
          <button
            key={world}
            type="button"
            role="radio"
            aria-checked={theme === world}
            tabIndex={theme === world ? 0 : -1}
            className={`of-choice__item${theme === world ? ' of-choice__item--on' : ''}`}
            data-testid={`theme-${world}`}
            onClick={() => {
              choose(world)
            }}
          >
            {name}
          </button>
        ))}
      </div>
    </div>
  )
}
