import { useEffect, useState } from 'react'

import { COLLAB_ENABLED, shareLink } from '../app/collab-config.js'
import { shareCurrentBoard } from '../app/share.js'
import { useOpenFrame } from '../runtime/context.js'
import { PeopleIcon } from './icons.js'

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
  const [peers, setPeers] = useState<readonly { clientId: number; state: Record<string, unknown> }[]>(
    [],
  )
  const [copied, setCopied] = useState(false)
  const [sharing, setSharing] = useState(false)

  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    const offStatus = collaboration.onStatus(setStatus)
    const offPeers = collaboration.onPeers(setPeers)
    return () => {
      offStatus()
      offPeers()
    }
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

  const names = peers
    .map((peer) => (typeof peer.state.name === 'string' ? peer.state.name : 'Guest'))
    .sort()

  return (
    <button
      type="button"
      className="of-status__share"
      data-testid="room-status"
      data-status={status}
      title={
        names.length === 0
          ? 'You are the only one here. Click to copy the link.'
          : `Here now: ${names.join(', ')}. Click to copy the link.`
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
      <PeopleIcon />
      {/*
        Everyone in the room INCLUDING you, because "2 here" when two people are
        looking at it is what a person expects; `peers` is everyone else.
      */}
      <span data-testid="room-people">{peers.length + 1}</span>
      <span className="of-status__share-label">{copied ? 'Link copied' : roomLabel(status)}</span>
    </button>
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
