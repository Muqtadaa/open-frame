---
version: 1
slug: "apps-web-src-ui-home-tsx"
primary_target: "apps/web/src/ui/Home.tsx"
related_targets: ["apps/web/src/ui/AccountForm.tsx","apps/web/src/app/boards.ts","apps/web/src/app/route.ts"]
---

THESIS: The front door is a page, not a portal. A product whose whole argument
is that the board is a ruled laboratory record cannot meet people on a flat
grey shell — so the entry surface is the same stock, ruled at the same 10 and
100 unit rhythm, and somebody arriving has been told what kind of thing they
are about to open before they open it.

MODE: Operate. The visitor completes a task — get into a board, or sign in —
and leaves. Nothing here persuades; the canvas is the product and this is the
shortest honest path to it.

TWO HANDLES: Signing in and starting without an account are offered as equals,
because PRODUCT.md's fourth principle says a board works with no account and no
network, and an entry page that demanded one would repeal a principle in a
commit about navigation. "No account needed" sits under the primary action, not
in small print at the bottom.

FORM: One sheet of page-stock apparatus with a hairline margin rule and the
contact shadow, divided by a rule into the ledger and sign-in. NOT two cards:
same-size panels side by side is the page scaffold this world's header names as
its first refusal, and panel white is reserved for surfaces that overlay the
board. Nothing here overlays anything.

The board list is a LEDGER — rows divided by the margin rule, title in 13px UI
sans, "how long ago" in 11px mono with tabular numerals, because a time is a
measurement and this world sets measurements in mono. Section names are
specimen labels: 11px mono, lowercase, tracked 0.02em, the way the record panel
names its subject.

BRAND: The third surface brand paints, after the boot splash and the tab icon,
and a deliberate extension of DESIGN.md's "and nothing else" rather than drift.
The owner took the decision on 2026-09-19. The mark only — 32px, beside the
wordmark set in type. No brand colour enters the page.

GROUND: Ruled in both weights, under the 3:1 non-text ceiling the build test
asserts. Drawn with tiled `linear-gradient` and `background-size`, never
`repeating-linear-gradient`, whose stops accumulate in floating point across the
box and band into visible plaid at a 10px pitch.

COLUMN: 560px, centred with `margin: auto` rather than `justify-content`, which
clips the top of a column taller than the viewport instead of letting it scroll
— the state this page reaches on a phone with the sign-in form open.

FINISH: contrast measured against the real stylesheet by `design-tokens.test.ts`
for every pair this surface introduces, both worlds. Nine end-to-end specs,
including that a share link somebody already holds still opens its board.
