import { useCallback, useEffect, useState } from 'react'
import type { BoardRepository } from '@openframe/core'

import { rememberOwnerKey } from '../app/board-password.js'
import { createLocalBoard, listAllBoards, type ListedBoard } from '../app/boards.js'
import { ACCOUNTS_ENABLED, signOut } from '../app/identity.js'
import { boardHref } from '../app/route.js'
import { createOwnedBoard, ShareFailed } from '../app/share.js'
import { useIdentity } from '../hooks/use-identity.js'
import { Mentions } from './Mentions.js'
import { WorkspaceBar } from './WorkspaceBar.js'
import { useWorkspaces } from '../hooks/use-workspaces.js'
import { joinWorkspace } from '../app/workspaces.js'
import { workspaceInvite } from '../app/collab-config.js'
import { hueVar, initialOf } from '../scene/presence.js'
import { AccountForm } from './AccountForm.js'
import { BoardRow } from './BoardRow.js'
import { ClaimLocalBoards } from './ClaimLocalBoards.js'
import { describeStartFailure } from './StartFailed.js'
// Imported rather than referenced by path: rule 12 keeps assets out of
// `public/`, so the bundler is what puts this in the build and fingerprints it.
import logoMark from '../assets/logo-mark-180.png'

/**
 * The front door, which now has ONE handle.
 *
 * It had two — sign in, or start a board without an account — and that was the
 * right shape while a board could belong to nobody. It is not any more.
 * Creating a board takes an account, every board has an owner, and the list
 * has one kind of row; PRODUCT.md's fourth principle now says a board works
 * OFFLINE, which is what IndexedDB and the CRDT actually provide, rather than
 * that it works with no account.
 *
 * What has NOT changed, and is the reason the change is affordable: a link
 * still opens a board for anybody. Guests were never the thing an account was
 * protecting, and the room's guest support is untouched.
 *
 * A build with no identity service keeps the old behaviour, because a build
 * with no accounts cannot require one — it would have no way in at all.
 */
export function Home({ repository }: { readonly repository: BoardRepository }) {
  const identity = useIdentity()
  /*
   * The list and the moment it was read, together. "3 minutes ago" is relative
   * to WHEN THE LIST WAS TAKEN, and reading the clock during render would both
   * break React's purity rule and quietly re-date every row on an unrelated
   * re-render.
   */
  const [listProblem, setListProblem] = useState<string | null>(null)
  const [listing, setListing] = useState<{
    readonly boards: readonly ListedBoard[]
    readonly readAt: number
  } | null>(null)
  const [starting, setStarting] = useState(false)
  /*
   * Bumped by a row that changed something, which re-runs the read below.
   * A counter rather than each row patching the list it lives in: renaming,
   * pinning and deleting all reorder it, and a row is the wrong place to hold
   * an opinion about where it now belongs.
   */
  const [revision, setRevision] = useState(0)
  const refresh = useCallback(() => setRevision((n) => n + 1), [])

  /*
   * Which workspace the list is narrowed to, or null for all of them.
   *
   * Not persisted. A filter you did not set and cannot see the edge of is how
   * a board goes missing — coming back to the front door should show
   * everything you have, every time.
   */
  const [space, setSpace] = useState<string | null>(null)
  const [invite, setInvite] = useState<string | null>(null)
  const spaces = useWorkspaces(identity !== null)

  /*
   * A workspace invitation in the URL, read ONCE.
   *
   * Held in state rather than re-read every render: the effect below clears
   * the URL after redeeming it, and a value re-read from `window.location`
   * would then become null mid-flight and change the effect's dependencies
   * while it was still running.
   */
  const [invitation] = useState(() => workspaceInvite(window.location.search))
  const [invited, setInvited] = useState<string | null>(null)

  /*
   * Redeemed once somebody is signed in, which is why this is here rather than
   * before the app renders: joining takes an account, and a person following
   * an invitation may not have one yet. Left in the URL until then, so signing
   * in on this page accepts it — rather than the link being spent on arrival
   * and lost.
   */
  const refreshSpaces = spaces.refresh
  useEffect(() => {
    if (invitation === null || identity === null) return
    let live = true
    joinWorkspace(invitation.id, invitation.key)
      .then((role) => {
        if (!live || role === null) return
        setInvited(role)
        refreshSpaces()
        /*
         * The key leaves the address bar as soon as it is spent. A link with a
         * key in it IS the credential, and one sitting in history is one that
         * can be re-offered from a browser somebody else picks up.
         */
        window.history.replaceState(null, '', '/')
      })
      .catch(() => {
        // Not invited, or a link since superseded. The front door is still
        // theirs, and an error page for a forwarded link helps nobody.
      })
    return () => {
      live = false
    }
  }, [identity, invitation, refreshSpaces])

  /*
   * Re-read when the identity settles, not only on mount: the session is
   * restored from storage asynchronously, so the first pass always runs signed
   * out and would leave a signed-in person looking at their local boards only.
   */
  useEffect(() => {
    let live = true
    void listAllBoards(repository, identity !== null).then((found) => {
      /*
       * The owner keys ride along, cached per board.
       *
       * This list is the only place they are handed out, and the board itself
       * needs one on the socket so its owner is not asked for the password on
       * their own board. Writing them here means the ordinary route — open a
       * board from your list — costs no extra round trip; `recoverOwnerKey`
       * covers arriving by a deep link on a machine that never saw this page.
       */
      for (const board of found) {
        if (board.ownerKey !== null) rememberOwnerKey(board.boardId, board.ownerKey)
      }
      if (live) setListing({ boards: found, readAt: Date.now() })
    }, (error: unknown) => {
      // Said, rather than "Looking for your boards…" for as long as the tab
      // stays open.
      if (live) setListProblem(describeStartFailure(error))
    })
    return () => {
      live = false
    }
  }, [repository, identity, revision])

  const [startError, setStartError] = useState<string | null>(null)

  /*
   * Who may start a board, and what kind.
   *
   * A build with no identity service has no account to require, so it keeps
   * making local boards — otherwise the change would leave such a deployment
   * with no way to create anything at all.
   */
  const canStart = !ACCOUNTS_ENABLED || identity !== null

  const start = (): void => {
    setStarting(true)
    setStartError(null)

    const created = ACCOUNTS_ENABLED
      ? // Into the workspace being shown, so a board lands where you were
        // looking. `undefined` for "everything" means the person's own, which
        // is what the database falls back to.
        createOwnedBoard(repository, undefined, space ?? undefined).then(
          (board) => board.editLink,
        )
      : createLocalBoard(repository).then((boardId) => boardHref(boardId, false))

    void created.then(
      (href) => {
        // A full navigation, because the runtime is wired to one board before
        // React renders. See `route.ts`.
        window.location.assign(href)
      },
      (error: unknown) => {
        setStarting(false)
        /*
         * Said plainly, because this is the one thing the new model costs and
         * pretending otherwise would be worse than the cost. Every board you
         * already have still opens and still edits with no network; there is
         * simply nowhere yet for a new one to live.
         */
        setStartError(
          error instanceof ShareFailed
            ? error.message
            : 'A new board needs a connection. Everything you already have still works offline.',
        )
      },
    )
  }

  /*
   * Boards that were made before an account was needed, still sitting in this
   * browser. Offered for moving, once, and only to somebody signed in — there
   * is nowhere to move them to otherwise.
   */
  const strays =
    identity === null ? [] : (listing?.boards ?? []).filter((board) => !board.shared)

  /*
   * A section with nothing in it is not an empty state, it is a gap.
   *
   * Signed out with no boards there is no list to show and no button to press,
   * and the one line left — "sign in to start a board" — is the heading of the
   * form directly below it said twice. So the ledger does not render at all
   * and the door is the form, which is what the door IS for somebody with no
   * account.
   */
  /*
   * The boards this workspace holds. A LOCAL board has no workspace — it lives
   * only in this browser — so narrowing to one hides it, which is right: it is
   * not in any workspace, and claiming it is what puts it in one.
   */
  const shown =
    space === null
      ? (listing?.boards ?? [])
      : (listing?.boards ?? []).filter((board) => board.workspaceId === space)

  const showBoards = listing === null || listing.boards.length > 0 || canStart

  return (
    <main className="of-home" data-testid="home">
      <div className="of-home__column">
        <header className="of-home__head">
          <div className="of-home__lockup">
            <img className="of-home__mark" src={logoMark} alt="" width={32} height={32} />
            <h1 className="of-home__title">OpenFrame</h1>

            {identity !== null && (
              <button
                type="button"
                className="of-home__account"
                aria-label={identity.displayName}
                data-testid="home-account"
                /*
                 * The colour is not decoration: it is the hue other people see
                 * on your cursor when you are on a board together, so saying so
                 * turns a swatch into a fact about yourself.
                 */
                data-tip={`Signed in as ${identity.displayName}. Click to sign out.`}
                aria-description={`Signed in as ${identity.displayName}. Click to sign out.`}
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
                <span className="of-home__account-name">{identity.displayName}</span>
              </button>
            )}

            {/* Only worth showing to somebody who has an account to be told. */}
            {identity !== null && <Mentions />}
          </div>

        </header>

        <div className="of-home__body">
          {/*
            * OUTSIDE the board list, deliberately.
            *
            * An invitation is not about your boards, and somebody following
            * one while signed out has none — which collapses the whole boards
            * section and took this notice with it. The test that caught it
            * passed in isolation and failed under load: the assertion had been
            * winning a race against the list finishing loading.
            */}
          {invitation !== null && identity === null && (
            <p className="of-home__note" data-testid="workspace-invited-signedout">
              You have been invited to a workspace. Sign in and it will be added to your list.
            </p>
          )}

          {invited !== null && (
            <p className="of-home__note" data-testid="workspace-invited">
              You have been added to a workspace as {invited === 'editor' ? 'an' : 'a'} {invited}.
            </p>
          )}

          {showBoards && (
          <section className="of-home__boards" aria-labelledby="of-home-boards">
            <h2 className="of-home__heading" id="of-home-boards">
              your boards
            </h2>

            <WorkspaceBar
              workspaces={spaces.workspaces}
              selected={space}
              onSelect={(id) => {
                setSpace(id)
                // The last workspace's link has nothing to do with this one.
                setInvite(null)
              }}
              onCreate={(name) => {
                void spaces.create(name).then((id) => {
                  if (id !== null) setSpace(id)
                })
              }}
              onShare={(id) => {
                void spaces.share(id).then((keys) => {
                  if (keys === null) return
                  setInvite(
                    `${window.location.origin}/?workspace=${id}&wk=${keys.editorKey}`,
                  )
                })
              }}
              invite={invite}
              busy={starting}
            />

            {listProblem !== null ? (
              <p className="of-home__row-problem" role="alert" data-testid="home-list-problem">
                Your boards could not be listed. {listProblem} Nothing on this device was changed.
              </p>
            ) : listing === null ? (
              <p className="of-home__note">Looking for your boards…</p>
            ) : shown.length === 0 ? (
              <p className="of-home__note" data-testid="home-empty">
                Nothing here yet.
              </p>
            ) : (
              <ul className="of-home__list" data-testid="home-boards">
                {shown.map((board, index) => (
                  <BoardRow
                    key={board.boardId}
                    board={board}
                    index={index}
                    readAt={listing.readAt}
                    repository={repository}
                    onChanged={refresh}
                  />
                ))}
              </ul>
            )}

            {strays.length > 0 && (
              <ClaimLocalBoards boards={strays} repository={repository} onChanged={refresh} />
            )}

            {canStart && (
              <button
                type="button"
                className="of-home__start"
                data-testid="home-start"
                disabled={starting}
                onClick={start}
              >
                {starting ? 'Starting…' : 'Start a board'}
              </button>
            )}

            {startError !== null && (
              <p className="of-home__row-problem" role="alert" data-testid="home-start-error">
                {startError}
              </p>
            )}
          </section>
          )}

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
              />
            </section>
          )}
        </div>
      </div>

      {/*
        * The front door's chrome layer.
        *
        * The board's lives in `Canvas.tsx`, and the two screens are separate
        * render roots with no component in common — so a surface opened from
        * here had nothing to portal into and rendered nothing at all. One per
        * screen, never two at once, which is what makes the layer's
        * `querySelector` unambiguous.
        */}
      <div className="of-chrome-layer" data-chrome-layer />
    </main>
  )
}
