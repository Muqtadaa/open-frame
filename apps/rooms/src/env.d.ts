/// <reference types="@cloudflare/workers-types" />

import type { AiQuotaObject } from './ai/quota-object.js'

export interface Env {
  readonly ROOMS: DurableObjectNamespace
  /**
   * Where a board's images live.
   *
   * Outside the Durable Object's storage on purpose: that storage is the
   * board's document and its update log, and putting megabytes of photograph
   * beside them would be paid for on every snapshot, every compaction and
   * every read of a board nobody is looking at pictures on.
   */
  readonly ASSETS: R2Bucket
  /**
   * The session music (ADR 0017): CC0 tracks, the same for every board, listed
   * in `library/catalogue.json` and served publicly. A bucket of its own,
   * because nothing in it belongs to any board and nothing in it is ever
   * deleted with one.
   */
  readonly LIBRARY: R2Bucket
  /** The day's AI runs, in one object so a reservation cannot be raced (ADR 0018). */
  readonly AI_QUOTA: DurableObjectNamespace<AiQuotaObject>
  /**
   * The Claude API key. A SECRET (`wrangler secret put ANTHROPIC_API_KEY`), and
   * only ever here: the browser never sees it, and without it the AI route
   * says it is not set up.
   */
  readonly ANTHROPIC_API_KEY?: string
  /** The Supabase project, to ask who a bearer token belongs to. */
  readonly SUPABASE_URL?: string
  readonly SUPABASE_PUBLISHABLE_KEY?: string
  /** Optional: the model, its effort, and where to send requests (a stand-in, in tests). */
  readonly AI_MODEL?: string
  readonly AI_EFFORT?: string
  readonly AI_UPSTREAM_URL?: string
  /** Runs per signed-in person per day, and for everybody together. */
  readonly AI_DAILY_LIMIT?: string
  readonly AI_GLOBAL_DAILY_LIMIT?: string
  /**
   * `"<settle ms>,<interval ms>"`, for the rooms suite only, which cannot wait
   * minutes for a version (ADR 0019). Never set in `wrangler.toml`.
   */
  readonly HISTORY_TIMING?: string
}
