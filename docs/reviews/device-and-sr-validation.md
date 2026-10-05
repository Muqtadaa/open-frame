# Device and screen-reader validation

← [Documentation index](../README.md) · [Current audit](audit-2026-10-02.md)

A checklist for people to run on real hardware and real assistive technology.
Automation cannot do this part: the browser suites drive Chromium, Firefox and
WebKit with synthetic input and read the accessibility tree, but they never
hear what NVDA or VoiceOver actually says, feel a trackpad's inertia, or draw
ten thousand objects on an integrated GPU.

This is **validation, not another accessibility rewrite** (audit 2026-10-02).
A pass records what happens, and every finding is filed with the severity rule
at the end. Fixes go in their own changes, after the findings are in.

Paths are relative to `apps/web/src` unless they say otherwise. The expected
text is quoted from the source, so if a run hears something different, either
the build is different or that is the finding.

---

## Before a run

- **Build.** Use a preview deployment, or locally
  `pnpm --filter @openframe/web build && pnpm --filter @openframe/web preview`
  (the root has no `preview` script), not `pnpm dev`: the production build is
  what carries the content security policy and the minified stylesheet.
  Record the commit.
- **Boards.** One shared board, signed in, with at least one other person (or
  a second browser) on it, so the comments and presence steps have someone to
  hear. Put on it:
  - a sticky note, a text, a frame holding two notes, a table and a connector;
  - an evidence slip with a source, a participant and a tag, linked to an
    insight that cites it;
  - a poll card with two options.
- **For the weak-GPU pass**, a bench build: `pnpm build:bench` (it runs
  `pnpm bench:fixtures` first). Its DevPanel loads the sticky-note boards. The
  mixed boards (`board-mixed-*`, with connectors and groups, which are the
  realistic ones) are built and served at `/bench/board-mixed-{n}.json`, but
  nothing in the panel loads them yet.

## The matrix

One row per run. Each row names the passes that apply to it, and is done when
those have a result; a pass that does not apply to the device is not run and
does not count against it.

| Device and browser                         | Assistive tech | Passes                                | Date | Commit | Tester | Result | Findings |
| ------------------------------------------ | -------------- | ------------------------------------- | ---- | ------ | ------ | ------ | -------- |
| Windows, Firefox                           | NVDA           | workflow, newer surfaces, preferences |      |        |        |        |          |
| Windows, Chrome                            | NVDA           | workflow, newer surfaces, preferences |      |        |        |        |          |
| macOS, Safari                              | VoiceOver      | workflow, newer surfaces, preferences |      |        |        |        |          |
| iPadOS, Safari                             | VoiceOver      | workflow, newer surfaces, touch       |      |        |        |        |          |
| iPhone, Safari                             | VoiceOver      | workflow, newer surfaces, touch       |      |        |        |        |          |
| Android, Chrome                            | TalkBack       | workflow, newer surfaces, touch       |      |        |        |        |          |
| Windows laptop, integrated GPU, Chrome     | none           | integrated GPU                        |      |        |        |        |          |
| High-DPI display with a precision trackpad | none           | trackpad and high-DPI                 |      |        |        |        |          |

"Workflow" is the eleven steps below; the other passes are the sections under
[The newer surfaces](#the-newer-surfaces) and [Device passes](#device-passes).
Result is **pass**, **pass with findings** or **blocked** (a step in one of the
row's passes could not be finished at all).

---

## The screen-reader workflow

Eleven steps, in order, keyboard and screen reader only. For each, what to do,
what should be heard, and what the source already suggests may go wrong. A
"confirm" line is a suspicion read off the code, not a finding: a run either
confirms it or clears it.

### 1. Open a board

- **Do.** From the front door, find the board in "your boards" and open it.
- **Expect.** The front door is a `main` with the heading "OpenFrame" and a
  section headed "your boards". Each board is a link whose name runs together
  the title, its tag ("this browser", "view only", "yours" or "shared with
  you", with " · password" when it has one) and its date (`ui/BoardRow.tsx`).
  Opening is a page load.
- **Confirm.** Nothing takes focus when the board arrives, and nothing is
  announced (`canvas/BoardAnnouncer.tsx` skips its first run on purpose). Note
  where focus starts and how many presses it takes to reach the board.

### 2. Identify the board's title

- **Expect.** The page title is "{title} — OpenFrame". The first heading is
  the board's name, an `h1` inside the navigation landmark "Board". To an
  editor it is a button named with the title and described as "Rename"; to a
  viewer it is text (`ui/BoardTitle.tsx`).
- **Check.** Renaming: Enter commits, Escape reverts, and focus comes back to
  the name either way.

### 3. Navigate objects

- **Do.** Tab to the canvas, then Tab and Shift+Tab through the objects.
- **Expect.** The canvas is one focus stop, an application named "Board",
  described with its keys ("Tab: next object. Arrows: move. …", `canvas/Canvas.tsx`).
  Tab selects the next object in reading order (rows, then left to right;
  members of a frame are stops of their own, members of a group are not) and
  the board says "Selected: {summary}" (`canvas/BoardAnnouncer.tsx`). Past the
  last object, Tab leaves the canvas.
- **Summaries** come from each type's `describe()` in `packages/core`: a
  sticky's text or "Empty sticky note"; a table's "{c}x{r} table: …".
- **Confirm.**
  - Objects are heard only through that announcement: none of them takes
    focus itself, so browse mode or the rotor finds the group labels but cannot
    act on them. Record whether that is usable, not only whether it works.
  - Arrow keys move the selected object rather than moving between objects,
    and the move is not announced. Note whether a tester expected otherwise.

### 4. Understand an evidence object

- **Do.** Tab to the evidence slip.
- **Expect.** "Selected: {the quote}". On the board the slip's group is named
  "Evidence. {participant} · {source}. #{tag}" (`views/EvidenceView.tsx`).
- **Confirm.** The announcement does not say "Evidence", so a quote and a
  sticky note with the same words sound the same. Record whether the tester
  could tell what kind of object it was without opening the record panel.

### 5. Open its record panel

- **Do.** With the slip selected, move to the record panel.
- **Expect.** The panel opens on selection; there is no key for it. It is a
  group "Selected object properties" with an `h2` naming the type
  ("Evidence"), a summary, an `h3` "record", and fields named "Source",
  "Participant" and "Tags" (`ui/Inspector.tsx`, `ui/RecordFields.tsx`). It is
  reached by Tab after the canvas's last object, which on a busy board is a
  long way.
- **Check.** Choice rows are radio groups, one stop, arrows move and wrap.
  "Delete selection" is the last stop.

### 6. Inspect provenance

- **Expect.** Two lists in the panel, "stands on" and "cited by", each entry a
  button named with the other object's summary (`ui/Provenance.tsx`).
  Activating one selects that object and pans to it; the board says
  "Selected: …".
- **Confirm.** Nothing in the code decides where focus goes after the jump.
  Record where it lands and whether the tester could keep following the trail
  from there.

### 7. Follow comments

- **Do.** Press M to open the comments; open a thread; reply; close.
- **Expect.** A complementary landmark "Comments" (`ui/CommentPanel.tsx`)
  whose heading reads "Comments", "New comment" or "Comment". "Previous
  comment" and "Next comment" step through threads. The reply box is "Your
  reply"; Mod+Enter posts, Enter is a new line, Escape closes and keeps the
  draft. Someone else's comment is announced as "{author} commented" or
  "{author} replied" (`app/Comments.tsx`). Closing returns focus to where it
  was, or the canvas.
- **Check.** Pins on the board are buttons named "Comment from {author}:
  {text} ({n} messages)" (`canvas/CommentLayer.tsx`). Mentions: the bell is
  "{n} unread mentions", and typing @ in a reply says "{n} matches".

### 8. Hear somebody else editing

- **Do.** Have the other person start editing a note's text.
- **Expect.** "{name} is editing {summary}" (`scene/presence.ts`,
  `canvas/PresenceLayer.tsx`).
- **Confirm.**
  - That is all presence says: nothing for joining, leaving, selecting or
    moving. Who is here is in the share control, as faces named by person or
    "Follow {name}" buttons.
  - The region is created empty and filled later, which is the pattern that
    works; confirm it is actually spoken on each reader.

### 9. Search for an object

- **Do.** Mod+F, type part of the evidence quote, arrow to it, Enter.
- **Expect.** A dialog "Find on board" with a combobox of the same name,
  focused on open (`ui/SearchPanel.tsx`). The count is spoken: "{n} found",
  or "nothing found — try type:sticky or type:evidence". Up and Down move
  through the results. Enter selects the object, pans to it and closes, and
  the board says "Selected: …".
- **Confirm.** If focus was on the page body when search opened, nothing is
  re-focused when it closes. Try opening search straight after step 1.

### 10. Recover from a modal or a gate

- **Do.** Open a board that has a password with a wrong password, then the
  right one. Also open the timer and press Escape.
- **Expect.** The password gate is an alert dialog "This board has a
  password", with the rest of the page inert and Tab kept inside it
  (`ui/Gate.tsx`, `ui/BoardLocked.tsx`). A wrong password is announced as an
  alert and puts focus back in the field. Gates have no Escape, by design; the
  way out is the "All boards" link. Sheets in the bar (timer, music) close on
  Escape and return focus to their button.
- **Confirm.** The clustering review and the dot-voting setup do not hand
  focus back when they close. Record where it goes.

### 11. Return to the board

- **Expect.** Ending an edit, closing the record panel, search, comments or
  the context menu all put focus back on the canvas or on what opened them.
  `e2e/focus-return.spec.ts` covers the first two in Chromium; this step is
  whether the screen reader announces the return sensibly.

---

## The newer surfaces

Each of these has keyboard tests in Chromium; the run is about what is heard.

| Surface   | Reach it                                    | Expect to hear                                                                                                | Confirm                                                                                                                       |
| --------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Reactions | Select one object, Shift+F10, "React"       | Toggle buttons "Agree", "Love it", … "More reactions"; the picker is a dialog "Emoji"                         | A chip's name is its glyph only, so the count is not heard; toggling a reaction is not announced                              |
| Timer     | "Timer" in the bar                          | "Timer, {m:ss} left"; "1 minute left" and "Time's up" from the board's announcer                              | The countdown inside the sheet updates every second: is it read out every second? The chime has no mute of its own            |
| Music     | "Music" in the bar                          | "Music, {genre}, playing" or "paused"; a "Genre" radio group; Play, Pause, Stop                               | **Nothing plays until this device presses Play or "Listen here"**; Mute and Volume appear only after that. Confirm on iOS too |
| Voting    | Shift+F10, "Dot voting"                     | The banner's status: "{n} of {m} votes left", "Voting open", "Voting ended"; dots read "{n} votes, {m} yours" | Whether the status is spoken when voting starts, since it appears with its text                                               |
| Poll      | Tab to an option, Enter                     | "{label}", then "{label}, {n} answers" once results show                                                      |                                                                                                                               |
| Clusters  | Select notes, Shift+F10, "Cluster with AI…" | "Clustering {n} notes…", then a list "Themes"                                                                 | Escape closes it without returning focus                                                                                      |

---

## Device passes

### Touch (iPad, iPhone, Android)

- One finger moves a note; a second finger landing mid-drag abandons the drag
  and pinches instead, and the note goes back where it was (rule 28).
- Pinch zoom and two-finger pan feel continuous and never zoom the page itself.
- On a landscape phone the rail scrolls and its last tool is reachable.
- Targets are 40px under a coarse pointer; note any control that is hard to hit.
- With VoiceOver or TalkBack on, the canvas is still usable: record what a
  double-tap and a swipe do on it.

### Trackpad, high-DPI

- Two-finger scroll pans; pinch zooms the board and never the browser
  (rule 13). Cmd/Ctrl +, −, 0 and 1 zoom the board, not the page.
- At 400% and above, handles stay small and crisp and do not overlap on a small
  object (rule 24).
- Momentum after a fast pan stops cleanly and does not jump.

### Integrated GPU

- Load the 10,000-object board from the DevPanel. Pan and zoom continuously
  for thirty seconds, then drag a selection of a few hundred objects.
- It is sticky notes only, the cheapest object to draw (rule 10), so a smooth
  result here is a lower bound. Record that the mixed board could not be
  loaded; a button for it is a small change to `ui/DevPanel.tsx`.
- Record whether it stutters, and the DevPanel's readout (fps, p50 and p95 frame
  time). The budgets the nightly holds are in `tools/bench/budgets.ts`; this
  pass is whether a real machine meets them.

### Preferences the system sets

- **Reduced motion** on: nothing slides or settles; the app's own tests check
  that every animation has a reduced-motion form.
- **Larger text** (browser default font size 24px): the interface grows, the
  board's content does not (`e2e/text-size.spec.ts` checks this in Chromium).
- **High contrast / forced colours** (Windows): the stylesheet has no
  `forced-colors` rules at all, so this is untested. Record whether selection,
  handles and focus rings are still visible.

---

## Already automated

What the browser suites already prove, so a run can spend its time elsewhere.
All in `apps/web/e2e/`.

- **Landmarks and order:** `landmarks` (main "Board" holds the canvas and the
  tools, the board's name is the first heading).
- **Keyboard:** `rail-keyboard`, `keys-at-load`, `sheets-keyboard`,
  `comment-keys`, `escape-keeps-words`, `search`, `inspector` (record panel
  order and radio rows).
- **Focus:** `focus-return`, `board-password` (trap, naming, focus after a
  wrong password), `board-unreadable`.
- **Small screens and touch:** `touch`, `phone-width`, `rail-overflow`,
  `text-size`.
- **The newer surfaces:** `reactions`, `dot-voting`, `poll`, `ai-cluster`,
  `session-music` and `session-timer` each drive their keyboard path.

None of these hears a screen reader, and they run with synthetic input.

---

## Filing a finding

One issue per finding, titled with the step or pass it came from, holding:

- device, browser, assistive tech and their versions, and the commit;
- what was done, what was expected (quote this page), what happened instead,
  and a recording or the reader's speech viewer output where possible.

**Severity.**

- **Blocks**: the step could not be finished without sight or a mouse, or work
  was lost. Fixed before new features in the same area.
- **Degrades**: it could be finished, but only by knowing a workaround, or
  what was heard was wrong or misleading.
- **Polish**: it worked and was understood, but was slower or noisier than it
  needs to be.

When a run is done, fill in its row in the matrix above and link the issues
from it.
