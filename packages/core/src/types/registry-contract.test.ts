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
      'evidence',
      'frame',
      'group',
      'image',
      'relation',
      'shape',
      'sticky',
      'text',
      'unknown',
    ])
  })

  /**
   * The check that makes the two field tests below non-vacuous.
   *
   * `defineObjectType` copies optional members one by one, and both sides
   * declare them optional — so forgetting one type checks cleanly and erases it
   * to `undefined`. That happened to `fields` on the day it was added, and the
   * per-type tests that police field declarations silently passed on an empty
   * set. A test that passes vacuously is worse than no test, because it is
   * trusted (rule 23), so this asserts a known declaration survives erasure.
   */
  it('carries a type\'s field declarations through erasure', () => {
    const evidence = registry.get('evidence')
    expect(evidence?.fields?.map((f) => f.key)).toEqual(['source', 'participant', 'tags'])
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
       * A type that occupies the board must be findable on it: either it has a
       * positive default size, or it computes its own bounds. A connector has no
       * meaningful frame — its extent is wherever its endpoints resolve — so it
       * supplies `getBounds` instead. A SPATIAL type with neither would be
       * invisible and unclickable.
       *
       * A relation is not on the board at all, so it is exempt — and the
       * exemption is spelled as `spatial: false` rather than by naming the type,
       * which is also what keeps it out of culling and marquee selection.
       */
      it('is either sized, self-bounding, or not on the board', () => {
        if (!definition.capabilities.spatial) {
          const { frame } = definition.create()
          // A non-spatial type must not pretend to have an extent.
          expect(frame.width === 0 && frame.height === 0).toBe(true)
          expect(definition.getBounds).toBeUndefined()
          return
        }
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

      /**
       * The guard that makes a field declaration falsifiable.
       *
       * `sticky` once declared a `fill` its view ignored, and nothing failed
       * because nothing consumed the declaration (rule 21). A declared FIELD
       * fails worse: the inspector renders a control, the user types into it,
       * and the write is rejected at the boundary — an edit that silently does
       * not save. So each declared key is round-tripped through the type's own
       * schema here, which is the same check `UpdateObjectData` will apply.
       */
      it('declares only fields its own schema accepts', () => {
        const sample: Record<string, unknown> = {
          text: 'sample',
          longText: 'sample',
          tags: ['sample'],
          select: undefined,
        }
        for (const field of definition.fields ?? []) {
          const { data } = definition.create()
          expect(typeof data).toBe('object')

          if (field.kind === 'select') {
            // A select with no options is a control with nothing to pick.
            expect(field.options?.length ?? 0).toBeGreaterThan(0)
            for (const option of field.options ?? []) {
              const result = definition.validate({ ...(data as object), [field.key]: option })
              expect(result.ok, `${definition.type}.${field.key} rejects option ${option}`).toBe(
                true,
              )
            }
            continue
          }

          const result = definition.validate({
            ...(data as object),
            [field.key]: sample[field.kind],
          })
          expect(result.ok, `${definition.type}.${field.key} is not in its own schema`).toBe(true)
        }
      })

      /**
       * A field the type declares but never reports is invisible to search, AI
       * context and export — the three consumers of `describe` — so the panel
       * would be the only place it existed.
       */
      it('reports every declared field in its description', () => {
        if (definition.fields === undefined) return
        const { data, frame } = definition.create()
        const described = definition.describe({
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
        })
        for (const field of definition.fields) {
          expect(
            Object.hasOwn(described.fields, field.key),
            `${definition.type}.${field.key} is editable but never described`,
          ).toBe(true)
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
