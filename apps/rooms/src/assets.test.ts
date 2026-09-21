import { describe, expect, it } from 'vitest'

import { assetDecision, assetKey, MAX_ASSET_BYTES } from './assets.js'

const read = {
  method: 'GET',
  role: 'viewer' as const,
  owner: false,
  unlocked: true,
}

const write = {
  method: 'PUT',
  role: 'editor' as const,
  owner: false,
  unlocked: true,
  contentType: 'image/png',
  contentLength: 1024,
}

describe('reading an image', () => {
  it('lets a viewer read, because they can already see the board', () => {
    expect(assetDecision(read)).toEqual({ ok: true, write: false })
  })

  it('lets an editor read', () => {
    expect(assetDecision({ ...read, role: 'editor' })).toEqual({ ok: true, write: false })
  })

  it('refuses a link that opens nothing', () => {
    const decision = assetDecision({ ...read, role: null })
    expect(decision.ok).toBe(false)
  })
})

describe('writing an image', () => {
  it('lets an editor write', () => {
    expect(assetDecision(write)).toEqual({ ok: true, write: true, contentType: 'image/png' })
  })

  /*
   * A viewer reads and does not write, which is the whole of what the two
   * links mean. Getting this backwards would let a read-only link fill
   * somebody else's bucket.
   */
  it('refuses a viewer', () => {
    const decision = assetDecision({ ...write, role: 'viewer' })
    expect(decision).toMatchObject({ ok: false, status: 403 })
  })

  it('takes the type before the parameters', () => {
    expect(assetDecision({ ...write, contentType: 'image/png; charset=binary' })).toMatchObject({
      ok: true,
      contentType: 'image/png',
    })
  })

  /*
   * SVG is a document that can carry scripts and external references, and a
   * half-sanitised one is worse than a rejected one because it looks handled.
   * The web app refuses it; so does this, because a client-side check binds
   * nobody who skips the client.
   */
  it('refuses an SVG, as the upload validator does', () => {
    expect(assetDecision({ ...write, contentType: 'image/svg+xml' })).toMatchObject({
      ok: false,
      status: 415,
    })
  })

  it('refuses something that is not an image at all', () => {
    expect(assetDecision({ ...write, contentType: 'application/pdf' })).toMatchObject({
      ok: false,
      status: 415,
    })
  })

  it('refuses an upload that will not say how big it is', () => {
    expect(assetDecision({ ...write, contentLength: null })).toMatchObject({
      ok: false,
      status: 411,
    })
  })

  it('refuses one that is too large', () => {
    expect(assetDecision({ ...write, contentLength: MAX_ASSET_BYTES + 1 })).toMatchObject({
      ok: false,
      status: 413,
    })
  })

  it('accepts one exactly at the ceiling', () => {
    expect(assetDecision({ ...write, contentLength: MAX_ASSET_BYTES })).toMatchObject({ ok: true })
  })
})

describe('the password, as a second factor over both', () => {
  it('refuses a locked board to a caller who has not unlocked it', () => {
    expect(assetDecision({ ...read, unlocked: false })).toMatchObject({ ok: false, status: 403 })
    expect(assetDecision({ ...write, unlocked: false })).toMatchObject({ ok: false, status: 403 })
  })

  /*
   * The owner is never asked. They set the password, and a board that locks
   * out the person whose board it is is a board they have lost.
   */
  it('never asks the owner', () => {
    expect(assetDecision({ ...read, unlocked: false, owner: true })).toMatchObject({ ok: true })
    expect(assetDecision({ ...write, unlocked: false, owner: true })).toMatchObject({ ok: true })
  })

  /*
   * And it is checked AFTER the link, so a request with no valid key learns
   * nothing about whether the board is protected.
   */
  it('gives the same answer with no key whether or not a password exists', () => {
    const locked = assetDecision({ ...read, role: null, unlocked: false })
    const open = assetDecision({ ...read, role: null, unlocked: true })
    expect(locked).toEqual(open)
  })
})

describe('where it is stored', () => {
  it('prefixes by board, so a board’s images can be deleted with it', () => {
    expect(assetKey('brd_1', 'ast_2')).toBe('brd_1/ast_2')
  })
})

describe('the method', () => {
  it('refuses anything that is not a GET or a PUT', () => {
    for (const method of ['POST', 'DELETE', 'PATCH']) {
      expect(assetDecision({ ...read, method })).toMatchObject({ ok: false, status: 405 })
    }
  })
})
