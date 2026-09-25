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

COPY IS CUT TO WHAT CHANGES A DECISION (2026-09-19). The page carried a
tagline, a line under the primary button and a lead above the sign-in form,
and none of the three told anyone anything they could act on: "A visual
workspace where what you put on the canvas keeps its meaning" is positioning,
and "Your boards follow you to any machine you sign in on" sat under a button
labelled Start a board. An email field, a password field and a button marked
Sign in do not need a sentence explaining that they sign you in.

What survives says something the interface cannot show by itself: that a new
board needs a connection while the boards you have do not, that deleting one
takes its links with it, and that the name in a sign-up form is what other
people see on your cursor. The three CSS rules those cuts orphaned went with
them.

ONE HANDLE (REVISED 2026-09-19): The door had two — sign in, or start without
an account — and the second is retired. Creating a board takes an account now;
PRODUCT.md's fourth principle was rewritten in the same change, from "no account
and no network" to "works offline", which is what IndexedDB and the CRDT
actually provide. The line under the primary action says what signing in BUYS
("yours, and on every machine you sign in on") rather than what it costs.

A link still opens a board for anybody, and the page never says otherwise: the
empty state for a signed-out visitor offers signing in and mentions that a link
somebody sends them needs nothing.

The ledger now carries VERBS. Each row has a pin in its margin, always visible
because a pinned board must read as pinned with no cursor near it, and rename
and remove revealed on hover OR focus — `:focus-within`, never hover alone, and
never hidden at all on a touch screen. Removing is confirmed in the row rather
than in a dialog: the craft floor bans a modal for anything needing neither
protected focus nor interruption, and a confirmation beside the board it names
is one nobody has to remember the subject of. Delete and leave are separate
controls and never one, because a shared "remove" would eventually destroy
somebody's work for a person tidying their own list.

STRAYS: boards that live only in this browser. Every row already carries a
`this browser` tag, so the offer is ONE LINE and a secondary button under the
ledger. It was a heading, two sentences and a bulleted list of every board,
which put the same five rows on screen twice under two names for one thing and
stood a second full-width accent button beside the primary one. Two accent
buttons on a surface means neither is primary, and starting a board is.

FORM: One sheet of page-stock apparatus with a hairline margin rule and the
contact shadow, divided by a rule into the ledger and sign-in. NOT two cards:
same-size panels side by side is the page scaffold this world's header names as
its first refusal, and panel white is reserved for surfaces that overlay the
board. Nothing here overlays anything.

The board list is a LEDGER — rows divided by the margin rule, title in 13px UI
sans, "how long ago" in 12px mono with tabular numerals, because a time is a
measurement and this world sets measurements in mono. Section names are
specimen labels: 12px mono, lowercase, tracked 0.02em, the way the record panel
names its subject.

BRAND: The third surface brand paints, after the boot splash and the tab icon,
and a deliberate extension of DESIGN.md's "and nothing else" rather than drift.
The owner took the decision on 2026-09-19. The mark only — 32px, beside the
wordmark set in type. No brand colour enters the page.

GROUND: Ruled in both weights, under the 3:1 non-text ceiling the build test
asserts. Drawn with tiled `linear-gradient` and `background-size`, never
`repeating-linear-gradient`, whose stops accumulate in floating point across the
box and band into visible plaid at a 10px pitch.

COLUMN: 680px (was 560 until 2026-09-19), centred with `margin: auto` rather
than `justify-content`, which clips the top of a column taller than the
viewport instead of letting it scroll — the state this page reaches on a phone
with the sign-in form open.

560 was right for a ledger of name, tag and time. The ledger has since grown a
pin in its margin and rename/remove at its end, and those reserve ~95px on
every row whether or not anyone is pointing at one — which left the NAME, the
only column that identifies anything, at about fifteen characters, so every row
read "Pricing co…". Widening is the honest fix; shortening the names is not.

LEDGER COLUMNS are FIXED, not `auto`. Each row is its own grid, so `auto` sizes
every row to its own content and the columns stop being columns: with four
different tags on screen the badges landed at four different x positions and a
name lost width to the longest tag in ITS OWN row. Sized in px from the real
metric rather than in `ch` — `ch` resolves against the 15px body face while the
text in those columns is 12px mono, which over-reserved by about eighty pixels.

Below 560px the row STACKS: name on its own line, tag and time on the one
below. Three columns across a phone left the name showing a single character
while the two readouts kept full width, which is exactly backwards.

FINISH: contrast measured against the real stylesheet by `design-tokens.test.ts`
for every pair this surface introduces, both worlds. End-to-end specs including
that a share link somebody already holds still opens its board, and that a pin
beats recency — the fixture pins the OLDEST board, so a test that pinned the
newest would pass with the feature deleted.
