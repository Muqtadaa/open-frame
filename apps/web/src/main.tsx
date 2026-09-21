import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { IndexedDbBoardRepository } from './adapters/indexeddb/indexeddb-board-repository.js'
import { App } from './app/App.js'
import { AppErrorBoundary } from './app/AppErrorBoundary.js'
import { createBoardCapabilities } from './app/board-capabilities.js'
import { COLLAB_ENABLED } from './app/collab-config.js'
import { healAssets } from './app/heal-assets.js'
import { forgetDeletedBoard } from './app/board-lifecycle.js'
import { startCollaboration } from './app/collaboration.js'
import { createRuntime } from './app/composition-root.js'
import { markLocalOpened } from './app/board-prefs.js'
import { joinBoard, touchBoardOpened } from './app/remote-boards.js'
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
  /*
   * Built before the socket, because the dispatcher is. The room narrows this
   * to read-only the moment it says `viewer`, which is before it sends any of
   * the board — see `board-capabilities.ts` for why it starts open.
   */
  const capabilities = createBoardCapabilities()

  let runtime: Awaited<ReturnType<typeof createRuntime>>
  try {
    runtime = await createRuntime({ boardId: route.boardId, capabilities })
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
      ? await startCollaboration(
          runtime,
          route.boardId,
          (error) => {
            console.error('A change from the room could not be applied', error)
          },
          route.key,
        )
      : null

  // The room is the authority on this; the browser only mirrors what it said.
  collaboration?.onRole((role) => {
    capabilities.narrowTo(role)
  })

  /*
   * IMAGES THAT NEVER LEFT THIS BROWSER.
   *
   * Every picture placed before the room could serve them carries a local
   * locator, which means nobody else can see it — and so does one whose
   * upload failed, because the store keeps the local locator on failure
   * precisely so this pass is also the retry.
   *
   * After the socket, so an editor's rewrite reaches everyone; not awaited,
   * because a board with twenty photographs on it must not hold up the first
   * paint to lift them. Silent either way: this is repair of a state that
   * should never have existed, and the person opening the board can act on no
   * part of it.
   */
  if (collaboration !== null) {
    void healAssets(runtime.store.getDocument(), {
      resolve: (ref) => runtime.assets.resolveNow(ref),
      reupload: (ref, blob) => runtime.assets.replace(ref.id, blob),
      rewrite: (objectId, asset) => {
        runtime.dispatcher.dispatch(
          { kind: 'UpdateObjectData', id: objectId, patch: { asset } },
          { label: 'Publish image' },
        )
      },
    })
  }

  /*
   * The board was deleted by whoever owns it, while this browser had it open.
   *
   * Two things have to happen here, and neither belongs in a component.
   *
   * AUTOSAVE STOPS FIRST. `dispose` detaches it and removes the `pagehide`
   * flush with it, so nothing writes this document to disk afterwards — not on
   * the next command, and not when the tab is closed. Rule 7 is about never
   * writing back a document we could not fully read; this is the same
   * principle from the other end, a document we could no longer fully TRUST.
   *
   * THEN THE LOCAL COPY GOES — the document, the stored CRDT and the local
   * preferences. Not for the board LIST's sake: `listAllBoards` already drops
   * room-board ids from the "this browser" section, so the phantom row cannot
   * happen by this route, and a test written to assert that passed with this
   * line deleted. What it actually prevents is a deleted board's document and
   * CRDT sitting in IndexedDB for the life of the browser profile, growing by
   * one board every time somebody deletes one out from under this machine.
   *
   * Ordered after `dispose` on purpose: forgetting the board while autosave is
   * still attached invites it to be written straight back.
   */
  collaboration?.onStatus((status) => {
    if (status !== 'gone') return
    runtime.dispose()
    void forgetDeletedBoard(runtime.repository, route.boardId)
  })

  /*
   * "You opened this", recorded and never waited for.
   *
   * It is what the board list is ordered by, and it is deliberately not
   * `updated_at`: opening is not editing, and a list ordered by what other
   * people CHANGED rearranges itself while you are looking away.
   *
   * Fire and forget on purpose. The board is already open by the time this
   * runs, and a slow round trip must not hold it up — a failure costs an
   * ordering, which is the smallest thing here worth failing over.
   */
  markLocalOpened(route.boardId)
  if (route.shared) {
    /*
     * Opening somebody's board KEEPS it, without being asked.
     *
     * It used to be offered as a control in the record line, on the reasoning
     * that every link you ever clicked accumulating in your list is its own
     * kind of mess. That reasoning was wrong about which mess is worse: not
     * pressing it left the board reachable only from the original message, and
     * the local cache of it then showed up in the list as "Untitled board"
     * anyway — so the choice was between a named row and a nameless one.
     *
     * The join is idempotent and grants nothing: whoever holds the key already
     * has the access, and this only writes down that they have it.
     *
     * Ordered, not fired together. `touch_board_opened` records recency
     * against a board you are a MEMBER of, so running it before the join lands
     * silently records nothing.
     */
    const key = route.key
    /*
     * A link with no key is one shared before links had roles. The room still
     * admits it, but the database has nothing to match it against, so there is
     * no membership to redeem — only the recency to record, which does nothing
     * unless you already are a member.
     */
    const kept = key === null ? Promise.resolve(null) : joinBoard(route.boardId, key)

    void kept
      .then(() => touchBoardOpened(route.boardId))
      .catch(() => {
        // A board that could not be kept is still a board you are looking at.
      })
  }

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
