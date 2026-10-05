import { asObjectId, richFromPlain } from '@openframe/core'
import { afterEach, describe, expect, it } from 'vitest'

import { SOMEBODY, fakeAi } from '../app/services.fake.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import type { Identity } from '../runtime/services.js'
import { mountOnBoard } from '../test-render.js'
import { ClusterReview } from './ClusterReview.js'

const IDS = ['obj_a', 'obj_b', 'obj_c'].map((id) => asObjectId(id))

/** A board with three notes, and an account lookup the test answers when it chooses. */
async function mounted() {
  let answer: (identity: Identity) => void = () => undefined
  const lookup = new Promise<Identity>((resolve) => {
    answer = resolve
  })
  const ai = fakeAi()
  const board = await mountOnBoard(<ClusterReview />, {
    services: (built) => ({
      ...built,
      ai,
      accounts: { ...built.accounts, enabled: true, current: () => lookup },
    }),
  })
  board.act(() => {
    board.runtime.dispatcher.dispatch({
      kind: 'CreateObjects',
      objects: IDS.map((id, index) => ({
        id,
        type: 'sticky',
        x: index * 220,
        y: 0,
        data: { text: richFromPlain(`Note ${String(index)}`) },
      })),
    })
    useInteractionStore.getState().openClusterReview(IDS)
  })
  const cluster = () =>
    board.container.querySelector<HTMLButtonElement>('[data-testid="cluster-ask"]')
  return { board, ai, cluster, answer: () => answer(SOMEBODY) }
}

afterEach(() => {
  useInteractionStore.getState().closeClusterReview()
})

describe('asking the AI to cluster', () => {
  it('asks once, however often Cluster is pressed while the account is looked up', async () => {
    const { board, ai, cluster, answer } = await mounted()
    const button = cluster()
    expect(button).not.toBeNull()
    board.act(() => {
      button?.click()
      button?.click()
    })
    // Still there to press again, if the panel had not moved on.
    board.act(() => cluster()?.click())
    answer()
    await board.settle()
    expect(ai.cluster).toHaveBeenCalledTimes(1)
    board.unmount()
  })

  it('never asks once the panel is closed, even mid-lookup', async () => {
    const { board, ai, cluster, answer } = await mounted()
    board.act(() => cluster()?.click())
    board.act(() => {
      useInteractionStore.getState().closeClusterReview()
    })
    answer()
    await board.settle()
    expect(ai.cluster).not.toHaveBeenCalled()
    board.unmount()
  })
})
