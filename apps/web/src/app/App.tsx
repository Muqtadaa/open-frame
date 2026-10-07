import { Canvas } from '../canvas/Canvas.js'
import { Comments, CommentsProvider } from './Comments.js'
import { BoardGone } from '../ui/BoardGone.js'
import { BoardLocked } from '../ui/BoardLocked.js'
import { BoardUnreadable } from '../ui/BoardUnreadable.js'
import { ContextMenu } from '../ui/ContextMenu.js'
import { Inspector } from '../ui/Inspector.js'
import { ClusterReview } from '../ui/ClusterReview.js'
import { VotingBanner } from '../ui/VotingBanner.js'
import { NoticeBanner } from '../ui/NoticeBanner.js'
import { BoardOverview } from '../ui/BoardOverview.js'
import { FollowingBar } from '../ui/FollowingBar.js'
import { SearchPanel } from '../ui/SearchPanel.js'
import { StatusBar } from '../ui/StatusBar.js'
import { Toast } from '../ui/Toast.js'
import { Toolbar } from '../ui/Toolbar.js'
import { ZoomControl } from '../ui/ZoomControl.js'
import { useContext, useSyncExternalStore } from 'react'

import { OpenFrameContext, useOpenFrame } from '../runtime/context.js'
import { VersionPreviewBar } from '../ui/VersionPreviewBar.js'
import { versionPreview } from './version-preview.js'

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
  const context = useContext(OpenFrameContext)
  const preview = useSyncExternalStore(versionPreview.subscribe, versionPreview.get)
  /*
   * A board this build could not read has nothing on it to work on, so it
   * gets the navigation bar and a sheet saying the work is safe — no rail, no
   * record panel, nothing that offers to act on a board that is not there.
   */
  if (runtime.quarantine !== null) {
    return (
      <div className="of-app">
        <div className="of-overlay of-overlay--nav" data-keep-clear="top">
          <StatusBar />
        </div>
        <main className="of-board-main" aria-label="Board">
          <Canvas />
        </main>
        <BoardUnreadable />
      </div>
    )
  }
  /*
   * An earlier version on the canvas, read-only (ADR 0019). The canvas reads a
   * runtime of the version's own through its own context; the bar above it
   * reads the LIVE board, which goes on running underneath, so "Back to now"
   * is simply this branch no longer being taken.
   */
  if (preview !== null && context !== null) {
    return (
      <div className="of-app">
        <div className="of-overlay of-overlay--nav" data-keep-clear="top">
          <VersionPreviewBar preview={preview} />
        </div>
        <main className="of-board-main" aria-label="Board as it was">
          <OpenFrameContext.Provider
            value={{ ...context, runtime: preview.runtime, collaboration: null, history: null }}
          >
            <Canvas />
          </OpenFrameContext.Provider>
        </main>
        {/*
          Kept clear of: the voting banner and the notices along the top are
          read while somebody works, so a selected note's reaction bar or
          record panel must not land on top of Reveal and End.
        */}
        <div className="of-overlay of-overlay--top" data-keep-clear="top">
          <Toast />
        </div>
      </div>
    )
  }
  return (
    <CommentsProvider>
      <div className="of-app">
        {/*
          The board's navigation, along the top — the way out, the name, the
          history. `data-keep-clear` marks furniture anchored to the WINDOW,
          which anything anchored to a selection has to stay clear of because
          it cannot move out of the way itself; the value names the edge it
          holds. See controls/screen-furniture.ts.

          FIRST in the page, before the board: it holds the h1, and the record
          panel's heading can dock on the canvas's chrome layer, which read it
          out before the page's own title (audit 2026-09-27).
        */}
        <div className="of-overlay of-overlay--nav" data-keep-clear="top">
          <StatusBar />
        </div>

        {/*
          The board, and what you work on it with, as the page's main content —
          it was in no landmark at all, so jumping between them skipped the one
          thing the page is for. `display: contents`, so the overlays inside it
          are still placed against the app and nothing moves.
        */}
        <main className="of-board-main" aria-label="Board">
          <Canvas />

          <div className="of-overlay of-overlay--left" data-keep-clear="left">
            <Toolbar />
          </div>

          <div className="of-overlay of-overlay--bottom-right" data-keep-clear="bottom">
            <ZoomControl />
          </div>
        </main>

        {/*
          Kept clear of: the voting banner and the notices along the top are
          read while somebody works, so a selected note's reaction bar or
          record panel must not land on top of Reveal and End.
        */}
        <div className="of-overlay of-overlay--top" data-keep-clear="top">
          <NoticeBanner notices={runtime.notices} />
          <FollowingBar />
          <VotingBanner />
          <ClusterReview />
          <Toast />
        </div>

        <Inspector />
        <ContextMenu />
        <SearchPanel />
        <BoardOverview />
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
