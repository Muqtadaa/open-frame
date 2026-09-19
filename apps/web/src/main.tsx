import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { IndexedDbBoardRepository } from './adapters/indexeddb/indexeddb-board-repository.js'
import { App } from './app/App.js'
import { AppErrorBoundary } from './app/AppErrorBoundary.js'
import { COLLAB_ENABLED } from './app/collab-config.js'
import { startCollaboration } from './app/collaboration.js'
import { createRuntime } from './app/composition-root.js'
import { readRoute } from './app/route.js'
import { dismissSplash, failSplash } from './app/splash.js'
import { restoreTheme } from './app/theme.js'
import { OpenFrameContext } from './runtime/context.js'
import { Home } from './ui/Home.js'
import { createDefaultViewRegistry } from './views/index.js'
import './styles.css'

const container = document.getElementById('root')
if (container === null) throw new Error('Missing #root element')

// Before anything paints, so the board never appears in one world and blinks
// into the other. The splash covers this either way, but a preference applied
// after first paint is a flash somebody eventually files a bug about.
restoreTheme()

const route = readRoute(window.location.search)
const root = createRoot(container)

/*
 * The front door needs no board, so it builds no runtime: opening IndexedDB for
 * a document nobody asked for costs a round trip before the first paint, and
 * `createRuntime` would have to invent a board id to do it. It gets the
 * repository alone, which is all a list of boards needs.
 */
if (route.kind === 'home') {
  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <Home repository={new IndexedDbBoardRepository()} />
      </AppErrorBoundary>
    </StrictMode>,
  )
} else {
  let runtime: Awaited<ReturnType<typeof createRuntime>>
  try {
    runtime = await createRuntime({ boardId: route.boardId })
  } catch (error) {
    // The splash is still up and still claiming to be opening a board. Say what
    // actually happened rather than leaving a cheerful lie on screen.
    failSplash('OpenFrame could not open this board. Reloading may help.')
    throw error
  }
  const views = createDefaultViewRegistry()

  /*
   * Attached after the runtime exists and before the first render, so the board
   * is already syncing by the time anyone can touch it. A build with no room
   * server configured never connects — `VITE_COLLAB_URL` absent means this
   * deployment does not collaborate, rather than one that fails to, forever.
   */
  const collaboration =
    route.shared && COLLAB_ENABLED
      ? startCollaboration(runtime, route.boardId, (error) => {
          console.error('A change from the room could not be applied', error)
        })
      : null

  // Exposed for the E2E suite to assert on persisted state without reaching into
  // React internals. Debug surface only — never a mutation path.
  Object.defineProperty(window, '__openframe', { value: { runtime, views }, writable: false })

  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <OpenFrameContext.Provider value={{ runtime, views, collaboration }}>
          <App />
        </OpenFrameContext.Provider>
      </AppErrorBoundary>
    </StrictMode>,
  )
}

/*
 * Two frames, not one: the first lets React commit, the second lets the browser
 * paint what it committed. Fading on the first cross-fades the artwork into a
 * blank canvas, which reads as a flicker rather than a handover.
 */
requestAnimationFrame(() => {
  requestAnimationFrame(dismissSplash)
})
