# The music library

`catalogue.json` is the list of tracks the rooms Worker will serve at
`/music/track/:id`, and the browser will play (ADR 0017). The bucket
(`LIBRARY`, `openframe-library`) holds the files; this list decides which of
them anyone can reach. A file in the bucket that is not listed here is not
served.

Every entry is **CC0 1.0** and says where it came from (`sourceUrl`,
`retrievedAt`), so what is played to everybody at a board is in git, with its
provenance, reviewed like code. `catalogue.test.ts` fails the build on an entry
the shared reader would refuse.

Candidates and the steps to approve one are in `docs/music/candidates.md`.
Files go in with `pnpm music:upload <folder>`, which checks each against its
entry (size, then SHA-256) and uploads nothing if any fails.
