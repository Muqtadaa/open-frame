# Tracks A and B, revised for the MCP build (2026-09-28)

`review-plan.md` held Tracks A (architecture) and B (QA) until the MCP server
landed. It has now landed: stages 1–4 of `docs/phases/phase-5a-mcp-server.md`
are done (headless peer, sign-in, read tools, write tools), and stage 5, the
remote transport, is not built. This document re-surveys both tracks against the
code as it stands on main at `dd872db`. Each finding was checked in the source;
none of it is carried over from the old plan unverified.

## What the MCP server is

`apps/mcp` is about 3.7k lines and speaks MCP over stdio.

- **Sign-in:** it signs in as the person through Supabase, with the publishable
  key only.
- **Connection:** each board it touches is joined once, as a headless Yjs peer
  (`board.ts`: `createDocumentStore`, `CommandDispatcher`, `connectBoard`).
- **Read tools:** `list_boards`, `get_board`, `get_objects`, `search_board`.
- **Write tools:** `create_objects`, `update_object`, `move_objects`,
  `delete_objects`, `create_connector`, `create_frame`, and `add_comment`, which
  writes to the database and not the document.

**What is sound:**

- **R3 holds.** Every document write goes through `dispatcher.transact(…,
{origin: 'mcp'})`. The writer is built inside `openBoard`, which is this app's
  composition root, and it never leaves it. `write.test.ts` asserts both.
- **R1/R2 hold.** Core's dependencies are unchanged. The depcruise rule
  `mcp-does-not-depend-on-the-web-app` exists and fires.
- **Roles are enforced three times over:** the tool (`onBoard(…, 'edit')`), the
  dispatcher's capabilities, and the room, which drops writes from non-editors.
- **Locks are honoured on dispatch** (`requireUnlocked` in every mutating
  handler).
- **Provenance:** objects carry `createdVia: 'mcp'`.
- **Sync cost:** each board is joined once and kept current by the room, so
  there is no per-call sync.

## Track A — architecture

### P0

**A-1. Undo throws after someone else deletes the object.**
`dispatcher.ts:211` `#applyHistory` replays stored patches with no check for a
missing target, a lock or a capability. `patch.ts` then throws `PatchError`,
and nothing on the web side catches it (`use-commands.ts:790`).

This was an edge case between two people. With an agent on the board it is the
normal case: the agent calls `delete_objects`, the person presses Cmd+Z on an
earlier edit to one of those objects, and the undo throws.

A second problem: undo also bypasses locks, so undo can change an object that is
now locked.

Fix:

- Replay through the same guards as dispatch.
- Drop the patches whose targets are gone. If nothing is left, skip the entry
  and say so, rather than throwing.
- Never reapply to a locked object.

Tests: undo after a remote delete, after a remote lock, and after a remote edit.
There should be a core unit test for each, plus a rooms e2e with an MCP peer.

**A-2. Nobody but the agent can undo the agent's edit.**
The MCP undo entry sits on the peer's own stack, which no tool exposes. A person
receives the agent's edits as `ApplyRemotePatches` with `skipUndo`, so their
Cmd+Z cannot take an agent's change back. `phase-5a` records this as open, and
`phase-5` requires agent edits to be "previewable and revertible as a unit".

This is a product decision more than a bug:

- a `revert_last` / `undo` MCP tool;
- a per-transaction "revert this agent change" command on the web side, applied
  through A-1's guarded path;
- or both.

### P1

**A-3. Style values are not validated at the boundary (R8).**
`create_objects` and `update_object` take `style` as `record<unknown>`.
`UpdateStyle` filters the keys against `styleProps` but never checks the values,
and `CreateObjects` spreads `spec.style` in unchecked.

So an agent can write any string into a colour, and colours are rendered into
inline CSS. A value such as `url(https://…)` becomes a request to that address
from every viewer's browser, and malformed values break the board.

Fix: validate each style value against the `ObjectStyle` schema, in the core
handlers so that every writer gets it and not just MCP. Test with the hostile
values.

**A-4. Tool schemas strip unknown keys instead of rejecting them (R8).**
There are no `.strict()` schemas (`definition.ts:62`, `write.ts:81/187/265`),
and parsed input is then cast with `as` in about ten places.

This is the same trap rule 23 records: `z.object({})` accepted every payload. A
misspelt field is silently dropped, and the agent believes it was set.

Fix: make the schemas strict, derive the parsed types instead of casting, and
add one rejection test per tool.

**A-5. The room relays editor updates without any content check.**
`room.ts:137` forwards Yjs updates verbatim. Clients do defend themselves:
`ApplyRemotePatches` validates through `readRemoteObject` and drops invalid
objects. So this is defence in depth rather than a hole.

Record it as a decision (an ADR) rather than leave it implicit. When the remote
transport (stage 5) lets agents run beyond the person's own machine, re-check
whether the room should reject malformed objects.

**A-6. Carried over, verified still present:**

- the dependency snapshot sums `x + y + width` (`use-document-object.ts:~100`),
  so it collides;
- `.frame` is used as bounds in `framesBounds`/`framesOrigin`, and
  `Math.min(...spread)` there can overflow the stack on a large paste;
- asset healing dispatches onto the person's undo stack (`main.tsx:125`, no
  `skipUndo`);
- the R5 scan covers core `.ts` only, and only the `switch` form.

`devTools` is now gated to dev and bench builds (`composition-root.ts:206`), so
that item is closed.

### P2 — efficiency with an agent peer

- `get_objects` and `search_board` sort the whole board on every call; paging
  uses `findIndex`; search describes every object on every call. That is fine
  at hundreds of objects. At 10k it should be measured, in a new
  `bench:mcp` alongside `bench:cull`.
- `applyToMap` and `apply-remote-patches` copy the object map for every command
  or batch. An agent creating 200 objects in one transaction copies the map 200
  times, on every peer. Measure it on `board-mixed-10000`.
- The structural items from the old plan still stand: split the gesture module
  and the store, and move tool metadata into the registry.

## Track B — QA

**Baseline, recounted:**

- About 1,440 unit tests: core 540, collab 66, web 679, rooms 81, mcp 70.
- 653 Playwright tests in 74 specs; 25 of those are local `zz-*` captures.
- 25 rooms tests, 2 of them MCP.

**B-1. MCP contract tests.** For each tool:

- schema rejection (paired with A-4);
- the lock refusal — there are no lock tests at all today;
- the view-only refusal, which exists;
- the hostile style values (paired with A-3);
- the size limits: 200 creates and 500 ids.

**B-2. Agent plus person, end to end** (`e2e-rooms`). Extend `mcp-peer.spec` to
cover:

- a person's undo after the agent deletes (A-1);
- per-actor undo, from the browser's side;
- an agent write refused on a locked object;
- the agent's revert, once A-2 is decided.

**B-3. CI.**

- Add `format:check` and `bench:smoke` so CI matches `pnpm verify`.
- Cache the Playwright browsers.
- Upload `test-results/` and traces for both e2e and rooms.
- Run `test:rooms` in `deploy-rooms.yml` before deploying.
- Add `apps/mcp` to that workflow's path filter, since the room protocol is
  shared.
- Add a separate MCP job only when stage 5 gives it something to deploy.

**B-4. Carried over.**

- The suite-hygiene items from the old B1/B2 are still open: vacuous guards,
  fixtures, fixed sleeps, and seeding boards through storage.
- The audit closed the known flakes: the load race (`a4a3c94`) and the
  `comments.spec` toggle.
- Cross-browser runs and a nightly `test:bench` trend are still not started.

## Order proposed

1. **A-1 and B-2's undo cases.** One PR: the P0, test-first.
2. **A-3 and A-4 with B-1.** One PR: the boundary.
3. **B-3.** CI, small.
4. **A-2.** Needs the owner's call on the revert shape.
5. **A-6**, then the P2 measurements.

## Decisions (owner, 2026-09-28)

- **Everything, in the order above**, one PR each, pausing after each merge.
- **A-2: both sides.** An agent can revert its own change through an MCP tool,
  and a person can revert an agent's change from the board. Both go through
  A-1's guarded history path.

## Progress

- **A-1:** undo and redo check capability first, then leave out patches whose
  target has gone or is locked (except its own lock). A step with nothing left
  is consumed, reported as `stale-history`, and shown as a toast.
  `history-guards.test.ts` (6 of 8 failed before the fix) and a rooms test where
  an MCP peer deletes and a person presses Cmd+Z (it failed before).
- **A-1, after review (Codex, on #12):** a replay also leaves out a `set` whose
  property somebody has changed since. It compares against the value the step
  itself left there, so it never puts an old value back over a newer one.
  Each undo entry also records which of its objects were locked before and
  after it ran, so a lock the step carried (a locked child swept up by an
  allowed cascade delete) does not block its own redo.
- **A-1, second review (Codex, on #13):**
  - A step's changes to one object now replay together or not at all. A
    conversion writes the type, its data version and the data together, and
    undoing two of the three after someone had edited the data left a sticky
    holding evidence data.
  - Each replayed write is now checked, as the replay reaches it, against its
    partner in the opposite list. The check previously ran against the board
    the replay started from, which put a move-then-delete back at the moved
    spot and a create-then-move back at the start.
- **A-3, A-4 and B-1, the boundary:**
  - A colour is checked where a COMMAND arrives, not only at load and at the
    room: `CreateObjects` and `UpdateStyle` refuse a value in `color`,
    `textColor`, `strokeColor` or `labelFill` that is not a palette token,
    `#rrggbb` or `none` (`requirePaintable`). A command refuses rather than
    drops, since whoever sent it is there to be told.
    `style-boundary.test.ts`: 10 of 11 failed before.
  - Every tool's arguments are a `z.strictObject`, including nested objects
    and both sides of the connector's endpoint union. The SDK parses against
    this schema before the tool runs; a raw shape had been wrapped in a
    non-strict object that stripped unknown keys first. The JSON schema an
    agent reads now says `additionalProperties: false`. `onBoard` is generic
    over the schema, so the ten `as` casts on parsed input are gone.
  - `contract.test.ts` covers, per tool: an unknown key is refused by name
    and changes nothing (12 failed before). It also covers hostile colours
    through `create_objects` and `update_object`, lock refusals for update,
    move and delete, and the 200/500 size limits. The stdio test checks the
    same refusal at the wire. Loosening any one schema again fails its test.
- **B-3, CI:**
  - The repository was formatted in one mechanical commit, listed in
    `.git-blame-ignore-revs`. Vendored and skill-written files are left out
    of Prettier. `pnpm verify` now starts with `format:check`.
  - The CI `verify` job runs the same steps as `pnpm verify`, including the
    Format step and `bench:smoke`, which it had been missing.
  - Playwright's Chromium comes from a cache keyed on the resolved
    Playwright version, through one local action
    (`.github/actions/playwright`) that every browser job uses.
  - `e2e` and `rooms` both upload `test-results/`, which is where the traces
    are.
  - `deploy-rooms.yml` runs the two-browser rooms suite before its dry run.
  - **Not done, on purpose:** `apps/mcp` is NOT in `deploy-rooms`' path
    filter. That filter decides when production rooms are redeployed, and an
    MCP-only change does not change the room. The MCP peer is covered on
    every PR by `mcp-peer.spec` in the `rooms` job.
- **A-2, revert from both sides:**
  - **Core:** `CommandDispatcher.revert(change)` takes back one recorded change
    through undo's replay and guards, and records it on the reverter's own
    history. What it would put back is checked like a merge, with
    `acceptablePatches` shared with `ApplyRemotePatches`. The guards also now
    refuse to remove a created object that somebody has changed since. That
    covers undo too.
  - **Collab:** a `changes` root map logs every `mcp`/`ai`/`api` change in the
    same Yjs transaction as its patches: label, who, when, forward, inverse,
    locks, affected objects, and whether it has been reverted. It is capped at
    50 entries and read structurally.
  - **MCP:** `commit()` returns the change id and no longer claims that undo
    covers it. `list_changes` and `revert_change` are new tools.
  - **Web:** a toast with Revert when an agent change lands, an "Agent
    changes" sheet in the top bar, and `revertChange` on `BoardCommands`.
  - `e2e-rooms/agent-revert.spec.ts` covers a real MCP peer and a browser. All
    5 tests failed with the web changes set aside.
  - **Not covered:** there is no golden for the new surfaces, because they
    exist only with a live room holding log entries, and goldens are
    local-only.
- **A-6, the carried-over items:**
  - **Connectors now follow every change to their ends.** Before, a connector
    re-rendered on a checksum, `x + y + width`. Now each notification bumps a
    counter, so a note made taller or turned moves the line.
  - **A line joined to a group follows the group's members.** A group's bounds
    come from its members, so `registry.renderDependenciesOf` adds the members
    of any end whose bounds are its children's. A frame end does not add its
    contents. `e2e/connector-follows.spec.ts` covers both, and both tests
    failed before the change.
  - **Paste and a move's snap box use each object's real bounds.** They read
    `boundsOf`, not `.frame`, and skip types drawn from their ends. A selected
    connector no longer pulls the box toward (0,0).
  - **A paste of any size is safe.** `boundsOfAll` is one loop, so it cannot
    overflow the stack the way `Math.min(...spread)` could.
  - **Resize and rotate still work from frames, on purpose.** They scale and
    turn frames, not drawn extents.
  - **Asset healing is kept off the person's undo history** with `skipUndo`,
    through `publishRewrite` in `heal-assets.ts`. Before, the first Cmd+Z
    unpublished an image for everyone.
  - **Rule 5 is scanned in the web app** (`src/registry-rule.test.ts`).
    - It flags a `switch` on `.type`, and any comparison of `.type` with a type
      name. The names are taken from the registry. Views are exempt.
    - It failed on `ObjectView`'s `object.type === 'connector'`. That line now
      calls `registry.drawnFromEnds(object)`, which checks whether the type
      declares `endpoints`.
- **P2, measuring an agent peer.** `pnpm bench:mcp` (`tools/bench/mcp-cost.ts`)
  times the real MCP read tools and a real dispatcher on the mixed fixtures.
  It also counts full-board map copies. `bench:mcp:smoke` runs in `verify`.
  Numbers are from a 4-core container on Node 22, on board-mixed-10000
  (12,250 objects), in ms:

  | Case                                   | Before | After | Map copies |
  | -------------------------------------- | -----: | ----: | ---------: |
  | `get_objects`, one page                |    1.6 |     — |          0 |
  | `get_objects`, all 123 pages           |    214 |     — |          0 |
  | `search_board`                         |    3.4 |     — |          0 |
  | agent: 200 commands in one transaction |    406 |    24 |    202 → 3 |
  | agent: one command of 200 (control)    |    5.3 |   4.9 |          3 |
  | that batch arriving at another peer    |    6.3 |   5.5 |          4 |
  - **The reads are not a problem.** A page costs about 1.6ms, even though
    every call sorts the whole board, so they are left as they are.
  - **The remote batch is fine.** It is what each browser pays, and it stays
    under a frame.
  - **The agent's transaction was the real cost.** Two fixes:
    - The dispatcher now copies the object map once per transaction instead
      of once per command.
    - `CreateObjects` finds the top of a container with `lastChildOrder`, one
      pass, instead of sorting all children to read the last one.
  - **What is left** is one scan per command. Only the agent's own process
    pays it.

- **Tool metadata moved into the registry** (structural, chosen by the owner):
  - **What was wrong.** A type made from the rail declared its tool in seven
    places: the `Tool` union, the keymap, the pointer controller's `if`s, the
    cursor table, and the rail's groups, icons and flyouts. All seven compared
    `tool === 'shape'`, which the rule 5 scan could not see.
  - **What changed.**
    - A type now declares its tool on its view, as `ObjectViewDefinition.tool`.
      It holds the label, keys, order, placement, icon, cursor, and any options
      with their picker.
    - Every caller reads that declaration through `views.tools()`.
    - `shapeKind` and `tableSize` became one `toolOptions` map.
    - The shape and table pickers moved to `controls/`.
    - Image stays a chrome button, because it is a file chooser with upload
      validation rather than a placement.
  - **How it was checked.**
    - The widened rule 5 scan failed on the nine tool comparisons before the
      change.
    - The rail goldens did not move, and the rail and tool e2e specs pass
      unchanged.
    - Giving `decision` a tool in its view alone put it on the rail with a
      working key and placement.
- **The gesture hook split into one module per mode** (structural, chosen by
  the owner):
  - `use-canvas-gestures.ts` went from 1,659 lines to about 700. Each mode now
    lives in `canvas/gestures/` as a `GestureHandler`, with a `move` for the
    preview and a `commit` for its one command.
  - The modes are pan, marquee, draw, translate, resize, rotate, connect,
    endpoint, divider and crop.
  - A new guard, `gestures.test.ts`, checks that every mode has a handler and
    that the hook branches on no mode by name. It failed on 11 such branches
    before the split.
  - Rule 17's drag delta now has unit tests, with an off-grid neighbour.
  - Escape and a blurred window now call the same `abandon` as every other
    interruption, instead of a copy of it.
  - No behaviour change: the e2e specs for every mode pass.
- **The interaction store split into slices** (the last structural item):
  - `interaction-store.ts` was one 739-line `create()`. It is now six slices in
    `interaction/store/`, joined into the same single store: tools,
    selection, viewport, gesture, discussion and chrome.
  - None of the 43 files that use it changed.
  - `slices.test.ts` holds every key to one slice, because a spread keeps the
    later of two keys silently. A duplicated `drag` key failed it.
  - With this, the review programme's structural track is complete.
- **Multi-step edits became core commands** (the first of the follow-ups):
  - Group, ungroup, align, distribute, duplicate and derive were assembled
    inside `hooks/use-commands.ts`, where only a browser could test them and
    only the web app could perform them.
  - They are now `GroupObjects`, `UngroupObjects`, `AlignObjects`,
    `DistributeObjects`, `DuplicateObjects` and `DeriveObject`, with 19 tests
    that failed before the handlers existed.
  - The handlers compose the existing ones through `sequence`, over an overlay
    rather than a copy of the board. A copy-count test holds them to a plain
    command's cost, and failed when the overlay was swapped for a copy.
  - The hook keeps only what a view knows: the selection, where a derived card
    goes on screen, and what to select or reveal afterwards.
  - Next: MCP tools on these commands, then a services layer for `app/`, e2e
    fixtures, and cross-browser runs.
- **MCP tools on the composite commands:**
  - `group_objects`, `ungroup_objects`, `align_objects`,
    `distribute_objects`, `duplicate_objects` and `derive_object` each dispatch
    one core command, under the label the web uses.
  - `get_board` now lists `derivations` for the types on the board, because
    `derive_object` refuses any pairing a type does not declare.
  - The contract suite covers the new tools through `VALID_CALL`.
    `shape.test.ts` has 10 tests. A rooms test has an agent group two notes and
    a person revert it; with the tool removed, that test failed.
- **A services layer for `app/`, part one** (item 2, PR 2a):
  - Everything the interface can ask of the outside world is now a port in
    `runtime/services.ts`: rooms, accounts, remote boards, discussion,
    workspaces, and the board and password use cases. The composition root
    builds one bundle and provides it around BOTH routes, so the front door,
    which has no board runtime, gets it too.
  - The rooms worker's HTTP moved into `adapters/room/room-client.ts`, which
    is handed its `fetch`. The use cases in `app/` take their dependencies and
    keep the order and the wording. Their tests hand in fakes instead of
    `vi.mock` and a replaced global, and `board-password.ts`, previously
    untested, has 13 tests.
  - The Supabase config moved into the adapter, which had been importing it
    from `app/`. The new `adapters-do-not-import-app` rule and the
    `io-boundary.test.ts` scan (no bare `fetch(` above the adapters) each
    failed once on purpose.
  - Part two moves the hooks and the remaining ui imports onto the services,
    deletes the re-export modules, and adds the rule that makes it stick.
