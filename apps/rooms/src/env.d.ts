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
}
