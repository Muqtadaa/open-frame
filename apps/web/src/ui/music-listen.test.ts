import { playMusic, stopMusic, stoppedMusic, pauseMusic } from '@openframe/core/facilitation'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { asksToListen, readAgreed, startedText, writeAgreed } from './music-listen.js'

const playlist = [{ id: 'one', durationMs: 60_000 }]
const playing = playMusic(stoppedMusic('jazzhop'), 1000, 'Ada', playlist)

describe('asking this device to listen', () => {
  it('asks while somebody else’s music plays here unheard', () => {
    expect(asksToListen(playing, false, null)).toBe(true)
  })

  it('asks nothing once this device listens', () => {
    expect(asksToListen(playing, true, null)).toBe(false)
  })

  it('asks nothing of stopped or paused music, where there is nothing to hear', () => {
    expect(asksToListen(stoppedMusic(), false, null)).toBe(false)
    expect(asksToListen(pauseMusic(playing, 2000, 'Ada'), false, null)).toBe(false)
  })

  it('stays away for the run it was waved away for, and asks again for the next', () => {
    expect(asksToListen(playing, false, playing.run)).toBe(false)
    const again = playMusic(stopMusic(playing, 3000, 'Ada'), 4000, 'Ada', playlist)
    expect(again.run).not.toBe(playing.run)
    expect(asksToListen(again, false, playing.run)).toBe(true)
  })

  it('says who started it, when the record knows', () => {
    expect(startedText(playing)).toBe('Ada started the music')
    expect(startedText(playMusic(stoppedMusic(), 0, null, playlist))).toBe('Music started')
  })
})

describe('a yes remembered in this browser', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
  })

  it('is no until somebody here says yes', () => {
    expect(readAgreed()).toBe(false)
    writeAgreed()
    expect(readAgreed()).toBe(true)
  })

  it('is no, without throwing, where storage is refused', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => {
      writeAgreed()
    }).not.toThrow()
    expect(readAgreed()).toBe(false)
  })
})
