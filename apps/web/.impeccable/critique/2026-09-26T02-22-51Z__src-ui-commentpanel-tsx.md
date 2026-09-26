---
target: "comments, mentions, presence (C3 #5)"
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/home/user/open-frame/apps/web/src/ui/CommentPanel.tsx"
target_fingerprint: "sha256:24bfbfce58103b988e5b67ffc356e6bc5f7a76026b47b9304db52e4a19b10176"
target_path: /home/user/open-frame/apps/web/src/ui/CommentPanel.tsx
timestamp: 2026-09-26T02-22-51Z
slug: src-ui-commentpanel-tsx
---
Method: dual-agent (A: design review · B: detector + browser measurements), live two-person room, both worlds, 1280 and 760.

Target: C3 #5 — comments (ui/CommentPanel.tsx, canvas/CommentLayer.tsx), mentions (ui/MentionPicker.tsx, MentionText.tsx, Mentions.tsx), presence (canvas/PresenceLayer.tsx, the nav bar's faces and room chip).

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 2 | No remark, list row or mention says when; no live region announces a reply or a new thread (0 announcements measured) |
| 2 | Match System / Real World | 3 | Plain words; "Shared" is a status word that copies a link when pressed |
| 3 | User Control and Freedom | 1 | Escape, or a click on another spot/pin, throws the draft away; no way back from a thread to the list; mentions list cannot be dismissed |
| 4 | Consistency and Standards | 2 | Escape keeps words everywhere else; open pin uses the alignment-guide hue; bell mono in the nav, sans on the front door; list click does not pan, mention click does |
| 5 | Error Prevention | 2 | Stranger detection and the picker prevent well; drafts unprotected; you are the first, pre-highlighted mention option |
| 6 | Recognition Rather Than Recall | 2 | Mod+Enter never shown; Follow only in a tip on a 22px initial; pin names carry no excerpt |
| 7 | Flexibility and Efficiency | 2 | No keyboard way to start a comment; no edit/delete; no next/previous thread |
| 8 | Aesthetic and Minimalist Design | 3 | Quiet and in the paper world; the bell is the loudest thing in the bar; a three-line hint under every composer |
| 9 | Error Recovery | 2 | Clipboard failure shows the link (good); "That could not be changed."; room chip's copy failure is silent |
| 10 | Help and Documentation | 2 | "Type @ and a name…" and "Click anywhere to start." exist; shortcuts unnamed |
| **Total** | | **21/40** | **Acceptable** |

## Design Specificity Verdict

**LLM:** half-authored. Presence is OpenFrame's own — a name riding every peer outline, dashed for "selected" and solid for "editing", a contrast-tested peer palette kept off the meaning-carrying hues, drag offsets that ride the object. The comment panel is the category's stock card, and the product premise (async, cross-functional, provenance) does not reach it: nothing says when, how many, or links a discussion into the object model. There is no DESIGN.md section and no surface contract for any of it, and the drift below follows.

**Deterministic:** CLI detector 0 findings across the 8 files. Overlay: one true positive — `low-contrast` on the mention-menu face initials, confirmed by hand at 1.5–3.0:1 in both worlds (`--of-ink` on the hue; every other face uses page stock). False positives: `text-overflow` on the nav faces (the tip text), `gray-on-color` on the panel title (13.8:1), "cyan neon" on mention chips (the world's accent, 8:1). axe: one in-scope minor, `aria-allowed-role` on `<textarea role="combobox">`. No 999px pills — the suspected pills are gone; radii are 10/6/4px and circles.

## Overall Impression

Presence is the best-authored thing in the product's collaboration story. Comments are where it falls down: a remark can be lost to Escape, cannot be started from the keyboard, and never says when it was written — in a product for people who "are not online at the same time".

## What's Working

1. Presence names people, not colours; dashed/solid reads at a glance; tags 5.2–10.2:1 across all hues and both worlds; nothing stale 1s after a peer leaves.
2. The mention picker is a real combobox: focus stays in the sentence, arrows wrap, Tab/Enter choose, Escape closes only the menu; a stranger's name becomes an inline invite.
3. Pins ride their object on the apparatus layer, keyboard-reachable with a focus ring, and a discussion survives its object's deletion with an honest notice.

## Priority Issues

**[P0] Drafts are thrown away.** Escape calls close(); the panel is keyed on its target (`Comments.tsx:80`), so closing — or clicking another spot or pin — remounts it and the draft is gone. Measured: a considered comment, Escape, reopen: "". Same for a half-typed reply. This is the failure C3 #4 removed from every other editor. Fix: keep drafts per target above the keyed panel, restore on reopen, clear on post; Escape closes and keeps. **Command:** /impeccable harden

**[P1] Not reachable or recoverable by keyboard.** A comment can only be started with a pointer. Post, Close, Escape and Resolve all drop focus to body; focus never returns to the pin or the tool. The panel sits last in DOM, after the zoom cluster. The mentions list gets no focus, no role or label, and ignores Escape and outside clicks (front door and board). No live region: a reply arriving in your open thread announces nothing. Fix: M with a selection opens a composer on it; focus returns to its origin; the mentions list becomes a sheet like account/share; a polite live region for arrivals. **Command:** /impeccable harden

**[P1] An async product whose comments do not say when, how many, or where.** No time on remarks, list rows or mentions (createdAt is in the data); list rows show no reply count; a list click opens the thread without panning to its pin (mentions do pan). Fix: "how long ago" in 12px mono on every remark, row and mention; rows read author · time · N replies · excerpt; list clicks go through focusComment. **Command:** /impeccable clarify

**[P2] Reading a thread steals the keyboard, and has no way back.** Opening a pin to read it focuses Reply, so board shortcuts type into it (a stray "v" in the capture); Close closes everything. Fix: focus the thread heading when reading; an "All comments" back control. **Command:** /impeccable layout

**[P2] No direction, and the drift that follows.** Open pin in the alignment-guide hue; the bell a solid accent block, mono in the nav and sans at home, 24px tall; nav faces 22×22 overlapping by 4px (below the 24px minimum) under a CSS comment that says they are not targets; `gap: -2px` is invalid; mention-menu initials 1.5–3.0:1; pin's tail sits 26px below the spot it points at. Fix: a surface contract and a DESIGN.md section; pin in ink/accent; bell quiet unless unread; faces 24px without overlap; initials on page stock. **Command:** /impeccable polish

## Persona Red Flags

**Alex (power user):** no keyboard comment on a selection; Mod+Enter unannounced; no edit/delete; no next/previous thread; reading steals shortcuts; "Shared" silently copies whichever link you arrived on.

**Sam (keyboard/screen reader):** cannot create a comment; focus to body after every close or post; mentions list unreachable and undismissable; nothing announced when someone replies; pin reads "1 replies" and its number disagrees with its name; the presence layer is aria-hidden entirely.

**The researcher back three days later:** no dates anywhere, so fresh and stale discussion look the same; a list row does not take her to the pin; her own name in a mention on the front door is not highlighted.

## Minor Observations

- Pin count is messages (replies + 1) while its name counts replies; "1 replies".
- Pins use `title=` — the one place in scope — instead of data-tip + aria-description.
- A dismissed mention menu never reopens at that position, even after retyping.
- You can mention yourself; you are the first option.
- A picked name adds a space, so "@Rowan  in" doubles it.
- A remark's avatar initial is read out ("M Muqtadaa Miandara"); a list entry's name and body run together.
- Disabled Reply/Comment read as a faded primary (1.9 / 2.5:1).
- The panel's right edge is 8px off the navigation bar's.
- A ghost "G" face appeared once after a reload (unconfirmed).
- "That could not be changed." and "A board you are a member of takes comments." say little.

## Questions to Consider

- A comment knows when it was written. Why does a product built for people who are not online together refuse to say it?
- Should a resolved thread be able to become a Decision that cites its discussion — bringing the one place a team reconciles vocabulary into the object model?
- Does presence need to be a row of buttons, or one "2 here" readout that opens a sheet of names with Follow?
