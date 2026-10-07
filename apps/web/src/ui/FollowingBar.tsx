import { usePeers } from '../hooks/use-peers.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { hueVar } from '../scene/presence.js'

/**
 * Who you are following, along the top of the board, with the way out.
 *
 * Following was shown only as a ring on a 24px face in the bar, so somebody
 * whose board was moving on its own had to find which face was pressed to
 * learn why, and press it again to stop (PR 3 critique, 2026-10-07). The board
 * says it in words while it happens.
 */
export function FollowingBar() {
  const following = useInteractionStore((state) => state.following)
  const setFollowing = useInteractionStore((state) => state.setFollowing)
  const peers = usePeers()
  if (following === null) return null
  const person = peers.find((peer) => peer.clientId === following)
  if (person === undefined) return null
  return (
    <section className="of-notice of-following" aria-label="Following" data-testid="following-bar">
      <span
        className="of-following__dot"
        style={{ background: hueVar(person.hue) }}
        aria-hidden="true"
      />
      <span className="of-following__who">Following {person.name}</span>
      <button
        type="button"
        className="of-button"
        onClick={() => {
          setFollowing(null)
        }}
      >
        Stop
      </button>
    </section>
  )
}
