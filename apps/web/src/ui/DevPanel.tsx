import { useState } from 'react'

import { useOpenFrame } from '../runtime/context.js'
import { useFrameTiming } from './use-frame-timing.js'

const SIZES = [100, 1_000, 5_000, 10_000] as const

/**
 * Development-only instrumentation for settling the renderer question
 * (ADR 0002): load a benchmark board, then pan, zoom and drag while watching
 * frame timing.
 *
 * Run `pnpm bench:fixtures` first to generate the boards.
 *
 * Excluded from production builds — `import.meta.env.DEV` is statically false
 * there, so this component and its fetch are removed by the bundler.
 */
export function DevPanel() {
  const { runtime } = useOpenFrame()
  const [status, setStatus] = useState<string | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const timing = useFrameTiming(measuring)

  const devTools = runtime.devTools
  if (devTools === undefined) return null

  const load = async (size: number): Promise<void> => {
    setStatus(`loading ${String(size)}…`)
    try {
      const response = await fetch(`/bench/board-${String(size)}.json`)
      if (!response.ok) {
        setStatus(`no fixture for ${String(size)} — run: pnpm bench:fixtures`)
        return
      }
      const result = devTools.loadBoard(await response.json())
      setStatus(result.ok ? `loaded ${String(result.objects)} objects` : `failed: ${result.reason}`)
    } catch (error) {
      setStatus(`failed: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return (
    <div className="of-dev" data-testid="dev-panel">
      <span className="of-dev__label">bench</span>

      {SIZES.map((size) => (
        <button key={size} type="button" className="of-dev__button" onClick={() => void load(size)}>
          {size >= 1000 ? `${String(size / 1000)}k` : size}
        </button>
      ))}

      <button
        type="button"
        className="of-dev__button"
        onClick={() => {
          devTools.clearBoard()
          setStatus('cleared')
        }}
      >
        clear
      </button>

      <button
        type="button"
        className={`of-dev__button${measuring ? ' of-dev__button--active' : ''}`}
        onClick={() => setMeasuring((current) => !current)}
      >
        {measuring ? 'stop' : 'measure'}
      </button>

      {timing !== null && (
        <span className="of-dev__timing" data-testid="frame-timing">
          {timing.fps} fps · p50 {timing.p50}ms · p95 {timing.p95}ms
        </span>
      )}

      {status !== null && <span className="of-dev__status">{status}</span>}
    </div>
  )
}
