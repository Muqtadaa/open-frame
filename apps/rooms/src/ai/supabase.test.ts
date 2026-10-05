import { describe, expect, it } from 'vitest'

import { verifyWithSupabase } from './supabase.js'

const answering =
  (status: number, body: unknown = {}): typeof globalThis.fetch =>
  () =>
    Promise.resolve(new Response(JSON.stringify(body), { status }))

describe('verifyWithSupabase', () => {
  it('asks Supabase with the publishable key and the bearer, and takes its user id', async () => {
    let asked: Request | null = null
    const verify = verifyWithSupabase({
      url: 'https://p.supabase.co/',
      publishableKey: 'pk',
      fetch: (input, init) => {
        asked = new Request(input, init)
        return Promise.resolve(new Response(JSON.stringify({ id: 'u1' }), { status: 200 }))
      },
    })
    expect(await verify('tok')).toEqual({ userId: 'u1' })
    expect(asked!.url).toBe('https://p.supabase.co/auth/v1/user')
    expect(asked!.headers.get('apikey')).toBe('pk')
    expect(asked!.headers.get('authorization')).toBe('Bearer tok')
  })

  it('refuses a token Supabase refuses, and says when it could not ask', async () => {
    const make = (fetch: typeof globalThis.fetch) =>
      verifyWithSupabase({ url: 'https://p', publishableKey: 'pk', fetch })
    expect(await make(answering(401))('t')).toBe('refused')
    expect(await make(answering(200, {}))('t')).toBe('refused')
    expect(await make(answering(500))('t')).toBe('unreachable')
    expect(await make(() => Promise.reject(new Error('down')))('t')).toBe('unreachable')
  })
})
