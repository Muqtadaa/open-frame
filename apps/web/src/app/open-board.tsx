import { StrictMode } from 'react'
import type { Root } from 'react-dom/client'

import type { BoardConnection } from '@openframe/collab'

import { indexedDbVersionStore } from '../adapters/indexeddb/version-store.js'
import type { IndexedDbBoardRepository } from '../adapters/indexeddb/indexeddb-board-repository.js'
import { OpenFrameContext } from '../runtime/context.js'
import { ServicesContext, type Services } from '../runtime/services.js'
import { StartFailed } from '../ui/StartFailed.js'
import { createDefaultViewRegistry } from '../views/index.js'
import { App } from './App.js'
import { AppErrorBoundary } from './AppErrorBoundary.js'
import { createBoardCapabilities } from './board-capabilities.js'
import { boardHistoryFor } from './board-history.js'
import { markLocalOpened } from './board-prefs.js'
import { COLLAB_ENABLED } from './collab-config.js'
import { createRuntime } from './composition-root.js'
import { localFacilitation } from './facilitation-local.js'
import { roomFacilitation } from './facilitation-room.js'
import { healAssets, publishRewrite } from './heal-assets.js'
import { holdAssets } from './hold-assets.js'
import { keepLocalHistory } from './local-history.js'
import type { Route } from './route.js'
import { abandonSplash } from './splash.js'

/**
 * Opening a board: the runtime, the room, and everything wired around them,
 * then the first render.
 *
 * Its own chunk, loaded only on the board route. The front door needs none of
 * it — the views, the canvas, the gestures, the facilitation surfaces — and
 * they were all in the one entry chunk every page paid for, which had grown a
 * quarter in a month (audit 2026-10-08).
 */
export async function openBoard({
  root,
  route,
  services,
  repository,
}: {
  readonly root: Root
  readonly route: Extract<Route, { kind: 'board' }>
  readonly services: Services
  readonly repository: IndexedDbBoardRepository
}): Promise<void> {
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
            await import('./collaboration.js')
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

  /*
   * A local board's history, kept in this browser (ADR 0019). Never for a
   * board that cannot be written back (rule 7), and never for a shared one,
   * whose room keeps its history. Lives as long as the page does, like
   * autosave.
   */
  const keeper =
    !route.shared && !runtime.readOnly
      ? keepLocalHistory({
          boardId: route.boardId,
          subscribe: (listener) => runtime.dispatcher.subscribe(listener),
          document: () => runtime.store.getDocument(),
          versions: indexedDbVersionStore,
        })
      : null
  const history = boardHistoryFor({
    boardId: route.boardId,
    shared: route.shared,
    registry: runtime.registry,
    keeper,
  })

  // Exposed for the E2E suite to assert on persisted state without reaching into
  // React internals. Debug surface only — never a mutation path.
  Object.defineProperty(window, '__openframe', { value: { runtime, views }, writable: false })

  root.render(
    <StrictMode>
      <AppErrorBoundary>
        <ServicesContext.Provider value={services}>
          <OpenFrameContext.Provider
            value={{ runtime, views, collaboration, facilitation, history }}
          >
            <App />
          </OpenFrameContext.Provider>
        </ServicesContext.Provider>
      </AppErrorBoundary>
    </StrictMode>,
  )
}
