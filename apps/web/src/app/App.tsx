import { Canvas } from '../canvas/Canvas.js'
import { NoticeBanner } from '../ui/NoticeBanner.js'
import { StatusBar } from '../ui/StatusBar.js'
import { Toolbar } from '../ui/Toolbar.js'
import { useOpenFrame } from './runtime-context.js'

/**
 * The application shell: chrome around a canvas, and nothing else.
 *
 * If this file ever grows state, effects or geometry, something has been put in
 * the wrong place — see docs/architecture/01-overview.md.
 */
export function App() {
  const { runtime } = useOpenFrame()
  return (
    <div className="of-app">
      <Toolbar />
      <NoticeBanner notices={runtime.notices} readOnly={runtime.readOnly} />
      <Canvas />
      <StatusBar />
    </div>
  )
}
