import { describe, expect, it } from 'vitest'

import { deserializeBoard } from '../../schema/deserialize.js'
import { createDefaultRegistry } from '../index.js'
import type { ConnectorData } from './schema.js'
import frozen from './__fixtures__/v2-labels.json' with { type: 'json' }

/**
 * Connectors saved while a label was a plain string with its bold, italic,
 * underline and size in STYLE. Frozen: a real envelope in the shape the build
 * persisted, so this keeps testing what is on people's disks.
 */
describe('a board from before labels were rich text', () => {
  const registry = createDefaultRegistry()

  const loaded = () => {
    const result = deserializeBoard(frozen, registry)
    if (result.status !== 'ok') throw new Error(`the board did not open: ${result.reason}`)
    return result
  }

  const textOf = (id: string): ConnectorData['text'] => {
    const object = loaded().document.objects.get(id as never)
    if (object === undefined) throw new Error(`${id} is missing`)
    return (object.data as ConnectorData).text
  }

  it('opens, with nothing degraded', () => {
    expect(loaded().degraded).toEqual([])
  })

  it('keeps a plain label as one unmarked span', () => {
    expect(textOf('obj_plain')).toEqual([{ text: 'depends on' }])
  })

  it('carries the label’s whole-object marks and size onto its text', () => {
    expect(textOf('obj_bold_large')).toEqual([
      { text: 'blocks', marks: ['bold', 'italic'], size: 'lg' },
    ])
    expect(textOf('obj_small_underline')).toEqual([
      { text: 'maybe', marks: ['underline'], size: 'sm' },
    ])
  })

  it('keeps an empty label empty, whatever its style said', () => {
    expect(textOf('obj_unlabelled')).toEqual([{ text: '' }])
  })

  it('leaves the colour where it was: that is still the object’s', () => {
    const object = loaded().document.objects.get('obj_bold_large' as never)
    expect(object?.style.textColor).toBe('red')
  })
})
