# Brand assets

## Source

Both files derive from two images supplied by the project owner on 2026-09-18:
a 1448×1086 synthwave hero with the OpenFrame lockup composited into it, and the
same lockup on transparency. They are the origin of the `--of-brand-*` tokens in
`src/styles.css`; no other artwork exists.

Nothing here is in `public/`. Vite copies that directory into every build
wholesale — the reason 4.7MB of benchmark fixtures nearly shipped — so brand
assets are imported and hashed like any other module, and `index.html`
references them by source path so the bundler rewrites them.

| File                | From      | Used by                       |
| ------------------- | --------- | ----------------------------- |
| `splash-hero.webp`  | hero      | the boot splash in `index.html` |
| `logo-mark-32.png`  | lockup    | `link rel=icon`               |
| `logo-mark-180.png` | lockup    | `link rel=apple-touch-icon`   |

The lockup's own transparent band (1364×386 after trimming) is not shipped:
nothing displays it. The hero already carries the wordmark, and the favicon needs
the mark alone. Re-derive it from the source if an about or empty-board surface
ever wants it.

## How they were made

`sharp`, run once from a scratch directory rather than added to the repo — a
native image dependency earns its place when assets are generated on every
build, and these are generated when the artwork changes.

```
npx --yes sharp-cli --version   # or: npm i sharp in a scratch dir
```

- **`splash-hero.webp`** — the hero re-encoded at quality 66, effort 6.
  147KB → 62KB, no resize: 1448px covers a 2x laptop.
- **The inlined backdrop** in `index.html` — the hero resized to 24px wide,
  blurred 1.4, WebP quality 40, emitted as a `data:` URI. 146 bytes. It exists so
  the splash's first frame is already the right picture: a loading screen that
  waits on the network to show that it is loading has the logic backwards.
- **`logo-mark-*.png`** — the lockup trimmed at alpha threshold 6, then the mark
  cut at **column 391**, which is the gutter: the only column between the mark
  and the wordmark with no pixel above alpha 170. Squared with transparent
  padding, then palette-quantised at quality 82 — a full-depth PNG spent 566KB
  rendering a halo nobody inspects at 32px.

Regenerate all of it by repeating those steps against replacement artwork, then
run `pnpm test` — `app/brand-splash.test.ts` fails if the splash stops matching
the brand tokens or names a file that is not here.
