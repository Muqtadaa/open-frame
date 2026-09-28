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
