import type { RoomSocket } from '@openframe/collab'

/**
 * A browser `WebSocket`, as the shape `@openframe/collab` asks for.
 *
 * The adapter exists so that package can stay free of DOM types — which is what
 * lets the provider be tested against a real room through fake sockets, with no
 * network in the suite at all. The cost is this file.
 */
export function browserRoomSocket(url: string): RoomSocket {
  const socket = new WebSocket(url)
  // Without this, a binary frame arrives as a Blob and has to be read
  // asynchronously — which would reorder messages in a protocol that depends
  // on their order.
  socket.binaryType = 'arraybuffer'

  return {
    send: (data) => {
      /*
       * Copied into a plain `ArrayBuffer` rather than cast.
       *
       * A `Uint8Array` can be backed by a `SharedArrayBuffer`, which `send`
       * does not accept, so the types refuse it — correctly. The messages here
       * are one patch batch each, so the copy is not worth a cast to silence.
       */
      const buffer = new ArrayBuffer(data.byteLength)
      new Uint8Array(buffer).set(data)
      socket.send(buffer)
    },
    close: () => {
      socket.close()
    },
    onOpen: (listener) => socket.addEventListener('open', () => listener()),
    /*
     * The CODE, not just the fact of a close. 4004 means the board was deleted
     * and the provider must stop; everything else is a connection to retry.
     */
    onClose: (listener) =>
      socket.addEventListener('close', (event: CloseEvent) => {
        listener(event.code)
      }),
    onError: (listener) => socket.addEventListener('error', () => listener()),
    onMessage: (listener) =>
      socket.addEventListener('message', (event: MessageEvent<unknown>) => {
        if (event.data instanceof ArrayBuffer) listener(new Uint8Array(event.data))
      }),
  }
}
