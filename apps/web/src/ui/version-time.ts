/**
 * When a version was taken, as a person says it: the time, and the day as
 * "today", "yesterday" or a date. Local time, since that is the clock the
 * person reading it lives by.
 */
export function versionTime(at: number, now: number = Date.now()): string {
  const when = new Date(at)
  const time = when.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  return `${time}, ${dayOf(when, new Date(now))}`
}

function dayOf(when: Date, now: Date): string {
  const midnight = (date: Date): number =>
    new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
  const days = Math.round((midnight(now) - midnight(when)) / 86_400_000)
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  return when.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    ...(when.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
  })
}
