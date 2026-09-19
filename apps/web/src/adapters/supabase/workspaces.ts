import { supabaseClient } from './client.js'

/**
 * Workspaces: what a board belongs to, and who works in it.
 *
 * Everything goes through a database function rather than a table read, for
 * the reason `boards.ts` gives: a workspace's links are revoked at the COLUMN
 * level, so no client can select them — and a `select *` on this table is
 * refused outright. `my_workspaces()` is the only door, and it hands back the
 * links only to an admin.
 *
 * Every failure is an empty list or a null, never a throw. A board opens and
 * edits offline, so a database that cannot be reached must degrade to "no
 * workspaces", never to a broken front door.
 */

export type WorkspaceRole = 'admin' | 'editor' | 'viewer'

export interface Workspace {
  readonly id: string
  readonly name: string
  /** The one every account is given. Not a permission — a label for the list. */
  readonly personal: boolean
  readonly role: WorkspaceRole
  /**
   * The links, for an admin and nobody else.
   *
   * Null for an editor or a viewer, because inviting is what `admin` means: a
   * link everybody can see is a link anybody can widen the workspace with.
   */
  readonly editorKey: string | null
  readonly viewerKey: string | null
  readonly boards: number
}

const ROLES = new Set(['admin', 'editor', 'viewer'])
const KEY = /^[0-9a-f]{32}$/
const ID = /^[0-9a-f-]{36}$/

/** Narrowed at the boundary, because a row arrived over a network. */
function readWorkspace(row: unknown): Workspace | null {
  if (typeof row !== 'object' || row === null) return null
  const {
    id,
    name,
    personal,
    role,
    editor_key: editorKey,
    viewer_key: viewerKey,
    boards,
  } = row as {
    id?: unknown
    name?: unknown
    personal?: unknown
    role?: unknown
    editor_key?: unknown
    viewer_key?: unknown
    boards?: unknown
  }

  if (typeof id !== 'string' || !ID.test(id)) return null
  if (typeof name !== 'string' || name === '') return null
  if (typeof role !== 'string' || !ROLES.has(role)) return null

  return {
    id,
    name,
    // Anything but a true is not personal: a row from a version that does not
    // send the column must not claim to be somebody's own workspace.
    personal: personal === true,
    role: role as WorkspaceRole,
    editorKey: typeof editorKey === 'string' && KEY.test(editorKey) ? editorKey : null,
    viewerKey: typeof viewerKey === 'string' && KEY.test(viewerKey) ? viewerKey : null,
    boards: typeof boards === 'number' && Number.isFinite(boards) ? boards : 0,
  }
}

export async function listMyWorkspaces(): Promise<readonly Workspace[]> {
  const client = supabaseClient()
  if (client === null) return []

  const response = (await client.rpc('my_workspaces')) as { data: unknown; error: unknown }
  if (response.error !== null || !Array.isArray(response.data)) return []

  const workspaces: Workspace[] = []
  for (const row of response.data as readonly unknown[]) {
    const workspace = readWorkspace(row)
    if (workspace !== null) workspaces.push(workspace)
  }
  return workspaces
}

/** Creates one and makes you its admin, in a single call. Its id, or null. */
export async function createWorkspace(name: string): Promise<string | null> {
  const client = supabaseClient()
  if (client === null) return null

  const response = (await client.rpc('create_workspace', { p_name: name })) as {
    data: unknown
    error: unknown
  }
  return response.error === null && typeof response.data === 'string' ? response.data : null
}

/**
 * Mints this workspace's two links, or returns the ones it already has.
 *
 * Idempotent by design: calling it twice does not rotate the keys, because
 * rotating silently would break every link already sent.
 */
export async function shareWorkspace(
  id: string,
): Promise<{ editorKey: string; viewerKey: string } | null> {
  const client = supabaseClient()
  if (client === null) return null

  const response = (await client.rpc('share_workspace', { p_id: id })) as {
    data: unknown
    error: unknown
  }
  if (response.error !== null || !Array.isArray(response.data)) return null

  const [row] = response.data as readonly unknown[]
  if (typeof row !== 'object' || row === null) return null
  const { editor_key: editorKey, viewer_key: viewerKey } = row as {
    editor_key?: unknown
    viewer_key?: unknown
  }
  if (typeof editorKey !== 'string' || !KEY.test(editorKey)) return null
  if (typeof viewerKey !== 'string' || !KEY.test(viewerKey)) return null
  return { editorKey, viewerKey }
}

/** Redeems a workspace link. The role now held, or null if the key is wrong. */
export async function joinWorkspace(id: string, key: string): Promise<WorkspaceRole | null> {
  const client = supabaseClient()
  if (client === null) return null

  const response = (await client.rpc('join_workspace', { p_id: id, p_key: key })) as {
    data: unknown
    error: unknown
  }
  if (response.error !== null) return null
  const role = response.data
  return typeof role === 'string' && ROLES.has(role) ? (role as WorkspaceRole) : null
}
