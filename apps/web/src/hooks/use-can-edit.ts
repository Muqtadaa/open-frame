import { useEffect, useState } from 'react'

import { useOpenFrame } from '../runtime/context.js'

/**
 * Whether this person can change the board right now.
 *
 * A board opened read-only (quarantined, or held by somebody else's password)
 * cannot, and neither can somebody on a view link. Both are asked here so a
 * control offering a change asks one question; the dispatcher refuses either
 * way, and the room refuses a viewer's writes regardless (ADR 0016) — this is
 * what lets a control say so before it is pressed rather than after.
 */
export function useCanEdit(): boolean {
  const { runtime, collaboration } = useOpenFrame()
  const [role, setRole] = useState(collaboration?.role ?? 'editor')
  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onRole(setRole)
  }, [collaboration])
  return !runtime.readOnly && role !== 'viewer'
}
