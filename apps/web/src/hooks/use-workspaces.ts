import { useCallback, useEffect, useState } from 'react'

import {
  createWorkspace,
  listMyWorkspaces,
  shareWorkspace,
  type Workspace,
} from '../app/workspaces.js'

export type { Workspace }

/** One reference, so a signed-out render never produces a fresh array. */
const NONE: readonly Workspace[] = []

/**
 * The workspaces you are in, and what you may do with them.
 *
 * Loaded once per sign-in rather than per render: this is the frame the board
 * list is drawn in, not something that changes while you look at it. Anything
 * that DOES change it — creating one, taking a link — refreshes explicitly.
 */
export interface Workspaces {
  readonly workspaces: readonly Workspace[]
  /** Null while the first load is in flight, so the list can wait rather than flash. */
  readonly loaded: boolean
  readonly refresh: () => void
  readonly create: (name: string) => Promise<string | null>
  readonly share: (id: string) => Promise<{ editorKey: string; viewerKey: string } | null>
}

export function useWorkspaces(enabled: boolean): Workspaces {
  const [workspaces, setWorkspaces] = useState<readonly Workspace[]>([])
  const [loaded, setLoaded] = useState(false)
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    if (!enabled) return
    let live = true
    listMyWorkspaces()
      .then((found) => {
        if (!live) return
        setWorkspaces(found)
        setLoaded(true)
      })
      .catch(() => {
        // An unreachable database costs the grouping, not the board list.
        if (live) setLoaded(true)
      })
    return () => {
      live = false
    }
  }, [enabled, revision])

  const refresh = useCallback(() => {
    setRevision((current) => current + 1)
  }, [])

  const create = useCallback(
    async (name: string): Promise<string | null> => {
      const id = await createWorkspace(name)
      if (id !== null) refresh()
      return id
    },
    [refresh],
  )

  const share = useCallback(async (id: string) => shareWorkspace(id), [])

  /*
   * Answered directly when there is nobody signed in, rather than pushed
   * through state. Setting state from inside an effect just to say "still
   * empty" is a render nobody asked for, and React now warns about it — the
   * same reason `usePeers` returns its empty constant.
   */
  if (!enabled) return { workspaces: NONE, loaded: true, refresh, create, share }

  return { workspaces, loaded, refresh, create, share }
}
