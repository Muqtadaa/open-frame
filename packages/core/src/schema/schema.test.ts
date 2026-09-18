import { describe, expect, it } from 'vitest'

import { createEmptyDocument } from '../domain/document.js'
import { asBoardId, asObjectId, asOrderKey } from '../domain/ids.js'
import type { ObjectId } from '../domain/ids.js'
import type { AnyOpenFrameObject } from '../domain/object.js'
import { createDefaultRegistry } from '../types/index.js'
import { deserializeBoard, deserializeBoardJson } from './deserialize.js'
import { migrateDocumentPayload, MigrationError } from './migrations/index.js'
import { serializeBoard } from './serialize.js'
import { CURRENT_SCHEMA_VERSION } from './version.js'
import fixtureV1 from './__fixtures__/v1-minimal.json' with { type: 'json' }

const registry = createDefaultRegistry()

function sticky(id: string, text: string): AnyOpenFrameObject {
  return {
    id: asObjectId(id),
    type: 'sticky',
    dataVersion: 1,
    frame: { x: 1, y: 2, width: 180, height: 180, rotation: 0 },
    parentId: null,
    order: asOrderKey('a0'),
    style: { color: 'yellow' },
    locked: false,
    hidden: false,
    data: { text },
    meta: { createdAt: 5, createdBy: null, createdVia: 'user' },
  }
}

function docWith(...objects: AnyOpenFrameObject[]) {
  const map = new Map<ObjectId, AnyOpenFrameObject>()
  for (const o of objects) map.set(o.id, o)
  return { ...createEmptyDocument(asBoardId('board_1'), 'Board', 0), objects: map }
}

describe('serialization round trip', () => {
  it('restores a document exactly', () => {
    const original = docWith(sticky('obj_a', 'hello'), sticky('obj_b', 'world'))
    const result = deserializeBoard(serializeBoard(original, 123), registry)

    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.objects).toEqual(original.objects)
    expect(result.document.meta).toEqual(original.meta)
    expect(result.degraded).toEqual([])
    expect(result.repairs).toEqual([])
  })

  it('loads a frozen v1 fixture', () => {
    const result = deserializeBoard(fixtureV1, registry)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.document.objects.size).toBe(1)
    expect(result.document.objects.get(asObjectId('obj_0001'))?.data).toEqual({
      text: 'Customers do not understand pricing',
    })
  })
})

/**
 * FORWARD COMPATIBILITY.
 *
 * A board saved by a newer build — or one containing a type behind a flag —
 * must still open, and must be written back without losing the payload this
 * build could not interpret. Without a test that asserts byte-equality on the
 * round trip, this guarantee silently regresses the first time someone
 * "cleans up" the serializer.
 */
describe('unknown object types', () => {
  const withFutureType = {
    format: 'openframe.board',
    schemaVersion: 1,
    savedAt: 1,
    board: {
      id: 'board_1',
      meta: { title: 'Board', createdAt: 0 },
      objects: [
        {
          id: 'obj_future',
          /*
           * Deliberately not a type on the roadmap. This fixture stands for a
           * board written by a NEWER build, so its type must be one this build
           * will never gain — `evidence` was used here until the day it was
           * implemented, at which point the payload stopped being unreadable
           * and started being merely invalid, and the test failed for a reason
           * that had nothing to do with quarantine.
           */
          type: 'type-from-a-newer-build',
          dataVersion: 3,
          frame: { x: 5, y: 6, width: 220, height: 140, rotation: 0 },
          parentId: null,
          order: 'a1',
          style: { color: 'green' },
          locked: false,
          hidden: false,
          data: {
            text: 'Participants skipped the pricing page',
            participant: 'P07',
            tags: ['pricing', 'comprehension'],
          },
          meta: { createdAt: 9, createdBy: 'user_1', createdVia: 'user' },
        },
      ],
      assets: [],
    },
  }

  it('quarantines the object instead of failing the board', () => {
    const result = deserializeBoard(withFutureType, registry)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return

    const object = result.document.objects.get(asObjectId('obj_future'))
    expect(object?.type).toBe('unknown')
    expect(result.degraded).toHaveLength(1)
    expect(result.degraded[0]?.reason).toBe('unknown-type')
    expect(result.degraded[0]?.originalType).toBe('type-from-a-newer-build')
  })

  it('preserves position and style so the board still looks right', () => {
    const result = deserializeBoard(withFutureType, registry)
    if (result.status !== 'ok') return
    const object = result.document.objects.get(asObjectId('obj_future'))
    expect(object?.frame).toEqual({ x: 5, y: 6, width: 220, height: 140, rotation: 0 })
    expect(object?.style).toEqual({ color: 'green' })
  })

  it('writes the original type, version and payload back unchanged', () => {
    const loaded = deserializeBoard(withFutureType, registry)
    if (loaded.status !== 'ok') return

    const resaved = serializeBoard(loaded.document, 2)
    const board = resaved.board as { objects: unknown[] }
    expect(board.objects[0]).toEqual(withFutureType.board.objects[0])
  })

  it('survives a full load -> save -> load cycle', () => {
    const first = deserializeBoard(withFutureType, registry)
    if (first.status !== 'ok') return
    const second = deserializeBoard(serializeBoard(first.document, 3), registry)
    expect(second.status).toBe('ok')
    if (second.status !== 'ok') return
    expect(second.degraded).toHaveLength(1)
    expect(second.document.objects.get(asObjectId('obj_future'))?.type).toBe('unknown')
  })

  it('quarantines an object whose data fails its own schema', () => {
    const result = deserializeBoard(
      {
        format: 'openframe.board',
        schemaVersion: 1,
        savedAt: 1,
        board: {
          id: 'board_1',
          meta: { title: 'Board', createdAt: 0 },
          objects: [
            {
              id: 'obj_bad',
              type: 'sticky',
              dataVersion: 1,
              frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
              parentId: null,
              order: 'a0',
              style: {},
              locked: false,
              hidden: false,
              data: { text: 12345 },
              meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
            },
          ],
          assets: [],
        },
      },
      registry,
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.degraded[0]?.reason).toBe('invalid-data')
    expect(result.document.objects.get(asObjectId('obj_bad'))?.type).toBe('unknown')
  })
})

describe('quarantine', () => {
  it('rejects unparseable JSON', () => {
    const result = deserializeBoardJson('{ not json', registry)
    expect(result.status).toBe('quarantined')
    if (result.status !== 'quarantined') return
    expect(result.reason).toBe('unparseable')
  })

  it('rejects a blob that is not an OpenFrame board', () => {
    const result = deserializeBoard({ hello: 'world' }, registry)
    expect(result.status).toBe('quarantined')
    if (result.status !== 'quarantined') return
    expect(result.reason).toBe('invalid-envelope')
  })

  it('refuses a document from a newer schema rather than guessing', () => {
    const result = deserializeBoard(
      {
        format: 'openframe.board',
        schemaVersion: CURRENT_SCHEMA_VERSION + 5,
        savedAt: 0,
        board: {},
      },
      registry,
    )
    expect(result.status).toBe('quarantined')
    if (result.status !== 'quarantined') return
    expect(result.reason).toBe('newer-schema')
  })

  it('rejects a payload that does not match the document shape', () => {
    const result = deserializeBoard(
      { format: 'openframe.board', schemaVersion: 1, savedAt: 0, board: { nope: true } },
      registry,
    )
    expect(result.status).toBe('quarantined')
    if (result.status !== 'quarantined') return
    expect(result.reason).toBe('invalid-payload')
  })

  it('always returns the raw payload so nothing is lost', () => {
    const raw = { hello: 'world' }
    const result = deserializeBoard(raw, registry)
    if (result.status !== 'quarantined') return
    expect(result.raw).toBe(raw)
  })
})

describe('document migrations', () => {
  it('is a no-op when the document is already current', () => {
    const payload = { anything: true }
    expect(migrateDocumentPayload(payload, 1, 1, {})).toBe(payload)
  })

  it('runs each step in order', () => {
    const migrations = {
      2: (d: unknown) => ({ ...(d as object), two: true }),
      3: (d: unknown) => ({ ...(d as object), three: true }),
    }
    expect(migrateDocumentPayload({ one: true }, 1, 3, migrations)).toEqual({
      one: true,
      two: true,
      three: true,
    })
  })

  /**
   * Keying migrations by TARGET version makes a missing step easy to overlook.
   * Skipping it silently would produce a document that claims to be current
   * while missing half a transformation — so a gap must be loud.
   */
  it('throws on a gap in the chain rather than skipping it', () => {
    const migrations = { 3: (d: unknown) => d }
    expect(() => migrateDocumentPayload({}, 1, 3, migrations)).toThrow(MigrationError)
  })

  it('refuses to migrate backwards', () => {
    expect(() => migrateDocumentPayload({}, 5, 1, {})).toThrow(MigrationError)
  })
})

describe('invariant repair on load', () => {
  it('repairs a dangling parent and reports it', () => {
    const result = deserializeBoard(
      {
        format: 'openframe.board',
        schemaVersion: 1,
        savedAt: 1,
        board: {
          id: 'board_1',
          meta: { title: 'Board', createdAt: 0 },
          objects: [
            {
              id: 'obj_a',
              type: 'sticky',
              dataVersion: 1,
              frame: { x: 0, y: 0, width: 10, height: 10, rotation: 0 },
              parentId: 'obj_missing',
              order: 'a0',
              style: {},
              locked: false,
              hidden: false,
              data: { text: '' },
              meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
            },
          ],
          assets: [],
        },
      },
      registry,
    )
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.repairs[0]?.kind).toBe('dangling-parent')
    expect(result.document.objects.get(asObjectId('obj_a'))?.parentId).toBeNull()
  })
})
