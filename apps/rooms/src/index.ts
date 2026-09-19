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
    const route = routeRequest(
      new URL(request.url),
      request.headers.get('Upgrade'),
      request.method,
    )

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
            'access-control-allow-methods': 'POST, OPTIONS',
            'access-control-allow-headers': 'content-type',
            'access-control-max-age': '86400',
          },
        })

      case 'claim':
      case 'destroy':
      case 'password':
      case 'unlock': {
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
