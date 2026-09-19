/**
 * Workspaces, as the rest of the app sees them.
 *
 * A one-file seam over the adapter, the same shape as `remote-boards.ts`,
 * `identity.ts` and `discussion.ts`: `supabase-lives-only-in-adapters` forbids
 * the interface from importing the client, and `hooks-do-not-touch-adapters`
 * forbids a hook from reaching past the composition root for one. This is what
 * satisfies both.
 */
export {
  createWorkspace,
  joinWorkspace,
  listMyWorkspaces,
  shareWorkspace,
  type Workspace,
  type WorkspaceRole,
} from '../adapters/supabase/workspaces.js'
