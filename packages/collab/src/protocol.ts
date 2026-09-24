import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as syncProtocol from 'y-protocols/sync'
import type * as Y from 'yjs'

/**
 * The wire protocol for a board room.
 *
 * Written here rather than taken from a Yjs-on-Durable-Objects wrapper, which
 * is the whole of [ADR 0013](../../../docs/adr/0013-collaboration-transport-durable-objects.md):
 * both wrappers were over a year stale, and adopting one would have put the
 * least maintained thing in the stack at the centre of the phase. What they
 * wrap is this file — two message types and a switch.
 *
 * `y-protocols` still does the encoding, and that is a deliberate line. The
 * SHAPE of the conversation is ours; the byte format of a Yjs sync step is not
 * something to reimplement, and awareness in particular carries clock and
 * timeout semantics that are fiddly to get right and silent when wrong. It was
 * last published 2025-12-16 — nine months at the time of writing, which for a
 * frozen protocol codec from the Yjs org is stability rather than rot. It sits
 * on `lib0`, which is maintained continuously.
 *
 * Everything here is a pure function of bytes. No sockets, no Durable Object,
 * no timers — so the whole protocol is testable in one process, which is the
 * claim ADR 0013 rests on.
 */

/** A Yjs document sync step or update. */
export const MESSAGE_SYNC = 0
/** A presence update: cursors, selections, who is here. Never persisted. */
export const MESSAGE_AWARENESS = 1
/**
 * What the room will let this connection do. Server to client, once, on join.
 *
 * The client cannot work this out for itself: it knows which link it opened,
 * but a link is a claim and the room is the only thing that checked it. Sending
 * the answer means a viewer's interface can say so honestly instead of letting
 * somebody edit for a second and then watching it not stick.
 */
export const MESSAGE_ROLE = 2

/** What a connection may do. Decided by the room, never by the client. */
export type RoomRole = 'editor' | 'viewer'

export type Awareness = awarenessProtocol.Awareness

/** The room telling a client what it is. */
export function encodeRole(role: RoomRole): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_ROLE)
  encoding.writeVarString(encoder, role)
  return encoding.toUint8Array(encoder)
}

/**
 * The role in a message, or `null` if it is not a role message.
 *
 * Unknown strings read as `viewer`. The safe direction for a value this side
 * did not recognise is the one that grants nothing — a future role this client
 * has never heard of must not fall through to full write access.
 */
export function decodeRole(message: Uint8Array): RoomRole | null {
  const decoder = decoding.createDecoder(message)
  if (decoding.readVarUint(decoder) !== MESSAGE_ROLE) return null
  return decoding.readVarString(decoder) === 'editor' ? 'editor' : 'viewer'
}

/**
 * Which kind of sync message this is, WITHOUT applying it.
 *
 * `readSyncMessage` applies an update as a side effect of reading it, so a room
 * that meant to refuse a viewer's write would already have accepted it by the
 * time it could tell what it was. The only way to decide first is to look
 * first, which costs one varint off a second decoder.
 */
function syncKind(message: Uint8Array): number {
  const decoder = decoding.createDecoder(message)
  decoding.readVarUint(decoder)
  return decoding.readVarUint(decoder)
}

/** Creates the awareness state for a document. Re-exported so `yjs` stays quarantined. */
export function createAwareness(doc: Y.Doc): Awareness {
  return new awarenessProtocol.Awareness(doc)
}

/**
 * The first thing either side says: "here is what I already have."
 *
 * A state vector, not the document — which is the property that makes joining a
 * large board cheap. The peer replies with only what is missing.
 */
export function encodeSyncStep1(doc: Y.Doc): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeSyncStep1(encoder, doc)
  return encoding.toUint8Array(encoder)
}

/** Everything the peer is missing, given the state vector it just sent. */
export function encodeSyncStep2(doc: Y.Doc, stateVector?: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeSyncStep2(encoder, doc, stateVector)
  return encoding.toUint8Array(encoder)
}

/** One incremental change, broadcast as it happens. */
export function encodeUpdate(update: Uint8Array): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_SYNC)
  syncProtocol.writeUpdate(encoder, update)
  return encoding.toUint8Array(encoder)
}

/** The presence of the named clients, for broadcasting or for catching someone up. */
export function encodeAwareness(awareness: Awareness, clients: readonly number[]): Uint8Array {
  const encoder = encoding.createEncoder()
  encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
  encoding.writeVarUint8Array(
    encoder,
    awarenessProtocol.encodeAwarenessUpdate(awareness, [...clients]),
  )
  return encoding.toUint8Array(encoder)
}

/** Everyone currently known to be present. */
export function encodeAllAwareness(awareness: Awareness): Uint8Array | null {
  const clients = [...awareness.getStates().keys()]
  return clients.length === 0 ? null : encodeAwareness(awareness, clients)
}

/** What a peer should do about a message, decided by this module rather than by its caller. */
export interface Handled {
  /** Send this straight back to the sender, and to nobody else. */
  readonly reply: Uint8Array | null
  /**
   * Relay this to every OTHER peer, verbatim.
   *
   * A document update and a presence update both fan out; a sync handshake does
   * not, which is the distinction a caller would otherwise have to rediscover.
   */
  readonly broadcast: Uint8Array | null
  /**
   * Whether this message carried DOCUMENT content — a sync step 2 or an
   * update, rather than a question about state or somebody's cursor.
   *
   * Reported separately from `broadcast` because presence fans out too, and a
   * client asking "has the board arrived yet" from the fact of a broadcast
   * gets the answer `yes` from the first cursor it hears about. A room always
   * has a state of its own to announce, so that is EVERY join — the headless
   * peer read an empty board and called it synced, before its own socket had
   * finished opening.
   */
  readonly content: boolean
}

const NOTHING: Handled = { reply: null, broadcast: null, content: false }

/**
 * Applies one incoming message, reporting what to send where.
 *
 * `origin` is what stops an echo: applying an update with the sender as origin
 * means the local `update` observer can recognise it and decline to send it
 * back down the socket it arrived on.
 */
export function readMessage(
  doc: Y.Doc,
  awareness: Awareness,
  message: Uint8Array,
  origin: unknown,
  /**
   * Whether this sender may change the document.
   *
   * Required rather than defaulted, deliberately: a default of `true` would
   * leave every call site that forgot it silently granting write access, and
   * the one that mattered would be the room. A client passes `true` because on
   * that side the peer IS the room, which is the thing being trusted.
   */
  mayWrite: boolean,
): Handled {
  const decoder = decoding.createDecoder(message)
  const type = decoding.readVarUint(decoder)

  switch (type) {
    case MESSAGE_SYNC: {
      /*
       * Refused before it is read, because reading applies it.
       *
       * A step-1 is a QUESTION — "what do you have that I do not" — and a
       * viewer is entitled to ask it; that is how they receive the board at
       * all. A step-2 or an update is a write, and this is where a view-only
       * link stops being a suggestion.
       */
      if (!mayWrite) {
        const kind = syncKind(message)
        const isWrite =
          kind === syncProtocol.messageYjsSyncStep2 || kind === syncProtocol.messageYjsUpdate
        if (isWrite) return NOTHING
      }

      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      const messageType = syncProtocol.readSyncMessage(decoder, encoder, doc, origin)

      /*
       * Length 1 means the encoder holds only the type byte we just wrote — a
       * step that needed no answer. Sending it would be a message that says
       * nothing, and y-websocket's own loop makes the same check.
       */
      const reply = encoding.length(encoder) > 1 ? encoding.toUint8Array(encoder) : null

      /*
       * Only a step-2 or a plain update carries new content. A step-1 is a
       * question about what the sender has, and relaying a question to the rest
       * of the room would have everyone answer a peer that never asked.
       */
      const carriesContent =
        messageType === syncProtocol.messageYjsSyncStep2 ||
        messageType === syncProtocol.messageYjsUpdate
      return { reply, broadcast: carriesContent ? message : null, content: carriesContent }
    }

    case MESSAGE_AWARENESS: {
      awarenessProtocol.applyAwarenessUpdate(
        awareness,
        decoding.readVarUint8Array(decoder),
        origin,
      )
      // Presence is relayed as it arrived: the room holds no opinion about who
      // is where, it only makes sure everyone hears about it.
      return { reply: null, broadcast: message, content: false }
    }

    default:
      /*
       * Dropped, not thrown. An unknown type is a peer running a version this
       * one has not met, and taking the room down over it would turn a rolling
       * deploy into an outage.
       */
      return NOTHING
  }
}

/** Marks the given clients as gone, so their cursors leave everyone else's screen. */
export function removeAwarenessClients(
  awareness: Awareness,
  clients: readonly number[],
  origin: unknown,
): void {
  awarenessProtocol.removeAwarenessStates(awareness, [...clients], origin)
}
