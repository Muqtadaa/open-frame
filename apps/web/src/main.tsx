import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { App } from './app/App.js'
import { AppErrorBoundary } from './app/AppErrorBoundary.js'
import { createRuntime } from './app/composition-root.js'
import { OpenFrameContext } from './app/runtime-context.js'
import { createDefaultViewRegistry } from './canvas/views/index.js'
import './styles.css'

const container = document.getElementById('root')
if (container === null) throw new Error('Missing #root element')

const runtime = await createRuntime()
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
