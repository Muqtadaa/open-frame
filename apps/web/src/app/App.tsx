import { Canvas } from '../canvas/Canvas.js'
import { Comments, CommentsProvider } from './Comments.js'
import { BoardGone } from '../ui/BoardGone.js'
import { BoardLocked } from '../ui/BoardLocked.js'
import { ContextMenu } from '../ui/ContextMenu.js'
import { Inspector } from '../ui/Inspector.js'
import { NoticeBanner } from '../ui/NoticeBanner.js'
import { SearchPanel } from '../ui/SearchPanel.js'
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
    <CommentsProvider>
      <div className="of-app">
        <Canvas />

        <div className="of-overlay of-overlay--left">
          <Toolbar />
        </div>

        <div className="of-overlay of-overlay--top">
          <NoticeBanner notices={runtime.notices} readOnly={runtime.readOnly} />
          <Toast />
        </div>

        {/*
          `data-keep-clear`: furniture anchored to the WINDOW, which anything
          anchored to a selection has to stay clear of because it cannot move
          out of the way itself. The value names the edge it holds. See
          controls/screen-furniture.ts.
        */}
        <div className="of-overlay of-overlay--bottom-right" data-keep-clear="bottom">
          <ZoomControl />
        </div>

        <div className="of-overlay of-overlay--bottom-left" data-keep-clear="bottom">
          <StatusBar />
        </div>

        <Inspector />
        <ContextMenu />
        <SearchPanel />
        <Comments />

        {/*
          Last, so they cover everything above them. Both are terminal states of
          the connection and only one can ever be showing: the room either
          destroyed the board or refused to open it.
        */}
        <BoardGone />
        <BoardLocked />
      </div>
    </CommentsProvider>
  )
}
