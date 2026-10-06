import type { SessionMusic } from '@openframe/core/facilitation'

/**
 * Whether to ask this device to listen: the music is playing, this device is
 * not hearing it, and nobody here has waved this run away. Paused music asks
 * nothing — there is nothing to hear yet — and a new run (somebody pressed
 * Play again) asks again, because it is news again.
 */
export function asksToListen(
  music: SessionMusic,
  joined: boolean,
  dismissedRun: number | null,
): boolean {
  return music.status === 'playing' && !joined && dismissedRun !== music.run
}

/** What the prompt says: who started this run, when the record knows. */
export function startedText(music: SessionMusic): string {
  return music.startedBy === null ? 'Music started' : `${music.startedBy} started the music`
}

const AGREED_KEY = 'openframe:music-join'

/**
 * Whether somebody in this browser has said yes to the board's music before.
 * Once they have, music somebody else starts joins on its own — or on their
 * next press anywhere, where the browser wants one — rather than asking again.
 */
export function readAgreed(): boolean {
  try {
    return window.localStorage.getItem(AGREED_KEY) === 'true'
  } catch {
    return false
  }
}

export function writeAgreed(): void {
  try {
    window.localStorage.setItem(AGREED_KEY, 'true')
  } catch {
    // Agreed for this page; a reload asks once more.
  }
}
