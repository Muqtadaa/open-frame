# Session music: candidate tracks

The session music plays one playlist per genre to everybody at a board
(ADR 0017). Only **CC0 1.0** tracks are eligible: anything that needs
attribution, or restricts a use, is a promise this product cannot keep on its
users' behalf. Pixabay and Mixkit are excluded for that reason — their licences
are their own, not CC0.

## Chosen (2026-10-05)

The owner chose **[Open Lo-Fi](https://github.com/btahir/open-lofi)**. Its
README and `catalog.json` both say CC0 1.0, with no attribution required. The
tracks are AI-generated (Suno v5), a fact this page flagged before they were
chosen. Each track's `id` is Open Lo-Fi's own filename, so a file downloaded
from there already has the name `pnpm music:upload` looks for.

**The whole catalogue is in (2026-10-06): all 166 tracks.** The genres are
Open Lo-Fi's own ten categories, and each track's genre is the category it was
published under, so nothing here is a guess about how a track sounds. The
sheet shortens the category labels to fit a row of toggles:

| Genre (slug)       | In the sheet      | Open Lo-Fi's label              | Tracks |
| ------------------ | ----------------- | ------------------------------- | ------ |
| `chillhop`         | Chillhop          | Chillhop & Cozy Beats           | 8      |
| `jazzhop`          | Jazz lounge       | Jazz Lounge & Bookstore Grooves | 12     |
| `ambient-lofi`     | Ambient           | Ambient Drift & Dreamscapes     | 21     |
| `soul-rnb`         | Soul & slow jams  | Soul, Slow Jams & Warm Rooms    | 21     |
| `asian-lofi`       | Asian & zen       | Asian & Zen Lo-Fi               | 8      |
| `funk-soul`        | Funk & soul       | Funk, Soul & Retro Bounce       | 14     |
| `seasonal-weather` | Seasons & weather | Seasons, Rain & Weather         | 27     |
| `late-night`       | Late night        | Late Night, Neon & After Hours  | 18     |
| `activities`       | Focus & routines  | Focus, Rituals & Daily Routines | 29     |
| `hybrid`           | Hybrid & world    | Hybrid, World & Cinematic       | 8      |

The catalogue lists the tracks in Open Lo-Fi's order, which is the order each
genre plays in. The **Upload music** workflow takes every file from Open
Lo-Fi's release archive, so nothing needs uploading by hand.

To add one:

1. Open its source page and confirm the licence shown there is CC0 1.0.
2. Download the file, name it `<id>.mp3`, and note its size and SHA-256.
3. Add an entry to `apps/rooms/src/library/catalogue.json`: id, genre, title,
   artist, `durationMs`, `bytes`, `sha256`, `mime`, `licence: "CC0-1.0"`,
   `sourceUrl`, and the date you retrieved it.
4. `wrangler r2 bucket create openframe-library` (once), then
   `pnpm music:upload <folder>`. It checks every file against the catalogue
   and uploads nothing if any one fails.

`catalogue.test.ts` fails the build on an entry the browser would refuse.

## Where to look

| Source                                                                            | Why                                                                     | Licence checked here                                                                                               |
| --------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| [Free Music Archive — HoliznaCC0](https://freemusicarchive.org/music/holiznacc0/) | A whole catalogue released CC0: lo-fi, background, chill                | **Not opened** — the page is unreachable from the build environment; check it                                      |
| [OpenGameArt — CC0 music](https://opengameart.org/content/good-cc0-music)         | Game music marked CC0, with synthwave and calm loops                    | **Not opened** — as above                                                                                          |
| [Open Lo-Fi](https://github.com/btahir/open-lofi)                                 | 150+ tracks, CC0, a `catalog.json`                                      | **CC0 confirmed** on the repository. The tracks are **AI-generated (Suno v5)** — decide whether that is acceptable |
| [Freesound](https://freesound.org/search/?f=license:%22Creative+Commons+0%22)     | Filter by "Creative Commons 0"; better for short loops than full tracks | Per sound — check each                                                                                             |
