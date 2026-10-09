import { describe, expect, it } from 'vitest'

import {
  Assembler,
  FRAGMENT_BYTES,
  MAX_ASSEMBLED_BYTES,
  MESSAGE_PART,
  SPLIT_ABOVE,
  Splitter,
} from './parts.js'

const bytes = (n: number, fill = 7): Uint8Array => new Uint8Array(n).fill(fill)

describe('a message in parts', () => {
  it('sends an ordinary message as it is', () => {
    const message = bytes(1000)
    expect(new Splitter().split(message)).toEqual([message])
  })

  /*
   * Everything a peer on the previous version could read is still sent whole.
   * That version drops a part as a type it has never met, so a board between
   * one part and the old 32 MiB limit, split, would never open in a tab that
   * had not reloaded — and one published from such a tab would be lost (Codex,
   * on #104). Only what could never have been sent at all goes in parts.
   */
  it('sends whole anything up to the old limit, which an older peer can still read', () => {
    expect(SPLIT_ABOVE).toBe(32 * 1024 * 1024)
    const sized = (n: number) => new Splitter({ splitAbove: 100, partBytes: 10 }).split(bytes(n))
    expect(sized(100)).toHaveLength(1)
    expect(sized(101)).toHaveLength(11)
    const between = bytes(FRAGMENT_BYTES * 2)
    const sent = new Splitter().split(between)
    expect(sent).toHaveLength(1)
    // The same bytes, untouched: compared by identity, since a deep equal over megabytes takes minutes.
    expect(sent[0]).toBe(between)
  })

  it('splits a large one into frames no larger than a part, and puts it back together', () => {
    const message = bytes(SPLIT_ABOVE + 5)
    message[0] = 0
    message[message.length - 1] = 9
    const frames = new Splitter().split(message)
    expect(frames).toHaveLength(Math.ceil((SPLIT_ABOVE + 5) / FRAGMENT_BYTES))
    for (const frame of frames) {
      expect(frame[0]).toBe(MESSAGE_PART)
      expect(frame.byteLength).toBeLessThanOrEqual(FRAGMENT_BYTES + 32)
    }
    const assembler = new Assembler()
    const heard = frames.map((frame) => assembler.receive(frame))
    expect(heard.slice(0, -1).every((h) => h.kind === 'part')).toBe(true)
    const whole = heard.at(-1)
    // Compared as bytes: a deep equal over twelve megabytes takes minutes.
    expect(whole?.kind).toBe('whole')
    if (whole?.kind !== 'whole') return
    expect(whole.message.byteLength).toBe(message.byteLength)
    expect(Buffer.compare(whole.message, message)).toBe(0)
  })

  it('passes a message that was never split straight through', () => {
    const message = bytes(10)
    expect(new Assembler().receive(message)).toEqual({ kind: 'whole', message })
  })

  it('refuses parts out of order, or a part with no message under way', () => {
    const frames = new Splitter({ splitAbove: FRAGMENT_BYTES }).split(bytes(2 * FRAGMENT_BYTES + 1))
    expect(new Assembler().receive(frames[1]!)).toEqual({ kind: 'bad' })
    const skipped = new Assembler()
    skipped.receive(frames[0]!)
    expect(skipped.receive(frames[2]!)).toEqual({ kind: 'bad' })
    // A different message starting before the first one finished.
    const interleaved = new Assembler()
    interleaved.receive(frames[0]!)
    const other = new Splitter({ splitAbove: FRAGMENT_BYTES }).split(bytes(2 * FRAGMENT_BYTES + 1))
    other[0]![1] = 99
    expect(interleaved.receive(other[0]!)).toEqual({ kind: 'bad' })
  })

  it('refuses a message larger than it will hold, before holding it', () => {
    const assembler = new Assembler()
    const count = Math.ceil(MAX_ASSEMBLED_BYTES / FRAGMENT_BYTES) + 1
    // A first part that claims more parts than the cap allows.
    const frames = new Splitter({ splitAbove: FRAGMENT_BYTES }).split(bytes(2 * FRAGMENT_BYTES))
    const lying = Splitter.frame(1, 0, count, frames[0]!.subarray(0, 4))
    expect(assembler.receive(lying)).toEqual({ kind: 'bad' })
  })

  it('refuses a part it cannot read', () => {
    expect(new Assembler().receive(new Uint8Array([MESSAGE_PART, 0xff]))).toEqual({ kind: 'bad' })
  })
})
