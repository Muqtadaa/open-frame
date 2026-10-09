import { describe, expect, it } from 'vitest'

import {
  decodeHello,
  encodeHello,
  MESSAGE_HELLO,
  readMessage,
  createAwareness,
} from './protocol.js'
import * as Y from 'yjs'

describe('the hello a connection opens with', () => {
  it('carries the link, the token and the owner key, and nothing absent', () => {
    const hello = encodeHello({ key: 'k'.repeat(32), token: 't'.repeat(32), ownerKey: null })
    expect(hello[0]).toBe(MESSAGE_HELLO)
    expect(decodeHello(hello)).toEqual({
      key: 'k'.repeat(32),
      token: 't'.repeat(32),
      ownerKey: null,
    })
    expect(decodeHello(encodeHello({}))).toEqual({ key: null, token: null, ownerKey: null })
  })

  it('is not a hello unless it says so, and an unreadable one is refused', () => {
    expect(decodeHello(new Uint8Array([0, 0, 0]))).toBeNull()
    expect(() => decodeHello(new Uint8Array([MESSAGE_HELLO, 0xff]))).toThrow()
  })

  it('is never mistaken for part of the board by the room that reads it', () => {
    const doc = new Y.Doc()
    const handled = readMessage(doc, createAwareness(doc), encodeHello({ key: 'x' }), 'a', true)
    expect(handled.content).toBe(false)
    expect(handled.reply).toBeNull()
  })
})
