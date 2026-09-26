import { describe, expect, it, vi } from 'vitest'

import { openDatabase } from './database.js'

/*
 * The connection is shared, and it used to be shared even when it FAILED: one
 * refused open was cached and handed to every later caller, so nothing read
 * from storage again until the page was reloaded — a board list that failed
 * once stayed failed, whatever changed in between.
 */
describe('opening the database after a refusal', () => {
  it('tries again rather than repeating the refusal', async () => {
    const open = vi.spyOn(indexedDB, 'open').mockImplementationOnce(() => {
      throw new DOMException('The operation is insecure.', 'SecurityError')
    })

    await expect(openDatabase()).rejects.toThrow('insecure')
    const db = await openDatabase()

    expect(db.name).toBe('openframe')
    expect(open).toHaveBeenCalledTimes(2)
    open.mockRestore()
    db.close()
  })
})
