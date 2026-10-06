import type { BoardDocument } from '../../domain/document.js'
import { defineObjectType } from '../../domain/registry.js'
import type { AnyOpenFrameObject } from '../../domain/object.js'
import { VOTE_ROUND_VERSION, VoteRoundDataSchema, type VoteRoundData } from './schema.js'

export const VOTE_ROUND_TYPE = 'vote-round'

export const voteRoundType = defineObjectType<typeof VOTE_ROUND_TYPE, VoteRoundData>({
  type: VOTE_ROUND_TYPE,

  schema: VoteRoundDataSchema,
  currentVersion: VOTE_ROUND_VERSION,
  migrations: {},

  create: (init) => ({
    data: {
      title: init?.title ?? '',
      scope: init?.scope ?? { kind: 'board' },
      perPerson: init?.perPerson ?? 5,
      hidden: init?.hidden ?? false,
      status: init?.status ?? 'open',
      run: init?.run ?? 1,
      by: init?.by ?? { key: 'nobody', name: 'Nobody', hue: 0 },
    },
    frame: { width: 0, height: 0 },
  }),

  capabilities: {
    resizable: false,
    rotatable: false,
    textEditable: false,
    spatial: false,
    canHaveChildren: false,
    selectsAsUnit: false,
    hollow: false,
    connectable: false,
    markable: false,
    styleProps: [],
  },

  describe: (object) => ({
    searchText: '',
    summary: `Dot voting${object.data.title === '' ? '' : `: ${object.data.title}`} (${object.data.status})`,
    gist: object.data.title,
    fields: {
      title: object.data.title,
      perPerson: String(object.data.perPerson),
      hidden: String(object.data.hidden),
      status: object.data.status,
      by: object.data.by.name,
    },
  }),
})

export type VoteRoundObject = AnyOpenFrameObject & { readonly data: VoteRoundData }

/**
 * The board's round of dot voting, if it has one.
 *
 * A scan of the objects, so it is asked once per change to the board's
 * structure — never once per note (rule 10).
 */
export function currentVoteRound(doc: BoardDocument): VoteRoundObject | null {
  let found: VoteRoundObject | null = null
  for (const object of doc.objects.values()) {
    if (object.type !== VOTE_ROUND_TYPE) continue
    const round = object as VoteRoundObject
    // The latest run, should a merge ever leave two: the same answer everywhere.
    if (
      found === null ||
      round.data.run > found.data.run ||
      (round.data.run === found.data.run && round.id < found.id)
    ) {
      found = round
    }
  }
  return found
}

/**
 * The id the `run`th round on a board has.
 *
 * Deterministic, so two people starting a round from the same board before
 * either hears of the other write ONE round rather than two: the later write
 * wins its settings, and every dot either of them casts is in it. A minted id
 * gave two rounds, one of them — with its votes — never shown (Codex, on #65).
 */
export function voteRoundId(run: number): string {
  return `vr_${String(run)}`
}

/**
 * Whether a round's votes may go on `target`: anything on the board, one of
 * the notes it was started on, or anything inside its frame, however deep — a
 * note in a group in the frame counts. The command and the interface both
 * ask this, so a menu never offers a vote the command would refuse.
 */
export function inVoteScope(
  doc: BoardDocument,
  round: VoteRoundData,
  target: AnyOpenFrameObject,
): boolean {
  const { scope } = round
  switch (scope.kind) {
    case 'board':
      return true
    case 'objects':
      return scope.ids.includes(target.id)
    case 'frame': {
      let parent = target.parentId
      for (let hops = 0; parent !== null && hops < doc.objects.size; hops += 1) {
        if (parent === scope.frame) return true
        parent = doc.objects.get(parent)?.parentId ?? null
      }
      return false
    }
  }
}
