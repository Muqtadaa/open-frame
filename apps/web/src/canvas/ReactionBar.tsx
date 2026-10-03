import { useMemo } from 'react'

import { useCanEdit } from '../hooks/use-can-edit.js'
import { useCommands } from '../hooks/use-commands.js'
import { useBoardDocument } from '../hooks/use-document-object.js'
import { useMe } from '../hooks/use-me.js'
import { useReactions } from '../hooks/use-reactions.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { useOpenFrame } from '../runtime/context.js'
import { CONNECT_REACH_PX } from '../scene/connect-points.js'
import { REACTION_GLYPHS } from '../scene/reaction-glyphs.js'
import { ChromeSurface } from './EditorChrome.js'
import { useOptionsPanelRect } from './options-panel.js'

/**
 * The reactions on offer, beside one selected note.
 *
 * On the chrome layer, like the arrange bar, so it is a constant size at every
 * zoom. For ONE object only: the arrange bar is for two or more, and two bars
 * competing for the same edge of a selection is how apparatus ends up stacked.
 * A selection of several reacts through the context menu.
 *
 * Held clear of the connection points, which sit just outside every edge of a
 * single selected note — anchored to the note grown by their reach, so the bar
 * never lands on the dot a line is started from.
 */
export function ReactionBar() {
  const { runtime } = useOpenFrame()
  const document = useBoardDocument()
  const selection = useInteractionStore((state) => state.selection)
  const dragKind = useInteractionStore((state) => state.drag.kind)
  const editingId = useInteractionStore((state) => state.editingId)
  const croppingId = useInteractionStore((state) => state.croppingId)
  const panel = useOptionsPanelRect()
  const canEdit = useCanEdit()

  const target = useMemo(() => {
    if (selection.size !== 1) return null
    const [id] = [...selection]
    const object = id === undefined ? undefined : document.objects.get(id)
    if (object === undefined || object.hidden) return null
    if (runtime.registry.get(object.type)?.capabilities.markable !== true) return null
    return { id: object.id, bounds: runtime.registry.boundsOf(object, document) }
  }, [selection, document, runtime.registry])

  if (!canEdit || target === null) return null
  if (dragKind !== 'idle' || editingId !== null || croppingId !== null) return null

  return (
    <ChromeSurface
      bounds={target.bounds}
      clearance={CONNECT_REACH_PX}
      prefer={['below', 'above', 'right', 'left']}
      testId="reaction-bar"
      avoid={panel}
    >
      <Bar id={target.id} />
    </ChromeSurface>
  )
}

function Bar({ id }: { readonly id: Parameters<typeof useReactions>[0] }) {
  const commands = useCommands()
  const me = useMe()
  const groups = useReactions(id)
  return (
    <div className="of-reaction-bar of-surface" role="group" aria-label="React">
      {REACTION_GLYPHS.map((glyph) => {
        const mine =
          groups
            .find((group) => group.glyph === glyph.key)
            ?.people.some((person) => person.key === me.key) === true
        return (
          <button
            key={glyph.key}
            type="button"
            className="of-icon-button of-reaction-bar__button"
            aria-pressed={mine}
            aria-label={glyph.label}
            data-tip={glyph.label}
            data-testid={`react-${glyph.key}`}
            onClick={() => {
              commands.toggleReaction([id], glyph.key, me)
            }}
          >
            <span aria-hidden="true">{glyph.emoji}</span>
          </button>
        )
      })}
    </div>
  )
}
