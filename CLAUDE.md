# CLAUDE.md — engineering rules for OpenFrame

Durable rules only. Product context lives in [`docs/`](docs/README.md); start at
[architecture/01-overview.md](docs/architecture/01-overview.md).

---

## Commands

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm verify       # typecheck + lint + depcruise + test + build  ← run before every commit
pnpm test         # unit + integration (~1s)
pnpm test:e2e     # Playwright; set OPENFRAME_CHROMIUM_PATH if the sandbox ships its own Chromium
pnpm bench:fixtures   # generate 100/1k/5k/10k boards into apps/web/public/bench/
pnpm test:bench       # renderer scaling probe (needs the fixtures above)
pnpm build:bench      # deployable build WITH the bench panel and fixtures
```

## Layout

```
packages/core   Pure TypeScript domain. Deps: zod, fractional-indexing. Nothing else.
apps/web        React app: canvas, interaction, UI, adapters.
```

---

## The rules

### 1. `packages/core` stays pure

No React, no DOM, no database, no CRDT, no AI provider, no `node:` imports in
source. Enforced by ESLint, `architecture.test.ts` and `.dependency-cruiser.cjs`.

Adding a runtime dependency to core requires updating the allowlist assertion in
`architecture.test.ts` — that friction is intentional.

### 2. Dependencies point inward

```
        app  (composition root — may reach anything)
         │
   ┌─────┴─────┐
   ui        canvas ──► views ─┐
   │           │               │
   └─────┬─────┘               │
      interaction ──────► scene ──► @openframe/core
                                    commands → domain → geometry
                                    adapters → ports
```

`scene/` (pure view geometry) and `views/` (React object views) are LEAVES.
`runtime/` describes the wired app so any layer can consume it without
depending on the module that builds it.

`ui`, `canvas` and `interaction` must never import from `adapters`. Nothing in
`core` may import from `apps`. No cycles.

**`no-circular` does not enforce this.** It detects cycles between FILES, so it
silently permitted `interaction → canvas` alongside `canvas → interaction` — a
mutual dependency between layers. The explicit layer rules in
`.dependency-cruiser.cjs` are what make the direction real; all of them have
been verified to fail when violated.

### 3. All persistent mutation goes through `CommandDispatcher.dispatch`

There is no second path. Not from a component, not from a hook, not from an
adapter, and later not from AI, the API or MCP.

`DocumentWriter` is held **only** by the composition root. If you find yourself
wanting it elsewhere, the change belongs in a command handler.

### 4. Nothing is written to the document during a drag

Gestures update interaction state only. **One command on commit.**

This is why a 500-event drag is one undo entry, one save and (later) one network
message. Breaking it breaks undo granularity, multiplayer semantics and
performance simultaneously.

### 5. Object behaviour lives in the registry, never in `switch (object.type)`

`switch (object.type)` outside the registry fails the build. If behaviour varies
by type, add it to `ObjectTypeDefinition` (pure) or `ObjectViewDefinition`
(React) — never to a caller.

### 6. Migrations never import current domain types

A migration declares its own local input and output shapes and operates on
`unknown`. Importing today's types makes a migration silently change meaning when
those types change. Migrations are pure, forward-only, and never edited once
shipped. Ship a frozen fixture with each one.

### 7. Never write back a document you could not fully read

A quarantined board opens read-only and autosave is **never** attached. Losing a
user's work is the one unacceptable failure.

### 8. Validate at boundaries, not in hot paths

Load, import, API, MCP, AI output, and arbitrary payloads such as
`UpdateObjectData`. Never in the render path; never on trusted internal objects.

### 9. Zustand selectors must return primitives or stable references

```ts
useInteractionStore((s) => ({ dx: s.drag.dx })) // ✗ infinite render loop
useInteractionStore((s) => s.drag.dx) // ✓
```

A fresh object never compares equal under `Object.is`, so
`useSyncExternalStore` re-renders forever. This crashed the app once.

### 10. Never call an O(n) document helper once per object

`childrenOf` scans the whole document. Calling it per object makes a render pass
O(n²) — on a flat 10,000-object board that was ~100 million iterations and 600ms
frame spikes. Use `groupByParent` when you need every container's children.

A container whose bounds are its children's is the same trap wearing a
different hat, because culling asks EVERY visible object for its bounds. A group
that called `childrenOf` itself cost 9.6ms per cull on 10,000 objects against a
16.7ms budget; sharing one index across the pass took it to 3.1ms. Container
types receive `childrenOf` in their bounds context — never import the document
helper.

Anything that runs per frame gets measured, not assumed — but measure the RIGHT
thing. `pnpm test:bench` reports frame time, which is capped at the refresh rate
and therefore reads 16.7ms whether a pass takes 1ms or 15ms; it only moves once
the budget is already blown. `pnpm bench:cull` times the pass directly, and is
what made the above visible.

**A benchmark fixture of one object type measures one object type.** The board
fixtures were sticky notes only — the cheapest possible bounds, four numbers off
a frame — so a flat frame time on them said nothing about connectors, which
resolve endpoints through the document, or groups, which union their children's.
`board-mixed-*` exists for that reason.

### 11. `OPENFRAME_BENCH` decides what a deployment ships

`vercel.json` runs `build:bench` when `OPENFRAME_BENCH=1` and the clean `build`
otherwise. A bench build carries the dev panel and ~4.7MB of benchmark boards.

**This guard is manual.** While that variable is set in Vercel, _every_
deployment in that environment carries the bench payload — production included.
Remove it once the renderer question (ADR 0002) is settled, and do not set it on
an environment real users reach.

### 12. Nothing goes in `apps/web/public/`

Vite copies that directory into every production build. Benchmark fixtures once
lived there and would have shipped 4.7MB to users. Assets that belong in some
builds but not others go through an explicit Vite plugin, and the guard that
enables them must be a compile-time literal (`define`), not a runtime env
lookup — otherwise the branch stays live and the code ships anyway.

### 13. `wheel` needs a native non-passive listener

React registers `wheel` passively, so `preventDefault()` inside an `onWheel`
prop silently does nothing and the browser zooms on top of the canvas. Wheel
handling lives in `use-wheel-gesture.ts` as a native listener with
`{ passive: false }`. Same applies to any gesture whose default must be
suppressed.

Anything bound to Cmd/Ctrl +, −, 0 or 1 must be claimed by the keymap and
prevented, or it drives browser zoom as well.

### 14. Transform gestures preview, they do not write

Resize and rotate carry preview frames in interaction state and dispatch ONE
command on pointer-up, exactly like dragging. A gesture that wrote per frame
would flood undo, persistence and (later) the network.

Rotation is stored on `frame.rotation` and honoured by `registry.boundsOf`, so
culling and marquee selection get the rotated extent for free. Hit testing
rotates the POINT into the object's local space rather than rotating the rect.

### 15. Chrome outside an object's world bounds is found via the DOM

A frame's title is drawn above the frame and counter-scaled to stay a constant
size on screen, so it has no fixed world geometry and world-space hit testing
cannot see it. Rather than special-casing types in the geometry, pointer
handling falls back to `closest('[data-object-id]')`. Any future chrome with the
same property gets this for free.

### 16. Derived geometry is asked for, never stored

A connector has no meaningful `frame`. Its extent comes from `getBounds(object,
doc)` and its ink from a precise `hitTest` — both on the registry, because a
connector's geometry depends on objects it merely references. Moving an
endpoint's object must never patch the connector.

Consequences to respect when adding a type like this:

- anything needing bounds asks `registry.boundsOf(object, doc)`, never
  `object.frame` — the selection overlay got this wrong and drew a degenerate
  box at the origin, and the connector's own anchors got it wrong a second
  time, running every line joined to a GROUP to that group's 0×0 frame instead
  of to its edge. A type that needs another object's extent is handed a
  `boundsOf`: the registry gives one to `getBounds`, `hitTest`, `endpoints` and
  `retargetEndpoint`, and `ObjectView` gives one to every view. The exception
  is an object that is TURNED, whose bounds are the axis-aligned box around it
  rather than where its edges are — and nothing both rotates and keeps its
  extent elsewhere
- bounds are a superset, so hit testing rejects on bounds then asks
  `registry.hitTestObject`
- per-object subscriptions mean a dependent object goes stale unless the type
  declares `dependencies`
- a type whose SHAPE is its ends declares `endpoints` and `retargetEndpoint`,
  and gets drag handles, preview and undo without the canvas knowing what it is.
  The gesture reports only what was dropped on; where exactly an attachment
  lands is the type's decision
- so a drop carries where the pointer was AND how precise a pointer is at that
  zoom — a tolerance in world units, because a constant means something
  different at 25% than at 400%, and only the view knows the zoom. Whether that
  counts as aiming at an anchor or merely at the object is then decided inside
  the type, and the overlay's highlight, the gesture's hit test and the drop
  itself all ask that one function, so none of them can promise what another
  does not deliver
- an end that is attached resolves to a point AND a direction, and the route
  leaves along it. Take the direction from the run between the ends instead and
  a line anchored to a bottom edge departs sideways — the caps are oriented by
  the route's own first and last segments, so the arrowhead then points along
  the object rather than into it. The anchors are drawn clear of the edges, so
  aiming at one means letting go OUTSIDE the target: hit testing the objects
  alone finds nothing at exactly the moment somebody is being most deliberate

### 17. Snapping is a preference with a held-key override

Snap-to-grid is ON by default (`GRID_SIZE` = 10 world units) and applies to
creation, move and resize. Holding Cmd/Ctrl suspends it for the duration of a
gesture WITHOUT changing the preference — an override only reachable from a
menu is useless once a drag has started.

A multi-selection snaps as ONE unit: the selection bounds are snapped and the
resulting delta applied to every member. Snapping each object independently
shuffles them relative to one another, which looks like a bug even though each
object is individually aligned.

**Alignment to neighbours beats the grid, per axis.** Lining up with the object
next to it is what the user is looking at; the grid is the fallback for an axis
nothing is near. Applying both would fight — the grid drags a selection back off
an alignment it has just captured. Cmd/Ctrl suspends both, because it is the
"stop helping" key rather than the "grid off" key.

Anything a gesture compares against is snapshotted at gesture START. Alignment
candidates are the visible objects minus the selection; recomputing them per
pointer event is the O(n) scan rule 10 forbids, sixty times a second.

**A test that only uses grid-aligned positions cannot tell alignment from the
grid.** Both put the object in the same place. Push a neighbour off-grid first,
or the test passes with the feature deleted — three of these did.

### 18. A container's behaviour is a capability, not a check for its type

`frame` and `group` both hold children and differ in ONE thing: clicking a
member of a group selects the group, clicking a member of a frame selects the
member. That lives in `capabilities.selectsAsUnit`, so the hit tester names
neither type.

Adding a capability is deliberately a breaking change — every type must state
its answer. A capability that defaulted to `false` would let a new type acquire
behaviour nobody chose for it.

Anything that reaches INTO such a container — double-click to edit a member —
uses `hitTestRaw`, which ignores membership. Without it, grouping a note makes
its text permanently uneditable.

### 19. An upload is validated by its content, not by what it claims to be

A `File`'s MIME type is derived from its extension, so it is trivially wrong:
renaming `payload.svg` to `photo.png` produces a File that claims to be a PNG.
Uploads are checked on size, declared type AND sniffed leading bytes, in that
order — size first because it is free, the declared type for a readable error,
the bytes because that is the one a file cannot lie about.

**SVG is not an accepted image format.** It is a document that can carry
scripts, external references and foreign objects, so accepting one means
sanitising it — and a half-sanitised SVG is worse than a rejected one because it
looks handled. Do not add it to the allowlist without a sanitiser in the same
change.

Validation is policy and lives beside the runtime, never in an adapter: swapping
IndexedDB for a server must not change what a user may upload.

### 20. A stored locator must survive a reload

An `AssetRef.locator` is `idb:<id>`, never a `blob:` URL. Object URLs are minted
per page load and die with the tab, so persisting one leaves every image on a
reloaded board pointing at nothing. Resolving a locator to something paintable
is the adapter's job, and it caches: `resolve` is called from the render path,
so minting a URL per call pins one decoded blob in memory per frame.

Anything asynchronous that the render path needs gets the same treatment — a
synchronous cache lookup with an explicit `loading`/`ready`/`missing` state,
plus a subscription that re-renders when it lands. A view cannot await.

### 21. The interface comes from the registry, not from a list

A panel that enumerates its own fields is a second source of truth about what a
type can do, and it drifts the moment a type changes. The inspector reads
`capabilities.styleProps`; a mixed selection gets the intersection, because one
control must mean one thing.

This is also how a declaration that was never honoured gets found: `sticky`
claimed `fill` and its view ignored it, invisible for as long as `color` was the
only property anything could set. **A capability nothing in the UI consumes is
untested, whatever the type says.**

Design decisions live in `PRODUCT.md` (who this is for, what is settled),
`DESIGN.md` (the built visual system) and `apps/web/.impeccable/surfaces/` (the
direction contract for a surface). They are maintained through the vendored
`impeccable` skill — `/impeccable` — not by editing tokens ad hoc.

### 22. Contrast is tested, not asserted

WCAG 2.2 AA is a product commitment, so `app/design-tokens.test.ts` parses
`styles.css` and fails the build when a pair drops below its floor. It restates
no hex values: a duplicated palette drifts, and the test then passes against
colours the app stopped using.

Know which floor applies. 4.5:1 is text; 3:1 is a **UI component you must
perceive to operate** — a control's boundary, a handle, a focus ring. The page
rule is neither, so it sits below 3:1 on purpose and the test asserts that
CEILING as well: a later "improve contrast" pass would otherwise turn the ground
into a cage the content has to fight.

Functional text has an 11px floor. That covers shortcuts, field labels and
readouts; only non-interactive legal smallprint gets less.

### 23. Break a new architectural rule once, and watch it fail

A rule that passes vacuously is worse than no rule, because it is trusted. This
practice has already caught a dependency-cruiser rule that never fired on the
mistake it existed to catch, an alignment suite that passed with the feature
deleted, a shape-label check that was never run against a real outline, and a
`z.object({})` that accepted every payload because Zod strips unknown keys
unless you ask it not to.

### 24. A length inside the world transform is a world unit

The board is drawn by one `scale(zoom)`, so a CSS length written inside it is
measured in world units. Apparatus is the opposite — a handle is 9 screen
pixels at 5% and at 1600% alike — and for a long time that was done by dividing
every length by the zoom.

**That works down to one pixel and then stops.** A border, an outline and a
shadow cannot be painted thinner than 1px in their own coordinate space, so at
1600% a `1 / zoom` border came back as one WORLD pixel — sixteen on screen — and
with `box-sizing: border-box` the border alone then set the element's size: a
9px resize handle measured 32. The 1.5px selection outline and the rotate grip's
1px ring were never divided at all and were sixteen times over on their own. The
arithmetic had been wrong at every zoom past about 2× for as long as it existed;
it only became visible when the grips above a selected object ran into each
other at maximum zoom.

So apparatus lives on `.of-apparatus`, OUTSIDE the transform: positions convert
once through `worldRectToScreen`, and every length out there is what it says.
`canvas/layers.test.ts` reads the composition root to find out what is on which
layer, so a new overlay joins the rule without anybody remembering to add it.

Inside the world the one counter-scale that does work is a
`transform: scale(1 / zoom)`: the element is laid out at its written size and
only painted smaller, so nothing is ever asked for a sub-pixel border. Nothing
needs it today — the comment pins were the last users and they moved out — but
it is the escape hatch for anything that genuinely has to stay in there.

**Apparatus sits over the board, including over its own object.** It used not
to — a selected object is lifted to `z-index: 1` and so painted over its own
handles, which quietly made their inner halves dead. A press target that reaches
inward is one that four corners can meet in the middle of, leaving a small
object impossible to pick up, so a handle's 24px target is spent entirely
outside the selection. An edge strip still straddles the boundary: that is the
tolerance band that makes an edge grabbable, and four of them cannot meet in the
middle of anything.

### 25. A handle that makes something hands the drag over to it

A route passes through the points it is given, in the order it is given them,
and a new one is made by dragging the middle of a segment. That handle cannot
go on meaning "insert here": the preview it produces is fed straight back to
the type, so asked again it would insert a second point, then a third — one per
pointer event, with the route folding up as you drag.

So a handle names its successor (`becomes`), and from the first move the
gesture is dragging THAT. The canvas follows a declaration rather than
recognising a naming convention, which is what keeps the rule in the registry
where behaviour belongs.

The same shape of problem is why a point is not REMOVED mid-drag: every index
after it would shift, and the hand that was moving vertex 2 would find itself
moving what used to be vertex 3.

**Chrome that only appears under the pointer must survive its own press.**
Hiding a revealed handle "while a drag is running" cannot be pressed at all:
the press starts the drag, the handle unmounts between `pointerdown` and
`pointerup`, and a `click` needs both on the same element — so no click, no
double-click, and a connector's label became unreachable. (The sixth appearance
of apparatus that unmounts under its own press.) It needs no such gate: the
pointer is only tracked BETWEEN gestures, so during a drag it stays where the
press was while the shape moves away from it, and the handle drops out of reach
on its own.

And a handle that has no double-click of its own must not swallow one. A
table's divider does have one — double-clicking it fits the column, so the
object underneath must not also open — but a drag-only grip sitting where
somebody double-clicks to type is just in the way.

---

## Conventions

**Naming** — `ObjectId`/`BoardId`/`AssetId` are branded; use `asObjectId()` only
at deserialization boundaries and in tests. `frame` is an object's geometry;
`Viewport` is the camera. `OrderKey` is a string, never parsed as a number.

**Types** — no `any`, ever; `unknown` plus narrowing instead. Interface members
that hold functions use property syntax (`readonly create: (…) => …`) rather than
method shorthand, because methods are bivariant and properties are not.

**Files** — one object type per folder in `core/src/types/` and
`web/src/canvas/views/`. A new registry entry is justified by different
BEHAVIOUR, not different appearance: the four shape variants are one `shape`
type with a discriminant, while `text` and `sticky` are separate because they
mean different things. Components stay small; if `Canvas.tsx` starts growing
state or geometry, extract it.

**Ports** — `Clock` and `IdGenerator` are injected, so tests are deterministic
without fake timers or mocks. Use `createTestHarness()` from `core/src/testing.ts`.

**Comments** — explain _why_, especially where a non-obvious choice prevents a
specific failure. Do not narrate what the code already says.

---

## Adding an object type

1. `packages/core/src/types/<name>/schema.ts` — Zod schema and TS type
2. `packages/core/src/types/<name>/definition.ts` — `defineObjectType({...})`
3. Register in `packages/core/src/types/index.ts` — one line
4. `apps/web/src/canvas/views/<Name>View.tsx` — `defineObjectView({...})`
5. Register in `apps/web/src/canvas/views/index.ts` — one line

Nothing else should need to change. If it does, that is the bug — fix the
registry, not the caller. See
[docs/architecture/04-object-type-registry.md](docs/architecture/04-object-type-registry.md).

---

## Adding a command

1. Add to the `Command` union in `commands/types.ts`
2. Add a case to `describeCommand` in `commands/labels.ts`
3. Write a pure handler in `commands/handlers/` returning `Patch[]` only
4. Add a case to `handleCommand` in `commands/handlers/index.ts`
5. Test the happy path, rejection paths, and locked-object behaviour

Undo comes free — inverse patches are derived generically and covered by the
patch-symmetry property test.

---

## Before you commit

`pnpm verify` must pass. If you touched interaction or rendering, run
`pnpm test:e2e` too — it catches the class of bug unit tests structurally cannot.
