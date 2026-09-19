import { useEffect, useState } from 'react'

import { COLLAB_ENABLED, shareLink } from '../app/collab-config.js'
import { guestIdentity } from '../app/guest.js'
import { shareCurrentBoard } from '../app/share.js'
import { usePeers } from '../hooks/use-peers.js'
import { useOpenFrame } from '../runtime/context.js'
import { hueVar, initialOf } from '../scene/presence.js'

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
  const [copied, setCopied] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onStatus(setStatus)
  }, [collaboration])

  if (!COLLAB_ENABLED) return null

  if (collaboration === null || collaboration === undefined) {
    return (
      <button
        type="button"
        className="of-status__share"
        disabled={sharing || runtime.readOnly}
        data-testid="share-board"
        title={
          runtime.readOnly
            ? 'This board is read-only and cannot be shared'
            : 'Copy this board to a shared link'
        }
        onClick={() => {
          setSharing(true)
          void shareCurrentBoard(runtime).then(
            (shared) => {
              // A full navigation, not a router push: the runtime is built
              // once, at boot, against one board.
              window.location.assign(shared.link)
            },
            () => setSharing(false),
          )
        }}
      >
        {sharing ? 'Sharing…' : 'Share'}
      </button>
    )
  }

  // You first, then everyone else in a stable order — a row of faces where the
  // leftmost is always yours is a row you can read without hunting.
  const you = guestIdentity()
  const here = [{ key: 'you', name: `${you.name} (you)`, hue: you.hue }, ...peers.map((peer) => ({
    key: String(peer.clientId),
    name: peer.name,
    hue: peer.hue,
  }))]

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
          void navigator.clipboard
            .writeText(shareLink(runtime.boardId, window.location.origin))
            .then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1600)
            })
        }}
      >
        <span className={`of-status__dot of-status__dot--${status}`} aria-hidden="true" />
        <span className="of-status__share-label">{copied ? 'Link copied' : roomLabel(status)}</span>
      </button>

      {/*
       * A face per person. Named in the accessible label rather than only in a
       * tooltip, because who else is on the board is information, not decoration
       * — and `aria-hidden` on a colour chip would leave a screen reader with a
       * room that appears empty.
       */}
      <span className="of-status__people" data-testid="room-people" data-count={here.length}>
        {here.map((person) => (
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
        ))}
      </span>
    </span>
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
