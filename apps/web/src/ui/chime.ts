/**
 * The sound a session timer makes at zero, synthesised rather than shipped —
 * two soft notes, so there is no audio file for rule 12 to worry about.
 *
 * A browser plays nothing until the page has been touched, and creating the
 * audio context is only allowed in answer to a gesture. So the context is
 * PRIMED on a press, and `chime` reports whether it could actually sound: a
 * participant who has not touched the page since the timer started gets a
 * flash on the bar instead, which is the honest fallback rather than silence.
 */

let context: AudioContext | null = null

/** Opens audio on a gesture, so a later chime may sound. Harmless where there is no audio. */
export function primeAudio(): void {
  try {
    context ??= new AudioContext()
    if (context.state === 'suspended') void context.resume()
  } catch {
    // No audio here; the timer flashes instead.
  }
}

/** Sounds the chime once. False when audio is not open, so the caller can show it instead. */
export function chime(): boolean {
  if (context?.state !== 'running') return false
  try {
    const start = context.currentTime
    for (const [offset, frequency] of [
      [0, 880],
      [0.18, 1318.5],
    ] as const) {
      const tone = context.createOscillator()
      const gain = context.createGain()
      tone.type = 'sine'
      tone.frequency.value = frequency
      gain.gain.setValueAtTime(0.0001, start + offset)
      gain.gain.exponentialRampToValueAtTime(0.2, start + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.9)
      tone.connect(gain).connect(context.destination)
      tone.start(start + offset)
      tone.stop(start + offset + 1)
    }
    return true
  } catch {
    return false
  }
}
