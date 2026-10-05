import { DurableObject } from 'cloudflare:workers'

import type { Reserved } from './handler.js'
import { dayOf, refundRun, reserveRun, type DayCounts, type Limits } from './quota.js'

const KEY = 'counts'

/**
 * Holds the day's AI runs. One instance (named `quota`) for the whole worker:
 * a reservation is a read and a write in one turn of one object, so two
 * requests at once can never both take the last run.
 */
export class AiQuotaObject extends DurableObject {
  async reserve(userId: string, limits: Limits): Promise<Reserved> {
    const stored = await this.ctx.storage.get<DayCounts>(KEY)
    const { counts, result } = reserveRun(stored, dayOf(Date.now()), userId, limits)
    await this.ctx.storage.put(KEY, counts)
    return result
  }

  /*
   * To the day the run was TAKEN from, not today: a run reserved before
   * midnight and given back after it would otherwise come off the new day's
   * count, and hand out a run the cap never allowed (Codex, on #67).
   */
  async refund(userId: string, day: string): Promise<void> {
    const stored = await this.ctx.storage.get<DayCounts>(KEY)
    await this.ctx.storage.put(KEY, refundRun(stored, day, userId))
  }
}
