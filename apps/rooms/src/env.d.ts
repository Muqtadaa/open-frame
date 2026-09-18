/// <reference types="@cloudflare/workers-types" />

export interface Env {
  readonly ROOMS: DurableObjectNamespace
}
