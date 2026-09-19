/**
 * Identity, as the rest of the application sees it.
 *
 * A one-file seam over the adapter, so nothing above this layer imports a
 * provider. `supabase-lives-only-in-adapters` stops the client leaking out;
 * this is what makes obeying that rule painless rather than a nuisance.
 */
export {
  currentIdentity,
  onIdentityChange,
  signIn,
  signOut,
  signUp,
  type AuthResult,
  type Identity,
} from '../adapters/supabase/identity.js'

export { ACCOUNTS_ENABLED } from './supabase-config.js'
