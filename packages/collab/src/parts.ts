import * as decoding from 'lib0/decoding'
import * as encoding from 'lib0/encoding'

/**
 * A message too large for one frame, sent as several.
 *
 * The platform drops a WebSocket frame over 32 MiB before anything can read it,
 * and two messages carry a whole board: the room's answer to a newcomer (sync
 * step 2) and a board being published. Past that size a board could neither be
 * opened nor shared. Split, its size is a question of memory, not of frames.
 *
 * `[4, seq, index, count, bytes]`. Only a message over `SPLIT_ABOVE` — the
 * old 32 MiB limit — is split, so everything a peer on the previous version
 * could read is still sent whole. That version drops a part as a type it has
 * never met: split any lower, a board it could open would never arrive in a tab
 * that had not reloaded, and one published from such a tab would be lost
 * (Codex, on #104). An older peer only meets a part on a board it could never
 * have opened anyway.
 */
export const MESSAGE_PART = 4

/** The largest message sent whole: the old limit, which every peer can read. */
export const SPLIT_ABOVE = 32 * 1024 * 1024

/** The size of each part of a message over `SPLIT_ABOVE`. */
export const FRAGMENT_BYTES = 4 * 1024 * 1024

/**
 * The largest message put back together. A room holds its board in memory, and
 * a peer that could make it hold anything at all could take the room down.
 */
export const MAX_ASSEMBLED_BYTES = 64 * 1024 * 1024

/** Cuts a message into parts. One per sender, so each message has its own number. */
export class Splitter {
  #seq = 0
  readonly #splitAbove: number
  readonly #partBytes: number

  /** The sizes are fixed in production; a test passes small ones to stay fast. */
  constructor(sizes: { readonly splitAbove?: number; readonly partBytes?: number } = {}) {
    this.#splitAbove = sizes.splitAbove ?? SPLIT_ABOVE
    this.#partBytes = sizes.partBytes ?? FRAGMENT_BYTES
  }

  /** One frame of a split message. Exposed for tests that need a malformed one. */
  static frame(seq: number, index: number, count: number, bytes: Uint8Array): Uint8Array {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_PART)
    encoding.writeVarUint(encoder, seq)
    encoding.writeVarUint(encoder, index)
    encoding.writeVarUint(encoder, count)
    encoding.writeVarUint8Array(encoder, bytes)
    return encoding.toUint8Array(encoder)
  }

  /** The frames to send: the message itself when it is small enough. */
  split(message: Uint8Array): Uint8Array[] {
    if (message.byteLength <= this.#splitAbove) return [message]
    const seq = this.#seq++
    const size = this.#partBytes
    const count = Math.ceil(message.byteLength / size)
    const frames: Uint8Array[] = []
    for (let index = 0; index < count; index++) {
      const at = index * size
      frames.push(Splitter.frame(seq, index, count, message.subarray(at, at + size)))
    }
    return frames
  }
}

export type Heard =
  /** A message, whole: one that was never split, or the last part of one that was. */
  | { readonly kind: 'whole'; readonly message: Uint8Array }
  /** A part was taken in; there is nothing to read yet. */
  | { readonly kind: 'part' }
  /** Out of order, unreadable or too large: the connection should start again. */
  | { readonly kind: 'bad' }

/**
 * Puts a split message back together. One per connection: a socket delivers in
 * order, so a message's parts arrive one after another with nothing between.
 *
 * Anything out of that order is `bad` rather than waited out — including the
 * first part a room hears after it was evicted mid-message, which has lost
 * the parts before it. The connection is closed, and the sender, reconnecting,
 * sends the whole thing again.
 */
export class Assembler {
  #under: { seq: number; count: number; parts: Uint8Array[]; bytes: number } | null = null

  receive(frame: Uint8Array): Heard {
    if (frame.byteLength === 0 || frame[0] !== MESSAGE_PART) {
      // A whole message in the middle of a split one means the sender lost its place.
      if (this.#under !== null) return this.#bad()
      return { kind: 'whole', message: frame }
    }

    let seq: number, index: number, count: number, bytes: Uint8Array
    try {
      const decoder = decoding.createDecoder(frame)
      decoding.readVarUint(decoder)
      seq = decoding.readVarUint(decoder)
      index = decoding.readVarUint(decoder)
      count = decoding.readVarUint(decoder)
      bytes = decoding.readVarUint8Array(decoder)
    } catch {
      return this.#bad()
    }

    if (index === 0) {
      if (this.#under !== null || count < 2) return this.#bad()
      // Refused on what it claims, before any of it is held: that many parts
      // cannot be smaller than all but the last of them full.
      if ((count - 1) * FRAGMENT_BYTES >= MAX_ASSEMBLED_BYTES) return this.#bad()
      this.#under = { seq, count, parts: [], bytes: 0 }
    }
    const under = this.#under
    if (under?.seq !== seq || under.count !== count || under.parts.length !== index) {
      return this.#bad()
    }
    under.parts.push(bytes.slice())
    under.bytes += bytes.byteLength
    if (under.bytes > MAX_ASSEMBLED_BYTES) return this.#bad()
    if (under.parts.length < count) return { kind: 'part' }

    this.#under = null
    const message = new Uint8Array(under.bytes)
    let at = 0
    for (const part of under.parts) {
      message.set(part, at)
      at += part.byteLength
    }
    return { kind: 'whole', message }
  }

  #bad(): Heard {
    this.#under = null
    return { kind: 'bad' }
  }
}
