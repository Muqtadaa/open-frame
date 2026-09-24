import {
  createDefaultRegistry,
  createEmptyDocument,
  instantiateObject,
  type BoardId,
  type ObjectId,
  type OrderKey,
} from '@openframe/core'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { createDefaultViewRegistry } from './index.js'
import { COLOR_VARS } from '../scene/style-tokens.js'

/**
 * A declaration nobody honours.
 *
 * `sticky` claimed `fill` and its view ignored it, and nothing noticed for as
 * long as `color` was the only property anything could set. `textColor` is
 * declared by thirteen types, which is thirteen chances to declare it and then
 * forget the one line that paints it — so every one of them is RENDERED here
 * with an ink and asked to show it.
 *
 * Generic on purpose: the list comes from the registry, so a type added later
 * is covered the moment it declares the property, and a type that drops the
 * declaration drops out of the suite rather than failing it.
 */
describe('every type that declares textColor paints it', () => {
  const types = createDefaultRegistry()
  const views = createDefaultViewRegistry()
  const doc = createEmptyDocument('ink-board' as BoardId, 'Ink', 0)

  /*
   * Some words for each type to colour.
   *
   * A shape and a connector draw no label at all when the text is empty, so
   * with the defaults they rendered no ink and the suite said "does not paint
   * it" about views that do — which is how this map came to exist.
   *
   * There is no completeness check, and none is needed: rich spans are what
   * almost every type holds, and a type whose text this does not reach draws
   * nothing and FAILS, exactly as shape and connector did. The fallback cannot
   * quietly cover a type it does not fit.
   */
  const SAID: Record<string, Record<string, unknown>> = {
    // A plain string for the connector, spans for everything with rich text —
    // the difference is the type's, and a test that smoothed it over would be
    // testing a shape of data the app does not have.
    connector: { text: 'Ink' },
    frame: { name: 'Ink' },
  }
  const RICH = { text: [{ text: 'Ink' }] }

  for (const definition of types.list()) {
    if (!definition.capabilities.styleProps.includes('textColor')) continue

    it(`${definition.type} renders its ink`, () => {
      const view = views.get(definition.type)
      expect(view).toBeDefined()
      if (view === undefined) return

      const object = instantiateObject({
        definition,
        id: 'ink-subject' as ObjectId,
        order: 'a0' as OrderKey,
        x: 0,
        y: 0,
        style: { textColor: 'red' },
        data: SAID[definition.type] ?? RICH,
        createdAt: 0,
        createdBy: null,
        createdVia: 'user',
      })

      const markup = renderToStaticMarkup(
        <view.Renderer
          object={object}
          selected={false}
          zoom={1}
          document={{ ...doc, objects: new Map([[object.id, object]]) }}
          assetUrl={() => ({ status: 'missing' })}
          /*
           * The frame IS the extent for every type here — nothing in this
           * fixture is a container — so the simplest honest answer. A view
           * that needs the real thing gets it from the registry through
           * `ObjectView`, which is the point of it being a prop.
           */
          boundsOf={(other) => ({
            x: other.frame.x,
            y: other.frame.y,
            width: other.frame.width,
            height: other.frame.height,
          })}
        />,
      )

      /*
       * The VARIABLE, not a hex value. Views read the token through
       * `COLOR_VARS`, so asserting `var(--of-c-red)` is asserting they went
       * through the one mapping rather than hard-coding a colour — which is
       * the other half of how a palette stays themeable.
       */
      expect(markup).toContain(COLOR_VARS.red)
    })
  }
})
