# Brand assets

## Source

The artwork was supplied by the project owner: a synthwave hero with the
OpenFrame lockup composited into it, and the same lockup on transparency.
They are the origin of the `--of-brand-*` tokens in `src/styles.css`; no other
artwork exists.

**Replaced 2026-09-19** with 2896×2172 versions — twice the linear resolution
of the 1448×1086 originals supplied on 2026-09-18. The splash paints its hero
with `object-fit: cover` over the whole viewport, so 1448px was covering a
retina laptop at about half the pixels it wanted and the lettering showed it.

Both source files are committed, and **neither ships**. Vite bundles what is
imported, and nothing imports them — the build output was checked rather than
assumed. They are here so the derived files can be regenerated without going
back to the owner.

Two things about them worth knowing before you open one:

- `OpenFrame Vaporwave Hero hi-res.png` **is a JPEG**, whatever the extension
  says. That costs nothing — the hero is opaque and gets re-encoded to WebP
  anyway — but it has no alpha channel, so it is not a source for anything
  that needs one.
- `OpenFrame Vaporwave Logo hi-res.png` is a real PNG with a real alpha
  channel, which is what the mark is cut out of.

Nothing here is in `public/`. Vite copies that directory into every build
wholesale — the reason 4.7MB of benchmark fixtures nearly shipped — so brand
assets are imported and hashed like any other module, and `index.html`
references them by source path so the bundler rewrites them.

| File                     | From   | Used by                          |
| ------------------------ | ------ | -------------------------------- |
| `splash-hero.webp`       | hero   | boot splash, 1x                  |
| `splash-hero-2x.webp`    | hero   | boot splash, 2x — same `srcset`  |
| `logo-mark-32.png`       | lockup | `link rel=icon`                  |
| `logo-mark-180.png`      | lockup | `link rel=apple-touch-icon`      |

The lockup's own transparent band is not shipped: nothing displays it. The hero
already carries the wordmark, and the favicon needs the mark alone. Re-derive it
from the source if an about or empty-board surface ever wants it.

## How they were made

`sharp`, run once from a scratch directory rather than added to the repo — a
native image dependency earns its place when assets are generated on every
build, and these are generated when the artwork changes.

```
mkdir /tmp/imgwork && cd /tmp/imgwork && npm init -y && npm i sharp
```

### The splash hero — two widths

Re-encoded at quality 66, effort 6, at **1448px and 2896px**, and named in one
`srcset` with `sizes="100vw"`. The browser then picks by device pixel ratio, so
a 1x screen still pays 67KB and only a retina screen pays 164KB. Shipping the
2x file alone would have tripled the cost of the first thing every visitor
loads, for a sharpness half of them cannot resolve.

Vite rewrites `srcset` in HTML exactly as it rewrites `src` — verified in
`dist/index.html`, not assumed — so both files are hashed and bundled.

### The inlined backdrop in `index.html`

The hero resized to 24px wide, blurred 1.4, WebP quality 40, emitted as a
`data:` URI. 150 bytes. It exists so the splash's first frame is already the
right picture: a loading screen that waits on the network to show that it is
loading has the logic backwards.

### The mark

The lockup trimmed at alpha threshold 6 (2723×767), then cut at the gutter
between the mark and the wordmark, then trimmed again — the cut leaves the
mark's own margin behind, and squaring has to happen around the ARTWORK rather
than around the slice. Squared with transparent padding to 787×787, resized
with Lanczos, and palette-quantised at quality 82; a full-depth PNG spent
566KB rendering a halo nobody inspects at 32px.

**The gutter is measured, never carried over.** Take the per-column maximum
alpha across the trimmed lockup and find the runs where it stays at or below
170: on this artwork there is exactly one in the interior, at columns 779–795,
so the cut goes at 787. That is 28.9% across, against 28.7% on the 2026-09-18
artwork — the same gutter, arrived at independently. Scaling the old column
number by two would have given 782 and looked fine, which is exactly why it is
worth measuring: the next piece of artwork may not be a clean 2x.

## Checking the result

`pnpm test` — `app/brand-splash.test.ts` fails if the splash stops matching the
brand tokens, or names a file that is not here in `src` **or in `srcset`**.
Look at the cut mark as well; a bad one is obvious at 360px and invisible at 32.
