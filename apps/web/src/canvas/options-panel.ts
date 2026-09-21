/**
 * Where the options panel is, in screen pixels, or `null` when it is closed.
 *
 * The panel is the one floating surface placed by its own arithmetic rather
 * than on the chrome layer, so it is the one thing that layer cannot reason
 * about from an anchor alone — it has to be told. On a wide selection the
 * panel takes the whole band above, which is exactly where anything anchored
 * to that selection wants to go.
 *
 * Read from the DOM rather than plumbed through, which is the fallback rule 15
 * names: some geometry only exists once the browser has drawn it. The panel's
 * own size depends on which controls the selection declares, so there is no
 * constant to consult.
 *
 * A function rather than a copy in each caller: there are two now, and two
 * transcriptions of one lookup is one chance for them to disagree about what
 * they are avoiding.
 */
export function optionsPanelRect(): DOMRect | null {
  if (typeof window === 'undefined') return null
  return (
    window.document
      .querySelector<HTMLElement>('[data-testid="inspector"]')
      ?.getBoundingClientRect() ?? null
  )
}
