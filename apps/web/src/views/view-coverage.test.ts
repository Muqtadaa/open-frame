import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

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

/**
 * ONE CARD, drawn once.
 *
 * `StructuredSlip` exists because a structured object is a slip with a record
 * line under a hairline, and what differs between an experiment and a
 * requirement is only WHAT that line says. Six types moved onto it; evidence
 * and insight kept their own copies of the same markup, and a change to the
 * slip then reached six of eight — which is how the tags on an evidence card
 * ended up styled by a rule nothing else in the product could reach.
 *
 * Read off the source rather than trusted to review, and by SIGNATURE rather
 * than by a list of files: a ninth type that writes its own card is caught the
 * same way the eighth was not.
 */
describe('the slip is drawn in one place', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const views = readdirSync(here).filter(
    (name) => name.endsWith('View.tsx') || name === 'StructuredSlip.tsx',
  )

  it('finds the views to read, so the rule below is not vacuous', () => {
    expect(views).toContain('StructuredSlip.tsx')
    expect(views).toContain('EvidenceView.tsx')
    expect(views.length).toBeGreaterThan(10)
  })

  it.each(views.filter((name) => name !== 'StructuredSlip.tsx'))(
    '%s does not draw a slip of its own',
    (name) => {
      const source = readFileSync(resolve(here, name), 'utf8')
      expect(source, `${name} writes its own card instead of using StructuredSlip`).not.toContain(
        'of-slip__',
      )
    },
  )
})
