/**
 * The collaboration adapter: the only place in OpenFrame that knows Yjs exists.
 *
 * [ADR 0007](../../../docs/adr/0007-collaboration-yjs-deferred.md) made patches
 * OpenFrame's own format precisely so a CRDT could be translated at one seam
 * rather than threaded through the domain, and
 * [ADR 0013](../../../docs/adr/0013-collaboration-transport-durable-objects.md)
 * is reversible — Hocuspocus is a week away instead of a rewrite — only for as
 * long as that stays true. A `dependency-cruiser` rule forbids `yjs` outside
 * this package, and it has been broken once to watch it fail.
 */
export const COLLAB_PACKAGE = '@openframe/collab'

export {
  applyPatchesToDoc,
  objectsFromDoc,
  objectsOf,
  seedDoc,
  LOCAL_ORIGIN,
  OBJECTS,
} from './document-map.js'
export { parentageCandidates, patchesFromEvent } from './remote-patches.js'
export {
  createAwareness,
  encodeAllAwareness,
  encodeAwareness,
  encodeSyncStep1,
  encodeSyncStep2,
  encodeUpdate,
  readMessage,
  removeAwarenessClients,
  MESSAGE_AWARENESS,
  MESSAGE_SYNC,
  type Awareness,
  type Handled,
} from './protocol.js'
export {
  BoardRoom,
  documentFromSnapshot,
  type BoardRoomOptions,
  type RoomPeer,
} from './room.js'
export { CollabSession, type CollabSessionDeps } from './session.js'
