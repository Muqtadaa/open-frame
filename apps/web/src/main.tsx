import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.js'
import { AppErrorBoundary } from './app/AppErrorBoundary.js'
import { createRuntime } from './app/composition-root.js'
import { dismissSplash, failSplash } from './app/splash.js'
import { restoreTheme } from './app/theme.js'
import { OpenFrameContext } from './runtime/context.js'
import { createDefaultViewRegistry } from './views/index.js'
import './styles.css'

const container = document.getElementById('root')
if (container === null) throw new Error('Missing #root element')

// Before anything paints, so the board never appears in one world and blinks
// into the other. The splash covers this either way, but a preference applied
// after first paint is a flash somebody eventually files a bug about.
restoreTheme()

let runtime: Awaited<ReturnType<typeof createRuntime>>
try {
  runtime = await createRuntime()
} catch (error) {
  // The splash is still up and still claiming to be opening a board. Say what
  // actually happened rather than leaving a cheerful lie on screen.
  failSplash('OpenFrame could not open this board. Reloading may help.')
  throw error
}
const views = createDefaultViewRegistry()

// Exposed for the E2E suite to assert on persisted state without reaching into
// React internals. Debug surface only — never a mutation path.
Object.defineProperty(window, '__openframe', { value: { runtime, views }, writable: false })

createRoot(container).render(
  <StrictMode>
    <AppErrorBoundary>
      <OpenFrameContext.Provider value={{ runtime, views }}>
        <App />
      </OpenFrameContext.Provider>
    </AppErrorBoundary>
  </StrictMode>,
)

/*
 * Two frames, not one: the first lets React commit, the second lets the browser
 * paint what it committed. Fading on the first cross-fades the artwork into a
 * blank canvas, which reads as a flicker rather than a handover.
 */
requestAnimationFrame(() => {
  requestAnimationFrame(dismissSplash)
})
