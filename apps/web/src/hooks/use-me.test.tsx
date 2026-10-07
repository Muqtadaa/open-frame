import { afterEach, describe, expect, it } from 'vitest'

import type { Identity } from '../runtime/services.js'
import { mountOnBoard, type Mounted } from '../test-render.js'
import { useMe } from './use-me.js'

/**
 * Who "me" is, for the marks a person leaves.
 *
 * A signed-in person's session is restored after the first render, and until
 * then they were handed the GUEST key: a reaction left in that moment was
 * filed under somebody else, and pressing the chip once the account arrived
 * added a second rather than taking the first back.
 */
function Probe() {
  const me = useMe()
  return <output>{me === null ? 'unknown' : me.key}</output>
}

const ACCOUNT: Identity = {
  userId: 'user-1',
  email: 'a@example.com',
  displayName: 'Ada',
  hue: 2,
  accessToken: 'token',
}

let mounted: Mounted | null = null
afterEach(() => {
  mounted?.unmount()
  mounted = null
})

describe('me', () => {
  it('is nobody yet while an account is still being restored', async () => {
    let answer: (identity: Identity | null) => void = () => undefined
    const pending = new Promise<Identity | null>((resolve) => {
      answer = resolve
    })
    mounted = await mountOnBoard(<Probe />, {
      services: (built) => ({
        ...built,
        accounts: {
          ...built.accounts,
          enabled: true,
          current: () => pending,
          onChange: () => () => undefined,
        },
      }),
    })
    await mounted.settle()
    expect(mounted.container.textContent).toBe('unknown')

    answer(ACCOUNT)
    await mounted.settle()
    expect(mounted.container.textContent).toMatch(/^u_[0-9a-f]{16}$/)
  })

  it('is the guest at once where there are no accounts', async () => {
    mounted = await mountOnBoard(<Probe />, {
      services: (built) => ({ ...built, accounts: { ...built.accounts, enabled: false } }),
    })
    expect(mounted.container.textContent).toMatch(/^g_[0-9a-f]{16}$/)
  })

  /*
   * A session that cannot be restored at all — the accounts module failed to
   * load — is a guest, not somebody forever about to arrive. "Nobody yet"
   * disabled voting and reacting for good, with no reason given.
   */
  it('is the guest when the account lookup fails', async () => {
    mounted = await mountOnBoard(<Probe />, {
      services: (built) => ({
        ...built,
        accounts: {
          ...built.accounts,
          enabled: true,
          current: () => Promise.reject(new Error('offline')),
          onChange: () => () => undefined,
        },
      }),
    })
    await mounted.settle()
    expect(mounted.container.textContent).toMatch(/^g_[0-9a-f]{16}$/)
  })
})
