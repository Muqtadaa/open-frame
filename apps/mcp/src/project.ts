/**
 * Which OpenFrame this server belongs to.
 *
 * The same project and the same room as the build the person uses in their
 * browser, written here rather than taken from a flag: a `--project` would make
 * "which OpenFrame am I signed into" a question every invocation answers
 * differently, and an agent that could be pointed at another deployment by a
 * line in a config file is an agent that can be pointed at a deployment
 * somebody else controls.
 *
 * Both values are PUBLISHABLE and are already in `apps/web/.env`, from where
 * Vite inlines them into a bundle every visitor downloads. They are copied
 * rather than imported because `apps/mcp` may not reach into the web app —
 * `project.test.ts` compares the two files and fails when they disagree, which
 * is the part that stops a copy from drifting.
 *
 * There is no service-role key here and must never be. What protects anything
 * is row-level security on the database and the room's own authorization: this
 * server sees exactly the boards the person it signed in as may see.
 */

/** The identity service. */
export const SUPABASE_URL = 'https://nayxpmxpornsjmmmedmh.supabase.co'
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_B5U44eQkoeAl8-MfrMG_zQ_cIVbQr2O'

/**
 * The room server, as the socket wants it.
 *
 * Overridable on the command line for one reason: a local `wrangler dev` is how
 * the room half is developed and demonstrated, and pointing at it must not mean
 * editing a constant.
 */
export const ROOM_SERVER = 'wss://openframe-rooms.muqdara95.workers.dev'
