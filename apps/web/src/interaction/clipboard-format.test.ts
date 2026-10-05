import { describe, expect, it } from 'vitest'

import { fromClipboard, toClipboard } from './clipboard-format.js'

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
