import { useBoardDocument } from '../hooks/use-document-object.js'
import { useInteractionStore } from '../interaction/interaction-store.js'

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
    </div>
  )
}
