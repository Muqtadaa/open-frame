import { richFromPlain } from '@openframe/core'
import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { applyPatchesToDoc, objectsFromDoc } from './document-map.js'
import {
  createAwareness,
  decodeRole,
  encodeAwareness,
  encodeRole,
  encodeSyncStep1,
  encodeUpdate,
  readMessage,
  type RoomRole,
} from './protocol.js'
import { BoardRoom, type RoomPeer } from './room.js'

/**
 * What a view-only connection can and cannot do, decided by the room.
 *
 * The client-side capability check is a UX affordance and always was — it
 * lives in the same browser as the person it restricts. This is the one that
 * is real, so these tests are written from the position of a viewer TRYING to
 * write: not "does the interface hide the button" but "what happens when the
 * bytes arrive anyway".
 */

class Client implements RoomPeer {
  readonly doc = new Y.Doc()
  readonly awareness = createAwareness(this.doc)
  readonly received: Uint8Array[] = []
  #room: BoardRoom | null = null

  constructor(
    readonly id: string,
    readonly role: RoomRole,
  ) {}

  connect(room: BoardRoom): void {
    this.#room = room
    room.join(this)
    room.receive(this, encodeSyncStep1(this.doc))
  }

  send(message: Uint8Array): void {
    this.received.push(message)
    const { reply } = readMessage(this.doc, this.awareness, message, 'room', true)
    if (reply !== null && this.#room !== null) this.#room.receive(this, reply)
  }

  /** Pushes a local change at the room, exactly as a compromised client would. */
  push(room: BoardRoom): void {
    const before = Y.encodeStateVector(this.doc)
    sticky(this.doc, `obj_${this.id}`, this.id)
    room.receive(this, encodeUpdate(Y.encodeStateAsUpdate(this.doc, before)))
  }
}

function sticky(doc: Y.Doc, id: string, text: string): void {
  applyPatchesToDoc(doc, [
    {
      op: 'add',
      id: id as never,
      object: {
        id: id as never,
        type: 'sticky',
        frame: { x: 0, y: 0, width: 100, height: 100 },
        parentId: null,
        order: 'a0',
        locked: false,
        hidden: false,
        createdVia: 'user',
        createdAt: 0,
        updatedAt: 0,
        style: {},
        data: { text: richFromPlain(text) },
      } as never,
    },
  ])
}

describe('a viewer connection', () => {
  it('receives the board', () => {
    const room = new BoardRoom()
    sticky(room.doc, 'obj_theirs', 'already here')

    const viewer = new Client('viewer', 'viewer')
    viewer.connect(room)

    expect([...objectsFromDoc(viewer.doc).keys()]).toContain('obj_theirs')
  })

  it('goes on receiving what an editor does afterwards', () => {
    const room = new BoardRoom()
    const viewer = new Client('viewer', 'viewer')
    const editor = new Client('editor', 'editor')
    viewer.connect(room)
    editor.connect(room)

    editor.push(room)

    expect([...objectsFromDoc(viewer.doc).keys()]).toContain('obj_editor')
  })

  /** The whole point. Change `peer.role === 'editor'` in `room.receive` to
   * `true` and this is the test that fails. */
  it('cannot write to the room even when it sends an update anyway', () => {
    const room = new BoardRoom()
    const viewer = new Client('viewer', 'viewer')
    viewer.connect(room)

    viewer.push(room)

    expect([...objectsFromDoc(room.doc).keys()]).not.toContain('obj_viewer')
  })

  it('cannot reach the other people in the room either', () => {
    const room = new BoardRoom()
    const viewer = new Client('viewer', 'viewer')
    const editor = new Client('editor', 'editor')
    viewer.connect(room)
    editor.connect(room)

    viewer.push(room)

    // Refused at the room, not merely un-persisted: a change relayed to the
    // others would appear on their screens and vanish on their next reload.
    expect([...objectsFromDoc(editor.doc).keys()]).not.toContain('obj_viewer')
  })

  /**
   * Presence is not a write. A viewer with no cursor is invisible to the people
   * they are watching with, which is worse than useless in a workshop — the
   * whole reason somebody is given a view-only link is to be in the room.
   */
  it('is still seen by everyone else', () => {
    const room = new BoardRoom()
    const editor = new Client('editor', 'editor')
    const viewer = new Client('viewer', 'viewer')
    editor.connect(room)
    viewer.connect(room)

    viewer.awareness.setLocalState({ name: 'Watcher' })
    room.receive(viewer, encodeAwareness(viewer.awareness, [viewer.doc.clientID]))

    const names = [...editor.awareness.getStates().values()].map(
      (state) => (state as { name?: string }).name,
    )
    expect(names).toContain('Watcher')
  })
})

describe('an editor connection', () => {
  it('writes, which is what makes the viewer test mean something', () => {
    const room = new BoardRoom()
    const editor = new Client('editor', 'editor')
    editor.connect(room)

    editor.push(room)

    expect([...objectsFromDoc(room.doc).keys()]).toContain('obj_editor')
  })
})

describe('the room telling a client what it is', () => {
  it('says so before it sends any of the board', () => {
    const room = new BoardRoom()
    const viewer = new Client('viewer', 'viewer')
    viewer.connect(room)

    // A client that learned its role after the board arrived would have a
    // window in which its interface invited an edit it was going to drop.
    const first = viewer.received[0]
    expect(first).toBeDefined()
    expect(decodeRole(first!)).toBe('viewer')
  })

  it('reads back what it wrote', () => {
    expect(decodeRole(encodeRole('editor'))).toBe('editor')
    expect(decodeRole(encodeRole('viewer'))).toBe('viewer')
  })

  it('is not confused by an ordinary message', () => {
    const doc = new Y.Doc()
    expect(decodeRole(encodeSyncStep1(doc))).toBeNull()
  })

  /**
   * A role this version has never heard of must not fall through to write
   * access. The safe direction for an unrecognised value is the one that
   * grants nothing.
   */
  it('reads a role it does not know as a viewer', () => {
    const forged = encodeRole('superuser' as RoomRole)
    expect(decodeRole(forged)).toBe('viewer')
  })
})
