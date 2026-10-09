# Enabling facilitation: music and AI

Everything else in a session works as soon as it is deployed: the timer,
reactions, dot voting, polls. Two features need the owner to do something
first. Until then each one stays out of the way: the Session pill has no Music section,
and the AI panel says "AI is not set up".

## Already in place

- **Both R2 buckets:** `openframe-assets` (images) and `openframe-library`
  (music).
- **Deploys:** `CLOUDFLARE_API_TOKEN` (a GitHub secret) and
  `CLOUDFLARE_ACCOUNT_ID` (a GitHub variable). `deploy-rooms.yml` deploys the
  Worker on every merge that touches it.
- **Every web variable.** `apps/web/.env` names the room server
  (`VITE_COLLAB_URL`), and the music and AI clients both derive their address
  from it. Vercel needs nothing new.
- **The Worker's own variables:** the AI limits and the Supabase project are
  in `apps/rooms/wrangler.toml`. Keep them there rather than in the Cloudflare
  dashboard: every deploy replaces the dashboard's plain variables with that
  file's.

## AI clustering and summaries ([ADR 0018](../adr/0018-ai-clustering-on-the-room-server.md), [ADR 0022](../adr/0022-ai-summaries.md))

One secret, set once, switches both on. Secrets survive deploys. The limits
below are one allowance per person across both features.

```sh
cd apps/rooms
npx wrangler login                        # once per machine
npx wrangler secret put ANTHROPIC_API_KEY # paste the key when asked
```

Or in the Cloudflare dashboard: Workers & Pages → **openframe-rooms** →
Settings → Variables and Secrets → Add, with type **Secret** and name
`ANTHROPIC_API_KEY`.

Optional, in `[vars]` of `apps/rooms/wrangler.toml`, through a PR:

| Variable                | Default           | What it is                                |
| ----------------------- | ----------------- | ----------------------------------------- |
| `AI_DAILY_LIMIT`        | `20`              | Runs per signed-in person per day         |
| `AI_GLOBAL_DAILY_LIMIT` | `1000`            | Runs for everybody together per day       |
| `AI_MODEL`              | `claude-opus-5-5` | The Claude model                          |
| `AI_EFFORT`             | `medium`          | `low`, `medium`, `high`, `xhigh` or `max` |

**To check it:** sign in on the live site, select three or more notes with
text, right-click, choose **Cluster with AI…**, then **Cluster**. If the
key is missing the panel says "AI is not set up"; if it is wrong, "The AI did
not finish", and the Worker's log says why. Summaries check the same way:
two or more notes, or a frame, then **Summarise with AI…**.

## Session music ([ADR 0017](../adr/0017-facilitation-state-outside-the-document.md))

Done: the catalogue lists all of Open Lo-Fi (166 tracks), and the Music section
appears in every board's Session pill. The steps below are for adding tracks from anywhere
else. Every track must be **CC0 1.0**.

1. **Choose tracks** from [the candidates](../music/candidates.md), or find
   others. On each one's own page, confirm the licence says CC0 1.0. A
   track's genre is one of Open Lo-Fi's ten categories (`MUSIC_GENRES` in
   `packages/core/src/facilitation/music.ts`).
2. **Download them** as MP3, ideally two to six minutes long at 128kbps, and
   name each `<id>.mp3`. An id is lowercase letters, digits and hyphens, for
   example `calm-rain-1`.
3. **List them** in `apps/rooms/src/library/catalogue.json`, through a PR:
   id, genre, title, artist, `durationMs`, `bytes`, `sha256`,
   `mime: "audio/mpeg"`, `licence: "CC0-1.0"`, `sourceUrl`, and
   `retrievedAt`. `catalogue.test.ts` refuses an entry the browser would
   refuse.
4. **Upload them**, which happens on its own. Merging a change to the
   catalogue starts the **Upload music** workflow
   (`.github/workflows/upload-music.yml`). It downloads the release archive
   the tracks came from (Open Lo-Fi's by default), takes each catalogue track
   out of it by id, and runs `pnpm music:upload`. That checks every file's
   size and SHA-256 against its entry and uploads nothing if any one fails.
   No terminal needed.
   - It needs the `CLOUDFLARE_API_TOKEN` GitHub secret to be allowed to
     **edit Workers R2 Storage**, as well as to deploy Workers. If the run
     fails at the upload, add that permission to the token in the Cloudflare
     dashboard (My Profile → API Tokens), then re-run it from the Actions
     tab.
   - Tracks from somewhere else: Actions → **Upload music** → Run workflow,
     and give the address of a `.zip` holding them as `<id>.mp3`.
   - From a terminal instead: `pnpm music:upload <folder>`, with wrangler
     logged in.

**To check it:** open any board and open the Session pill (Alt+T). The Music
section sits below the timer.
Choose a genre, press play, and open the board on a second device: both hear
the same track at the same place.
