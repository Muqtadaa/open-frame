import { readCatalogue } from '@openframe/core/facilitation'

import type { MusicService } from '../../runtime/services.js'

export interface MusicClientOptions {
  /** The room server's http(s) base, no trailing slash. */
  readonly base: string
  readonly fetch: typeof globalThis.fetch
}

/**
 * The session music's library on the room server (ADR 0017): its catalogue,
 * and where each track is. Public, so no key travels with either.
 */
export function createMusicClient(options: MusicClientOptions): MusicService {
  return {
    catalogue: async () => {
      try {
        const response = await options.fetch(`${options.base}/music/catalogue`, undefined)
        if (!response.ok) return null
        return readCatalogue(await response.json())
      } catch {
        // Unreachable or not JSON: no music, and nothing else is affected.
        return null
      }
    },
    trackUrl: (trackId) => `${options.base}/music/track/${encodeURIComponent(trackId)}`,
  }
}
