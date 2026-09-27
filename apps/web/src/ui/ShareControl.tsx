import { useEffect, useRef, useState, type RefObject } from 'react'
import { createPortal } from 'react-dom'

import { AnchoredSurface } from '../controls/AnchoredSurface.js'
import { useAnchoredTo } from '../controls/use-anchor.js'
import { useDismiss, useFocusOnOpen } from '../controls/use-dismiss.js'
import { accessKey, COLLAB_ENABLED, shareLink } from '../app/collab-config.js'
import { ACCOUNTS_ENABLED } from '../app/identity.js'
import { guestIdentity } from '../app/guest.js'
import { ownedKeys, setBoardPassword } from '../app/board-password.js'
import { shareCurrentBoard, ShareFailed, type SharedBoard } from '../app/share.js'
import { useIdentity } from '../hooks/use-identity.js'
import { usePeers } from '../hooks/use-peers.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { canFollow, hueVar, initialOf } from '../scene/presence.js'
import { Gate, GateActions, GateBody } from './Gate.js'

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
  // The clipboard can refuse; saying nothing made the chip look broken.
  const [copyFailed, setCopyFailed] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [shareError, setShareError] = useState<string | null>(null)
  /*
   * The links arrive with the board: a move that just happened hands them
   * over through this tab's session, once, so the shared board opens with the
   * choice of which to send already in front of the person who asked.
   */
  const [links, setLinks] = useState<SharedBoard | null>(() => takeHandedOver(runtime.boardId))
  const [asking, setAsking] = useState(false)
  /*
   * Whether this board is YOURS, which decides what the chip does. Asked once,
   * of the account, when a signed-in person is on a board in a room.
   */
  const [owned, setOwned] = useState<Awaited<ReturnType<typeof ownedKeys>>>(null)
  const [role, setRole] = useState(collaboration?.role ?? 'editor')
  /*
   * The links hang off the room chip, on the board a move lands on. A failed
   * move is said in the question that started it, so nothing else hangs here.
   */
  const {
    ref: shareButton,
    anchor: shareAnchor,
    surface,
  } = useAnchoredTo<HTMLButtonElement>(links !== null)

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onStatus(setStatus)
  }, [collaboration])

  useEffect(() => {
    if (collaboration === null || collaboration === undefined || identity === null) return
    let live = true
    void ownedKeys(runtime.boardId).then((keys) => {
      if (live) setOwned(keys)
    })
    return () => {
      live = false
    }
  }, [collaboration, identity, runtime.boardId])

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

    const shareHint = runtime.readOnly
      ? 'This board is read-only and cannot be shared'
      : 'Give this board a link other people can open'

    return (
      <>
      <button
        ref={shareButton}
        type="button"
        className="of-status__share"
        disabled={runtime.readOnly}
        aria-label="Share"
        data-testid="share-board"
        data-tip={shareHint}
        aria-description={shareHint}
        onClick={() => {
          setShareError(null)
          setAsking(true)
        }}
      >
        Share
      </button>
      {asking && (
        <ShareConfirm
          moving={sharing}
          error={shareError}
          onMove={() => {
            setSharing(true)
            setShareError(null)
            void shareCurrentBoard(runtime).then(
              (shared) => {
                /*
                 * Straight onto the board that now exists. The links used to
                 * be shown over the page that had just been moved away from,
                 * which went on taking edits and saying "Saved" — and lost
                 * every one of them (rule 7). The choice of link is offered
                 * on arrival instead, where anything typed next is kept.
                 */
                handOver(shared)
                window.location.assign(shared.editLink)
              },
              (error: unknown) => {
                setSharing(false)
                setShareError(
                  error instanceof ShareFailed
                    ? error.message
                    : 'This board could not be moved. It is still here, exactly as it was.',
                )
              },
            )
          }}
          onCancel={() => {
            setAsking(false)
            setShareError(null)
            // Once the board behind is no longer inert, or the focus would not take.
            requestAnimationFrame(() => shareButton.current?.focus())
          }}
        />
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

  /*
   * Three faces at most, and a count for the rest: at 24px without overlap a
   * whole room would push the bar's other controls off a narrow window. The
   * person you are following is always among the three, so the control that
   * stops following is never hidden behind "+2".
   */
  const MAX_FACES = 3
  const followed = here.find(
    (person) => person.clientId !== null && person.clientId === following,
  )
  const shown =
    followed === undefined || here.indexOf(followed) < MAX_FACES
      ? here.slice(0, MAX_FACES)
      : [...here.slice(0, MAX_FACES - 1), followed]
  const hidden = here.filter((person) => !shown.includes(person))
  const moreLabel = `Also here: ${hidden.map((person) => person.name).join(', ')}`

  /*
   * The chip says which link it hands over, because that is the whole risk of
   * sharing. An owner gets both, and the password beside them; anybody else
   * gets the link they arrived on, named for what it gives.
   */
  const linkKind = role === 'viewer' ? 'view' : 'edit'
  const action =
    owned !== null
      ? 'Click for both links and the password.'
      : `Click to copy the ${linkKind} link.`
  const roomHint =
    here.length === 1
      ? `You are the only one here. ${action}`
      : `Here now: ${here.map((person) => person.name).join(', ')}. ${action}`
  const ownLinks = (): SharedBoard => {
    const origin = window.location.origin
    return {
      boardId: runtime.boardId,
      editLink: shareLink(
        runtime.boardId,
        origin,
        owned?.edit ?? accessKey(window.location.search),
      ),
      viewLink: shareLink(runtime.boardId, origin, owned?.view ?? null),
    }
  }

  return (
    <span className="of-status__room">
      <button
        ref={shareButton}
        type="button"
        className="of-status__share"
        data-testid="room-status"
        aria-label={
          copyFailed
            ? 'Could not copy the link'
            : copied !== null
              ? `${copied === 'edit' ? 'Edit' : 'View'} link copied`
              : roomLabel(status)
        }
        aria-expanded={owned !== null ? links !== null : undefined}
        data-status={status}
        data-tip={roomHint}
        aria-description={roomHint}
        onClick={() => {
          if (owned !== null) {
            setLinks((open) => (open === null ? ownLinks() : null))
            return
          }
          /*
           * The link you arrived on, key and all. Copying a bare board id
           * would hand somebody a URL that a claimed room refuses — the share
           * button producing a dead link is the worst possible bug here.
           */
          void navigator.clipboard
            .writeText(
              shareLink(runtime.boardId, window.location.origin, accessKey(window.location.search)),
            )
            .then(
              () => {
                setCopied(linkKind)
                setTimeout(() => setCopied(null), 1600)
              },
              () => {
                setCopyFailed(true)
                setTimeout(() => setCopyFailed(false), 2400)
              },
            )
        }}
      >
        <span className={`of-status__dot of-status__dot--${status}`} aria-hidden="true" />
        <span className="of-status__share-label">
          {copyFailed
            ? 'Could not copy'
            : copied !== null
              ? `${copied === 'edit' ? 'Edit' : 'View'} link copied`
              : roomLabel(status)}
        </span>
      </button>

      {/*
       * Said plainly rather than left to be discovered by an edit that does
       * not stick. A viewer is not broken — they were given the other link.
       */}
      {role === 'viewer' && (
        <span className="of-status__watching" data-testid="viewing-only" data-tip="You can watch, and others can see you here. Changing the board needs the edit link." aria-description="You can watch, and others can see you here. Changing the board needs the edit link.">
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
        {shown.map((person) => {
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
                data-tip={person.name}
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
              data-tip={label}
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
        {hidden.length > 0 && (
          <span
            className="of-status__more"
            data-testid="room-more"
            data-tip={moreLabel}
            role="img"
            aria-label={moreLabel}
          >
            +{hidden.length}
          </span>
        )}
      </span>
      {links !== null && (
        <AnchoredSurface
          anchor={shareAnchor}
          surface={surface}
          prefer={['below', 'above']}
          testId="share-links-surface"
        >
          <ShareLinks
            links={links}
            trigger={shareButton}
            password={{
              boardId: runtime.boardId,
              editor: owned?.edit ?? accessKey(window.location.search) ?? '',
              owner: owned?.owner ?? null,
            }}
            onDone={() => {
              setLinks(null)
              shareButton.current?.focus()
            }}
          />
        </AnchoredSurface>
      )}
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
function ShareLinks({
  links,
  trigger,
  password,
  onDone,
}: {
  readonly links: SharedBoard
  readonly trigger: RefObject<HTMLElement | null>
  readonly password: { readonly boardId: SharedBoard['boardId']; readonly editor: string; readonly owner: string | null }
  readonly onDone: () => void
}) {
  const [copied, setCopied] = useState<'edit' | 'view' | null>(null)
  const [copyFailed, setCopyFailed] = useState(false)
  const first = useRef<HTMLButtonElement>(null)
  const sheet = useRef<HTMLDivElement>(null)
  // Into the sheet on arrival, since it is what the press was for; and out on
  // Escape or a press elsewhere, which it used to ignore.
  useFocusOnOpen(sheet, first)
  useDismiss(sheet, trigger, onDone)

  const copy = (which: 'edit' | 'view'): void => {
    void navigator.clipboard.writeText(which === 'edit' ? links.editLink : links.viewLink).then(
      () => {
        setCopyFailed(false)
        setCopied(which)
        setTimeout(() => setCopied(null), 1600)
      },
      // A refused clipboard said nothing, and the sheet looked broken.
      () => setCopyFailed(true),
    )
  }

  return (
    <div ref={sheet} className="of-sheet" role="dialog" aria-label="Share this board" data-testid="share-links">
      <p className="of-share__lead">Shared. Send the link that gives what you mean to give.</p>

      <button
        ref={first}
        type="button"
        className="of-share__link"
        data-testid="copy-edit"
        data-copied={copied === 'edit' ? 'yes' : 'no'}
        onClick={() => copy('edit')}
      >
        <span className="of-share__link-name">Copy edit link</span>
        {/* The name stays: "Copied" in its place did not say which one. */}
        <span className="of-share__link-what">
          {copied === 'edit' ? 'Copied' : 'They can change the board'}
        </span>
      </button>

      <button
        type="button"
        className="of-share__link"
        data-testid="copy-view"
        data-copied={copied === 'view' ? 'yes' : 'no'}
        onClick={() => copy('view')}
      >
        <span className="of-share__link-name">Copy view link</span>
        <span className="of-share__link-what">
          {copied === 'view' ? 'Copied' : 'They can watch, and be seen watching'}
        </span>
      </button>

      {copyFailed && (
        <p className="of-share__problem" role="alert">
          The link could not be copied. Your browser may be blocking the clipboard.
        </p>
      )}

      <SharePassword {...password} />

      <button type="button" className="of-button of-share__open" data-testid="share-done" onClick={onDone}>
        Done
      </button>
    </div>
  )
}

/**
 * The board's password, beside the two links it protects.
 *
 * It lived on the board's row in the list, a place nobody sharing a board was
 * looking. Setting it is a neutral action — it used to wear the correction red
 * of a destructive one — and removing it is its own control, named for what it
 * does rather than "No password" beside the field.
 */
function SharePassword({
  boardId,
  editor,
  owner,
}: {
  readonly boardId: SharedBoard['boardId']
  readonly editor: string
  readonly owner: string | null
}) {
  const [secret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const [said, setSaid] = useState<{ readonly ok: boolean; readonly text: string } | null>(null)

  const apply = (next: string | null): void => {
    setBusy(true)
    setSaid(null)
    void setBoardPassword(boardId, { owner, editor }, next).then((outcome) => {
      setBusy(false)
      if (!outcome.ok) {
        setSaid({ ok: false, text: outcome.reason })
        return
      }
      setSecret('')
      setSaid({
        ok: true,
        text: next === null ? 'Both links open without a password.' : 'Both links now ask for it.',
      })
    })
  }

  return (
    <form
      className="of-share__password"
      onSubmit={(event) => {
        event.preventDefault()
        if (secret !== '') apply(secret)
      }}
    >
      <label className="of-account__field">
        <span className="of-account__label">password</span>
        <input
          className="of-input"
          type="password"
          autoComplete="off"
          aria-label="A password for this board"
          aria-describedby="of-share-password-what"
          data-testid="password-input"
          value={secret}
          onChange={(event) => {
            setSecret(event.target.value)
          }}
        />
      </label>
      <span className="of-share__link-what" id="of-share-password-what">
        Both links ask for it. Anyone who already has the board open is signed out of it.
      </span>
      <span className="of-share__password-actions">
        <button
          type="submit"
          className="of-button"
          data-testid="password-save"
          aria-disabled={busy || secret === ''}
          aria-busy={busy}
        >
          Set password
        </button>
        <button
          type="button"
          className="of-button of-button--ghost"
          data-testid="password-clear"
          aria-disabled={busy}
          onClick={() => {
            if (!busy) apply(null)
          }}
        >
          Remove password
        </button>
      </span>
      {said !== null && (
        <p
          className={said.ok ? 'of-share__said' : 'of-share__problem'}
          role={said.ok ? 'status' : 'alert'}
          data-testid="password-said"
        >
          {said.text}
        </p>
      )}
    </form>
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

/** Where a move leaves its links for the board it lands on. */
const HANDOVER = 'openframe:shared-links'

function handOver(shared: SharedBoard): void {
  try {
    sessionStorage.setItem(HANDOVER, JSON.stringify(shared))
  } catch {
    // Storage refused: the board still moved, and the links are on its row.
  }
}

/** The links a move left for THIS board, taken once so a reload does not reopen them. */
function takeHandedOver(boardId: SharedBoard['boardId']): SharedBoard | null {
  try {
    const raw = sessionStorage.getItem(HANDOVER)
    if (raw === null) return null
    const shared = JSON.parse(raw) as Partial<SharedBoard>
    if (shared.boardId !== boardId) return null
    sessionStorage.removeItem(HANDOVER)
    return typeof shared.editLink === 'string' && typeof shared.viewLink === 'string'
      ? { boardId, editLink: shared.editLink, viewLink: shared.viewLink }
      : null
  } catch {
    return null
  }
}

/**
 * The question before a board is moved into a room.
 *
 * A GATE, and deliberately: moving is the one step here that can lose work,
 * because the page it starts on stops existing. So the board behind is inert
 * from the question until the page has left for the board that does exist —
 * nothing can be typed into a board that is in the middle of moving.
 */
function ShareConfirm({
  moving,
  error,
  onMove,
  onCancel,
}: {
  readonly moving: boolean
  readonly error: string | null
  readonly onMove: () => void
  readonly onCancel: () => void
}) {
  const confirm = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.key !== 'Escape' || moving) return
      event.preventDefault()
      event.stopPropagation()
      onCancel()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [moving, onCancel])

  const app = document.querySelector('.of-app')
  if (app === null) return null
  return createPortal(
    <Gate heading="Move this board to share it?" testId="share-dialog" initialFocus={confirm}>
      <GateBody>
        It moves from this browser into your account, where it gets two links: one that lets people
        change it, and one that lets them watch. It is the same board; nothing is copied.
      </GateBody>
      {error !== null && (
        <p className="of-gone__body" role="alert" data-testid="share-error">
          {error}
        </p>
      )}
      <GateActions>
        <button
          ref={confirm}
          type="button"
          className="of-button of-button--primary"
          data-testid="share-confirm"
          aria-disabled={moving}
          aria-busy={moving}
          onClick={() => {
            if (!moving) onMove()
          }}
        >
          {moving ? 'Moving…' : error === null ? 'Move and share' : 'Try again'}
        </button>
        <button
          type="button"
          className="of-button"
          data-testid="share-cancel"
          aria-disabled={moving}
          onClick={() => {
            if (!moving) onCancel()
          }}
        >
          Not now
        </button>
      </GateActions>
    </Gate>,
    app,
  )
}
