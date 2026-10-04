/**
 * A countdown as it is read: `m:ss`, or `h:mm:ss` past the hour.
 *
 * Rounded UP, so a timer reads 0:00 only once it is over. Rounding down showed
 * 0:00 for the whole of the last second, and "Time's up" a second after the
 * clock already said it was.
 */
export function clockText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const seconds = String(total % 60).padStart(2, '0')
  return hours > 0
    ? `${String(hours)}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${String(minutes)}:${seconds}`
}

/**
 * A duration somebody typed: `5` is five minutes, `1:30` a minute and a half,
 * `1:02:03` past the hour. `null` for anything else. Bounds are the timer's to
 * apply, not this.
 */
export function parseClock(typed: string): number | null {
  const parts = typed.trim().split(':')
  if (parts.length > 3 || parts.some((part) => !/^\d{1,3}$/.test(part))) return null
  const numbers = parts.map(Number)
  if (numbers.length === 1) return (numbers[0] ?? 0) * 60_000
  // Every part after the first is a count of sixty.
  if (numbers.slice(1).some((part) => part >= 60)) return null
  return numbers.reduce((total, part) => total * 60 + part, 0) * 1000
}
