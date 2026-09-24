/**
 * OpenFrame, joined by a process rather than by a person.
 *
 * Stage 1 of [phase 5a](../../../docs/phases/phase-5a-mcp-server.md): a
 * headless peer. The tools an agent calls come in stages 3 and 4 and are
 * callers of what is here — a board, read from the room, changed through the
 * dispatcher, with no second path to either.
 *
 * This package may depend on `@openframe/core` and `@openframe/collab` and
 * never on `apps/web`, which `.dependency-cruiser.cjs` enforces and which has
 * been broken once and watched fail.
 */
export { openBoard, type BoardPeer, type OpenBoardOptions } from './board.js'
export { nodeRoomSocket } from './node-room-socket.js'

// Rule 23: broken once, on purpose, and watched fail. Uncommenting this line
// makes `pnpm depcruise` report `mcp-does-not-depend-on-the-web-app`.
// import { COLLAB_URL } from '../../web/src/app/collab-config.js'
