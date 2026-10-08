import { useEffect } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { mountOnBoard, type Mounted } from '../test-render.js'
import { useBoardTitle } from './use-document-object.js'

/*
 * The bar asked for the whole document to read the board's title, and so
 * redrew — with the Session control and everything else in it — on every
 * committed change to the board (audit 2026-10-08).
 */
let renders = 0
function Probe() {
  const title = useBoardTitle()
  // Counted after each commit: a render that committed nothing is no redraw.
  useEffect(() => {
    renders += 1
  })
  return <output>{title}</output>
}

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('the board title', () => {
  it('redraws for a new title, and not for an edit to the board', async () => {
    mounted = await mountOnBoard(<Probe />)
    const { runtime } = mounted
    const before = renders
    mounted.act(() => {
      runtime.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [{ type: 'sticky', x: 0, y: 0 }],
      })
    })
    expect(renders).toBe(before)

    mounted.act(() => {
      runtime.dispatcher.dispatch({ kind: 'SetBoardTitle', title: 'Pricing' })
    })
    expect(mounted.container.textContent).toBe('Pricing')
    expect(renders).toBe(before + 1)
  })
})
