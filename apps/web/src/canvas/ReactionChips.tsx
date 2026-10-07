import type { ObjectId } from '@openframe/core'
import { useState } from 'react'

import { useCanEdit } from '../hooks/use-can-edit.js'
import { useCommands } from '../hooks/use-commands.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
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
   * What was already here when the note was drawn. Only a reaction that
   * arrives AFTER that is new, and inked in: opening a board, or scrolling a
   * note into view, must not set every chip on it popping (motion.css).
   */
  const [born] = useState(() => new Set(groups.map((group) => group.glyph)))
  /*
   * Split in two so a note nobody has reacted to costs one index lookup and
   * nothing else. Every visible note mounts this; asking who I am, what I may
   * do and building the command set for each of them would put an account
   * subscription on every note on screen.
   */
  if (groups.length === 0) return null
  return <Chips id={id} groups={groups} born={born} />
}

function Chips({
  id,
  groups,
  born,
}: {
  readonly id: ObjectId
  readonly groups: readonly ReactionGroup[]
  readonly born: ReadonlySet<string>
}) {
  const me = useMe()
  const commands = useCommands()
  const canEdit = useCanEdit()
  // While voting, a press on a note's reactions is a vote on the note: the
  // chips step aside rather than toggling somebody's reaction off.
  const voting = useInteractionStore((state) => state.tool === 'dot')

  return (
    <div
      className={`of-reactions${voting ? '' : ' of-editor-chrome'}`}
      data-testid="reactions"
      style={voting ? { pointerEvents: 'none' } : undefined}
    >
      {groups.map((group) => {
        const glyph = glyphFor(group.glyph)
        // Until it is known who "me" is, nothing is mine and nothing is pressable.
        const mine = me !== null && group.people.some((person) => person.key === me.key)
        const who = whoReacted(group, me?.key ?? null)
        return (
          <button
            key={group.glyph}
            type="button"
            className="of-reaction"
            data-testid={`reaction-${group.glyph}`}
            data-fresh={!born.has(group.glyph)}
            aria-pressed={mine}
            /*
             * Named for the reaction AND its count, as it is drawn: the count
             * was visible and unsaid. Who left it is the description.
             */
            aria-label={`${glyph.label}, ${String(group.people.length)}`}
            aria-description={who}
            data-tip={who}
            disabled={!canEdit || me === null}
            onClick={() => {
              if (me !== null) commands.toggleReaction([id], group.glyph, me)
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

/**
 * Who reacted — "Otter, Heron and you" — and nothing else. The chip is plainly
 * a button; telling people what pressing it does is copy they have to read
 * past every time.
 */
function whoReacted(group: ReactionGroup, myKey: string | null): string {
  const others = group.people.filter((person) => person.key !== myKey).map((p) => p.name)
  const names = others.length < group.people.length ? [...others, 'you'] : others
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1] ?? ''}`
}
