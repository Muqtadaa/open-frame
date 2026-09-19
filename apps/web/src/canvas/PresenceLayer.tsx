import { useMemo } from 'react'

import type { Rect } from '@openframe/core'

import { usePeers } from '../hooks/use-peers.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { hueVar, type DragDelta, type Peer } from '../scene/presence.js'

/**
 * Other people: where they are pointing, what they have hold of.
 *
 * Drawn in world space so it tracks the board exactly, with every dimension
 * divided by zoom so a cursor stays the same size on screen — the same rule the
 * selection handles follow, and for the same reason: a cursor that shrinks with
 * the board is a dot at 25%.
 *
 * Nothing here is interactive. `pointer-events: none` throughout, because a
 * cursor belonging to somebody else must never be a thing you can click.
 */
/** The same rect, moved. Never mutated: these come straight off the registry. */
function shifted(rect: Rect, by: DragDelta): Rect {
  return { ...rect, x: rect.x + by.dx, y: rect.y + by.dy }
}

export function PresenceLayer() {
  const peers = usePeers()
  if (peers.length === 0) return null
  return <PresentPeers peers={peers} />
}

function PresentPeers({ peers }: { readonly peers: readonly Peer[] }) {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const zoom = useInteractionStore((state) => state.viewport.zoom)

  /*
   * Bounds come from the registry, never from `object.frame`: a connector has
   * no meaningful frame, and asking for one draws a degenerate box at the
   * origin — which the selection overlay got wrong once already.
   */
  const outlines = useMemo(() => {
    const drawn: { key: string; rect: Rect; peer: Peer; editing: boolean }[] = []
    for (const peer of peers) {
      for (const id of peer.selection) {
        const object = document.objects.get(id)
        if (object === undefined) continue
        /*
         * Offset by the same delta the object itself is drawn with, when its
         * owner is mid-drag. The bounds come from the DOCUMENT, which rule 4
         * says has not moved yet — so an outline left where the document has
         * it would sit still while the note slides out from under it.
         */
        const held = peer.drag
        const rect =
          held === null
            ? runtime.registry.boundsOf(object, document)
            : shifted(runtime.registry.boundsOf(object, document), held)
        drawn.push({
          key: `${String(peer.clientId)}:${id}`,
          rect,
          peer,
          editing: peer.editing === id,
        })
      }
      // An object being edited is always outlined, even when the peer's
      // selection has moved on — that is the one that must not be touched.
      if (peer.editing !== null && !peer.selection.includes(peer.editing)) {
        const object = document.objects.get(peer.editing)
        if (object !== undefined) {
          drawn.push({
            key: `${String(peer.clientId)}:editing`,
            rect: runtime.registry.boundsOf(object, document),
            peer,
            editing: true,
          })
        }
      }
    }
    return drawn
  }, [peers, document, runtime.registry])

  return (
    <div className="of-presence" aria-hidden="true">
      {outlines.map(({ key, rect, peer, editing }) => (
        <div
          key={key}
          className={`of-presence__outline${editing ? ' of-presence__outline--editing' : ''}`}
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            // Constant on screen, whatever the zoom.
            borderWidth: 1.5 / zoom,
            // Both, and they are not the same thing: `color` drives the border
            // through `currentcolor`, while the label needs a value that
            // survives setting its own `color`. See the note in styles.css.
            color: hueVar(peer.hue),
            ['--of-presence-hue' as string]: hueVar(peer.hue),
          }}
        >
          {editing && (
            <span className="of-presence__tag" style={{ transform: `scale(${String(1 / zoom)})` }}>
              {peer.name} is editing
            </span>
          )}
        </div>
      ))}

      {peers.map((peer) =>
        peer.cursor === null ? null : (
          <div
            key={peer.clientId}
            className="of-presence__cursor"
            style={{
              transform: `translate(${String(peer.cursor.x)}px, ${String(peer.cursor.y)}px) scale(${String(1 / zoom)})`,
              color: hueVar(peer.hue),
              ['--of-presence-hue' as string]: hueVar(peer.hue),
            }}
          >
            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
              {/*
                Filled with the peer's colour and outlined in the page's, so the
                pointer stays readable over a dark slip as well as over the
                ruled ground.
              */}
              <path
                d="M2 1.5l10.5 5.2-4.6 1.4-1.6 4.6L2 1.5z"
                fill="currentColor"
                stroke="var(--of-page)"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
            </svg>
            <span className="of-presence__name">{peer.name}</span>
          </div>
        ),
      )}
    </div>
  )
}
