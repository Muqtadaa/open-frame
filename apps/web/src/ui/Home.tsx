import { useEffect, useState } from 'react'
import type { BoardRepository } from '@openframe/core'

import { createLocalBoard, describeWhen, listAllBoards, type ListedBoard } from '../app/boards.js'
import { ACCOUNTS_ENABLED, signOut } from '../app/identity.js'
import { boardHref } from '../app/route.js'
import { shareLink } from '../app/collab-config.js'
import { useIdentity } from '../hooks/use-identity.js'
import { hueVar, initialOf } from '../scene/presence.js'
import { AccountForm } from './AccountForm.js'
// Imported rather than referenced by path: rule 12 keeps assets out of
// `public/`, so the bundler is what puts this in the build and fingerprints it.
import logoMark from '../assets/logo-mark-180.png'

/**
 * The front door.
 *
 * It has two handles, and that is the whole design. PRODUCT.md's fourth
 * principle says a board works with no account and no network, so an account
 * cannot be the price of starting — but a product with no entrance also has
 * nowhere to put a board list, which is what an account is actually FOR.
 *
 * So: signing in is offered first and prominently, and "start a board without
 * an account" sits beside it as an equal, not as a link in the small print.
 * Anyone who already has boards in this browser sees them before either.
 */
export function Home({ repository }: { readonly repository: BoardRepository }) {
  const identity = useIdentity()
  /*
   * The list and the moment it was read, together. "3 minutes ago" is relative
   * to WHEN THE LIST WAS TAKEN, and reading the clock during render would both
   * break React's purity rule and quietly re-date every row on an unrelated
   * re-render.
   */
  const [listing, setListing] = useState<{
    readonly boards: readonly ListedBoard[]
    readonly readAt: number
  } | null>(null)
  const [starting, setStarting] = useState(false)

  /*
   * Re-read when the identity settles, not only on mount: the session is
   * restored from storage asynchronously, so the first pass always runs signed
   * out and would leave a signed-in person looking at their local boards only.
   */
  useEffect(() => {
    let live = true
    void listAllBoards(repository, identity !== null).then((found) => {
      if (live) setListing({ boards: found, readAt: Date.now() })
    })
    return () => {
      live = false
    }
  }, [repository, identity])

  const start = (): void => {
    setStarting(true)
    void createLocalBoard(repository).then((boardId) => {
      // A full navigation, because the runtime is wired to one board before
      // React renders. See `route.ts`.
      window.location.assign(boardHref(boardId, false))
    })
  }

  return (
    <main className="of-home" data-testid="home">
      <div className="of-home__column">
        <header className="of-home__head">
          <img className="of-home__mark" src={logoMark} alt="" width={32} height={32} />
          <div>
            <h1 className="of-home__title">OpenFrame</h1>
            <p className="of-home__tagline">
              A visual workspace where what you put on the canvas keeps its meaning.
            </p>
          </div>
          {identity !== null && (
            <button
              type="button"
              className="of-home__account"
              data-testid="home-account"
              title={`Signed in as ${identity.displayName}. Click to sign out.`}
              onClick={() => {
                void signOut()
              }}
            >
              <span
                className="of-home__person"
                style={{ background: hueVar(identity.hue) }}
                aria-hidden="true"
              >
                {initialOf(identity.displayName)}
              </span>
              <span>{identity.displayName}</span>
            </button>
          )}
        </header>

        <div className="of-home__body">
          <section className="of-home__boards" aria-labelledby="of-home-boards">
            <h2 className="of-home__heading" id="of-home-boards">
              your boards
            </h2>

            {listing === null ? (
              <p className="of-home__note">Looking for your boards…</p>
            ) : listing.boards.length === 0 ? (
              <p className="of-home__note" data-testid="home-empty">
                Nothing here yet. Starting a board takes no account and no network — it lives in
                this browser until you share it.
              </p>
            ) : (
              <ul className="of-home__list" data-testid="home-boards">
                {listing.boards.map((board) => (
                  <li key={board.boardId}>
                    <a
                      className="of-home__board"
                      href={
                        board.shared
                          ? // The key travels with the link: a claimed room
                            // refuses the board id on its own.
                            shareLink(board.boardId, '', board.accessKey)
                          : boardHref(board.boardId, false)
                      }
                    >
                      <span className="of-home__board-title">{board.title}</span>
                      {board.shared && (
                        <span className="of-home__board-tag">
                          {board.role === 'viewer' ? 'view only' : 'shared'}
                        </span>
                      )}
                      <span className="of-home__board-when">
                        {describeWhen(board.updatedAt, listing.readAt)}
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            )}

            <button
              type="button"
              className="of-home__start"
              data-testid="home-start"
              disabled={starting}
              onClick={start}
            >
              {starting ? 'Starting…' : 'Start a board'}
            </button>
            <p className="of-home__small">No account needed.</p>
          </section>

          {ACCOUNTS_ENABLED && identity === null && (
            <section className="of-home__signin" aria-labelledby="of-home-signin">
              <h2 className="of-home__heading" id="of-home-signin">
                sign in
              </h2>
              <AccountForm
                onDone={() => {
                  // The board list is about to mean something different.
                  window.location.reload()
                }}
                lead={(mode) =>
                  mode === 'in'
                    ? 'Signing in gives you a board list that follows you between browsers.'
                    : 'An account is for owning boards and keeping a list of them. It is never needed to open one.'
                }
              />
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
