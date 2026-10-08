---
version: 1
slug: "apps-web-src-ui-sessiontimer-tsx"
primary_target: "apps/web/src/ui/SessionTimer.tsx"
related_targets: ["apps/web/src/ui/Session.tsx"]
---

THESIS: One clock for the whole room. It must be readable from across the
table without opening anything, never jitter, and never disagree between two
devices — the time is the room's, not this browser's.

MODE: Operate. Set once by a facilitator, glanced at by everyone for the length
of an exercise. The readout outranks the controls.

PLACEMENT: the Timer section of the Session pill, beside the people on the
navigation bar; the session is about the room, not the board. Alt+T opens the
sheet at the timer. A viewer gets no pill until there is a timer to watch.

THE PILL: "Session" at rest. Running, the time in mono, tabular, with the
control edge, and "5:00 · ♪" while music plays. Paused, two bars and a muted
time, and its name says "paused". At zero the accent's wash and edge until
somebody resets it — the Inbox's "look at me".

THE SHEET: a large readout and who last touched it ("Started by Ada"); for an
editor five presets in minutes, a duration field taking minutes or `m:ss`,
Start, or Pause / Resume, +1 min and Reset. Reset is outside the board's undo,
so the sheet offers Undo reset in its place until anything else is done.

TIME: the room's clock, never this device's. The readout rounds UP, so 0:00
only once time is up. "1 minute left" and "Time's up" are announced once per
run on every device. At zero a synthesised two-note chime; where the browser
will not sound it, the pill pulses in colour, not movement.

KEYBOARD: the sheet takes the keyboard on arrival, keeps Tab inside, and hands
it back on Escape; focus stays on the control pressed through start, pause,
resume and reset.

NOT: a second clock per device; a countdown that hides 0:59 behind 0:00; an
alarm that moves under reduced motion; a timer that a viewer can start.

FINISH: `session-timer.spec.ts` holds running down, the minute warning once per
run, pause and resume, surviving a reload, the keyboard, Alt+T, the paused
look and undoable Reset; `e2e-rooms/session-timer.spec.ts` holds two devices,
one with a skewed clock, agreeing; the "the session timer" golden holds its
look in both worlds. Critique 2026-10-07: 26/40. DESIGN.md: Session Timer.
ADR 0017.
