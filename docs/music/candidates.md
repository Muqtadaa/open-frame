# Session music: candidate tracks

The session music plays one playlist per genre to everybody at a board
(ADR 0017). Only **CC0 1.0** tracks are eligible: anything that needs
attribution, or restricts a use, is a promise this product cannot keep on its
users' behalf. Pixabay and Mixkit are excluded for that reason — their licences
are their own, not CC0.

**Nothing here is approved.** The shipped catalogue is empty and the music
control does not appear until it lists tracks. To approve one:

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

## Proposed, one or two per genre

| Genre      | Candidate                                          | Source                                                                     | To check                        |
| ---------- | -------------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------- |
| Electronic | A HoliznaCC0 "Background Music" track              | FMA                                                                        | Licence on the track page       |
| Jazzy      | "Jazz Lounge & Bookstore Grooves" (pick two)       | Open Lo-Fi                                                                 | AI-generated; length            |
| Synthwave  | "Calm Ambient 1 (Synthwave 4k)", The Cynic Project | [OpenGameArt](https://opengameart.org/content/calm-ambient-1-synthwave-4k) | Licence on the page             |
| Bossa nova | "Bossa Nova" (8-bit)                               | [OpenGameArt](https://opengameart.org/content/bossa-nova)                  | Licence; whether chiptune suits |
| Calm       | A HoliznaCC0 "Lo-fi and Chill" track               | FMA                                                                        | Licence on the track page       |

Aim for tracks of two to six minutes at 128kbps MP3: long enough not to repeat
inside an exercise, small enough that a device joining mid-track starts within
a second.
