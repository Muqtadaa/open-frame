# ADR 0017 · Facilitation state is outside the document

**Status:** Proposed · 2026-10-04 · awaiting the owner's acceptance; built in
PR B (the session timer). Cites ADR 0016.

## Context

A facilitator running an ideation session needs things that belong to the
SESSION rather than to the board: a countdown everybody sees, and next, music
everybody hears. They have three properties no board object has:

- **They are not content.** Nobody wants "Start timer" in their undo history,
  copied with a selection, exported, or kept in the board's file. An undo
  that stopped somebody else's countdown would be taking back something that
  was never an edit.
- **They are about time, and every device's clock is its own.** Two laptops a
  minute apart must still agree, to the second, on what is left.
- **A local board has them too.** A facilitator using a board nobody else is on
  still wants a timer, and one that survives a reload.

Rule 3 says all persistent mutation goes through `CommandDispatcher.dispatch`.
The dispatcher's job is the board: commands produce patches against
`BoardDocument`, and patches are what undo, autosave and the room carry. None of
that fits a countdown.

## Decision

**Facilitation state lives in its own Yjs root map, `facilitation`, written
through `BoardConnection` and never through the dispatcher.** It is the second
stated exception to rule 3, after the change log (tracks A-2), and made the
same way:

- **Its own root map, not `meta`.** The room relays and stores every root map
  without reading it (ADR 0016), and an older client observes `objects` and
  `meta` only, so it carries this along and never turns it into an edit.
- **The room gates the writer; every reader checks the content** (ADR 0016).
  A viewer's writes never reach the room. What an editor wrote is read through
  a strict reader (`readTimer`, `@openframe/core/facilitation`), because any
  editor can write anything there. A record that fails is read as no timer.
- **One record per thing, replaced whole.** Two people pressing at once is
  settled by Yjs picking one record, never by merging halves of two.
- **The rules are pure and shared.** `@openframe/core/facilitation` holds the
  timer's shape and its transitions (start, pause, resume, reset, add a
  minute). A shared board and a local board run the same ones.

**Every time is the room's clock.** The room answers a new message,
`MESSAGE_TIME` (3): the client sends `[3, sentAt]` and the room replies to that
client alone with `[3, sentAt, roomNow]`. The client keeps the offset from the
quickest of its last eight round trips (`ServerClock`), asks three times on
connecting, again every five minutes and whenever the page becomes visible.

- **"Done" is never stored.** It is a fact about the clock (`now ≥ endsAt`),
  and a stored one would be wrong on every device that read it a moment late.
- **A run counts starts**, so a finish is announced and chimed once per run on
  every device, however many renders happen past zero.
- **Safe across a rolling deploy.** An older room drops a message type it has
  not met, so a newer client stays on its own clock. An older client never
  asks, so it is never answered.

**A local board keeps its timer in this browser** (`localStorage`, per board)
on this device's clock. The interface reads one port, `FacilitationChannel`,
chosen once by the composition root, so no component asks which kind of board
it is on.

## Alternatives considered

- **A board object for the timer.** Rejected. It would be undoable, copyable,
  exported and drawn by the renderer's machinery, every one of which is wrong,
  and each would need a special case to switch off.
- **Commands that skip undo.** Rejected. The dispatcher writes `BoardDocument`;
  a timer is not part of it, so the command would be a patch against nothing.
  And autosave would write the meeting's state into the board's file.
- **Presence (awareness) for the timer.** Rejected. Presence is per peer and
  vanishes with the socket: the timer would end when its starter's laptop
  slept, and a newcomer would have to be told by whoever happened to be there.
- **Each device's own clock.** Rejected. Clocks routinely disagree by seconds
  and sometimes by minutes; the rooms suite runs one a minute and a half fast
  and the two pills were ninety seconds apart without the room's clock.
- **The room running the countdown itself.** Rejected. It would need alarms,
  state and schema knowledge in the Durable Object, which ADR 0016 keeps
  schema-agnostic; one number (the time) is all the room has to say.

## Consequences

- A modified editor client can write a nonsense timer; every reader shows none.
- Facilitation state is persisted with the room like any root map, so a timer
  still running is still running for whoever opens the board next.
- When this ADR is accepted, music (PR C) goes in the same map.

## When to revisit

- If facilitation state needs history or undo (it should not).
- If a host role arrives: today any editor can run the timer.
