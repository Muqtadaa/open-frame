import { useState } from 'react'

import { applyTheme, readTheme, type Theme } from '../app/theme.js'
import { AfterHoursIcon } from '../controls/icons.js'

/**
 * Which world the page is drawn in, as one pressed-or-not control.
 *
 * On the front door, where it is the head's one setting. It lived on the
 * board alone once, so the front door — the first thing anybody sees — was
 * always the Notebook. On a board the theme is in the account sheet
 * (`WorldSwitch`), with the person rather than on the board's bar.
 */
export function ThemeToggle({ className = 'of-icon-button' }: { readonly className?: string }) {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const afterHours = theme === 'after-hours'

  return (
    <button
      type="button"
      className={className}
      aria-pressed={afterHours}
      aria-label="After Hours theme"
      data-tip={afterHours ? 'After Hours — on' : 'After Hours — off'}
      aria-description={afterHours ? 'After Hours — on' : 'After Hours — off'}
      data-testid="theme-toggle"
      onClick={() => {
        const next: Theme = afterHours ? 'notebook' : 'after-hours'
        setTheme(next)
        applyTheme(next)
      }}
    >
      <AfterHoursIcon />
    </button>
  )
}
