# Appendix E · Testing strategy

← [Documentation index](../README.md)

Tests exist to protect **behaviour and architectural contracts**. Coverage
percentage is not a goal and is not measured.

---

## Where tests live

| Layer             | Tool                        | What is tested                                                                                | What is not          |
| ----------------- | --------------------------- | --------------------------------------------------------------------------------------------- | -------------------- |
| `core/geometry`   | Vitest                      | Intersection, containment, union, screen↔world round-trips                                    | Rendering            |
| `core/domain`     | Vitest                      | Invariants, cycle repair determinism, **patch/inverse symmetry**                              | Type internals       |
| `core/schema`     | Vitest + frozen fixtures    | Every migration, unknown-type round-trip, every quarantine path                               | Zod itself           |
| `core/commands`   | Vitest                      | Per command: happy path, rejection, locking, authorization, transaction atomicity             | Dispatch plumbing    |
| `core/types`      | Vitest, table-driven        | The registry contract, for **every** registered type                                          | Visual output        |
| `core/uploads`    | Vitest                      | The one image policy: size, declared type, sniffed bytes                                      | Storage              |
| `packages/collab` | Vitest, in-process rooms    | Patch↔Yjs mapping, the room protocol and roles, offline resync, the change log                | A real socket        |
| `apps/rooms`      | Vitest                      | Access, asset authorization, passwords, routing, in-flight requests — values in, decision out | The Durable Object   |
| `apps/mcp`        | Vitest + a real MCP client  | Every tool against a real `BoardRoom`; the stdio protocol (`server.stdio.test.ts`)            | A signed-in session  |
| **Architecture**  | Vitest + dependency-cruiser | Forbidden imports, platform neutrality, declared deps, no `switch(object.type)`, no cycles    | —                    |
| `web/adapters`    | Vitest + fake-indexeddb     | Save→load round-trip, patches, **quarantine never writes back**                               | Browser quirks       |
| `web/canvas`      | Vitest                      | Culling, hit testing, marquee containment, paint order                                        | Pixel output         |
| `web/gestures`    | Vitest, `gesture-bench.ts`  | Every pointer mode: modifiers, snapping, **one command on release, none before it**           | The hook's wiring    |
| `web/ui`          | Vitest, `test-render.tsx`   | What a control DOES: keys, focus going in and coming back, what it asks of the services       | Layout and paint     |
| `web/interaction` | Vitest                      | Pointer decisions as pure functions                                                           | Synthetic DOM events |
| **E2E**           | Playwright, `apps/web/e2e`  | Seams in a real browser: the core loop, gestures, editing, keyboard, touch, layout            | A real room          |
| **Rooms E2E**     | Playwright, `e2e-rooms`     | Two browsers on one board against a real Durable Object; an MCP peer; the production CSP      | Deployed Cloudflare  |
| `tools/`          | `node --test`               | The bench budget judge: a budget nothing measured fails                                       | The measurements     |

---

## The three tests that encode the architecture

These exist because they are the executable form of claims made in prose
elsewhere.

### 1. Patch symmetry

> Applying a patch list and then its inverse returns the **exact** prior document.

Undo correctness for every command reduces to this one property, which is why
there is no per-command undo test. A command added next year inherits it.

Covers: add, remove, nested set, whole-subobject set, setting a property that did
not exist, clearing to `undefined`, mixed batches, repeated writes to one path,
remove-then-re-add.

### 2. Unknown-type round-trip

> A board containing an unrecognised type saves back **byte-for-byte unchanged**.

Forward compatibility is otherwise untestable and silently regresses the first
time someone tidies the serializer.

### 3. Core purity

> `packages/core` has no path to React, the DOM, a renderer, a CRDT or a database.

The claim the entire architecture rests on. It fails `pnpm test`, not just lint.

---

## Verify the tests are not vacuous

A rule that passes vacuously is **worse** than no rule, because it is trusted.
Every enforcement mechanism here was deliberately violated to confirm it fails.

That practice found a real defect: `core-is-pure` in `.dependency-cruiser.cjs`
passed while React was imported into core, because pnpm makes React unresolvable
and the rule only matched resolved `node_modules` paths.

**When adding an architectural rule, break it once and watch it fail.**

---

## What E2E is for

Not UI coverage — seam verification. The first handful of specs found four
real bugs unit tests structurally could not:

| Bug                                                | Why unit tests missed it                       |
| -------------------------------------------------- | ---------------------------------------------- |
| Canvas collapsed to zero height                    | CSS layout; no unit test renders real geometry |
| Editor discarded text on click-away                | A focus/blur ordering race in a real browser   |
| Zustand selector looped `useSyncExternalStore`     | Needs React's real reconciliation              |
| Gesture captured selection before the click set it | Needs a real multi-event sequence              |

Every one is invisible in isolation and fatal in use. That is the category E2E
owns.

---

## What is deliberately not tested

React component trees, rendering internals, library behaviour, styling, and any
`getBounds` default that is just the object's frame.

---

## Running them

```bash
pnpm test             # Vitest in every workspace: core, collab, rooms, mcp, web
pnpm test:e2e         # Playwright functional suite, Chromium
pnpm test:e2e:smoke   # the @smoke specs in Firefox and WebKit
pnpm test:e2e:all     # the functional suite in all three engines
pnpm test:rooms       # two browsers against a real Durable Object (wrangler --local)
pnpm test:tools       # the bench tooling's own tests
pnpm bench:fixtures   # generate benchmark boards
pnpm test:bench       # renderer scaling probe (needs the fixtures)
pnpm bench:cull       # the cull pass, timed directly
pnpm bench:mcp        # an agent peer's reads and writes, with map copies
pnpm --filter @openframe/web test:visual   # goldens, Chromium; not run by CI
pnpm verify           # format + typecheck + lint + boundaries + tests
                      #   + bench and MCP-bench smoke + tool tests + build
```

On every push, `.github/workflows/ci.yml` runs what `pnpm verify` runs, in the
same order, and three browser jobs beside it: `pnpm test:e2e`,
`pnpm test:e2e:smoke` and `pnpm test:rooms`. The rooms suite boots a real
workerd with a SQLite-backed Durable Object, so it lives apart from
`pnpm test:e2e`, which must run from a clean checkout with no account. One of
its specs, `content-security.spec.ts`, opens a production build rather than the
dev server, because the dev server carries no Content Security Policy.

Benchmarks are a separate Playwright project because they need generated
fixtures and **report** measurements rather than asserting thresholds — with one
exception, which is asserted because the architecture depends on it: DOM node
count must not grow with board size.

Every night the benchmarks run in CI (`nightly.yml`, "Performance budgets"):
`bench:cull`, `bench:mcp` and the renderer probe write their numbers as JSON,
`pnpm bench:check` holds them to `tools/bench/budgets.ts` and prints the table
into the job summary, and the results are kept for 90 days as the trend. The
budgets are the product's own limits rather than one machine's readings, map
copies are held exactly, and a budget that nothing measured fails. Breaking
the transaction's copy-once back to a copy per command was caught as 202
copies against a budget of 3.

### Writing a browser test

Start from `e2e/fixtures.ts`, not `@playwright/test`. `test.use({ board:
'fresh' })` opens the local board with nothing stored and waits for the rail,
so the first keystroke is never dropped; `'open'` opens it as it was left.
The file also holds the gestures every spec needs — `drag`, `place`,
`clickLine` — and the waits: `saved(page)` before a reload, never a sleep
guessing at the autosave debounce.

A spec whose subject is not MAKING objects starts from a seeded board:
`buildBoard` (`e2e/boards.ts`) runs core's dispatcher in Node, and
`seedBoard(page, built)` hands the result to the open page's dev-only
`loadBoard` — no reload, nothing in the undo history. The builder places an
object where a click at the same point would, which `boards.spec.ts` holds it
to, so a spec keeps its click coordinates. Opening a board and making three
notes through the rail measured 1.6s; opening it seeded, 0.85s. (Writing the
board into IndexedDB and reloading was tried first and cost 2.2s: the reload
was dearer than the clicks.) On the eleven
setup-heavy files the suite went from 562s to 370s in Chromium. Specs about
creation — the rail, placement, drawing, a frame adopting what it is dropped
on — keep driving the UI.

A missing element fails the test. Read a box with `boxOf`, an index with
`defined`; a test that returned on `null` passed while checking nothing, as
47 places once did. The lint (`eslint-plugin-playwright`) refuses sleeps,
branches in a test body and forced clicks, so these stay true.

### Which browsers

The functional suite runs in Chromium on every push. The 21 tests tagged
`@smoke` — the core loop of placing, editing, moving and saving — also run in
Firefox and WebKit on every push (`pnpm test:e2e:smoke`), and the whole suite
runs in all three every night (`.github/workflows/nightly.yml`, which can also
be started by hand). Goldens and benchmarks stay in Chromium.

**The visual goldens are not a CI gate.** `surfaces.visual.spec.ts` has its own
`visual` project and runs under `pnpm --filter @openframe/web test:visual`; no workflow runs it.
The snapshots are platform-specific and were taken in the development
container; they are a net to run by hand around a stylesheet-wide change, and
a change that breaks one still merges. `touch.spec.ts`
drives touch through CDP, which only Chromium has, and is excluded from the
other two in the config; the two specs that emulate a phone (`isMobile`) are
excluded from Firefox, which cannot. A spec that needs the clipboard calls
`useClipboard()`: the real one in Chromium, an in-memory one elsewhere,
because the other engines have no clipboard permission to grant.

What the first full runs in Firefox and WebKit taught — each was a real
failure, fixed rather than excluded:

- **A port browsers block is refused before Playwright can route it.** The
  suite's room server is a closed high port (59999), not 9, which Firefox and
  WebKit turn away before any `page.route` sees the request.
- **`#root` is inert until the splash leaves.** A visible element can still be
  inert, and focus asked of one goes nowhere; the fixtures wait for the root to
  be reachable, and anything that must focus at start-up (a gate) takes the
  splash away first.
- **Firefox gives a constructed `ClipboardEvent` an empty `clipboardData`**, and
  keeps Shift+right-click for its own menu. Specs paste with a plain event
  carrying the data, and right-click without Shift.
- **Firefox cannot divide a length by a length** in CSS, so the text clamp's
  line count is measured there instead (`views/line-clamp.ts`).
- **Only Chromium turns Shift+F10 into a `contextmenu` event.** The canvas
  claims the key itself.
- **A caret goes inside a paragraph block, never on the field.** Chromium moves
  typing into the block; Firefox types beside it (`openingRange`).
- **WebKit's animation frames are slow enough for a quick hand to beat.**
  Anything that happens "a frame later" needs a fallback for the key pressed
  before it.

`pnpm test:e2e` needs a Chromium. In an environment with a pre-installed browser
whose build differs from Playwright's expected one, set
`OPENFRAME_CHROMIUM_PATH=/path/to/chromium`.
