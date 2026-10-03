import type { Env } from './env.js'
import { routeRequest } from './route.js'

export { BoardRoomObject } from './room-object.js'

/**
 * The Worker in front of the rooms.
 *
 * It does as little as possible on purpose: find the board, and hand the socket
 * or the request (claim, images, password, unlock, destroy, owner, protection)
 * to that board's Durable Object. Health checks, CORS preflights and unknown
 * paths it answers itself. Everything that matters happens inside the room,
 * and everything about the shared document happens in `@openframe/collab`,
 * which has no idea Cloudflare exists.
 *
 * It authorizes nothing. Every decision about who may do what is made inside
 * the board's own object, by the pure rules in `access.ts` — ADR 0013's
 * addendum and ADR 0016 say why it ended up there rather than here.
 */
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
            'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
            /*
             * The key and the password token travel as headers rather than in
             * the URL, so the preflight has to allow them by name — a browser
             * will not send a header the server has not said it accepts.
             */
            'access-control-allow-headers':
              'content-type, x-openframe-key, x-openframe-owner, x-openframe-token',
            'access-control-max-age': '86400',
          },
        })

      case 'asset':
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
