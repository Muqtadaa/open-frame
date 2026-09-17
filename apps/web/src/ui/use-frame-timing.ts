import { useEffect, useState } from 'react'

export interface FrameTiming {
  /** Frames per second over the sampling window. */
  readonly fps: number
  /** Median frame time in milliseconds — the typical experience. */
  readonly p50: number
  /** 95th-percentile frame time — where jank actually shows up. */
  readonly p95: number
}

const WINDOW = 120
/** Report at 4Hz: updating state every frame would itself distort the reading. */
const REPORT_INTERVAL_MS = 250

/**
 * Rolling frame-time statistics, for answering the renderer question with
 * numbers instead of impressions.
 *
 * p95 matters more than the average here: a canvas that averages 60fps but
 * drops a 40ms frame on every pointer-up feels broken, and a mean would hide
 * that completely.
 */
export function useFrameTiming(enabled: boolean): FrameTiming | null {
  const [timing, setTiming] = useState<FrameTiming | null>(null)

  useEffect(() => {
    if (!enabled) return

    const samples: number[] = []
    let previous = performance.now()
    let lastReport = previous
    let handle = 0

    const tick = (now: number): void => {
      samples.push(now - previous)
      previous = now
      if (samples.length > WINDOW) samples.shift()

      if (now - lastReport >= REPORT_INTERVAL_MS && samples.length > 10) {
        lastReport = now
        const sorted = [...samples].sort((a, b) => a - b)
        const at = (q: number): number =>
          sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * q))] ?? 0
        const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length
        setTiming({
          fps: Math.round(1000 / mean),
          p50: Math.round(at(0.5) * 10) / 10,
          p95: Math.round(at(0.95) * 10) / 10,
        })
      }
      handle = requestAnimationFrame(tick)
    }

    handle = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(handle)
  }, [enabled])

  return timing
}
