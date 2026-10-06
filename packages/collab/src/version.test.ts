import { describe, expect, it } from 'vitest'
import * as Y from 'yjs'

import { metaOf, objectsOf } from './document-map.js'
import { boardFromUpdate } from './version.js'

describe('opening a room version', () => {
  it('gives back the title and every object, unread', () => {
    const doc = new Y.Doc()
    objectsOf(doc).set('obj_a', { id: 'obj_a', anything: true } as never)
    objectsOf(doc).set('obj_b', { id: 'obj_b', frame: 'wide' } as never)
    metaOf(doc).set('title', 'Plans')

    const opened = boardFromUpdate(Y.encodeStateAsUpdate(doc))
    expect(opened.title).toBe('Plans')
    // Not validated here: a version is checked by whoever uses it.
    expect(opened.objects).toHaveLength(2)
  })

  it('has no title for a room that never had one', () => {
    expect(boardFromUpdate(Y.encodeStateAsUpdate(new Y.Doc()))).toEqual({
      title: null,
      objects: [],
    })
  })
})
