import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { IndexedDbBoardRepository } from './adapters/indexeddb/indexeddb-board-repository.js'
import { App } from './app/App.js'
import { AppErrorBoundary } from './app/AppErrorBoundary.js'
import { createBoardCapabilities } from './app/board-capabilities.js'
import type { BoardConnection } from '@openframe/collab'
import { COLLAB_ENABLED } from './app/collab-config.js'
import { healAssets, publishRewrite } from './app/heal-assets.js'
import { localFacilitation } from './app/facilitation-local.js'
import { roomFacilitation } from './app/facilitation-room.js'
import { holdAssets } from './app/hold-assets.js'
import { createRuntime } from './app/composition-root.js'
import { markLocalOpened } from './app/board-prefs.js'
import { readRoute } from './app/route.js'
import { createServices } from './app/services.js'
import { abandonSplash, dismissSplash } from './app/splash.js'
import { restoreTheme } from './app/theme.js'
import { OpenFrameContext } from './runtime/context.js'
import { ServicesContext } from './runtime/services.js'
import { Home } from './ui/Home.js'
import { StartFailed } from './ui/StartFailed.js'
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
   * Built before the socket, because the dispatcher is. The room narrows this
   * to read-only the moment it says `viewer`, which is before it sends any of
   * the board — see `board-capabilities.ts` for why it starts open.
   */
  const capabilities = createBoardCapabilities()

  /*
   * EVERY await before the first render sits in this one try. The splash is up
   * over an inert root until the end of this module, so a rejection that
   * escaped — the room refusing the socket was one — left it there for good,
   * still claiming to be opening a board. Say what actually happened, in a
   * panel of its own, rather than leaving a cheerful lie on screen.
   */
  let runtime: Awaited<ReturnType<typeof createRuntime>>
  let collaboration: BoardConnection | null
  try {
    runtime = await createRuntime({ boardId: route.boardId, capabilities, repository })

    /*
     * Attached after the runtime exists and before the first render, so the
     * board is already syncing by the time anyone can touch it. A build with no
     * room server configured never connects — `VITE_COLLAB_URL` absent means
     * this deployment does not collaborate, rather than one that fails to,
     * forever.
     */
    /*
     * Imported only for a shared board: the collaboration code and Yjs are
     * about 80KB a local board never runs, and they were in the entry chunk
     * of every page (audit 2026-09-27).
     */
    collaboration =
      route.shared && COLLAB_ENABLED
        ? await (
            await import('./app/collaboration.js')
          ).startCollaboration(
            runtime,
            route.boardId,
            (error) => {
              console.error('A change from the room could not be applied', error)
            },
            route.key,
          )
        : null
  } catch (error) {
    abandonSplash()
    root.render(<StartFailed heading="This board did not open" error={error} />)
    throw error
  }
  const views = createDefaultViewRegistry()

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
      rewrite: publishRewrite(runtime.dispatcher),
    })
  }

  /*
   * EVERY PICTURE, HELD HERE TOO.
   *
   * The board fetches only what is on screen, and a room that is deleted
   * refuses its pictures along with everything else — so a copy kept of a
   * board deleted under somebody lost every picture they had not scrolled to.
   * Stopped when the room goes, since there is nothing left to fetch from.
   */
  const releaseAssets =
    collaboration === null ? null : holdAssets(runtime.store, (ref) => runtime.assets.hold(ref))

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
    releaseAssets?.()
    runtime.dispose()
    void services.boards.forgetDeleted(route.boardId)
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
    const kept =
      key === null ? Promise.resolve(null) : services.remoteBoards.join(route.boardId, key)

    void kept
      .then(() => services.remoteBoards.touchOpened(route.boardId))
      .catch(() => {
        // A board that could not be kept is still a board you are looking at.
      })
  }

  /*
   * The session timer's channel, chosen once here so no component ever asks
   * which kind of board it is on (ADR 0017): the room's state and clock on a
   * shared board, this browser's on a local one.
   */
  const facilitation =
    collaboration === null ? localFacilitation(route.boardId) : roomFacilitation(collaboration)

  // Exposed for the E2E suite to assert on persisted state without reaching into
  // React internals. Debug surface only — never a mutation path.
  Object.defineProperty(window, '__openframe', { value: { runtime, views }, writable: false })

  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <ServicesContext.Provider value={services}>
          <OpenFrameContext.Provider value={{ runtime, views, collaboration, facilitation }}>
            <App />
          </OpenFrameContext.Provider>
        </ServicesContext.Provider>
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
