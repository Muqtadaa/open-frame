import { Canvas } from '../canvas/Canvas.js'
import { ContextMenu } from '../ui/ContextMenu.js'
import { NoticeBanner } from '../ui/NoticeBanner.js'
import { StatusBar } from '../ui/StatusBar.js'
import { Toast } from '../ui/Toast.js'
import { Toolbar } from '../ui/Toolbar.js'
import { ZoomControl } from '../ui/ZoomControl.js'
import { useOpenFrame } from '../runtime/context.js'

/**
 * The application shell.
 *
 * The canvas fills the window and every control floats above it. Chrome that
 * occupies a band steals board space on every screen; overlays cost only the
 * area they cover.
 *
 * If this file ever grows state, effects or geometry, something is in the wrong
 * place — see docs/architecture/01-overview.md.
 */
export function App() {
  const { runtime } = useOpenFrame()
  return (
    <div className="of-app">
      <Canvas />

      <div className="of-overlay of-overlay--left">
        <Toolbar />
      </div>

      <div className="of-overlay of-overlay--top">
        <NoticeBanner notices={runtime.notices} readOnly={runtime.readOnly} />
        <Toast />
      </div>

      <div className="of-overlay of-overlay--bottom-right">
        <ZoomControl />
      </div>

      <div className="of-overlay of-overlay--bottom-left">
        <StatusBar />
      </div>

      <ContextMenu />
    </div>
  )
}
