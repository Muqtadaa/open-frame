import type { BoardDocument } from '../../domain/document.js'
import { asObjectId, type ObjectId } from '../../domain/ids.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import type { Patch } from '../../domain/patch.js'
import { MarkAuthorSchema, type MarkAuthor } from '../../types/reaction/schema.js'
import { VOTE_MARK, VOTE_TYPE, voteId } from '../../types/vote/definition.js'
import {
  VOTE_ROUND_TYPE,
  currentVoteRound,
  inVoteScope,
  voteRoundId,
  type VoteRoundObject,
} from '../../types/vote-round/definition.js'
import { VoteRoundDataSchema, type VoteRoundData } from '../../types/vote-round/schema.js'
import { CommandError } from '../errors.js'
import type { Command, CommandContext } from '../types.js'
import { createObjects } from './create-objects.js'
import { deleteObjects } from './delete-objects.js'
import { requireObject } from './shared.js'

type StartVoteRound = Extract<Command, { kind: 'StartVoteRound' }>
type CastDotVote = Extract<Command, { kind: 'CastDotVote' }>
type RemoveDotVote = Extract<Command, { kind: 'RemoveDotVote' }>
type SetVoteRound = Extract<Command, { kind: 'SetVoteRound' }>

/*
 * Dot voting. A round is an object, every dot is an object marked on its note
 * and `within` its round, so the mark index counts them and the delete cascade
 * clears them — nothing here keeps a tally of its own.
 *
 * Votes go on LOCKED notes too, as reactions do: a vote is a separate object,
 * and locking a note stops people changing it, not choosing it.
 */

export function startVoteRound(
  doc: BoardDocument,
  command: StartVoteRound,
  ctx: CommandContext,
): Patch[] {
  const existing = currentVoteRound(doc)
  const run = (existing?.data.run ?? 0) + 1
  const data = VoteRoundDataSchema.safeParse({
    title: command.title,
    scope: command.scope,
    perPerson: command.perPerson,
    hidden: command.hidden,
    status: 'open',
    run,
    by: command.by,
  })
  if (!data.success) throw new CommandError('invalid-input', 'That is not a round of voting')

  if (existing?.data.status === 'open') {
    throw new CommandError('invalid-input', 'A round of voting is already open')
  }

  const scope = data.data.scope
  if (scope.kind === 'frame' && !doc.objects.has(asObjectId(scope.frame))) {
    throw new CommandError('unknown-object', 'That frame is not on the board')
  }

  // Replacing the ended round is part of this command, so undo restores it
  // with its votes in one step.
  const cleared =
    existing === null ? [] : deleteObjects(doc, { kind: 'DeleteObjects', ids: [existing.id] }, ctx)
  const after = existing === null ? doc : withoutRemoved(doc, cleared)

  return [
    ...cleared,
    ...createObjects(
      after,
      {
        kind: 'CreateObjects',
        objects: [
          {
            type: VOTE_ROUND_TYPE,
            id: asObjectId(voteRoundId(run)),
            x: 0,
            y: 0,
            data: { ...data.data },
          },
        ],
      },
      ctx,
    ),
  ]
}

export function castDotVote(
  doc: BoardDocument,
  command: CastDotVote,
  ctx: CommandContext,
): Patch[] {
  const round = openRound(doc, command.round)
  const by = author(command.by)
  const target = votable(doc, round.data, command.target, ctx)

  const mine = votesBy(doc, round.id, by.key, ctx)
  if (mine.length >= round.data.perPerson) {
    throw new CommandError('invalid-input', 'No votes left')
  }

  // The lowest free slot: a person casting from two devices at once takes the
  // same one on both, and the two writes are one object.
  const taken = new Set(mine.map((link) => link.id))
  let slot = 0
  while (taken.has(asObjectId(voteId(round.id, by.key, slot)))) slot += 1
  const id = asObjectId(voteId(round.id, by.key, slot))
  if (doc.objects.has(id)) {
    throw new CommandError('invalid-input', 'Something else already has that vote’s id')
  }

  return createObjects(
    doc,
    {
      kind: 'CreateObjects',
      objects: [
        { type: VOTE_TYPE, id, x: 0, y: 0, data: { target: target.id, round: round.id, by } },
      ],
    },
    ctx,
  )
}

export function removeDotVote(
  doc: BoardDocument,
  command: RemoveDotVote,
  ctx: CommandContext,
): Patch[] {
  const round = openRound(doc, command.round)
  const by = author(command.by)
  const onTarget = votesBy(doc, round.id, by.key, ctx).filter(
    (link) => link.edge.target === command.target,
  )
  // The latest of them, so the slots a person holds stay the lowest ones.
  const last = onTarget.sort((a, b) => (a.id < b.id ? -1 : 1)).at(-1)
  if (last === undefined) throw new CommandError('invalid-input', 'No vote of yours to take back')
  return [{ op: 'remove', id: last.id }]
}

export function setVoteRound(
  doc: BoardDocument,
  command: SetVoteRound,
  ctx: CommandContext,
): Patch[] {
  const round = requireRound(doc, command.round)
  if (command.hidden === undefined && command.status === undefined) {
    throw new CommandError('invalid-input', 'SetVoteRound requires a change')
  }
  const next = {
    ...round.data,
    ...(command.hidden === undefined ? {} : { hidden: command.hidden }),
    ...(command.status === undefined ? {} : { status: command.status }),
  }
  const validated = ctx.registry.get(VOTE_ROUND_TYPE)?.validate(next)
  if (validated?.ok !== true)
    throw new CommandError('invalid-data', 'That is not a round of voting')
  return [{ op: 'set', id: round.id, path: ['data'], value: validated.data }]
}

function requireRound(doc: BoardDocument, id: ObjectId): VoteRoundObject {
  const object = requireObject(doc, id)
  if (object.type !== VOTE_ROUND_TYPE) {
    throw new CommandError('invalid-input', 'That is not a round of voting')
  }
  return object as VoteRoundObject
}

function openRound(doc: BoardDocument, id: ObjectId): VoteRoundObject {
  const round = requireRound(doc, id)
  if (round.data.status !== 'open') throw new CommandError('invalid-input', 'Voting has ended')
  return round
}

function author(by: MarkAuthor): MarkAuthor {
  // At the boundary (rule 8): the key becomes part of an id.
  const parsed = MarkAuthorSchema.safeParse(by)
  if (!parsed.success) throw new CommandError('invalid-input', 'That is not a person who can vote')
  return parsed.data
}

function votable(
  doc: BoardDocument,
  round: VoteRoundData,
  id: ObjectId,
  ctx: CommandContext,
): AnyOpenFrameObject {
  const target = requireObject(doc, id)
  if (ctx.registry.get(target.type)?.capabilities.markable !== true) {
    throw new CommandError('invalid-input', `A ${target.type} cannot be voted on`)
  }
  if (!inVoteScope(doc, round, target)) {
    throw new CommandError('invalid-input', 'That note is not part of this vote')
  }
  return target
}

function votesBy(doc: BoardDocument, round: ObjectId, key: string, ctx: CommandContext) {
  return ctx.registry
    .marksWithin(doc, round)
    .filter((link) => link.edge.kind === VOTE_MARK && link.edge.by === key)
}

function withoutRemoved(doc: BoardDocument, patches: readonly Patch[]): BoardDocument {
  const objects = new Map(doc.objects)
  for (const patch of patches) if (patch.op === 'remove') objects.delete(patch.id)
  return { ...doc, objects }
}
