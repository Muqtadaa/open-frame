import { chmodSync, mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { clearSession, configHome, readSession, sessionPath, writeSession } from './session-store.js'

/**
 * Where a credential is kept, and what it is kept as.
 *
 * Everything here takes the environment as an argument rather than reading
 * `process.env`, which is what lets these run against a real directory in
 * `tmp` instead of a mocked filesystem: the permissions are the point, and a
 * mock cannot get them wrong.
 */

function somewhere(): { env: NodeJS.ProcessEnv; root: string } {
  const root = mkdtempSync(join(tmpdir(), 'openframe-session-'))
  return { env: { XDG_CONFIG_HOME: root, HOME: join(root, 'home') }, root }
}

const SESSION = {
  project: 'https://project.supabase.co',
  userId: 'f9ab',
  email: 'someone@example.com',
  refreshToken: 'refresh-token-value',
}

describe('the stored session', () => {
  it('lives under XDG_CONFIG_HOME', () => {
    const { env, root } = somewhere()
    expect(sessionPath(env)).toBe(join(root, 'openframe', 'session.json'))
  })

  /**
   * The specification requires an absolute path and says a relative one is to
   * be IGNORED. Resolving it instead would put a refresh token wherever the
   * tool was started from — in a repository, in a shared directory, in
   * whatever an editor's terminal had open.
   */
  it('ignores a relative XDG_CONFIG_HOME rather than resolving it', () => {
    const env = { XDG_CONFIG_HOME: '.config', HOME: '/home/someone' }
    expect(configHome(env)).toBe('/home/someone/.config')
  })

  it('falls back to ~/.config when the variable is unset', () => {
    expect(configHome({ HOME: '/home/someone' })).toBe('/home/someone/.config')
  })

  it('round-trips what was written', () => {
    const { env } = somewhere()
    writeSession(SESSION, env)
    expect(readSession(env)).toEqual(SESSION)
  })

  it('writes the file readable by nobody else', () => {
    const { env } = somewhere()
    writeSession(SESSION, env)
    expect(statSync(sessionPath(env)).mode & 0o777).toBe(0o600)
  })

  /**
   * Written twice, because the mode passed to `writeFileSync` applies only
   * when it CREATES the file — so a second sign-in over a file somebody had
   * loosened would keep the loose permissions, and nothing would say so.
   */
  it('tightens the permissions again on a later sign-in', () => {
    const { env } = somewhere()
    writeSession(SESSION, env)
    const path = sessionPath(env)
    /*
     * `chmod`, not a second `writeFileSync` with a mode on it. That was the
     * first version of this test and it proved nothing: a mode passed to
     * `writeFileSync` is ignored for a file that already exists, so the file
     * stayed at 0600 and the test passed with the fix deleted.
     */
    chmodSync(path, 0o644)
    expect(statSync(path).mode & 0o777).toBe(0o644)
    writeSession({ ...SESSION, refreshToken: 'rotated' }, env)
    expect(statSync(path).mode & 0o777).toBe(0o600)
    expect(readSession(env)?.refreshToken).toBe('rotated')
  })

  it('reads a missing or unreadable file as signed out', () => {
    const { env } = somewhere()
    expect(readSession(env)).toBeNull()
    writeSession(SESSION, env)
    writeFileSync(sessionPath(env), '{ half writ', { mode: 0o600 })
    expect(readSession(env)).toBeNull()
  })

  it('forgets the session on the way out, and does not mind being asked twice', () => {
    const { env } = somewhere()
    writeSession(SESSION, env)
    clearSession(env)
    clearSession(env)
    expect(readSession(env)).toBeNull()
    expect(() => readFileSync(sessionPath(env))).toThrow()
  })
})
