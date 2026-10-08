import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { IndexedDbBoardRepository } from './adapters/indexeddb/indexeddb-board-repository.js'
import { AppErrorBoundary } from './app/AppErrorBoundary.js'
import { readRoute } from './app/route.js'
import { createServices } from './app/services.js'
import { abandonSplash, dismissSplash } from './app/splash.js'
import { restoreTheme } from './app/theme.js'
import { ServicesContext } from './runtime/services.js'
import { StartFailed } from './ui/StartFailed.js'
import './styles/index.css'

const container = document.getElementById('root')
if (container === null) throw new Error('Missing #root element')

// Before anything paints, so the board never appears in one world and blinks
// into the other. The splash covers this either way, but a preference applied
// after first paint is a flash somebody eventually files a bug about.
restoreTheme()

const route = readRoute(window.location.search)
const root = createRoot(container)

/*
 * The outside world, wired once and handed to both routes: the front door has
 * no board runtime, and it is where most of this is used. One repository, so
 * the list and the board read the same boards through the same object.
 */
const repository = new IndexedDbBoardRepository()
const services = createServices({ repository })

/*
 * The front door needs no board, so it builds no runtime: opening IndexedDB for
 * a document nobody asked for costs a round trip before the first paint, and
 * `createRuntime` would have to invent a board id to do it. It gets the
 * repository alone, which is all a list of boards needs.
 */
if (route.kind === 'home') {
  /*
   * The front door's own chunk, as the board has its own: neither pays for
   * the other (audit 2026-10-08). An await before the first render, so a
   * failure to load it is said rather than left behind the splash.
   */
  const { Home } = await import('./ui/Home.js').catch((error: unknown) => {
    abandonSplash()
    root.render(<StartFailed heading="The front door did not open" error={error} />)
    throw error
  })
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <ServicesContext.Provider value={services}>
          <Home />
        </ServicesContext.Provider>
      </AppErrorBoundary>
    </StrictMode>,
  )
} else {
  /*
   * The board's own chunk. Loading it is an await before the first render
   * like any other, so it sits under the same rule: a failure is said, never
   * left behind the splash.
   */
  const { openBoard } = await import('./app/open-board.js').catch((error: unknown) => {
    abandonSplash()
    root.render(<StartFailed heading="This board did not open" error={error} />)
    throw error
  })
  await openBoard({ root, route, services, repository })
}

/*
 * Two frames, not one: the first lets React commit, the second lets the browser
 * paint what it committed. Fading on the first cross-fades the artwork into a
 * blank canvas, which reads as a flicker rather than a handover.
 */
requestAnimationFrame(() => {
  requestAnimationFrame(dismissSplash)
})
