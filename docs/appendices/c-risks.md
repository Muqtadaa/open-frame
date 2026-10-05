# Appendix C · Architectural risks

← [Documentation index](../README.md)

Genuine risks, their mitigations, and when each becomes relevant. Referenced from
code by identifier (R1–R12).

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

**Mitigation.** `needsRebalance()` in `packages/core/src/domain/order.ts`
detects it. Nothing acts on it yet: there is no rebalance command, and
nothing outside the tests calls the detector.

**Ties are settled; collisions and rebalancing are not.** Two people adding on
top of the same container at once both mint the key after the same last child,
so the pair holds the SAME key — every time, not by chance. Siblings are
ordered by `compareSiblings` in `packages/core/src/domain/order.ts`, by key and
then by id, so every client stacks the pair the same way; it is the only place
siblings are compared (`sibling-order-rule.test.ts`), and reordering steps past
a tied pair rather than failing to fit between them. What remains: the pair
stays adjacent with no key between them until one is reordered, and nothing
makes new keys collision-resistant (a per-client suffix would). A rebalance
rewrites every sibling, and the room does not coordinate writes (it relays
them, [ADR 0016](../adr/0016-room-trust-boundary.md)), so one run by a client
would race every concurrent reorder in that container. Whoever builds it has
to decide where it runs before what it does.

**Relevant:** now that boards are shared; no board has reached the threshold
in ordinary use.

---

## R6 · Deferring collaboration makes a Phase 1 decision silently wrong

**Retired.** Phase 4 shipped on the Phase 1 decisions unchanged.

**Impact: High if wrong** — retrofitting would touch everything.

**Mitigation, as it turned out.** The three expensive-to-reverse decisions held:
flat object map, fractional ordering, no document writes during a drag. The
board is one `Y.Map` keyed by `ObjectId` (`packages/collab/src/document-map.ts`),
patches translate to it with no change of structure, and remote changes are
dispatched with `origin: 'remote'` and `skipUndo` (`packages/collab/src/session.ts`).
The spike became the real thing rather than preceding it.

**Relevant:** no longer; kept for the reasoning.

---

## R7 · The command layer proves too coarse for rich text

**Impact: Medium.** Per-keystroke commands would flood undo and persistence;
per-session commands lose the intra-field undo users expect.

**Mitigation.** Text editing is a _session_: the buffer is React state, one
command on commit, intra-field undo delegated to the native input. Rich text is
a list of spans shaped like a `Y.Text` delta
([ADR 0012](../adr/0012-rich-text-as-spans.md)), but nothing uses `Y.Text`: an
object is stored in the room as one plain value, and a text commit replaces it.

**What that costs.** Two people committing edits to the SAME object's text at
once is last-writer-wins for that object — one of the two edits is lost, not
merged. Edits to different objects never collide. A per-character merge would
mean storing text as `Y.Text` inside the object, which is a change to
`document-map.ts` and to how a commit is written, not to the editor.

**Already materialised once.** Clicking away from an editor discarded the text
instead of committing it. Found by E2E, fixed, and now regression-tested.

**Relevant:** Phase 2 (rich text); the merge cost since Phase 4.

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

**Adopted.** The transport is our own sync loop on a Durable Object
([ADR 0013](../adr/0013-collaboration-transport-durable-objects.md)), so the
stale wrappers were never taken on. What remains exposed is what was adopted:
`yjs` and `y-protocols`, `wrangler`/`workerd`, `@supabase/supabase-js` and
`@modelcontextprotocol/sdk`. Each is reached through one package or adapter
(`packages/collab`, `apps/rooms`, the Supabase adapters, `apps/mcp/src/server.ts`).

**Relevant:** at every upgrade of those, and Phase 5's AI provider.

---

## R11 · The room does not check what an editor writes

**Impact: Medium.** The room decides WHO may write — only the editor link
changes a board — but applies, relays and stores any update that decodes as
Yjs ([ADR 0016](../adr/0016-room-trust-boundary.md)). An editor with a modified
client can persist objects no current client accepts. Every compliant client
drops them on merge, so nobody sees them and nobody can delete them, and they
stay in room storage and every browser's CRDT cache.

**Mitigation.** Clients validate every remote object (`readRemoteObject`) and
every `meta` patch before it reaches the domain; a message over the size cap or
one that fails to decode is refused with the room unchanged. Recovery is
replaying a good copy into a new room; there is no reseed tool.

**Relevant:** when remote MCP transport ships (Phase 5a stage 5) — an agent
on the network holding editor links is the likeliest modified client — or the
first time a board is found holding content its clients drop.

---

## R12 · A whole board must fit in one message

**Impact: Medium.** The room reads at most 32 MiB per message
(`MAX_MESSAGE_BYTES`, `packages/collab/src/room.ts`), the platform's own limit.
Publishing a local board sends its whole state in one frame (`seedDoc`), so a
board past that size could not be shared. Reconnecting is cheaper: each side
sends only a state vector, and the answer holds only what the other lacks, so
what has to fit is what changed while offline, not the whole board. A client
whose offline changes exceed the limit would be refused on every reconnect.

**Mitigation.** None yet; it is a **Revisit** row in the security model's known
gaps ([11 · Security](../architecture/11-security.md)). 10,000 objects is a few
MB, so the headroom is large. The fix is chunking the handshake, not raising
the cap.

**Relevant:** when a board approaches 32 MiB, which images stored in R2 rather
than in the document make unlikely.
