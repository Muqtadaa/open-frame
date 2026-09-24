import type { RoomSocket } from '@openframe/collab'

/**
 * A Node `WebSocket`, as the shape `@openframe/collab` asks for.
 *
 * The mirror of the browser's adapter, and the reason there is one at each end
 * rather than a socket type in the package: `RoomSocket` is what lets the
 * provider be tested against a real `BoardRoom` through a pair of fakes, with
 * no network in the suite at all.
 *
 * Node's own `WebSocket` — global since 22, which this repository already
 * requires — rather than `ws`. A dependency to open a socket the runtime can
 * already open is a dependency to keep current for nothing.
 */
export function nodeRoomSocket(url: string): RoomSocket {
  const socket = new WebSocket(url)
  // Without this a binary frame arrives as a Blob and has to be read
  // asynchronously, which would reorder messages in a protocol that depends on
  // their order.
  socket.binaryType = 'arraybuffer'

  return {
    send: (data) => {
      /*
       * Copied into a plain `ArrayBuffer` rather than cast: a `Uint8Array` can
       * be backed by a `SharedArrayBuffer`, which `send` does not accept. One
       * patch batch per message, so the copy is not worth silencing the types
       * over.
       */
      const buffer = new ArrayBuffer(data.byteLength)
      new Uint8Array(buffer).set(data)
      socket.send(buffer)
    },
    close: () => {
      socket.close()
    },
    onOpen: (listener) => {
      socket.addEventListener('open', () => {
        listener()
      })
    },
    onMessage: (listener) => {
      socket.addEventListener('message', (event) => {
        // Only the binary frames are the protocol. Anything else is not a
        // message this client understands, and handing it to the decoder
        // would be handing it bytes that mean nothing.
        if (event.data instanceof ArrayBuffer) listener(new Uint8Array(event.data))
      })
    },
    /*
     * The CODE, not merely the fact of a close. 4004 means the board was
     * deleted and the provider must stop; everything else is a connection to
     * retry.
     */
    onClose: (listener) => {
      // The event's type is inferred: Node has no global `CloseEvent` type
      // to name, though it very much delivers one.
      socket.addEventListener('close', (event) => {
        listener(event.code)
      })
    },
    onError: (listener) => {
      socket.addEventListener('error', () => {
        listener()
      })
    },
  }
}
