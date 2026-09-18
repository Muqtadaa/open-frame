/**
 * Which world the board is drawn in.
 *
 * Two, and they are not light-and-dark variants of one palette: they are two
 * complete worlds that happen to share token NAMES, which is the whole reason
 * a saved board never has to be touched when one is swapped for the other.
 * `notebook` is the engineering quadrille; `after-hours` is the same notebook
 * at night, lit by its own grid.
 *
 * Opt-in on purpose, and not wired to `prefers-color-scheme`. The default world
 * is the one the product was designed around, and a system preference set for
 * reading email at night is not a statement about how somebody wants to look at
 * their research.
 */
export const THEMES = ['notebook', 'after-hours'] as const
export type Theme = (typeof THEMES)[number]

export const DEFAULT_THEME: Theme = 'notebook'

const STORAGE_KEY = 'openframe:theme'

function isTheme(value: unknown): value is Theme {
  return typeof value === 'string' && (THEMES as readonly string[]).includes(value)
}

export function readTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    return isTheme(stored) ? stored : DEFAULT_THEME
  } catch {
    // Private mode, blocked storage, a locked-down embed. A preference that
    // cannot be read is a preference that is simply not set.
    return DEFAULT_THEME
  }
}

/**
 * Applies a theme to the document and remembers it.
 *
 * The default world carries NO attribute rather than `data-theme="notebook"`,
 * so the base `:root` block stays the thing that defines it. An attribute for
 * the default would make two selectors responsible for one palette, and the
 * next person would have to discover which one wins.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement
  if (theme === DEFAULT_THEME) delete root.dataset.theme
  else root.dataset.theme = theme

  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // Not being able to remember the choice must never stop it taking effect.
  }
}

/** Restores the remembered theme. Called once, before the first render. */
export function restoreTheme(): Theme {
  const theme = readTheme()
  applyTheme(theme)
  return theme
}
