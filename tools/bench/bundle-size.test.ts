import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { firstLoad, type Manifest } from './bundle-size.js'

const manifest: Manifest = {
  'index.html': { file: 'index.js', isEntry: true, imports: ['_react.js', '_shared.js'] },
  '_react.js': { file: 'react.js' },
  '_shared.js': { file: 'shared.js', imports: ['_react.js'] },
  'src/app/open-board.tsx': { file: 'board.js', imports: ['_shared.js', '_canvas.js'] },
  '_canvas.js': { file: 'canvas.js' },
  'src/ui/BoardOverview.tsx': { file: 'overview.js', imports: ['_canvas.js'] },
}

void describe('first load', () => {
  void it('counts a route, its entry and what they import, each chunk once', () => {
    assert.deepEqual(
      [...firstLoad(manifest, ['index.html', 'src/app/open-board.tsx'])].sort(),
      ['_canvas.js', '_react.js', '_shared.js', 'index.html', 'src/app/open-board.tsx'].sort(),
    )
  })

  void it('leaves out what loads on request', () => {
    const board = firstLoad(manifest, ['index.html', 'src/app/open-board.tsx'])
    assert.equal(board.has('src/ui/BoardOverview.tsx'), false)
  })

  void it('refuses a chunk the manifest does not have, rather than measuring less', () => {
    assert.throws(() => firstLoad(manifest, ['src/renamed.tsx']), /no chunk/)
  })
})
