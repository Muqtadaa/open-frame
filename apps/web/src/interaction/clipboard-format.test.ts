import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { fromClipboard, toClipboard, writeSystemClipboard } from './clipboard-format.js'

/**
 * What a board copy looks like on the system clipboard, and what reading one
 * back will and will not accept. What the content then MEANS is the paste
 * command's to check, object by object, in core.
 */
describe('a board copy on the system clipboard', () => {
  const content = { format: 'openframe.clipboard', note: 'Prix — 定価 🙂' }

  it('comes back exactly as it went, whatever the words are written in', () => {
    const { html } = toClipboard(content, ['one'])
    expect(fromClipboard(html)).toEqual(content)
  })

  it('reads as the words of what was copied, to anything that is not a board', () => {
    const { text, html } = toClipboard(content, ['Pricing is hidden', 'P07 <could not> find it'])
    expect(text).toBe('Pricing is hidden\nP07 <could not> find it')
    expect(html).toContain('<p>P07 &lt;could not&gt; find it</p>')
  })

  it('is found in HTML another application wrapped around it', () => {
    const { html } = toClipboard(content, ['one'])
    expect(
      fromClipboard(`<html><body><!--StartFragment-->${html}<!--EndFragment--></body></html>`),
    ).toEqual(content)
  })

  it('is not found in HTML that never carried one', () => {
    expect(fromClipboard('<p>Just words from a document</p>')).toBeUndefined()
    expect(fromClipboard('')).toBeUndefined()
  })

  it('is not found where the carrier is damaged', () => {
    expect(fromClipboard('<div data-openframe-clipboard="!!!not base64"></div>')).toBeUndefined()
    expect(
      fromClipboard(`<div data-openframe-clipboard="${btoa('{not json')}"></div>`),
    ).toBeUndefined()
  })
})

/**
 * A copied picture goes in a write of its own, since a clipboard event
 * carries strings only. A picture that cannot be had must not cost the words
 * and the board copy that came with it.
 */
describe('writing a copy outside a clipboard event', () => {
  class FakeItem {
    constructor(readonly entries: Record<string, Blob | Promise<Blob>>) {}
  }
  const written: string[][] = []

  beforeEach(() => {
    written.length = 0
    vi.stubGlobal('ClipboardItem', FakeItem)
    vi.stubGlobal('navigator', {
      clipboard: {
        // As a browser does: every entry is awaited, and one that fails fails the write.
        write: async (items: FakeItem[]) => {
          for (const item of items) {
            await Promise.all(Object.values(item.entries).map((value) => Promise.resolve(value)))
          }
          written.push(items.flatMap((item) => Object.keys(item.entries)))
        },
      },
    })
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  const payload = toClipboard({ format: 'openframe.clipboard' }, ['A picture'])

  it('carries the picture with the words', async () => {
    const picture = Promise.resolve(new Blob(['png'], { type: 'image/png' }))
    expect(await writeSystemClipboard({ ...payload, picture })).toBe(true)
    expect(written).toEqual([['text/plain', 'text/html', 'image/png']])
  })

  it('writes the words alone when the picture cannot be had', async () => {
    expect(await writeSystemClipboard({ ...payload, picture: Promise.resolve(null) })).toBe(true)
    expect(written).toEqual([['text/plain', 'text/html']])
  })
})
