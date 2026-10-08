import {
  VOTE_MARK,
  currentVoteRound,
  type BoardDocument,
  type ObjectId,
  type VoteRoundData,
} from '@openframe/core'
import { createContext, useCallback, useContext, useMemo, useSyncExternalStore } from 'react'

import { useOpenFrame } from '../runtime/context.js'

export interface VotingRound {
  readonly id: ObjectId
  readonly data: VoteRoundData
}

/**
 * The board's round of dot voting, or null.
 *
 * Found once per change to the board's STRUCTURE — a round arriving or being
 * cleared — and then followed as an object, so revealing or ending it (an edit,
 * not a structural change) is seen as well. Asked by the few things that show
 * the round as a whole; a note asks `VotingContext`, never this (rule 10).
 */
/**
 * The round, found once per version of the board rather than once per read.
 *
 * `currentVoteRound` walks every object, and the snapshot is read on every
 * render of everything that asks — the context menu included, which is always
 * mounted (rule 10). A board version is immutable, so its answer never changes.
 */
const roundOf = new WeakMap<BoardDocument, string>()
function roundSignature(doc: BoardDocument): string {
  const known = roundOf.get(doc)
  if (known !== undefined) return known
  const round = currentVoteRound(doc)
  // A string, so it compares by value (rule 9).
  const signature = round === null ? '' : JSON.stringify({ id: round.id, data: round.data })
  roundOf.set(doc, signature)
  return signature
}

export function useVoteRound(): VotingRound | null {
  const { runtime } = useOpenFrame()
  const subscribe = useCallback(
    (onChange: () => void) => {
      let unfollow = (): void => undefined
      const follow = (): void => {
        unfollow()
        // From the cache: three things follow the round, and each walked the
        // whole board on every structural change (audit 2026-10-08).
        const signature = roundSignature(runtime.store.getDocument())
        const id = signature === '' ? null : (JSON.parse(signature) as VotingRound).id
        unfollow = id === null ? () => undefined : runtime.store.subscribeToObject(id, onChange)
      }
      follow()
      const unstructure = runtime.store.subscribeToStructure(() => {
        follow()
        onChange()
      })
      return () => {
        unstructure()
        unfollow()
      }
    },
    [runtime.store],
  )
  const getSnapshot = useCallback(
    () => roundSignature(runtime.store.getDocument()),
    [runtime.store],
  )
  const signature = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return useMemo(
    () => (signature === '' ? null : (JSON.parse(signature) as VotingRound)),
    [signature],
  )
}

/** The round, handed down once rather than looked up by every note that has a dot. */
export const VotingContext = createContext<VotingRound | null>(null)

export const useVotingContext = (): VotingRound | null => useContext(VotingContext)

/**
 * Who has put dots on one note, and in which round, as sorted `round\tkey`
 * lines — one per dot, so a person with two on it appears twice.
 *
 * From the registry's mark index, O(1) per note (rule 10), and a string so it
 * compares by value (rule 9). Votes only arrive and leave, so structure is all
 * it needs to hear.
 */
export function useVoters(id: ObjectId): string {
  const { runtime } = useOpenFrame()
  const subscribe = useCallback(
    (onChange: () => void) => runtime.store.subscribeToStructure(onChange),
    [runtime.store],
  )
  const getSnapshot = useCallback(() => {
    const keys: string[] = []
    for (const link of runtime.registry.marksOn(runtime.store.getDocument(), id)) {
      if (link.edge.kind === VOTE_MARK) keys.push(`${link.edge.value}\t${link.edge.by}`)
    }
    return keys.sort().join('\n')
  }, [runtime, id])
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export interface Tally {
  readonly total: number
  readonly mine: number
}

/**
 * How many dots a note has in `round`, and how many of them are this person's.
 * Only that round's: a dot cast in a round that has since been replaced, or in
 * one a merge left behind, is not part of the vote anybody is looking at.
 */
export function tallyVoters(voters: string, round: string, myKey: string | null): Tally {
  if (voters === '') return { total: 0, mine: 0 }
  const keys = voters
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(([inRound]) => inRound === round)
    .map(([, key]) => key)
  return { total: keys.length, mine: keys.filter((key) => key === myKey).length }
}

/**
 * Whether a person may see the count, or only their own dots: everybody sees
 * everything once the round is revealed or over.
 */
export const countsShown = (round: VoteRoundData): boolean =>
  !round.hidden || round.status === 'closed'

/**
 * The notes ranked by dots, most first, ties in board order — what "results"
 * and "select the top three" both read. Notes with none are left out.
 */
export function rankVotes(
  counts: ReadonlyMap<ObjectId, number>,
  order: readonly ObjectId[],
): readonly { readonly id: ObjectId; readonly count: number }[] {
  const position = new Map(order.map((id, index) => [id, index]))
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .map(([id, count]) => ({ id, count }))
    .sort(
      (a, b) =>
        b.count - a.count || (position.get(a.id) ?? Infinity) - (position.get(b.id) ?? Infinity),
    )
}

/**
 * The top `n` places — everything tied with the last of them comes too, so a
 * three-way tie for third does not quietly pick one.
 */
export function topPlaces(
  ranked: readonly { readonly id: ObjectId; readonly count: number }[],
  n: number,
): readonly ObjectId[] {
  if (ranked.length <= n) return ranked.map((entry) => entry.id)
  const cutoff = ranked[n - 1]?.count ?? 0
  return ranked.filter((entry) => entry.count >= cutoff).map((entry) => entry.id)
}
