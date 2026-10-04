/// <reference types="@cloudflare/workers-types" />

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
}
