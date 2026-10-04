import { POLL_MARK, type PollOption } from '@openframe/core'

export interface OptionTally {
  readonly id: string
  readonly label: string
  /** People who picked it — each person once, however many records say so. */
  readonly count: number
  readonly mine: boolean
}

export interface PollTally {
  readonly options: readonly OptionTally[]
  /** People who have answered at all. */
  readonly people: number
}

/**
 * The poll's answers, counted per option.
 *
 * Only the options the poll still has: an answer to one that has since been
 * removed is left where it is, uncounted, rather than deleted from under the
 * person who gave it. Each person counts once per option, so a stray
 * duplicate — an agent's, or two devices racing — is one person, not two.
 */
export function tallyPoll(
  marks: readonly { readonly kind: string; readonly value: string; readonly by: string }[],
  options: readonly PollOption[],
  myKey: string | null,
): PollTally {
  const pickers = new Map<string, Set<string>>(options.map((option) => [option.id, new Set()]))
  const people = new Set<string>()
  for (const mark of marks) {
    if (mark.kind !== POLL_MARK) continue
    const who = pickers.get(mark.value)
    if (who === undefined) continue
    who.add(mark.by)
    people.add(mark.by)
  }
  return {
    options: options.map((option) => {
      const who = pickers.get(option.id) ?? new Set<string>()
      return {
        id: option.id,
        label: option.label,
        count: who.size,
        mine: myKey !== null && who.has(myKey),
      }
    }),
    people: people.size,
  }
}
