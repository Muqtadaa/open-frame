import { createDefaultRegistry } from '@openframe/core'
import { describe, expect, it } from 'vitest'

import { createDefaultViewRegistry } from './index.js'

/**
 * The seam between the two registries.
 *
 * Adding a semantic type is a two-file change by design — one line in core's
 * `types/index.ts`, one here — and the failure mode when someone does half of
 * it is quiet: the object renders through `FallbackView`, which helpfully
 * labels it "No view registered" on the board rather than failing a build.
 *
 * It is also the seam that keeps `@openframe/core` free of React, so it cannot
 * be closed by making one registry contain the other.
 */
describe('every type that can be on the board can be drawn', () => {
  const types = createDefaultRegistry()
  const views = createDefaultViewRegistry()

  for (const definition of types.list()) {
    if (!definition.capabilities.spatial) {
      /*
       * The inverse also matters. A view for a non-spatial type would be dead
       * code that looks live: nothing paints a relation, because culling
       * excludes it before the renderer ever asks for a view.
       */
      it(`${definition.type} has no view, because it is never painted`, () => {
        expect(views.get(definition.type)).toBeUndefined()
      })
      continue
    }

    it(`${definition.type} has a view`, () => {
      expect(views.get(definition.type)).toBeDefined()
    })
  }
})
