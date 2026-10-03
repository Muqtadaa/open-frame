import { describe, expect, it } from 'vitest'

import * as shared from '@openframe/core/uploads'

import {
  assetDecision,
  assetKey,
  checkUpload,
  MAX_ASSET_BYTES,
  purgeBoardAssets,
  type AssetBucket,
} from './assets.js'

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

/**
 * A bucket in memory, listing in key order and a page at a time the way R2
 * does — so pagination is exercised rather than assumed. `failList` and
 * `failDeleteAfter` make the two ways cleanup can break happen on cue.
 */
function memoryBucket(keys: readonly string[]) {
  const stored = new Set(keys)
  const state = { failList: false, failDeleteAfter: Number.POSITIVE_INFINITY, deleteCalls: 0 }
  const bucket: AssetBucket = {
    list: ({ prefix, cursor, limit }) => {
      if (state.failList) return Promise.reject(new Error('R2 is down'))
      const matching = [...stored].filter((key) => key.startsWith(prefix)).sort()
      // The cursor names the last key returned, as R2's opaque one does in
      // effect: deleting a page must not shift where the next one starts.
      const after = cursor === undefined ? [...matching] : matching.filter((key) => key > cursor)
      const page = after.slice(0, limit ?? 1000)
      const last = page.at(-1)
      return Promise.resolve(
        page.length < after.length && last !== undefined
          ? { objects: page.map((key) => ({ key })), truncated: true, cursor: last }
          : { objects: page.map((key) => ({ key })), truncated: false },
      )
    },
    delete: (doomed) => {
      state.deleteCalls += 1
      if (state.deleteCalls > state.failDeleteAfter) return Promise.reject(new Error('R2 is down'))
      for (const key of doomed) stored.delete(key)
      return Promise.resolve()
    },
  }
  return { bucket, stored, state }
}

/**
 * Deleting a board deletes its pictures. The prefix exists for exactly this,
 * and a board that is "deleted everywhere" while its images sit in the bucket
 * has not been deleted: the bytes are unreachable, not gone.
 */
describe('purging a board’s images', () => {
  const BOARD = 'brd_board0001'

  it('is a success for a board with no images', async () => {
    const { bucket } = memoryBucket(['brd_other/a'])

    expect(await purgeBoardAssets(bucket, BOARD)).toEqual({ ok: true, deleted: 0 })
  })

  it('deletes one image', async () => {
    const { bucket, stored } = memoryBucket([assetKey(BOARD, 'a')])

    expect(await purgeBoardAssets(bucket, BOARD)).toEqual({ ok: true, deleted: 1 })
    expect(stored.size).toBe(0)
  })

  it('deletes many, a page at a time', async () => {
    const keys = Array.from({ length: 25 }, (_, i) => assetKey(BOARD, `img${String(i)}`))
    const { bucket, stored, state } = memoryBucket(keys)

    expect(await purgeBoardAssets(bucket, BOARD, 10)).toEqual({ ok: true, deleted: 25 })
    expect(stored.size).toBe(0)
    expect(state.deleteCalls).toBe(3)
  })

  /**
   * THE PREFIX ENDS IN A SLASH. Without it, deleting `brd_a` would take every
   * image of `brd_ab` with it — somebody else's board, somebody else's work.
   */
  it('leaves every other board’s images alone, including one whose id it prefixes', async () => {
    const { bucket, stored } = memoryBucket([
      assetKey(BOARD, 'mine'),
      assetKey(`${BOARD}x`, 'theirs'),
      assetKey('brd_other', 'theirs'),
    ])

    await purgeBoardAssets(bucket, BOARD)

    expect([...stored].sort()).toEqual([assetKey(`${BOARD}x`, 'theirs'), 'brd_other/theirs'])
  })

  /** Never "done" while bytes remain: a failure must be reported, so it is retried. */
  it('reports a listing that fails, and deletes nothing', async () => {
    const { bucket, stored, state } = memoryBucket([assetKey(BOARD, 'a')])
    state.failList = true

    expect(await purgeBoardAssets(bucket, BOARD)).toEqual({ ok: false })
    expect(stored.size).toBe(1)
  })

  it('reports a delete that fails part-way, and a retry finishes the job', async () => {
    const keys = Array.from({ length: 25 }, (_, i) => assetKey(BOARD, `img${String(i)}`))
    const { bucket, stored, state } = memoryBucket(keys)
    state.failDeleteAfter = 1

    expect(await purgeBoardAssets(bucket, BOARD, 10)).toEqual({ ok: false })
    expect(stored.size).toBe(15)

    state.failDeleteAfter = Number.POSITIVE_INFINITY
    expect(await purgeBoardAssets(bucket, BOARD, 10)).toEqual({ ok: true, deleted: 15 })
    expect(stored.size).toBe(0)
  })

  it('is a success again when run twice', async () => {
    const { bucket } = memoryBucket([assetKey(BOARD, 'a')])

    await purgeBoardAssets(bucket, BOARD)
    expect(await purgeBoardAssets(bucket, BOARD)).toEqual({ ok: true, deleted: 0 })
  })
})

/**
 * The bytes themselves, checked before anything reaches the bucket.
 *
 * The browser has always sniffed an image's leading bytes; the room took the
 * declared type on trust and wrote the body straight to R2. So any client that
 * skipped the browser could store anything at all under an image's type. Now
 * the room reads the body — never more than the ceiling — and holds it to the
 * same policy the browser uses.
 */
describe('checking what was actually uploaded', () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
  const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>')

  function body(...chunks: Uint8Array[]): ReadableStream<Uint8Array> {
    return new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk)
        controller.close()
      },
    })
  }

  it('accepts a real image and hands back its bytes to store', async () => {
    const result = await checkUpload(
      'image/png',
      PNG.length,
      body(PNG.subarray(0, 5), PNG.subarray(5)),
    )
    expect(result).toMatchObject({ ok: true })
    expect(result.ok && [...result.bytes]).toEqual([...PNG])
  })

  /** The renamed-file attack, made by a client that never ran the browser's check. */
  it('refuses markup declared as an image', async () => {
    expect(await checkUpload('image/png', SVG.length, body(SVG))).toMatchObject({
      ok: false,
      status: 415,
    })
  })

  it('refuses one image format declared as another', async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0])
    expect(await checkUpload('image/png', jpeg.length, body(jpeg))).toMatchObject({
      ok: false,
      status: 415,
    })
  })

  /** Content-Length is a claim too. A body longer than it stops being read at the ceiling. */
  it('refuses a body larger than it declared, without reading past the ceiling', async () => {
    let pulled = 0
    const endless = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new Uint8Array(1024 * 1024))
      },
    })
    expect(await checkUpload('image/png', PNG.length, endless)).toMatchObject({
      ok: false,
      status: 413,
    })
    expect(pulled).toBeLessThanOrEqual(MAX_ASSET_BYTES / (1024 * 1024) + 2)
  })

  it('refuses a body shorter than it declared', async () => {
    expect(await checkUpload('image/png', PNG.length + 10, body(PNG))).toMatchObject({
      ok: false,
      status: 400,
    })
  })

  it('refuses a missing body', async () => {
    expect(await checkUpload('image/png', PNG.length, null)).toMatchObject({
      ok: false,
      status: 400,
    })
  })
})

/**
 * The room reads the SAME policy as the browser, not a copy. A copy is how the
 * two came to disagree: 20MB against 12MB, AVIF refused on one side and taken on
 * the other, and bytes sniffed on only one of them.
 */
describe('the policy the room applies', () => {
  const write = {
    method: 'PUT',
    role: 'editor' as const,
    owner: false,
    unlocked: true,
    contentLength: 1024,
  }

  it('has the shared ceiling', () => {
    expect(MAX_ASSET_BYTES).toBe(shared.MAX_IMAGE_BYTES)
  })

  it('accepts every type the shared policy allows, and nothing it does not', () => {
    for (const contentType of shared.ALLOWED_IMAGE_TYPES) {
      expect(assetDecision({ ...write, contentType })).toMatchObject({ ok: true })
    }
    for (const contentType of ['image/svg+xml', 'image/heic', 'image/bmp', 'text/html']) {
      expect(assetDecision({ ...write, contentType })).toMatchObject({ ok: false, status: 415 })
    }
  })
})
