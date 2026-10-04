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
  metaOf,
  holdsBoard,
  roomOf,
  seedDoc,
  LOCAL_ORIGIN,
  META,
  OBJECTS,
  ROOM,
} from './document-map.js'
export { metaPatchesFromEvent, parentageCandidates, patchesFromEvent } from './remote-patches.js'
export {
  createAwareness,
  decodeRole,
  encodeAllAwareness,
  encodeAwareness,
  encodeRole,
  encodeSyncStep1,
  encodeSyncStep2,
  encodeUpdate,
  readMessage,
  removeAwarenessClients,
  decodeTimeReply,
  decodeTimeRequest,
  encodeTimeReply,
  encodeTimeRequest,
  MESSAGE_AWARENESS,
  MESSAGE_ROLE,
  MESSAGE_SYNC,
  MESSAGE_TIME,
  type Awareness,
  type Handled,
  type RoomRole,
} from './protocol.js'
export {
  BoardRoom,
  documentFromSnapshot,
  MAX_MESSAGE_BYTES,
  type BoardRoomOptions,
  type Received,
  type RoomPeer,
} from './room.js'
export {
  CLOSE_BOARD_DELETED,
  CLOSE_PASSWORD_REQUIRED,
  RoomProvider,
  type ConnectionStatus,
  type RoomProviderOptions,
  type RoomSocket,
} from './provider.js'
export {
  connectBoard,
  type BoardConnection,
  type ConnectBoardOptions,
  type CrdtStore,
  type PeerPresence,
} from './connect.js'
export { CollabSession, type CollabSessionDeps } from './session.js'
export { CLOCK_SAMPLES, ServerClock } from './clock.js'
export {
  facilitationOf,
  readFacilitation,
  writeMusic,
  writeTimer,
  FACILITATION,
  type Facilitation,
} from './facilitation.js'
export {
  changesOf,
  clearReverted,
  markReverted,
  readChanges,
  readLoggedChange,
  recordChange,
  CHANGES,
  CHANGE_LOG_LIMIT,
  LOGGED_ORIGINS,
  type LoggedChange,
} from './change-log.js'
export {
  roomSocketUrl,
  KEY_PARAM,
  OWNER_PARAM,
  TOKEN_PARAM,
  type RoomCredentials,
} from './room-url.js'
