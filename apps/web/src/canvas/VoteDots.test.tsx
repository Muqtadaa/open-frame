import { asObjectId, currentVoteRound, type ObjectId } from '@openframe/core'
import { useEffect, useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { accountKey } from '../hooks/use-me.js'
import type { Identity } from '../runtime/services.js'
import { mountOnBoard, type Mounted } from '../test-render.js'
import { VoteDots } from './VoteDots.js'
import { VotingProvider } from './VotingProvider.js'

/*
 * A hidden round shows a person only their own dots, and who they are is
 * known a moment after the board draws when they are signed in. The dots
 * already on a note were counted as unseen until then, so every one of them
 * was inked in again on every open and every scroll (audit 2026-10-08).
 */
const ACCOUNT: Identity = {
  userId: 'user-1',
  email: 'a@example.com',
  displayName: 'Ada',
  hue: 2,
  accessToken: 'token',
}

let reveal: (id: ObjectId) => void = () => undefined
function Later() {
  const [id, setId] = useState<ObjectId | null>(null)
  useEffect(() => {
    reveal = setId
  }, [])
  return id === null ? null : <VoteDots id={id} />
}

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('dots on a note, signed in', () => {
  it('does not ink in my own dots that were already there', async () => {
    let answer: (identity: Identity | null) => void = () => undefined
    const pending = new Promise<Identity | null>((resolve) => {
      answer = resolve
    })
    mounted = await mountOnBoard(
      <VotingProvider>
        <Later />
      </VotingProvider>,
      {
        services: (built) => ({
          ...built,
          accounts: {
            ...built.accounts,
            enabled: true,
            current: () => pending,
            onChange: () => () => undefined,
          },
        }),
      },
    )
    const by = { key: accountKey(ACCOUNT.userId), name: 'Ada', hue: 2 }
    const note = asObjectId('obj_note')
    const { runtime } = mounted
    mounted.act(() => {
      runtime.dispatcher.dispatch({
        kind: 'CreateObjects',
        objects: [{ id: note, type: 'sticky', x: 0, y: 0 }],
      })
      runtime.dispatcher.dispatch({
        kind: 'StartVoteRound',
        title: '',
        scope: { kind: 'board' },
        perPerson: 5,
        hidden: true,
        by,
      })
      const round = currentVoteRound(runtime.store.getDocument())?.id
      if (round === undefined) throw new Error('the round did not start')
      runtime.dispatcher.dispatch({ kind: 'CastDotVote', round, target: note, by })
      runtime.dispatcher.dispatch({ kind: 'CastDotVote', round, target: note, by })
    })
    // The note is drawn while who "me" is is still being restored...
    mounted.act(() => {
      reveal(note)
    })
    await mounted.settle()
    // ...and then it lands.
    answer(ACCOUNT)
    await mounted.settle()

    const dots = [...mounted.container.querySelectorAll('[data-testid="vote-dot"]')]
    expect(dots).toHaveLength(2)
    expect(dots.map((dot) => dot.getAttribute('data-fresh'))).toEqual(['false', 'false'])
  })
})
