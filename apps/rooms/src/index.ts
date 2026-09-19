import type { Env } from './env.js'
import { routeRequest } from './route.js'

export { BoardRoomObject } from './room-object.js'

/**
 * The Worker in front of the rooms.
 *
 * It does as little as possible on purpose: find the board, hand the socket to
 * that board's Durable Object. Everything that matters happens inside the room,
 * and everything that DECIDES anything happens in `@openframe/collab`, which
 * has no idea Cloudflare exists.
 *
 * This is also where authorization goes when Stage 3 brings identity — the
 * Worker checks before the room accepts, so a refused connection never reaches
 * the object at all.
 */
export default {
  fetch(request: Request, env: Env): Response | Promise<Response> {
    const route = routeRequest(new URL(request.url), request.headers.get('Upgrade'))

    switch (route.kind) {
      case 'health':
        return new Response('ok', { headers: { 'content-type': 'text/plain' } })

      case 'refuse':
        return new Response(route.reason, { status: route.status })

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
