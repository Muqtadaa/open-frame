import { chmodSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'

/**
 * Where the signed-in session lives between runs.
 *
 * `$XDG_CONFIG_HOME/openframe/session.json`, and the specification's own
 * fallback when that is unset or relative — the variable is REQUIRED to hold
 * an absolute path, and a relative one is to be ignored rather than resolved
 * against whatever directory the tool happened to start in. A credential
 * written to a path that moves with the working directory is a credential in
 * a repository.
 *
 * The file holds a REFRESH token and no access token. The access token lasts
 * an hour and would be stale in the file long before it was read; the refresh
 * token is the thing worth keeping and the thing worth protecting, so the file
 * is `0600` and the directory `0700`.
 *
 * It also records which project it was issued by. Supabase refresh tokens do
 * not say where they came from, so a build pointed at a different project
 * would send this one to a service that has never heard of it and report the
 * person as signed out for a reason nothing on screen could explain.
 */

export interface StoredSession {
  /** The identity service that issued it. */
  readonly project: string
  readonly userId: string
  readonly email: string | null
  /**
   * Rotated by the service on every use, so this is rewritten on every
   * refresh. A stale one here means the next start signs in from nothing.
   */
  readonly refreshToken: string
}

/** `$XDG_CONFIG_HOME`, or the specification's fallback. */
export function configHome(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.XDG_CONFIG_HOME
  if (typeof configured === 'string' && configured !== '' && isAbsolute(configured)) {
    return configured
  }
  return join(env.HOME ?? homedir(), '.config')
}

export function sessionPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(configHome(env), 'openframe', 'session.json')
}

/** The stored session, or `null` when there is none or it cannot be read. */
export function readSession(env: NodeJS.ProcessEnv = process.env): StoredSession | null {
  let raw: string
  try {
    raw = readFileSync(sessionPath(env), 'utf8')
  } catch {
    // No file is the ordinary case: nobody has signed in on this machine.
    return null
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    /*
     * Unreadable is treated as absent rather than fatal. A half-written file
     * is recoverable by signing in again, and refusing to start over one
     * leaves somebody with a tool that cannot be used and cannot be fixed.
     */
    return null
  }

  if (typeof parsed !== 'object' || parsed === null) return null
  const { project, userId, email, refreshToken } = parsed as {
    project?: unknown
    userId?: unknown
    email?: unknown
    refreshToken?: unknown
  }
  if (typeof project !== 'string' || typeof userId !== 'string') return null
  if (typeof refreshToken !== 'string' || refreshToken === '') return null
  return {
    project,
    userId,
    email: typeof email === 'string' ? email : null,
    refreshToken,
  }
}

export function writeSession(session: StoredSession, env: NodeJS.ProcessEnv = process.env): void {
  const path = sessionPath(env)
  mkdirSync(join(configHome(env), 'openframe'), { recursive: true, mode: 0o700 })
  /*
   * The mode is passed AND set: `writeFileSync`'s mode applies only when it
   * creates the file, so a second sign-in would silently keep whatever
   * permissions an earlier version — or somebody's editor — left behind.
   */
  writeFileSync(path, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 })
  chmodSync(path, 0o600)
}

/** Signs out on this machine. Missing is success: there is nothing to remove. */
export function clearSession(env: NodeJS.ProcessEnv = process.env): void {
  rmSync(sessionPath(env), { force: true })
}
