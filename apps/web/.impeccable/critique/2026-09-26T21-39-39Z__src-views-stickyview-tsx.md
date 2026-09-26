---
target: "object views (C3 #8)"
total_score: 24
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/home/user/open-frame/apps/web/src/views/StickyView.tsx"
target_fingerprint: "sha256:45ca5c133559f2e86c71e7256f11ae661420ecbb7b52c7ac42c4f7aa5ead3182"
target_path: /home/user/open-frame/apps/web/src/views/StickyView.tsx
timestamp: 2026-09-26T21-39-39Z
slug: src-views-stickyview-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence)

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | A promoted slip looks like a sticky until a field is filled; cites/derivesFrom never drawn |
| 2 | Match system / real world | 3 | The index-slip metaphor holds for slips; shapes and code are a generic kit |
| 3 | User control and freedom | 3 | Clipped text can be fitted; the shape editor spills a 9-line tower out of a diamond |
| 4 | Consistency and standards | 2 | Shape labels top-left against DESIGN.md's "centred"; radii 2/4/6/0; only slips carry the slip shadow |
| 5 | Error prevention | 2 | Black and white shapes and lines lose their edge (1.00–1.06:1); a label plate can hide its own text |
| 6 | Recognition rather than recall | 1 | Type is colour alone; gray means evidence, experiment, frame, shape and code |
| 7 | Flexibility and efficiency | 3 | 11-hue palette, per-span marks, spreadsheet tables |
| 8 | Aesthetic and minimalist design | 3 | Slips quiet and disciplined; counter-scaled connector labels invert the zoom hierarchy |
| 9 | Error recovery | 3 | Honest ellipsis everywhere; a designed missing-image state |
| 10 | Help and documentation | 2 | Empty sticky, text and table are blank rectangles with no hint |
| **Total** | | **24/40** | **Acceptable — a real slip system beside a generic kit, carried by colour alone** |

## Design Specificity Verdict

**LLM assessment:** partly specific. The slips earn it — square 2px corners, one slip shadow, a mono record line under a currentcolor hairline, the insight a step larger: a computation pad with index slips on it. Everything else is a flowchart kit (gray polygons, a 6px-radius code box, a plain spreadsheet, stock arrows), and the synthesis layer — typed objects and provenance, which is what OpenFrame is — is nearly invisible on a finished board. At 25% it is pastel rectangles and two oversized connector labels.

**Deterministic scan:** `detect` on src/views: 0 findings (it cannot see inline-style TSX). On styles.css, 4 findings, none on objects (the ruled home ground, the colour picker's spectrum, a user-chosen Georgia) — all known. The live overlay flagged `gray-on-color` on After Hours slips (false positive: 10–12:1 measured) and syntax colours as an "AI palette" (style heuristic; 6.6–8.6:1). The contrast sweep and browser measurements carried this run.

## Overall Impression

The slip component and the paper/ink system are genuinely good: every ink reads on every paper in both worlds, and the shape default fill against its stroke — PRODUCT.md's open gap — passes (6.45 / 7.67:1). What fails is identity and edges: a type is only a colour, gray is five things, the black and white papers lose their outlines, and the labels of lines grow as everything else shrinks.

## What's Working

1. One `StructuredSlip` for eight types, dropping empty record parts so structure is earned; its accessible name carries the record.
2. The paper/ink system: every ink on every paper passes in both worlds; code tokens 5.5–8.6:1.
3. Honest overflow: clamps with an ellipsis on stickies, slips, shapes and cells; long URLs wrap.

## Priority Issues

**[P1] A semantic type is invisible; colour is the only signal and gray is overloaded.** A freshly promoted evidence slip is pixel-identical to a gray sticky; evidence and experiment both default to gray, the same `s-gray` as the frame fill, the default shape and the code block; journey stage and a sticky are both yellow; nothing on a slip names its type (only `aria-label`); the record line appears only once a field is set; re-colouring a slip erases its type; journey stage cannot be created from the UI at all. Fix: a permanent type word in the record band (12px mono, "evidence ·", "decision · accepted"), shown even when empty; no two types sharing a default; the frame's fill off gray. `/impeccable clarify`

**[P1] Shape labels sit top-left by default, against DESIGN.md's "centred".** `ShapeView.tsx:117,126` passes `justifyAlign(undefined)` / `verticalAlign(undefined)`, both `flex-start`, overriding the CSS centring — "Pay", "Retry", "Email" hug the corner of every diamond and hexagon. Fix: centre/middle as the shape's default, and an e2e that measures where the label actually sits. `/impeccable polish`

**[P1] Connector labels invert the hierarchy, and a plated label can hide its own text.** Counter-scaled at 12px, a label is the largest text on the board at 25–51% and the smallest at 200%; and its text stays `--of-ink` on whatever plate it is given — 1.00:1 on black, 1.20:1 on white After Hours (`ConnectorView.tsx:117-119, 150-155` ignore `readableInkOn`). Fix: labels scale with the world between a screen floor and ceiling; the plate's ink comes from `readableInkOn`; guard it. `/impeccable typeset`

**[P2] Edges that vanish.** A white shape or line in the notebook is 1.06:1 on the page, a black one After Hours 1.14:1; a black or white shape's own stroke on its own fill is 1.00:1; the frame edge is 1.45 / 1.77:1 on the page; a table's inner grid 1.20 / 1.06:1 on its ground. Fix: a stroke that would vanish falls back to the readable neutral; frame edge and table grid on tokens that clear 3:1; all of it in design-tokens.test, and PRODUCT.md's gap recorded as closed. `/impeccable harden`

**[P2] After Hours: the important slips sink and white glares.** Violet (hypothesis) is 1.23:1 on the night page, blue (insight) 1.25:1, black 1.14:1, the 9% lit edge barely shows; a white slip is 17.97:1, the brightest thing on the board. Fix: a stronger lit edge and a hairline on slips in After Hours; a dimmed white paper. `/impeccable colorize`

## Persona Red Flags

**Priya (researcher synthesising):** derived slips land on top of their source cluster and the camera jumps; relations are never drawn, so "the evidence under this insight" lives only in the panel; the evidence record truncates before the participant, the most-cited field.

**Jordan (first-timer):** type by colour alone; empty sticky and table blank; journey stage unreachable; a promoted note seems to have done nothing but turn gray.

**Lee (low vision / screen reader):** record lines about 6px at 51% while line labels grow; every object's name repeats its whole body, so a 600-character note is read twice; an image whose alt is cleared vanishes from assistive tech (`ImageView.tsx:35-58`); a table's cells have no `row`, so its roles are broken (axe critical ×10); the code block scrolls but cannot be focused (axe serious).

**Sam (After Hours):** hypothesis and insight merge with the ground; frame, shapes, code and evidence are all one slate.

## Minor Observations

- Corner radii 2 (slip, frame), 4 (image), 6 (code, the control radius), 0 (table) — DESIGN.md says stock on the page is 2px.
- DESIGN.md's "one slip height": only sticky and slip carry the slip shadow; shape, frame, table, code and image are flat.
- A sticky's line breaks change when its editor opens.
- The label halo uses `--of-bg` (the desk) rather than the page, and fringes over coloured notes.
- The code block shows "plain" in its corner by default.
- The default shape stroke is 2 world px, so 4px and heavy at 200%.
- A text object's default 240×48 box clamps to one line.
- An empty text's placeholder is 1.95 / 2.72:1.
- Frame title documented as 13px, built at 15.
- Table cells and code set content at the 12px record step; DESIGN.md says object text is off the ramp.
- A later frame paints over earlier objects it overlaps.

## Questions to Consider

- Should a type carry a fixed mark that colour cannot override?
- Provenance is the product: why are cites/derivesFrom invisible while a hand-drawn line labelled "cites" is the loudest thing at 25%?
- Shapes, code and tables: join the notebook (rule, mono labels, slip stock) or stay deliberately plain so the slips carry the identity?
