---
version: 1
slug: "apps-web-src-ui-sessionmusic-tsx"
primary_target: "apps/web/src/ui/SessionMusic.tsx"
related_targets: ["apps/web/src/ui/Session.tsx"]
---

THESIS: Music the room shares, offered rather than imposed. The same track at
the same place on every device that has said yes, and nobody surprised by
sound they did not ask for — so the prompt does the inviting and the sheet
does the controlling.

MODE: Operate. Started by one person in a second, and then left alone. The
listen prompt matters more than the sheet, because it is what everybody else
sees.

PLACEMENT: the Music section of the Session pill, present only where there is
a library to play from. The listen prompt hangs under the pill. While music
plays or is paused the pill carries a note.

THE SECTION: the genres that have tracks, one stop of pressed toggles walked
with the arrows, the playing one in the accent's wash; what is playing —
title, artist, "CC0", the time into the track in mono. An editor gets the
track before, Play or Pause, the next one, and Stop. Everybody gets this
device's Mute and volume, kept in this browser and never sent.

THE PROMPT: "Ada started the music", Listen and a dismiss. It never takes
focus and is announced once. Waved away, the pill keeps saying so — the accent
edge, a dot, "not playing here" in its name — and the sheet keeps "Listen
here". Once a browser has said yes, later music joins on its own, or on the
next press anywhere where the browser insists on one; a refused join waits for
a press rather than retrying.

KEYBOARD: Escape waves the prompt away and puts the keyboard on the pill; the
sheet takes the keyboard on arrival and hands it back.

NOT: autoplay that claims to play while silent; a prompt that steals focus; a
volume that is anybody else's business; a genre offered with nothing in it.

FINISH: `session-music.spec.ts` holds no library, playing and stopping, genres
from the library, the arrows, the volume target, mute through a reload, the
prompt and its memory, skipping tracks and a refused join;
`e2e-rooms/session-music.spec.ts` holds a second device hearing the same track
at the same place; the "the session music" and "the listen prompt" goldens
hold their look in both worlds. Critique 2026-10-07: 27/40. DESIGN.md: Session
Music. ADR 0017.
