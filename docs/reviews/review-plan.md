# OpenFrame — Review Programme Plan (Architecture · E2E/QA · Design)

## Context

OpenFrame has finished Phases 1–4 (canvas, structured objects, collaboration). Phase 5 (AI/MCP) comes next and adds two more writers to the document. Before that, the user wants three coordinated reviews:

1. an architecture and implementation review, for structural soundness and efficiency
2. a review of the E2E tests and QA process
3. a design-consistency review of every surface, driven by the vendored `impeccable` skill

This plan says how to run each review and what it should produce, and it seeds each one with findings from a read-only survey. Running the plan should give three review reports (committed under `docs/reviews/`), a prioritised backlog, and the first fixes as small PRs. Each fix PR passes `pnpm verify` and, where it touches rendering or interaction, `pnpm test:e2e`.

The branch `claude/blissful-goldberg-qy0eks` is identical to `main`, so the reviews start from a clean baseline.

### Decisions (from the user)

- **Text floor: 12px.** Move the 27 uses of 11px up to 12px. Update CLAUDE.md rule 22, the component sections of DESIGN.md, the Share contract and `design-tokens.test.ts` to match.
- **Design scope: refine, plus bolder chrome.** Keep the visual identity: ruled ground, After Hours, palette. `/impeccable bolder` and `typeset` may strengthen hierarchy in the inspector, rail and record line. There is no new visual world, and DESIGN.md is not replaced.
- **Order: correctness fixes first**, then the three review reports, then the tracks.

### Now executing: Track C (design) — C1 ✅ done (see [design-review.md](design-review.md)), C2 next

Tracks A and B wait for MCP. Step 1 of the execution order below was "correctness fixes first". For now it is limited to the design-owned fix, the unstyled `.of-button`, which rides with C2. The other correctness fixes resume with Tracks A and B.

Design work happens on `claude/blissful-goldberg-qy0eks`, with one commit per phase step, and `pnpm verify` passing before each commit:

1. **C1:** `impeccable context` from `apps/web`, then `/impeccable document`. Reconcile DESIGN.md with the code, apply the 12px floor to CSS, docs and the token test, and fix the stale numbers.
2. **C2:** `/impeccable extract`, covering the button primitive, the token scales, the duplicate sheets and icons.
3. **C3:** per-surface `critique` (Inspector first), then contracts and polish.

### Execution order

1. **Correctness PRs, one per item, each with a test that fails first:**
   1. undo under collaboration (A1 P0)
   2. the dependency-snapshot collision (A1 P0)
   3. the 20 vacuous e2e guards (B1)
   4. the flaky `comments.spec.ts:901` test (B1)
   5. the unstyled `.of-button` (C2)
   6. `.frame` used as bounds in `framesBounds`/`framesOrigin` (A1 P0)
2. **The three reports** in `docs/reviews/`, each with a ranked backlog. Update the stale docs: ADR 0007, the overview, the testing strategy, and the CLAUDE.md paths and timings.
3. **Enforcement PR (A2.2) and QA foundations:** the fixtures module, sleeps replaced, the playwright lint, the CI fixes (B2, B5).
4. **Baselines for design work:** axe scans and visual goldens (B4).
5. **Design phases C1 → C2 → C3**, running alongside the Track A perf and structure work (A2.3–4).

### 📌 TODO (user request): revise Tracks A and B once the MCP build lands, so the MCP work is covered in the architecture and E2E effort

### ⏸ On hold: waiting for the MCP server build (Phase 5a)

A separate run is building the MCP server (`docs/phases/phase-5a-mcp-server.md`, with stages: headless peer, sign-in, read tools, write tools, remote transport). Tracks A and B pick it up once it lands. When it lands:

- Re-survey the new package or app, and add it to the layer map and depcruise rules. Check that core stays pure (R1) and that dependencies still point inward (R2).
- **R3:** every MCP write tool goes through `CommandDispatcher.dispatch`, with nothing holding a `DocumentWriter`. **R8:** MCP input is validated at the boundary. Note that the room server does not validate Yjs updates today (A1).
- **The A1 undo P0 gets worse with an agent peer.** An agent editing alongside a person makes undo-after-remote-edit the normal case, not an edge case. Re-rank it against the MCP design.
- The headless peer path gets correctness and performance review: sync cost, whole-document subscriptions, and dispatch cost per tool call.
- **Track B additions:**
  - MCP contract tests: tool schemas, rejection paths, permission and lock behaviour
  - a headless-peer-plus-browser e2e in the `e2e-rooms` style: an agent writes, a human sees it, and undo stays per-actor
  - CI jobs for the MCP package, mirroring the `rooms` job
- Merge the MCP branch into this one, and refresh the baseline numbers (test counts, e2e runtime) before starting execution.

Track C (design) does not depend on MCP. It can start sooner if the user wants.

---

## Track A — Architecture & implementation review

### A0. Method

- Check each CLAUDE.md rule (1–27) against its enforcement: lint, depcruise, test, or convention only. Per rule 23, **break each rule once on purpose and watch it fail**. A rule that never fails gets recorded as vacuous.
- Every performance claim gets a measurement from `pnpm bench:cull` or `pnpm test:bench` on `board-mixed-*`, never an assumption (rule 10).
- Output: `docs/reviews/architecture-review.md`. It holds a rule-by-rule enforcement matrix, findings ranked P0–P3, and one backlog item per finding.

### A1. Seeded findings. Confirmed means I read the code; suspect means it still needs verifying.

**P0 — correctness**

- **Undo is unsafe under collaboration** (confirmed). `packages/core/src/commands/dispatcher.ts:211` `#applyHistory` replays the stored patches with no capability check, no lock check and no handling for a missing target. After a peer deletes the object, `patch.ts` throws `PatchError` out of `undo()`. In the normal case it silently overwrites peers' edits. Review whether undo should rebase or skip stale patches. Add tests for undo after a remote delete and after a remote edit.
- **The dependency snapshot collides** (confirmed). `apps/web/src/hooks/use-document-object.ts:100` sums `x + y + width`, so it ignores height and rotation, and moves along x+y=const produce the same sum. A group's frame is 0×0 (rule 16), so a connector attached to a group can go stale. Fix: use a per-object version or revision counter.
- `.frame` is used as bounds in `scene/resize.ts:180` `framesBounds` and in `hooks/use-commands.ts:161` `framesOrigin`, which is wrong for rotated objects, groups and connectors. `Math.min(...spread)` can also overflow the stack on a large paste.
- `main.tsx:~109` asset healing dispatches onto the user's undo stack. It probably needs `skipUndo`.

**P1 — enforcement gaps (rules that pass vacuously)**

- **R5.** `packages/core/src/architecture.test.ts:115` scans core `.ts` files only, and only the `switch(x.type)` form. It misses `canvas/ObjectView.tsx:200` (`object.type === 'connector'`). Extend it to apps/web `.ts`/`.tsx` and to `=== '<registered type>'` comparisons.
- **R2 layer leaks that depcruise does not catch:**
  - ui→app (32 imports)
  - canvas→ui and canvas→app (`ArrangeBar.tsx:19`, `SelectionOverlay.tsx:17`, `use-presence.ts:10`, `CommentLayer.tsx:5`)
  - **interaction↔hooks cycle between layers** (`use-keyboard-shortcuts.ts:11` → `hooks/use-commands`)
  - reachability from ui to adapters through app, which is transitive
  - Decide the intended position of `hooks/` and `app/` in the layer diagram, then add explicit rules.
- **R3.** `composition-root.ts:187` `devTools.loadBoard/clearBoard` closes over `DocumentWriter` in every build and is exposed through `runtime/context.ts:58`. Gate it behind the compile-time bench `define` (rule 12).
- **R9.** Selectors are safe today, but nothing lints them. Consider a custom ESLint rule or a typed selector helper.
- **Conventions.** `method-signature-style` is off, and `interaction-store.ts:411` already breaks the rule. Turn the lint on.
- **R6/R8.** Migrations are convention only; add a lint that migration files import nothing from domain. The room server (`packages/collab/src/room.ts`) accepts Yjs updates without shape validation. Decide whether this is a trust boundary under R8.
- **R12.** Add a test that `apps/web/public/` does not exist.
- **R4/R14.** Add a unit test on the gesture layer: one gesture produces exactly one dispatch.

**P2 — structure**

- `app/` is both the composition root and a service layer: it imports adapters and calls raw `fetch` in `share.ts`, `board-password.ts` and `board-lifecycle.ts`. Split it into `app/` (wiring) and a `services/` layer behind ports.
- God-modules to decompose:
  - `canvas/use-canvas-gestures.ts` (1418 LOC): split into one gesture module per mode behind a small dispatcher
  - `interaction/interaction-store.ts` (~104 members): split into slices (viewport, selection, gesture, UI chrome)
  - `hooks/use-commands.ts` (764 LOC): move the multi-command logic (group, paste, duplicate, derive) into core command handlers
- Tools are hard-coded per type in `interaction-store.ts:21`, `keymap.ts:54`, `pointer-controller.ts:90` and `ui/Toolbar.tsx:33`. That breaks "adding a type needs no other change"; move tool metadata into `ObjectViewDefinition`.
- Docs drift: ADR 0007 says "deferred" and `docs/architecture/01-overview.md` describes two packages, but `packages/collab` and `apps/rooms` are built.

**P2 — efficiency (measure first)**

- `scene/culling.ts:42` → `objectsInPaintOrder` does `groupByParent` plus a sort **on every pan or zoom frame**. Cache it by document version, the way `registry.ts:1077` caches its child index.
- `setPointer` and `setHovered` (`interaction-store.ts:552`) write on every pointermove with no equality short-circuit. There are about 19 selectors per visible `ObjectView`, and an idle hover also hit-tests on every move.
- 13 components subscribe to the whole document via `useBoardDocument()`. Narrow them to derived selectors.
- `dispatcher.ts:239` `applyToMap` copies the objects Map once per command in a transaction, O(k·n).
- Autosave writes the whole document every 500ms, and a failed save only logs to the console. Surface the failure to the user (this relates to rule 7) and check that overlapping saves are ordered.
- Bundle: supabase-js, yjs and collab load eagerly even for local boards. There is no `manualChunks` and no route-level `lazy`. Measure with `vite build --report` or rollup-plugin-visualizer.

**P3 — unit-test gaps:** `ui/` (5.6k LOC, 0 tests), `controls/`, `use-commands.ts`, `use-canvas-gestures.ts`, `scene/culling.ts`, `scene/hit-testing.ts`, `app/composition-root.ts`, and `adapters/indexeddb` (verify).

### A2. Order of work

1. P0 fixes with regression tests, one PR each.
2. Enforcement PR: R5 scan, depcruise layer rules, `method-signature-style`, the `public/` guard, the devTools gate. Break each rule once to prove it fires.
3. Perf PR: paint-order cache and pointer short-circuit, with before/after numbers from `bench:cull`.
4. Structural refactors (`app/` split, gesture/store/commands decomposition, tools into the registry), one at a time and each behind green e2e.

---

## Track B — E2E tests & QA process review

### B0. Baseline (measured)

- 329 Playwright tests in 34 files: 328 in the functional project, 1 bench. Another 19 are in `e2e-rooms`. About 1,870 unit tests, all passing.
- A local run of the functional project with 2 workers: **327 passed, 1 failed, 8.3 min**.
- **A real flaky test:** `comments.spec.ts:901` "offers nothing to reveal when nothing has been resolved" failed 3 of 5 runs under `--repeat-each=5`. The likely cause is a race when switching the comment tool off with `v` and back on (`:912`). CI's `retries: 1` hides it.
- Output: `docs/reviews/qa-review.md`, and a rewrite of `docs/appendices/e-testing-strategy.md`. That doc still says E2E is "five tests".

### B1. Correctness of the existing suite (P0/P1)

- **Tests that pass vacuously:** 20 `if (x === null) return` guards (confirmed at `manipulation.spec.ts:109`), in `manipulation.spec.ts` (17, covering every grid-snap and frame test), `comments:560`, `rich-text:45` and `stroke:172`. Replace each with a `boundingBox` helper that asserts the element exists. Then, per rule 23, delete the feature under one test and watch it fail.
- **Fix the flake** at `comments.spec.ts:901`: find the root cause (tool-toggle race, or a missing wait on panel state), then prove it with `--repeat-each=20`.
- **Replace the fixed sleeps:** the 7 `waitForTimeout(800) // autosave` calls before a reload should use the real flush signal `seed.ts`/`board-exit` already uses, or a new `data-save-state` attribute. Also `tools-and-navigation:232` and the `shared-board` waits at `:318`, `:479`, `:518` and `:540`.
- **Rule 4 is inferred, not measured.** Add a test hook, compiled in only under a test `define` (rule 12), that counts dispatches and repository writes. Assert zero writes mid-drag and exactly one on commit, for drag, resize, rotate, endpoint and route-stop gestures.

### B2. Structure and maintainability

- Create `e2e/fixtures.ts` as a Playwright `test.extend` fixture set: `board`, `create(type, at)`, `drag`, `select`, `undo`/`redo`, `reload({ flushed: true })`, `objectBox(id)`. It replaces the 11 copies of `freshBoard`, the 4 local `drag` helpers and the copies of `create`.
  - Drop the IndexedDB delete-and-reload each copy does if a fresh context already gives an empty database. Verify first; it saves one reload per test.
- **Seed through storage for anything not under test:** fixture boards injected into IndexedDB, reusing `tools/bench/generate-board.ts` and the frozen schema fixtures. Keep UI-driven creation for specs that test creation itself.
- **Selectors:**
  - Move the ~100 CSS-class selectors to test ids or roles. `.of-connector__line` alone has 26 uses.
  - Prefer `getByRole` for chrome, which also covers accessibility.
  - Replace magic viewport coordinates with positions relative to the object or world (`objectBox`, `worldToScreen`).
- Lint the specs with ESLint `playwright` plugin rules: `no-wait-for-timeout`, `no-conditional-in-test`, `no-force-option`, `missing-playwright-await`, `no-skipped-test`.

### B3. Coverage gaps to add

- **Rule 7 quarantine:** load a board that cannot be read. Assert it opens read-only, shows the notice, never writes back, and that the stored bytes are unchanged.
- **Migrations in the browser:** load each frozen fixture from `packages/core/src/schema/__fixtures__` into IndexedDB, open it, check it renders, save, reload.
- **Upload validation:** a file that is too large, non-SVG bytes under a declared MIME type that does not match, a corrupt PNG, and an SVG sent with its real MIME type.
- **Inspector with a mixed selection** (rule 21 intersection); keyboard-only navigation (Tab order, focus rings, Mod+0/1); redo, and undo across a reload.
- **Collab:** undo after a peer deletes or edits the object (pairs with Track A P0), and disconnect and reconnect in the middle of a session.

### B4. New quality dimensions

- **Accessibility:** `@axe-core/playwright` scans of Home, an empty board, a board with a selection, the inspector open, the context menu, the comments panel and BoardLocked, in both the default world and After Hours. Record the violations that exist today, then ratchet them down to zero.
- **Visual regression:** `toHaveScreenshot` on a small, deterministic set: each object type at 100%, apparatus at 25%, 100% and 1600% (rule 24), and each chrome surface in both themes. Store the goldens per platform and generate them in CI's Linux image. This set is the regression net for Track C.
- **Cross-browser:** add `firefox` and `webkit` projects. Run a `@smoke`-tagged subset on each PR and the full matrix nightly.
- **Touch and viewport:** one `hasTouch` project for pan, pinch and drag, and a narrow viewport for Home.
- **Performance budgets as assertions:** turn `bench:cull` into a threshold test with generous headroom, and run `test:bench` nightly on `board-mixed-10k`, keeping the trend.

### B5. CI and process

- `workers: 1` in CI is the main cost. Test with 2–4 workers, and/or shard with `--shard=i/n` across a matrix. Cache `~/.cache/ms-playwright` keyed on the Playwright version; it is currently installed twice per push.
- Add `format:check` and `bench:smoke` to CI so CI matches `pnpm verify`.
- **Flake policy:**
  - Keep `retries: 1`, but add `--fail-on-flaky-tests` or a JSON reporter step that fails or annotates on flaky tests.
  - Upload `test-results/` with traces on failure for both the e2e and rooms jobs. The rooms job uploads nothing today.
  - Track flaky tests in an issue label.
- **Rooms suite:** close the browser contexts that are left open (19 opened, 7 closed), and run `test:rooms` in `deploy-rooms.yml` before deploying.
- Correct the stale numbers in CLAUDE.md (`pnpm test ~1s`) and in the testing-strategy doc.

---

## Track C — Design review with `impeccable`

### C0. How impeccable is driven here

- Run the helper from `apps/web/`, because the monorepo root makes `impeccable context` ask which app to use. The platform is `web`. The web app inherits PRODUCT.md and DESIGN.md from the repo root. Only 3 surface contracts exist, in `apps/web/.impeccable/surfaces/`: App.tsx, Home.tsx and ShareControl.tsx.
- `impeccable signals` says the project has **never been critiqued** (`critique.latest: null`) and no dev server is running.
- Baseline `impeccable detect --json src` gave 56 advisory hits, all in `styles.css`:
  - 33 font sizes off the DESIGN.md ramp
  - 19 radii outside the DESIGN.md scale
  - 2 undocumented colours
  - 1 Georgia font
  - 1 grid background, which is a false positive: it is the canvas ground. Add it to the ignore list.
- The mode is **Operate** for the board, and for Home as its contract already says.
- Sequence, per the skill's own routing:
  1. `document`, to reconcile DESIGN.md with the code
  2. `extract`, to turn tokens and primitives into code
  3. `critique <surface>` on each surface; the command runs two isolated sub-agents, A and B, and needs `pnpm dev` running for browser evidence
  4. `audit` for accessibility, performance, theming and responsive checks
  5. `polish` and targeted commands (`clarify`, `harden`, `layout`, `typeset`) to close the backlog. `craft-floor.md` is read before any edit.
  6. `impeccable-finish-reviewer` to check each finished surface against its contract.
- The skill's own rule caps verification at one batched screenshot round plus at most one confirm round per surface. Desktop and mobile widths are captured together, in both the default world and After Hours.

### C1. Phase 1 — make DESIGN.md true, before any critique

The design documents contradict themselves, so a critique scored against them now would be scored against noise. Resolve these first. They are product decisions, and some are asked below.

- **The text floor is 12px (decided).** Move the 27 uses of 11px in `styles.css` up to 12px. Update the component sections of DESIGN.md, CLAUDE.md rule 22 and the Share contract. Add a floor assertion to `design-tokens.test.ts`, and break it once to watch it fail.
- **Stale numbers:**
  - Tool size: 40px in DESIGN.md, 50px in code (`--of-hit-lg`).
  - Inspector: 276px wide with a 52px label column in DESIGN.md; 360px (`Inspector.tsx:53`) with an 82px column in code.
  - Menu and notice text: 13px in DESIGN.md, 15px in code.
  - Share rows: 44px, which breaks the multiple-of-10 rule.
  - `spacing.gutter` is 10px in DESIGN.md but `--of-gutter` is 20px.
  - The swatch test name in `design-tokens.test.ts:499` says "seven" while the grid is 6×2.
- CLAUDE.md says views live in `canvas/views/`; they are actually in `src/views/`.
- Because the scope is refine plus bolder chrome, C3 may run `/impeccable bolder` or `typeset` on the inspector, rail and record line. It still keeps the palette, ruled ground and After Hours.
- Run `/impeccable document` so DESIGN.md and its sidecar are derived again from the shipped code, then hand-merge the decisions above.

### C2. Phase 2 — design system extraction (`/impeccable extract`)

- **P0 bug:** `.of-button`, `.of-button--primary` and `.of-button--ghost` have **no CSS rule**. That is confirmed, and there are 12 uses: NoticeBanner "Dismiss", WorkspaceBar, the BoardGone link, BoardLocked, CommentPanel, CodeView, TableView. Build **one button primitive** with variants, and fold the per-surface buttons into it: `.of-zoom__button`, `.of-status__action`, `.of-inspector__action`, `.of-format-bar__button`, `.of-arrange__button`, `.of-home__row-action`, and so on.
- **Add token scales that exist only on paper:** a type ramp (114 of 122 font sizes are raw px), a radius scale (17 distinct values against one `--of-radius`), spacing below 10px (only 11 of 220 declarations use a token), a z-index scale (raw values 1–100; `.of-search` at 8 sits below `.of-overlay` at 10), and motion for the tooltip at 110ms and the copied-link flash at 600ms.
- **Remove duplication:** `.of-account` and `.of-share` are identical sheet shells, and `.of-notice` and `.of-toast` duplicate each other. Unify sheets on `.of-surface`: some floating surfaces use a 10px radius and others 6px.
- **Icons:** fold the stray inline SVGs into `ui/icons.tsx` (WorkspaceBar, Swatches, ColorPicker, PresenceLayer, at stroke widths from 1.2 to 3.2). Replace the typed glyphs (`−`, `A−`, `×`) with drawn icons.
- **Tooltips:** replace about 44 native `title=` tooltips with the focusable `.of-tool__tip` pattern, and extract the repeated `isMac` modifier helper.
- **Colour leaks:** `interaction/tool-cursor.ts:178` hard-codes ink and halo colours, so the cursor ignores After Hours. `controls/Swatches.tsx:29` falls back to `#000000`, which breaks Never-Black.
- **Guards:** extend `design-tokens.test.ts` to fail on a raw font size, radius or z-index outside the token scales, the same way it already fails on colour literals. Enable the impeccable detector hook (`/impeccable hooks on`) so drift is flagged as it is written.
- Split the 5.4k-line `styles.css` into files per layer (tokens, primitives, chrome, apparatus, views). The token test has to follow the split.

### C3. Phase 3 — per-surface critique and contracts

Surfaces are listed in priority order. Each gets `/impeccable critique`, a new `.impeccable/surfaces/<slug>.md` contract where one is missing, and then `polish`.

1. **Inspector / record panel.** DESIGN.md calls it the "signature component". Covers Inspector, RecordFields, Provenance, Swatches, ColorPicker. No contract.
2. **Tool rail and flyouts:** Toolbar, TableSizePicker.
3. **Record line and zoom:** StatusBar, BoardTitle, BoardExit, ZoomControl.
4. **Context menu, search, arrange bar, format bar.** Also fix focus: `.of-search__input { outline:none }` has no replacement ring, and the table and code inputs use `:focus` rather than `:focus-visible`.
5. **Comments, mentions, presence.** Pills (999px) have come back, against DESIGN.md.
6. **Blocking and degraded states:** BoardLocked, BoardGone, NoticeBanner (quarantine read-only, rule 7), Toast, AppErrorBoundary, ObjectErrorBoundary, Unknown and Fallback views. Use `harden` and `clarify` on the copy.
7. **Selection apparatus:** handles, endpoints, connect points, crop, dividers, alignment. The handle radius is 2px against DESIGN.md's 4px. Check rule 24: `FrameView.tsx:28` and `TableView.tsx:296` divide borders and shadows by zoom. Verify at 1600%.
8. **Object views:** sticky, text, shapes, frame, connector, image, table, code, and the 8 semantic slips. Also cover PRODUCT.md's open gap: the contrast between a shape's default fill and its stroke.
9. **Home, account and share.** These already have contracts; re-critique them for regressions.
10. **Boot splash:** `index.html` inline styles and its own timings.

- **Cross-cutting:** after that, run `/impeccable audit apps/web/src` over the whole app, covering accessibility, performance, theming (After Hours on every surface) and responsive/touch.

---

## Cross-track dependencies

- Design phase C2 changes `styles.css` broadly, so it waits until the Track B visual and a11y baselines exist. B's screenshots are then the regression net for C.
- The Track A decompositions of `use-canvas-gestures.ts` and `interaction-store.ts` land before the C3 apparatus polish, so design edits do not rebase against a refactor.
- Everything goes in `docs/reviews/`: `architecture-review.md`, `qa-review.md`, `design-review.md`, plus the critique snapshots impeccable persists.

---

## Verification

- Each fix PR: `pnpm verify` passes; `pnpm test:e2e` passes for interaction or render changes; `pnpm test:rooms` passes for collab changes.
- Each new enforcement rule is shown to fail on a deliberate violation (the failure output goes in the PR description), then reverted.
- Perf changes: `pnpm bench:cull` and `pnpm test:bench` before and after on `board-mixed-10k`, with the numbers recorded in the review doc.
