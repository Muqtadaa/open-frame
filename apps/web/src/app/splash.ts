/**
 * The boot splash, which lives in `index.html` rather than in a component.
 *
 * `main.tsx` opens with a top-level `await createRuntime()`, so `#root` is
 * empty until IndexedDB answers — and a React splash cannot paint during the
 * wait it exists to cover, because React is most of that wait. The markup is
 * therefore in the document itself, and this module only takes it away again.
 */
const SPLASH_ID = 'of-splash'
const FADE_MS = 220

function splashElement(): HTMLElement | null {
  return document.getElementById(SPLASH_ID)
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Fades the splash out and removes it. Safe to call when there is none. */
export function dismissSplash(): void {
  const splash = splashElement()
  if (splash === null) return

  const remove = (): void => {
    splash.remove()
  }

  if (prefersReducedMotion()) {
    remove()
    return
  }

  splash.dataset.state = 'leaving'
  splash.addEventListener('transitionend', remove, { once: true })
  /*
   * `transitionend` does not fire in a background tab, and an element that is
   * never removed is an opaque sheet over the board. The timer is the one that
   * actually guarantees it goes.
   */
  setTimeout(remove, FADE_MS + 200)
}

/**
 * Leaves the splash up, saying what went wrong.
 *
 * Without this, a runtime that fails to open leaves "Opening your board" on
 * screen for as long as the tab is open — a loading screen that has stopped
 * being true, which is worse than the blank page it replaced.
 */
export function failSplash(message: string): void {
  const label = splashElement()?.querySelector('p')
  if (label === null || label === undefined) return
  label.textContent = message
}
