import { describe, expect, it } from 'vitest'

import { asObjectId, asOrderKey } from '../domain/ids.js'
import type { AnyOpenFrameObject } from '../domain/object.js'
import { COLOR_TOKENS } from '../domain/object.js'
import { createDefaultRegistry } from './index.js'

/**
 * The contract every object type must satisfy, checked for all of them at once.
 *
 * This is the test that makes adding a semantic type safe: a new `evidence`
 * type is covered by these guarantees the moment it is registered, with no new
 * test file required for the basics. If one of these fails, the type would
 * break search, AI serialization, migration or persistence — all of which
 * consume the registry generically.
 */
describe('object type registry contract', () => {
  const registry = createDefaultRegistry()
  const definitions = registry.list()

  it('registers exactly the expected set', () => {
    // Asserted explicitly rather than loosely: a type appearing or vanishing
    // unnoticed is how the app and the persisted format quietly diverge.
    expect(definitions.map((d) => d.type).sort()).toEqual([
      'connector',
      'frame',
      'group',
      'image',
      'shape',
      'sticky',
      'text',
      'unknown',
    ])
  })

  it('rejects duplicate registration', () => {
    const duplicate = definitions[0]
    expect(duplicate).toBeDefined()
    if (duplicate === undefined) return
    expect(() => registry.register(duplicate)).toThrow(/already registered/)
  })

  for (const definition of createDefaultRegistry().list()) {
    describe(definition.type, () => {
      it('has a positive current version', () => {
        expect(definition.currentVersion).toBeGreaterThan(0)
      })

      it('creates data that satisfies its own schema', () => {
        const { data } = definition.create()
        expect(definition.validate(data).ok).toBe(true)
      })

      /**
       * A type must be findable on the board: either it has a positive default
       * size, or it computes its own bounds. A connector has no meaningful
       * frame — its extent is wherever its endpoints resolve — so it supplies
       * `getBounds` instead. A type with neither would be invisible and
       * unclickable.
       */
      it('is either sized or self-bounding', () => {
        const { frame } = definition.create()
        const sized = frame.width > 0 && frame.height > 0
        expect(sized || definition.getBounds !== undefined).toBe(true)
      })

      it('has a migration for every version below the current one', () => {
        const { data } = definition.create()
        for (let from = 1; from <= definition.currentVersion; from++) {
          expect(() => definition.migrate(data, from)).not.toThrow()
        }
      })

      it('refuses data from a newer version than it understands', () => {
        const { data } = definition.create()
        expect(() => definition.migrate(data, definition.currentVersion + 1)).toThrow()
      })

      it('rejects invalid data rather than accepting it', () => {
        expect(definition.validate({ __definitely: 'not valid' }).ok).toBe(false)
      })

      it('declares only real style properties', () => {
        const allowed = new Set(['color', 'fill', 'stroke', 'font', 'align', 'opacity'])
        for (const prop of definition.capabilities.styleProps) {
          expect(allowed.has(prop)).toBe(true)
        }
      })

      it('describes an instance without throwing', () => {
        const { data, frame } = definition.create()
        const object: AnyOpenFrameObject = {
          id: asObjectId('obj_1'),
          type: definition.type,
          dataVersion: definition.currentVersion,
          frame: { x: 0, y: 0, ...frame, rotation: 0 },
          parentId: null,
          order: asOrderKey('a0'),
          style: { color: COLOR_TOKENS[0] },
          locked: false,
          hidden: false,
          data,
          meta: { createdAt: 0, createdBy: null, createdVia: 'user' },
        }
        const description = definition.describe(object)
        expect(typeof description.searchText).toBe('string')
        expect(description.summary.length).toBeGreaterThan(0)
        expect(typeof description.fields).toBe('object')
      })
    })
  }
})
