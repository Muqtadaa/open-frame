import { createContext, useContext } from 'react'

import type { ObjectViewRegistry } from '../canvas/views/registry.js'
import type { OpenFrameRuntime } from './composition-root.js'

export interface OpenFrameContextValue {
  readonly runtime: OpenFrameRuntime
  readonly views: ObjectViewRegistry
}

export const OpenFrameContext = createContext<OpenFrameContextValue | null>(null)

/**
 * Access to the wired application.
 *
 * Note what this hands out: the READ-ONLY document store and the dispatcher.
 * There is no way to reach the document writer from a component, because the
 * composition root never puts it in here.
 */
export function useOpenFrame(): OpenFrameContextValue {
  const value = useContext(OpenFrameContext)
  if (value === null) {
    throw new Error('useOpenFrame must be used inside <OpenFrameProvider>')
  }
  return value
}
