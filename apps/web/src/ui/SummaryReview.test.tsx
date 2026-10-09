import { asObjectId, richFromPlain } from '@openframe/core'
import { CITES } from '@openframe/core/ai'
import { afterEach, describe, expect, it } from 'vitest'

import { SOMEBODY, fakeAi } from '../app/services.fake.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { mountOnBoard } from '../test-render.js'
import { SummaryReview } from './SummaryReview.js'

const IDS = ['obj_a', 'obj_b', 'obj_c'].map((id) => asObjectId(id))

/** A board with three notes, and an AI that answers with a summary citing two of them. */
async function mounted() {
  const ai = fakeAi(undefined, {
    kind: 'summary',
    summary: {
      title: 'What we heard',
      points: [
        { text: 'Costs come too late.', refs: ['n1', 'n2'] },
        { text: 'Nobody mentioned returns.', refs: [] },
      ],
    },
    remaining: 4,
  })
  const board = await mountOnBoard(<SummaryReview />, {
    services: (built) => ({
      ...built,
      ai,
      accounts: { ...built.accounts, enabled: true, current: () => Promise.resolve(SOMEBODY) },
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
    useInteractionStore.getState().openSummaryReview(IDS)
  })
  const find = <E extends Element>(id: string) =>
    board.container.querySelector<E>(`[data-testid="${id}"]`)
  return { board, ai, find }
}

afterEach(() => {
  useInteractionStore.getState().closeSummaryReview()
})

describe('asking the AI to summarise', () => {
  it('asks once, and writes nothing when the summary is discarded', async () => {
    const { board, ai, find } = await mounted()
    const before = board.runtime.store.getDocument().objects.size
    board.act(() => {
      find<HTMLButtonElement>('summary-ask')?.click()
      find<HTMLButtonElement>('summary-ask')?.click()
    })
    await board.settle()
    expect(ai.summarise).toHaveBeenCalledTimes(1)
    expect(find('summary-review')?.getAttribute('data-stage')).toBe('review')
    const discard = [...board.container.querySelectorAll('button')].find(
      (button) => button.textContent === 'Discard',
    )
    board.act(() => discard?.click())
    expect(board.runtime.store.getDocument().objects.size).toBe(before)
    expect(useInteractionStore.getState().summaryReview).toBeNull()
    board.unmount()
  })

  it('applies the edited summary as one text box citing the notes, in one change', async () => {
    const { board, find } = await mounted()
    board.act(() => find<HTMLButtonElement>('summary-ask')?.click())
    await board.settle()
    const points = board.container.querySelectorAll<HTMLTextAreaElement>(
      '[data-testid="summary-point"]',
    )
    expect(points).toHaveLength(2)
    // An emptied point is taken out.
    board.type(points[1]!, '')
    board.act(() => find<HTMLButtonElement>('summary-apply')?.click())
    const doc = board.runtime.store.getDocument()
    const box = [...doc.objects.values()].find((object) => object.type === 'text')
    expect(box).toBeDefined()
    expect(JSON.stringify(box?.data)).toContain('Costs come too late.')
    expect(JSON.stringify(box?.data)).not.toContain('Nobody mentioned returns.')
    // Taken out, not left as an empty bullet.
    expect(JSON.stringify(box?.data).match(/"list":"bullet"/g)).toHaveLength(1)
    const cites = [...doc.objects.values()]
      .filter((object) => object.type === 'relation')
      .map((object) => object.data as { from: string; to: string; predicate: string })
    expect(cites.map((c) => [c.from, c.to, c.predicate])).toEqual([
      [box?.id, 'obj_a', CITES],
      [box?.id, 'obj_b', CITES],
    ])
    expect(useInteractionStore.getState().selection.has(box!.id)).toBe(true)
    // One undo takes all of it away.
    board.act(() => board.runtime.dispatcher.undo())
    expect(board.runtime.store.getDocument().objects.size).toBe(IDS.length)
    board.unmount()
  })

  it('starts again when opened on other notes, rather than citing them with the old answer', async () => {
    const { board, ai, find } = await mounted()
    board.act(() => find<HTMLButtonElement>('summary-ask')?.click())
    await board.settle()
    expect(find('summary-review')?.getAttribute('data-stage')).toBe('review')
    board.act(() => {
      useInteractionStore.getState().openSummaryReview([IDS[1]!, IDS[2]!])
    })
    expect(find('summary-review')?.getAttribute('data-stage')).toBe('confirm')
    expect(find('summary-review')?.textContent).toContain('2 notes')
    expect(ai.summarise).toHaveBeenCalledTimes(1)
    board.unmount()
  })

  it('refuses to apply when a note it cites has gone, and keeps the sheet open', async () => {
    const { board, find } = await mounted()
    board.act(() => find<HTMLButtonElement>('summary-ask')?.click())
    await board.settle()
    board.act(() => {
      board.runtime.dispatcher.dispatch({ kind: 'DeleteObjects', ids: [IDS[0]!] })
    })
    board.act(() => find<HTMLButtonElement>('summary-apply')?.click())
    const doc = board.runtime.store.getDocument()
    expect([...doc.objects.values()].some((object) => object.type === 'text')).toBe(false)
    expect(useInteractionStore.getState().toast).toBe('A note it cites is gone')
    expect(find('summary-review')).not.toBeNull()
    board.unmount()
  })

  it('counts the citations Apply will make, after a point is emptied', async () => {
    const { board, find } = await mounted()
    board.act(() => find<HTMLButtonElement>('summary-ask')?.click())
    await board.settle()
    expect(find('summary-adds')?.textContent).toBe(
      'Adds a text box citing 2 notes; nothing summarised changes',
    )
    const points = board.container.querySelectorAll<HTMLTextAreaElement>(
      '[data-testid="summary-point"]',
    )
    board.type(points[0]!, '')
    expect(find('summary-adds')?.textContent).toBe(
      'Adds a text box citing no notes; nothing summarised changes',
    )
    board.unmount()
  })
})
