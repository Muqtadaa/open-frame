# Appendix C · Architectural risks

← [Documentation index](../README.md)

Genuine risks, their mitigations, and when each becomes relevant. Referenced from
code by identifier (R1–R10).

---

## R1 · The custom renderer under-delivers on interaction quality

**Impact: High.** Users judge canvas applications on feel within thirty seconds.
No amount of clean architecture compensates for a janky canvas.

**Mitigation.** The renderer sits behind culling and hit-testing interfaces, so
the object layer can move to Canvas2D without touching the domain. The viewport
transform and pointer pipeline were built **first**, in Phase 1, so the answer
arrives early rather than in month three.

**Aggravating factor.** Ruling out commercial licensing removed tldraw as a
fallback. The ladder is now `DOM/SVG → Canvas2D → (nothing)`. There is no buying
our way out, which raises the value of settling this early.

**Relevant:** [Phase 2](../phases/phase-2-core-canvas.md), explicitly a checkpoint.

---

## R2 · The domain/view split leaks

**Impact: High.** It is the load-bearing claim of the whole architecture, and it
would fail silently and gradually.

**Mitigation.** Three independent mechanisms, all verified to fail on deliberate
violation: ESLint `no-restricted-imports`, `architecture.test.ts` (fails
`pnpm test`), and `dependency-cruiser` (fails `pnpm depcruise`).

**Already materialised once.** The `core-is-pure` dependency-cruiser rule
initially passed **vacuously** — pnpm makes React unresolvable from core, so
matching only `node_modules/react` never fired on the exact mistake the rule
existed to catch. Fixed by also matching the unresolved specifier and adding a
`no-unresolvable` rule.

**Relevant:** continuously.

---

## R3 · DOM node count becomes the bottleneck

**Impact: Medium.** Culling bounds nodes to what is visible, but a zoomed-out
view of a large board can legitimately put thousands on screen at once.

**Mitigation.** Level-of-detail below a zoom threshold — render simplified
proxies rather than full content. Benchmark boards at 100/1k/5k/10k already
exist; measure rather than guess.

**Relevant:** Phase 2–3, around 1,000+ objects visible simultaneously.

---

## R4 · Two version axes add real complexity

**Impact: Medium.** Per-object `dataVersion` costs bytes and per-object migration
work on load for large boards.

**Mitigation.** Omit `dataVersion` when it equals the registry's current version
(serialize only when stale). Migrate lazily on object access if load time becomes
a problem.

**Relevant:** at the second schema change; Phase 2.

---

## R5 · Fractional index degradation

**Impact: Medium.** Repeatedly dropping an object between the same two neighbours
grows keys without bound. Long keys slow comparison and bloat documents.

**Measured:** ~1 character per 6 inserts, so the 40-character threshold is reached
after roughly 230 — deliberate, repetitive reordering rather than ordinary use.

**Mitigation.** `needsRebalance()` detects it. A rebalance command renormalises a
parent's children. Rebalancing rewrites every sibling and conflicts badly under
concurrent editing, so once multiplayer exists it must be **server-coordinated**.

**Relevant:** Phase 2+; genuinely tricky in Phase 4.

---

## R6 · Deferring collaboration makes a Phase 1 decision silently wrong

**Impact: High if wrong** — retrofitting would touch everything.

**Mitigation.** The three expensive-to-reverse decisions are already made: flat
object map, fractional ordering, no document writes during a drag. Plus `origin`
and `skipUndo` on every dispatch. A short Yjs spike before Phase 4 should
validate patch→Yjs translation while it is still cheap to change.

**Relevant:** decisions now; validation before Phase 4.

---

## R7 · The command layer proves too coarse for rich text

**Impact: Medium.** Per-keystroke commands would flood undo and persistence;
per-session commands lose the intra-field undo users expect.

**Mitigation.** Text editing is a _session_: the buffer is React state, one
command on commit, intra-field undo delegated to the native input. When
collaborative text arrives, `Y.Text` plugs in at exactly this seam.

**Already materialised once.** Clicking away from an editor discarded the text
instead of committing it. Found by E2E, fixed, and now regression-tested.

**Relevant:** Phase 2 (rich text).

---

## R8 · Solo-developer bandwidth

**Impact: High.** This is the risk most likely to actually kill the project.

**Mitigation.** Ruthless feature scope, never architectural shortcuts. Phase 1
shipped **two** object types and **six** commands. Everything not required to
prove a seam was deferred. The registry, migrations and command layer were _not_
trimmed, because those are precisely the seams that cannot be retrofitted.

**Relevant:** continuously.

---

## R9 · Per-object subscriptions create React overhead

**Impact: Medium.** Thousands of mounted objects each holding a subscription.

**Mitigation.** Notification is keyed `Map<ObjectId, Set<listener>>`, never a flat
list, and only **visible** objects mount — so subscription count tracks the cull
set, not board size. Asserted directly in `document-store.test.ts`.

**Already materialised once.** A Zustand selector returning a fresh object looped
`useSyncExternalStore` forever and crashed the board. Found by E2E; the rule is
now in `CLAUDE.md`.

**Relevant:** Phase 2, at 1k+ objects.

---

## R10 · Ecosystem churn in deferred choices

**Impact: Medium.** Decisions deferred to later phases depend on libraries that
may not survive.

**Already visible.** Between planning and building, `partykit` (2025-05) and
`@y-sweet/sdk` (2025-09) both went stale — two options that would have been
natural recommendations.

**Mitigation.** Deferring these was correct, not lucky. Re-verify maintenance
state at adoption; keep adapters thin enough that a transport swap is contained.

**Relevant:** Phase 4 onward.
