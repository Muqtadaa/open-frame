import { useEffect, useState } from 'react'

import type { BoardConnection } from '@openframe/collab'

import { useOpenFrame } from '../runtime/context.js'

export type RoomStatus = BoardConnection['status']

/**
 * Whether the room can be reached, or `null` on a board that has no room.
 *
 * One subscription for everything on the bar that needs it: the readout says
 * it, the share button no longer does.
 */
export function useRoomStatus(): RoomStatus | null {
  const { collaboration } = useOpenFrame()
  const [status, setStatus] = useState<RoomStatus>(collaboration?.status ?? 'offline')
  useEffect(() => {
    if (collaboration === null || collaboration === undefined) return
    return collaboration.onStatus(setStatus)
  }, [collaboration])
  return collaboration === null || collaboration === undefined ? null : status
}
