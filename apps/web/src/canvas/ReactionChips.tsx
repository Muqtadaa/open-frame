import type { ObjectId } from '@openframe/core'

import { useCanEdit } from '../hooks/use-can-edit.js'
import { useCommands } from '../hooks/use-commands.js'
import { useMe } from '../hooks/use-me.js'
import { useReactions, type ReactionGroup } from '../hooks/use-reactions.js'
import { glyphFor } from '../scene/reaction-glyphs.js'

/**
 * The reactions on a note, drawn on the note.
 *
 * IN the world rather than on the apparatus layer (rule 24): they are part of
 * how the note looks — they scale with it, cull with it and print with it —
 * not a handle for changing it. They sit inside its bottom edge so that hit
 * testing by bounds still finds the note under them.
 *
 * Each chip is a button: pressing it adds or takes back YOUR reaction of that
 * kind. Marked as editor chrome, so a press is a press and never the start of
 * a drag.
 */
export function ReactionChips({ id }: { readonly id: ObjectId }) {
  const groups = useReactions(id)
  /*
   * Split in two so a note nobody has reacted to costs one index lookup and
   * nothing else. Every visible note mounts this; asking who I am, what I may
   * do and building the command set for each of them would put an account
   * subscription on every note on screen.
   */
  if (groups.length === 0) return null
  return <Chips id={id} groups={groups} />
}

function Chips({
  id,
  groups,
}: {
  readonly id: ObjectId
  readonly groups: readonly ReactionGroup[]
}) {
  const me = useMe()
  const commands = useCommands()
  const canEdit = useCanEdit()

  return (
    <div className="of-reactions of-editor-chrome" data-testid="reactions">
      {groups.map((group) => {
        const glyph = glyphFor(group.glyph)
        const mine = group.people.some((person) => person.key === me.key)
        const tip = describe(group, glyph.label, me.key, canEdit)
        return (
          <button
            key={group.glyph}
            type="button"
            className="of-reaction"
            data-testid={`reaction-${group.glyph}`}
            aria-pressed={mine}
            aria-label={tip}
            data-tip={tip}
            disabled={!canEdit}
            onClick={() => {
              commands.toggleReaction([id], group.glyph, me)
            }}
          >
            <span aria-hidden="true">{glyph.emoji}</span>
            <span className="of-reaction__count">{group.people.length}</span>
          </button>
        )
      })}
    </div>
  )
}

/** "Agree, 3: Otter, Heron and you. Press to take yours back." */
function describe(group: ReactionGroup, label: string, myKey: string, canEdit: boolean): string {
  const others = group.people.filter((person) => person.key !== myKey).map((p) => p.name)
  const mine = others.length < group.people.length
  const names = mine ? [...others, 'you'] : others
  const who =
    names.length <= 1
      ? (names[0] ?? '')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`
  const action = !canEdit ? '' : mine ? ' Press to take yours back.' : ' Press to add yours.'
  return `${label}, ${String(group.people.length)}: ${who}.${action}`
}
