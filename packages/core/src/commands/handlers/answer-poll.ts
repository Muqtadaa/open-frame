import type { BoardDocument } from '../../domain/document.js'
import { asObjectId, type ObjectId } from '../../domain/ids.js'
import type { Patch } from '../../domain/patch.js'
import {
  POLL_ANSWER_TYPE,
  POLL_MARK,
  SINGLE_CHOICE,
  pollAnswerId,
} from '../../types/poll-answer/definition.js'
import { POLL_TYPE } from '../../types/poll/definition.js'
import type { PollData } from '../../types/poll/schema.js'
import { MarkAuthorSchema } from '../../types/reaction/schema.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { createObjects } from './create-objects.js'
import { requireObject } from './shared.js'

type AnswerPoll = Extract<Command, { kind: 'AnswerPoll' }>

/**
 * One person's pick on a poll, made or taken back.
 *
 * Pressing an option you already picked takes it back. On a single-choice
 * poll, picking another takes back your other picks in the SAME command, so
 * changing your mind is one undo step and never leaves you with two answers.
 * What you have picked is asked of the mark index, never of ids, as for
 * reactions: an answer an agent made under another id is still yours.
 *
 * A LOCKED poll can still be answered — locking stops people changing the
 * question, not answering it. A CLOSED one cannot.
 */
export function answerPoll(doc: BoardDocument, command: AnswerPoll, ctx: CommandContext): Patch[] {
  const poll = requireObject(doc, command.poll)
  if (poll.type !== POLL_TYPE) throw new CommandError('invalid-input', 'That is not a poll')
  const data = poll.data as PollData
  if (data.closed) throw new CommandError('invalid-input', 'This poll is closed')
  if (!data.options.some((option) => option.id === command.option)) {
    throw new CommandError('invalid-input', 'That is not one of this poll’s options')
  }
  const author = MarkAuthorSchema.safeParse(command.by)
  if (!author.success)
    throw new CommandError('invalid-input', 'That is not a person who can answer')
  const by = author.data

  const mine = ctx.registry
    .marksOn(doc, poll.id)
    .filter((link) => link.edge.kind === POLL_MARK && link.edge.by === by.key)
  const already = mine.filter((link) => link.edge.value === command.option)
  if (already.length > 0) return already.map((link) => ({ op: 'remove', id: link.id }))

  const create = (id: ObjectId): Patch[] =>
    createObjects(
      doc,
      {
        kind: 'CreateObjects',
        objects: [
          {
            type: POLL_ANSWER_TYPE,
            id,
            x: 0,
            y: 0,
            data: { poll: poll.id, option: command.option, by },
          },
        ],
      },
      ctx,
    )

  if (data.multi) {
    const id = asObjectId(pollAnswerId(poll.id, command.option, by.key))
    if (doc.objects.has(id)) {
      throw new CommandError('invalid-input', 'Something else already has that answer’s id')
    }
    return create(id)
  }

  /*
   * One answer per person, under ONE id per person: the same person picking
   * different options on two devices before either hears of the other writes
   * one object twice, and the merge keeps one answer. An id per option kept
   * both, and showed that person on two choices of a single-choice poll
   * (Codex, on #66). Changing your mind rewrites that object; any other
   * answer of yours — from when the poll allowed several — goes.
   */
  const id = asObjectId(pollAnswerId(poll.id, SINGLE_CHOICE, by.key))
  const others: Patch[] = mine
    .filter((link) => link.id !== id)
    .map((link) => ({ op: 'remove', id: link.id }))
  const existing = doc.objects.get(id)
  if (existing === undefined) return [...others, ...create(id)]
  if (existing.type !== POLL_ANSWER_TYPE) {
    throw new CommandError('invalid-input', 'Something else already has that answer’s id')
  }
  return [
    ...others,
    { op: 'set', id, path: ['data'], value: { poll: poll.id, option: command.option, by } },
  ]
}
