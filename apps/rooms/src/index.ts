import { readCatalogue } from '@openframe/core/facilitation'

import { clusterDeps, summaryDeps } from './ai/deps.js'
import { handleCluster, handleSummary } from './ai/handler.js'
import type { Env } from './env.js'
import shipped from './library/catalogue.json' with { type: 'json' }
import { serveCatalogue, serveTrack } from './music.js'
import { routeRequest } from './route.js'

export { BoardRoomObject } from './room-object.js'
export { AiQuotaObject } from './ai/quota-object.js'

/**
 * The Worker in front of the rooms.
 *
 * It does as little as possible on purpose: find the board, and hand the socket
 * or the request (claim, images, versions, password, unlock, destroy, owner,
 * protection)
 * to that board's Durable Object. Health checks, CORS preflights and unknown
 * paths it answers itself. Everything that matters happens inside the room,
 * and everything about the shared document happens in `@openframe/collab`,
 * which has no idea Cloudflare exists.
 *
 * It authorizes nothing. Every decision about who may do what is made inside
 * the board's own object, by the pure rules in `access.ts` — ADR 0013's
 * addendum and ADR 0016 say why it ended up there rather than here.
 */
/**
 * The session music's catalogue, bundled with the Worker and read once. Tracks
 * change only through a reviewed change to `library/catalogue.json`, so what
 * may be played to everybody at a board is in git with its provenance. Read
 * through the shared reader, so an entry the browser would refuse is never
 * served either; `catalogue.test.ts` fails the build on one.
 */
const CATALOGUE = readCatalogue(shipped) ?? { v: 1 as const, tracks: [] }

export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const route = routeRequest(new URL(request.url), request.headers.get('Upgrade'), request.method)

    switch (route.kind) {
      case 'health':
        return new Response('ok', { headers: { 'content-type': 'text/plain' } })

      case 'refuse':
        return new Response(route.reason, { status: route.status })

      /*
       * The web app is served from another origin, so claiming links is a
       * cross-origin POST and the browser asks first. Answered here rather than
       * in the room: a preflight names no board and should not wake one.
       */
      case 'preflight':
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-origin': '*',
            'access-control-allow-methods': 'GET, HEAD, PUT, POST, DELETE, OPTIONS',
            /*
             * The key and the password token travel as headers rather than in
             * the URL, so the preflight has to allow them by name — a browser
             * will not send a header the server has not said it accepts.
             * `range` is for the music: a seek is a ranged read.
             */
            'access-control-allow-headers':
              'authorization, content-type, range, x-openframe-key, x-openframe-owner, x-openframe-token',
            'access-control-max-age': '86400',
          },
        })

      // Names no board and reads none (ADR 0018), so no room is woken for it.
      case 'ai-cluster':
        return handleCluster(request, clusterDeps(env))
      case 'ai-summary':
        return handleSummary(request, summaryDeps(env))

      // The music library names no board, so no room is woken for it.
      case 'catalogue':
        return serveCatalogue(CATALOGUE)

      case 'track':
        return serveTrack(env.LIBRARY, CATALOGUE, route.trackId, request)

      case 'asset':
      case 'versions':
      case 'version':
      case 'keep-version':
      case 'forget-version':
      case 'claim':
      case 'destroy':
      case 'password':
      case 'unlock':
      case 'owner':
      case 'protection': {
        // Each names a board and is answered inside it, because each turns on
        // what that room already holds. The Worker decides nothing here.
        const room = env.ROOMS.get(env.ROOMS.idFromName(route.boardId))
        return room.fetch(request)
      }

      case 'room': {
        /*
         * `idFromName` is deterministic, so every client asking for the same
         * board reaches the same object from anywhere in the world. That is the
         * property a room needs and the one a stateless Worker cannot provide.
         */
        const room = env.ROOMS.get(env.ROOMS.idFromName(route.boardId))
        return room.fetch(request)
      }
    }
  },
} satisfies ExportedHandler<Env>
