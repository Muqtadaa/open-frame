import { afterEach, describe, expect, it } from 'vitest'

import type { Services } from '../runtime/services.js'
import { mountOnBoard, type Mounted } from '../test-render.js'
import { BoardMenu } from './BoardMenu.js'

/**
 * The menu beside the board's name holds what is not the name itself. Where
 * there are no accounts, the theme has no account sheet to live in, so it
 * lives here — and where there is nothing but Rename, there is no menu.
 */
let ui: Mounted | null = null

afterEach(() => {
  ui?.unmount()
  ui = null
  document.documentElement.removeAttribute('data-theme')
  localStorage.clear()
})

const accounts =
  (enabled: boolean) =>
  (built: Services): Services => ({ ...built, accounts: { ...built.accounts, enabled } })

const find = (testId: string): HTMLElement | null =>
  document.querySelector<HTMLElement>(`[data-testid="${testId}"]`)

describe('the board menu', () => {
  it('offers the theme when there are no accounts to keep it in', async () => {
    ui = await mountOnBoard(<BoardMenu onRename={() => undefined} />, {
      services: accounts(false),
    })
    const trigger = find('board-menu')
    expect(trigger).not.toBeNull()
    ui.act(() => {
      trigger?.click()
    })
    const theme = find('board-menu-theme')
    expect(theme?.getAttribute('aria-checked')).toBe('false')
    ui.act(() => {
      theme?.click()
    })
    expect(document.documentElement.dataset.theme).toBe('after-hours')
  })

  it('is not offered when Rename would be all it held', async () => {
    ui = await mountOnBoard(<BoardMenu onRename={() => undefined} />, {
      services: accounts(true),
    })
    expect(find('board-menu')).toBeNull()
  })
})
