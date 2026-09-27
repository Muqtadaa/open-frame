---
version: 1
slug: "apps-web-src-app-splash-ts"
primary_target: "apps/web/src/app/splash.ts"
related_targets: ["apps/web/index.html","apps/web/src/main.tsx","apps/web/src/ui/StartFailed.tsx"]
---

THESIS: The one full-bleed brand moment, once, then out of the way. The
artwork covers the wait the first time a tab opens OpenFrame. After that, the
page opens as fast as it can be ready, in the person's own world. Whatever
happens, the splash ENDS: in the board, in a failure panel, or in a sentence
that admits it is stuck.

MODE: Operate. A transitional surface: honesty about what is opening and how
long it is taking outranks the picture.

FIRST LOAD IN A TAB: the artwork, painted before the module graph from a
146-byte inlined thumbnail, then the 1x/2x picture. Held until two seconds
after navigation start or until the page is ready, whichever is later, then a
240ms fade on the product curve. Portrait letterboxes the picture rather than
cutting off the wordmark.

LATER LOADS: `sessionStorage['openframe:splash-seen']`, read by an inline head
script before the body is parsed, marks the document `data-splash="quiet"`. The
sheet is the world's `--of-page`, `#f7f9fb` or `#1b1033`, with nothing on it,
and it leaves on the first frame the page is ready. `theme-color` matches it
from the first frame. After load, `applyTheme` keeps `theme-color` on the
world's page colour.

LABEL: "Opening the board" when the URL carries `board` or `room`, otherwise
"Opening OpenFrame" (the markup's own neutral words). 13px ink on the void
scrim, with a 6px control radius and no capsule. Portrait: just under the
picture.

WATCHDOG: inline, before the module graph. At 12 seconds the live label says
"Still opening. This is taking longer than usual." and a Reload button appears
that the keyboard can reach.

FAILURE: never held. Every await before the first render sits in one try.
StartFailed abandons the splash on mount before focusing Reload; the front
door abandons it before saying its boards could not be listed. `#root` is
inert only while the splash is up.

NOT: a hold paid on every page load; "your board" where no board, or not
theirs, opens; a splash that never ends; a failure waiting out the brand hold;
an alert rendered into an inert root; the browser's chrome stuck at violet; a
999px capsule; motion off the product curve.

FINISH: splash.spec.ts (the refused room, the watchdog, once per session in
both worlds, a new session, the label on three routes, portrait, failures not
held), brand.spec.ts (the hold, theme-color follows the world),
start-failed.spec.ts, brand-splash.test.ts (colours, quiet page colours,
theme-color literals, radius, motion), and the splash goldens.
