import { afterEach, describe, expect, it } from 'vitest'

import type { BoardHistory, VersionListing } from '../runtime/board-history.js'
import { mountOnBoard, type Mounted } from '../test-render.js'
import { VersionList } from './VersionHistory.js'

/**
 * A board edited for months keeps around a thousand versions, and the sheet
 * drew every one of them at once (audit 2026-10-08). It shows the newest page
 * and offers the rest a page at a time.
 */
let ui: Mounted | null = null

afterEach(() => {
  ui?.unmount()
  ui = null
})

const HOUR = 3_600_000

function historyOf(count: number): BoardHistory {
  const versions: VersionListing[] = Array.from({ length: count }, (_, index) => ({
    id: `v${String(index)}`,
    at: Date.UTC(2026, 9, 8) - index * HOUR,
    kind: 'auto',
  }))
  return {
    list: () => Promise.resolve(versions),
    open: () => Promise.resolve({ status: 'missing' }),
    keepNow: () => Promise.resolve(true),
    name: () => Promise.resolve(true),
    forget: () => Promise.resolve(true),
  }
}

const rows = (): number => document.querySelectorAll('[data-testid="history-version"]').length
const more = (): HTMLButtonElement | null =>
  document.querySelector<HTMLButtonElement>('[data-testid="history-more"]')

describe('the version list', () => {
  it('shows the newest fifty, and the rest a page at a time', async () => {
    ui = await mountOnBoard(<VersionList onChosen={() => undefined} />, {
      history: historyOf(120),
    })
    await ui.settle()
    expect(rows()).toBe(50)
    expect(more()?.textContent).toBe('Show earlier versions')
    ui.act(() => {
      more()?.click()
    })
    expect(rows()).toBe(100)
    ui.act(() => {
      more()?.click()
    })
    expect(rows()).toBe(120)
    expect(more()).toBeNull()
  })

  it('offers nothing more when everything fits', async () => {
    ui = await mountOnBoard(<VersionList onChosen={() => undefined} />, {
      history: historyOf(12),
    })
    await ui.settle()
    expect(rows()).toBe(12)
    expect(more()).toBeNull()
  })
})
