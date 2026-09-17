import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'
import { DevPanel } from './DevPanel.js'

/**
 * Also the Phase 1 performance instrumentation surface: object count, visible
 * count and zoom are the three numbers you want in front of you while checking
 * whether culling is doing its job on a benchmark board.
 */
export function StatusBar() {
  const document = useBoardDocument()
  const zoom = useInteractionStore((state) => state.viewport.zoom)
  const selection = useInteractionStore((state) => state.selection)

  return (
    <div className="of-status" data-testid="status-bar">
      <span data-testid="object-count">{document.objects.size} objects</span>
      <span>{selection.size} selected</span>
      <span>{Math.round(zoom * 100)}%</span>
      {/*
       * Statically guarded, not runtime-guarded: `import.meta.env.DEV` is
       * replaced with `false` at build time, so the branch is dead code and the
       * bundler drops both it and the DevPanel module. A runtime check would
       * ship the whole panel to production just to never render it.
       */}
      {import.meta.env.DEV && <DevPanel />}
    </div>
  )
}
