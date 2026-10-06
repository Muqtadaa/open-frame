import { describe, expect, it } from 'vitest'

import { readBounded } from './body.js'

/** A request whose body arrives in chunks and declares no length, as a chunked POST does. */
function chunked(...chunks: string[]): Request {
  const encoder = new TextEncoder()
  let pulled = 0
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const next = chunks[pulled++]
      if (next === undefined) controller.close()
      else controller.enqueue(encoder.encode(next))
    },
  })
  return new Request('https://rooms.example/room/b/versions', {
    method: 'POST',
    body,
    // @ts-expect-error -- a streamed body needs it in Node; workerd ignores it.
    duplex: 'half',
  })
}

describe('reading a body with a hard bound', () => {
  it('reads a body within the bound, however it arrives', async () => {
    expect(await readBounded(chunked('{"name":', '"Kickoff"}'), 64)).toBe('{"name":"Kickoff"}')
    expect(await readBounded(new Request('https://rooms.example', { method: 'POST' }), 64)).toBe('')
  })

  it('stops at the bound whatever the request claims, and reads no further', async () => {
    let pulled = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        controller.enqueue(new Uint8Array(1024))
      },
    })
    const request = new Request('https://rooms.example', {
      method: 'POST',
      body,
      // @ts-expect-error -- a streamed body needs it in Node; workerd ignores it.
      duplex: 'half',
    })
    // An endless body: the read ends once it passes four kilobytes.
    expect(await readBounded(request, 4096)).toBeNull()
    expect(pulled).toBeLessThan(10)
    expect(await readBounded(chunked('x'.repeat(4097)), 4096)).toBeNull()
  })
})
