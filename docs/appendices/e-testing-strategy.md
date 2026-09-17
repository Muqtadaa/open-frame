# Appendix E · Testing strategy

← [Documentation index](../README.md)

Tests exist to protect **behaviour and architectural contracts**. Coverage
percentage is not a goal and is not measured.

---

## Where tests live

| Layer             | Tool                        | What is tested                                                                             | What is not          |
| ----------------- | --------------------------- | ------------------------------------------------------------------------------------------ | -------------------- |
| `core/geometry`   | Vitest                      | Intersection, containment, union, screen↔world round-trips                                 | Rendering            |
| `core/domain`     | Vitest                      | Invariants, cycle repair determinism, **patch/inverse symmetry**                           | Type internals       |
| `core/schema`     | Vitest + frozen fixtures    | Every migration, unknown-type round-trip, every quarantine path                            | Zod itself           |
| `core/commands`   | Vitest                      | Per command: happy path, rejection, locking, authorization, transaction atomicity          | Dispatch plumbing    |
| `core/types`      | Vitest, table-driven        | The registry contract, for **every** registered type                                       | Visual output        |
| **Architecture**  | Vitest + dependency-cruiser | Forbidden imports, platform neutrality, declared deps, no `switch(object.type)`, no cycles | —                    |
| `web/adapters`    | Vitest + fake-indexeddb     | Save→load round-trip, patches, **quarantine never writes back**                            | Browser quirks       |
| `web/canvas`      | Vitest                      | Culling, hit testing, marquee containment, paint order                                     | Pixel output         |
| `web/interaction` | Vitest                      | Pointer decisions as pure functions                                                        | Synthetic DOM events |
| **E2E**           | Playwright                  | create → edit → move → reload → undo → restyle → delete                                    | Everything else      |

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

Not UI coverage — seam verification. Five tests, and they found four real bugs
unit tests structurally could not:

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
pnpm test            # unit + integration, both packages (~1s)
pnpm test:e2e        # Playwright functional suite
pnpm bench:fixtures  # generate benchmark boards
pnpm test:bench      # renderer scaling probe (needs the fixtures)
pnpm verify          # typecheck + lint + boundaries + tests + build
```

Benchmarks are a separate Playwright project because they need generated
fixtures and **report** measurements rather than asserting thresholds — with one
exception, which is asserted because the architecture depends on it: DOM node
count must not grow with board size.

`pnpm test:e2e` needs a Chromium. In an environment with a pre-installed browser
whose build differs from Playwright's expected one, set
`OPENFRAME_CHROMIUM_PATH=/path/to/chromium`.
