import type { ReactNode } from 'react'

import { VotingContext, useVoteRound } from '../hooks/use-voting.js'

/**
 * The round, worked out once for the whole board and handed to every note
 * that has a dot, rather than looked up by each of them (rule 10). Children
 * are passed through, so a round changing re-renders the dots and nothing
 * else.
 */
export function VotingProvider({ children }: { readonly children: ReactNode }) {
  const round = useVoteRound()
  return <VotingContext.Provider value={round}>{children}</VotingContext.Provider>
}
