---
target_identity: "file:/home/user/open-frame/apps/web/src/app/splash.ts"
target_fingerprint: "sha256:5d756fdfbf72cafad5abc59d0f8d0e86e9664125f36c25cb22ee77ed60d6b1c4"
target_path: /home/user/open-frame/apps/web/src/app/splash.ts
timestamp: 2026-09-27T15-34-27Z
slug: src-app-splash-ts
---
# Critique: the boot splash (`src/app/splash.ts`, `index.html`)

Method: dual-agent (A: design review · B: detector + browser evidence)
Mode: Operate (a transitional loading surface). Applicable max /32: heuristics 6 and 10 scored n/a (no choices to recall, nothing to document on a 2s sheet).

## Design Health Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | The label never changes. A cold 6s load looks like a hung one, and on a warm load it says "Opening" for about 1.2s after the page is ready. |
| 2 | Match with the real world | 2 | "Opening your board" is shown on the front door, where no board opens. |
| 3 | User control and freedom | 1 | It can't be skipped, and the same hold returns on every full navigation. |
| 4 | Consistency and standards | 2 | 999px pill; timings off the motion scale; ignores the chosen world; `theme-color` stays violet after load. |
| 5 | Error prevention | 2 | `startCollaboration` is awaited outside the try, so a rejection leaves the splash up forever over an inert root. |
| 6 | Recognition rather than recall | n/a | Nothing to recall. |
| 7 | Flexibility and efficiency | 1 | No accelerator for somebody who has seen it before. |
| 8 | Aesthetic and minimalist design | 3 | One image and one line, well controlled at 4:3 to 16:9. In portrait, the label floats 230px below the letterboxed art. |
| 9 | Error recovery | 3 | StartFailed is honest. The error-boundary and Home paths wait out the hold, and focus is lost. |
| 10 | Help and documentation | n/a | Nothing to document. |
| **Total** | | **16/32 (50%)** | **Acceptable, at the bottom of the band** |

## Design specificity

**Design review:** partly specific. The lockup is OpenFrame's, but the scene is stock synthwave in the category-default composition: a full-bleed hero with a status pill. It rhymes with After Hours; in the mid-fade the artwork's grid runs into the board's quadrille. On the default Notebook world, the handover is a jump cut from dark violet to pale stock.

**Detector:** `index.html` has 3 findings, all false positives:
- `buried-raster`: the static scan sees the image's pre-load opacity 0.
- `design-system-color` ×2: `#150a2e` is `--of-brand-void`, pinned by `brand-splash.test.ts`, and `#ece8fb` is After Hours ink.

`StartFailed.tsx` is clean. The browser overlay reported "No anti-patterns found."

**axe:** 0 violations on both routes in both worlds. `color-contrast` on the label is "incomplete" because the text sits over an image; sampled directly, the label is 10.0–15.8:1 on its bed.

## What's working
- **The first frame is real.** A 146-byte inlined thumbnail, then the artwork: 69KB at 1x, 168KB at 2x, one request per load. There's no white flash and no waiting on the network.
- **Failure is kept off the artwork on the board route.** StartFailed appears at about 800ms and the hold is not spent on it. Focus lands on Reload, and axe finds 0 violations.
- **Careful edges.**
  - `#root` is inert, and Tab lands on nothing while the splash is held.
  - Portrait letterboxes the art rather than cutting off the wordmark.
  - A timer backs up `transitionend`.
  - Reduced motion removes every transition.

## Priority issues

1. **[P1] The splash can hang forever.** `main.tsx:76-86` awaits `startCollaboration` outside the try that guards `createRuntime`. `dismissSplash` is only scheduled at the end of the module. A rejection there leaves a z-index 2147483647 sheet reading "Opening your board" over an inert root, and there is no recovery short of a manual reload.
   - **Fix:** every awaited start-up step goes under the same catch (`abandonSplash` plus StartFailed). Add a watchdog, so a load that runs long says so and offers Reload.
2. **[P1] The hold is paid on every page load, not once.** Measured with the production hold:
   - the page underneath is ready at 0.7–0.84s, and the splash leaves at 2.0s;
   - a second navigation in the same tab pays the full hold again, because `performance.now()` resets per document;
   - `/` → board → All boards → another board costs about 2.4s of pure waiting.
   
   DESIGN.md already names the fix: spend it once per session.
3. **[P2] The copy is wrong on the front door.** "Opening your board" is static (`index.html:127`) and shows over the board list and the sign-in gate.
4. **[P2] Failures other than a board that won't open wait behind the splash, and lose focus.**
   - `AppErrorBoundary` renders StartFailed without `abandonSplash`, so it waits out the 2s hold.
   - StartFailed's `focus()` runs while `#root` is still inert, so it silently fails.
   - On `/`, a storage failure's inline alert renders at about 790ms, is seen at 2.0s, and focus stays on BODY.
5. **[P3] Off-system details.**
   - The 999px pill contradicts "round means grab me".
   - Fades are 220ms/320ms `ease-out`, off `--of-quick`/`--of-settle` and the product curve.
   - `<meta name="theme-color">` stays `#150a2e` after load in both worlds, so the browser's own colour disagrees with the page.
   - The handover ignores the chosen world.
   - The comment at `index.html:103` names a `failSplash()` that no longer exists, and the label's `aria-live` never fires.

## Persona red flags
- **Power user switching boards all afternoon:** an unskippable 2s on every switch, most of it spent after the page is ready.
- **Keyboard and screen-reader users:** hear one line that never changes, then lose focus on the error-boundary and Home failure paths.
- **First-time collaborator from a shared link:** a strong first impression, but "your board" is somebody else's.

## Minor observations
- In portrait (390×844) about 65% of the screen is void, and the label's bed vanishes into it.
- At 844×390 the label overlaps the bottom of the wordmark's floor reflection.
- Reduced motion keeps the full 2s hold. That's defensible, but it is unstated.
- On a Notebook failure, StartFailed's scrim reads as a dialog over a missing page.

## Questions to consider
- Whose moment is the 20th splash of the day, the person's or the brand's?
- Should the default world's first impression be the one that doesn't match it?
- Is the label a promise or a caption? Would the wordmark alone be the more confident moment?
