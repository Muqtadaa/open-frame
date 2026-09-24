import { useEffect, useState } from 'react'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { accessKey, COLLAB_ENABLED, shareLink } from '../app/collab-config.js'
import { ACCOUNTS_ENABLED } from '../app/identity.js'
import { guestIdentity } from '../app/guest.js'
import { shareCurrentBoard, ShareFailed, type SharedBoard } from '../app/share.js'
import { useIdentity } from '../hooks/use-identity.js'
import { usePeers } from '../hooks/use-peers.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { canFollow, hueVar, initialOf } from '../scene/presence.js'

/**
 * The state of the room, and the way into one.
 *
 * Two things, because they are two states of one idea: a board is either
 * yours alone — in which case the only question is whether to share it — or it
 * is in a room, in which case what matters is whether the room can be reached
 * and who else is in it.
 *
 * Absent entirely when the build has no room server. A control that cannot work
 * is worse than a missing one: it invites the click and then explains.
 */
export function ShareControl() {
  const { runtime, collaboration } = useOpenFrame()
  const [status, setStatus] = useState(collaboration?.status ?? 'offline')
  const peers = usePeers()
  const following = useInteractionStore((state) => state.following)
  const setFollowing = useInteractionStore((state) => state.setFollowing)
  // With the other hooks, above every early return: a hook called
  // conditionally changes the order between renders.
  const identity = useIdentity()
  const [copied, setCopied] = useState<'edit' | 'view' | null>(null)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  const [links, setLinks] = useState<SharedBoard | null>(null)
  const [role, setRole] = useState(collaboration?.role ?? 'editor')
  /*
   * One anchor for both the links panel and the failure notice: they hang off
   * the same button and are never up at the same time, so two would be two
   * measurements of one rectangle.
   */
  const {
    ref: shareButton,
    anchor: shareAnchor,
    surface,
  } = useAnchoredTo<HTMLButtonElement>(shareError !== null || links !== null)

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onStatus(setStatus)
  }, [collaboration])

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onRole(setRole)
  }, [collaboration])

  if (!COLLAB_ENABLED) return null

  if (collaboration === null || collaboration === undefined) {
    /*
     * Sharing takes an account, like creating. A control that invites the
     * click and then explains is worse than one that is not there, and the
     * account chip beside it is already the way in.
     *
     * Only this branch. The other one — the room's status, who else is here,
     * the view-only badge — belongs to EVERYONE on a shared board, guests very
     * much included: the first version of this guard sat above both and took
     * a guest's connection indicator away with it.
     */
    if (ACCOUNTS_ENABLED && identity === null) return null

    return (
      <>
      <button
        ref={shareButton}
        type="button"
        className="of-status__share"
        disabled={sharing || runtime.readOnly}
        data-testid="share-board"
        title={
          runtime.readOnly
            ? 'This board is read-only and cannot be shared'
            : 'Give this board a link other people can open'
        }
        onClick={() => {
          setSharing(true)
          setShareError(null)
          void shareCurrentBoard(runtime).then(
            (shared) => {
              /*
               * The links are SHOWN before navigating, not copied silently.
               * There are two of them now, and which one somebody sends is the
               * decision this feature exists to give them — taking them
               * straight to the board would make that choice for them.
               */
              setSharing(false)
              setLinks(shared)
            },
            (error: unknown) => {
              setSharing(false)
              setShareError(
                error instanceof ShareFailed ? error.message : 'This board could not be shared.',
              )
            },
          )
        }}
      >
        {sharing ? 'Sharing…' : 'Share'}
      </button>
      {/*
        * Both hang ABOVE the button and are clamped, rather than pinned with
        * `bottom: calc(100% + 10px)` against whichever ancestor happened to be
        * positioned. Same 320px panel, same bar on the bottom edge, same way
        * of leaving the window sideways that the mentions list left it
        * downward.
        */}
      {shareError !== null && (
        <AnchoredSurface
          anchor={shareAnchor}
          surface={surface}
          prefer={['above', 'below']}
          testId="share-error-surface"
        >
          <p className="of-share__error" role="alert" data-testid="share-error">
            {shareError}
          </p>
        </AnchoredSurface>
      )}
      {links !== null && (
        <AnchoredSurface
          anchor={shareAnchor}
          surface={surface}
          prefer={['above', 'below']}
          testId="share-links-surface"
        >
          <ShareLinks links={links} onOpen={() => window.location.assign(links.editLink)} />
        </AnchoredSurface>
      )}
      </>
    )
  }

  // You first, then everyone else in a stable order — a row of faces where the
  // leftmost is always yours is a row you can read without hunting.
  const guest = guestIdentity()
  const you = identity === null ? guest : { name: identity.displayName, hue: identity.hue }
  const here = [
    { key: 'you', name: `${you.name} (you)`, hue: you.hue, clientId: null, followable: false },
    ...peers.map((peer) => ({
      key: String(peer.clientId),
      name: peer.name,
      hue: peer.hue,
      clientId: peer.clientId,
      /*
       * A follower is never a target. That one rule is what stops two people
       * following each other into a viewport that feeds itself, and it stops
       * every longer chain for free, because the second link can never be
       * made.
       */
      followable: canFollow(peer),
    })),
  ]

  return (
    <span className="of-status__room">
      <button
        type="button"
        className="of-status__share"
        data-testid="room-status"
        data-status={status}
        title={
          here.length === 1
            ? 'You are the only one here. Click to copy the link.'
            : `Here now: ${here.map((person) => person.name).join(', ')}. Click to copy the link.`
        }
        onClick={() => {
          /*
           * The link you arrived on, key and all. Copying a bare board id
           * would hand somebody a URL that a claimed room refuses — the share
           * button producing a dead link is the worst possible bug here.
           */
          void navigator.clipboard
            .writeText(
              shareLink(runtime.boardId, window.location.origin, accessKey(window.location.search)),
            )
            .then(() => {
              setCopied('edit')
              setTimeout(() => setCopied(null), 1600)
            })
        }}
      >
        <span className={`of-status__dot of-status__dot--${status}`} aria-hidden="true" />
        <span className="of-status__share-label">
          {copied !== null ? 'Link copied' : roomLabel(status)}
        </span>
      </button>

      {/*
       * Said plainly rather than left to be discovered by an edit that does
       * not stick. A viewer is not broken — they were given the other link.
       */}
      {role === 'viewer' && (
        <span className="of-status__watching" data-testid="viewing-only" title="You can watch, and others can see you here. Changing the board needs the edit link.">
          View only
        </span>
      )}

      {/*
       * A face per person. Named in the accessible label rather than only in a
       * tooltip, because who else is on the board is information, not decoration
       * — and `aria-hidden` on a colour chip would leave a screen reader with a
       * room that appears empty.
       */}
      <span className="of-status__people" data-testid="room-people" data-count={here.length}>
        {here.map((person) => {
          const isFollowed = person.clientId !== null && person.clientId === following
          if (person.clientId === null || !person.followable) {
            /*
             * Yourself, or somebody there is nothing to follow — a client too
             * old to send a viewport, or one already following somebody.
             * Rendered as the chip it always was rather than a dead button: a
             * control that cannot do anything is worse than no control.
             */
            return (
              <span
                key={person.key}
                className="of-status__person"
                style={{ background: hueVar(person.hue) }}
                title={person.name}
                role="img"
                aria-label={person.name}
              >
                {initialOf(person.name)}
              </span>
            )
          }
          const label = isFollowed ? `Stop following ${person.name}` : `Follow ${person.name}`
          return (
            <button
              key={person.key}
              type="button"
              className={`of-status__person of-status__person--follow${
                isFollowed ? ' of-status__person--following' : ''
              }`}
              style={{ background: hueVar(person.hue) }}
              title={label}
              aria-label={label}
              aria-pressed={isFollowed}
              data-testid={`follow-${person.key}`}
              onClick={() => {
                setFollowing(isFollowed ? null : person.clientId)
              }}
            >
              {initialOf(person.name)}
            </button>
          )
        })}
      </span>
    </span>
  )
}

/**
 * The two links, side by side, with what each one gives away.
 *
 * Shown together and described in the same words a person would use, because
 * the entire risk of this feature is sending the wrong one — and a chooser
 * that says "edit" and "view" without saying what that MEANS is a chooser
 * somebody gets wrong once and then stops trusting.
 */
function ShareLinks({ links, onOpen }: { readonly links: SharedBoard; readonly onOpen: () => void }) {
  const [copied, setCopied] = useState<'edit' | 'view' | null>(null)

  const copy = (which: 'edit' | 'view'): void => {
    void navigator.clipboard
      .writeText(which === 'edit' ? links.editLink : links.viewLink)
      .then(() => {
        setCopied(which)
        setTimeout(() => setCopied(null), 1600)
      })
  }

  return (
    <div className="of-share" role="dialog" aria-label="Share this board" data-testid="share-links">
      {/*
        * Says it MOVED, not that it gained links.
        *
        * The page behind this panel is a board that no longer exists: sharing
        * wrote it under a new id and removed the local one, so nothing typed
        * here now is kept. Leaving that unsaid would be an interface quietly
        * disagreeing with itself, which is the failure this world is built to
        * avoid.
        */}
      <p className="of-share__lead">
        This board has moved.
      </p>

      <button
        type="button"
        className="of-share__link"
        data-testid="copy-edit"
        data-copied={copied === 'edit' ? 'yes' : 'no'}
        onClick={() => copy('edit')}
      >
        <span className="of-share__link-name">{copied === 'edit' ? 'Copied' : 'Copy edit link'}</span>
        <span className="of-share__link-what">They can change the board</span>
      </button>

      <button
        type="button"
        className="of-share__link"
        data-testid="copy-view"
        data-copied={copied === 'view' ? 'yes' : 'no'}
        onClick={() => copy('view')}
      >
        <span className="of-share__link-name">{copied === 'view' ? 'Copied' : 'Copy view link'}</span>
        <span className="of-share__link-what">They can watch, and be seen watching</span>
      </button>

      <button type="button" className="of-button of-button--primary of-button--large of-share__open" data-testid="open-shared" onClick={onOpen}>
        Open the shared board
      </button>
    </div>
  )
}

function roomLabel(status: string): string {
  switch (status) {
    case 'connected':
      return 'Shared'
    case 'connecting':
      return 'Reconnecting…'
    default:
      return 'Offline'
  }
}
