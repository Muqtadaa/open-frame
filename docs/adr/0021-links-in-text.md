# ADR 0021 · A link is a span's target, not a mark

**Status:** Accepted · 2026-10-08 · the editing gestures chosen by the owner
(2026-10-08): Mod+K and a format-bar button, pasted addresses become links,
Mod+click opens one on the board. Cites ADR 0012, ADR 0014, rules 3, 8 and 21.

## Context

Rich text had four marks and no links (ADR 0012 left them open). A note that
says "see the pricing page" could not take anyone there, and an evidence
slip's source could not lead back to the recording it came from. A link is
near-universal in the tools people compare a board to.

A link is not like bold. A mark is on or off; a link has a VALUE, and two
runs going to different places are different formatting even when everything
else about them is the same.

## Decision

**`TextSpan.link?: string`** — the run's target, beside its marks and size.

- **Checked at the boundary** (rule 8) by `safeLink` in core: `http:`,
  `https:` and `mailto:` only, no whitespace or control characters, at most
  2048 characters. A scheme a browser would run (`javascript:`, `data:`) is
  refused rather than escaped, and so is anything relative, which would
  resolve against whichever page drew it. Never on a newline.
- **Formatting, compared by value.** `normaliseText` never merges two runs
  that go to different places; marks and sizes keep the link through every
  edit. `applyLink` links or unlinks a range (newlines inside it stay
  unlinked), `linkOf` reads the one target a range goes to.
- **Additive, no `dataVersion` bump** — the ADR 0014 precedent. A build from
  before this refuses a span with `link` in it: a peer on an older build does
  not see that object until it reloads, and an older tab opening a board
  saved since quarantines it read-only (rule 7). Nothing is lost either way.
- **Collaboration needs nothing:** spans are JSON in the object's map.

**Editing.** One editor for every text (ADR 0014), so every text gets it:

- **Mod+K or the Link button** opens an address field in the format bar,
  holding the current target if there is one. Enter links the selection; an
  address the board may not hold is refused in place ("Not a web or mail
  address"); emptied, or "Remove link", it unlinks. A caret with nothing
  selected inserts the address as its own words, linked.
- **Pasting an address** over selected words links them; at a caret it
  arrives linked. **Pasted markup** keeps its `<a href>` targets that pass
  `safeLink`; the rest arrive as words with no target.
- **Table cells** offer the field while a cell is being typed in.

**On the board.** A link is drawn in the text's own ink, underlined in the
accent, as `<a rel="noopener noreferrer" target="_blank">`.

- **A plain click selects**, as it does anywhere on a note. The browser never
  follows a link here by itself — a note that navigated away when somebody
  reached for it would be a trap.
- **Mod+click follows it**, in a new tab with no opener and no referrer, and
  only when the press did not move (Mod is also the snap override, so a
  Mod-drag that happens to start on a link moves the note).
- **Activation with no pointer** (`detail === 0`: Enter on a focused link,
  or a screen reader's "activate") follows it too, which is how assistive
  technology reaches a link.
- The address is put through `safeLink` again before `window.open`: the DOM
  is not the document.

**Export** writes a Markdown link for each stretch of words that go to one place.

## Rejected

- **A link as a fifth mark plus a side table of targets:** two places a link
  would live, and an edit to one could leave the other pointing nowhere.
- **Following a link on a plain click:** see above. Selecting is the board's
  primary gesture and stays so.
- **A tip with the address on hover, on the board:** the board's hover is the
  object's; the format bar shows the target while editing. Kept for later.
- **Searching link addresses:** search reads what the text says. Kept for
  later if people ask for it.

## Consequences

- PRODUCT.md and the parity matrix: "Link out" is shipped.
- `11-security.md` gains a row for content links.
- A new kind of formatting is a breaking change to readers of spans — the
  Markdown export and the DOM translation both learned it here, with tests.
