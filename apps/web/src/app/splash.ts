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

/**
 * How long the artwork stays up before the board may take the screen.
 *
 * Measured from navigation start rather than from when the splash painted,
 * which is both simpler and more honest: the wait a person feels begins when
 * they hit enter, not when our first frame lands.
 *
 * This is a deliberate cost. The board is usually ready well inside it, so on a
 * warm load this hold IS the loading time — chosen because the splash is the
 * one full-bleed brand moment the product has, and a moment nobody sees is not
 * a moment. If it ever starts to grate, the honest fix is to spend it once per
 * session rather than to shave it down to a flicker.
 */
const MINIMUM_VISIBLE_MS = 2_000

/**
 * Turns the hold off, for the end-to-end suite only.
 *
 * Without this every one of 154 specs would sit behind an opaque sheet for two
 * seconds — roughly five minutes added to a two-minute suite, to re-test one
 * `setTimeout`. `playwright.config.ts` seeds this through `storageState`, so no
 * spec has to know it exists, and `brand.spec.ts` clears it to test the hold
 * itself.
 *
 * It suppresses the WAIT, never the splash: what every spec sees is still the
 * real element being really removed.
 */
const HOLD_KEY = 'openframe:splash-hold'

function splashElement(): HTMLElement | null {
  return document.getElementById(SPLASH_ID)
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function holdWanted(): boolean {
  try {
    return localStorage.getItem(HOLD_KEY) !== 'off'
  } catch {
    return true
  }
}

function fadeOut(splash: HTMLElement): void {
  // The board becomes reachable at the moment it becomes visible, not before.
  document.getElementById('root')?.removeAttribute('inert')

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
 * Takes the splash away once the board is ready AND it has been seen.
 *
 * Whichever finishes last wins: a slow board is never held up further, and a
 * fast one does not flash the artwork past in 200ms.
 */
export function dismissSplash(): void {
  const splash = splashElement()
  if (splash === null) return

  const remaining = holdWanted() ? MINIMUM_VISIBLE_MS - performance.now() : 0
  if (remaining <= 0) {
    fadeOut(splash)
    return
  }
  setTimeout(() => {
    fadeOut(splash)
  }, remaining)
}

/**
 * Takes the splash away NOW, for a board that is not going to open.
 *
 * It used to stay up with its line of text swapped for the error — one small
 * sentence across the artwork, which nobody reads as the page having stopped.
 * The failure gets a panel of its own instead (`StartFailed`), and the brand
 * hold is not spent on bad news.
 */
export function abandonSplash(): void {
  document.getElementById('root')?.removeAttribute('inert')
  splashElement()?.remove()
}
