/**
 * Who you are in a room before there is any such thing as an account.
 *
 * This is the product decision recorded in the phase plan: an account is for
 * OWNERSHIP and board lists, not for getting into a board. Somebody a
 * researcher wants in a workshop should not have to sign up to attend.
 *
 * A guest identity is a LABEL and never an authorization. The client chooses
 * it, so nothing may ever decide access from it — the room does not read it,
 * and when Stage 3 adds real identity this stays exactly what it is: a name on
 * a cursor.
 */

const STORAGE_KEY = 'openframe:guest'

/**
 * Short, neutral and memorable enough to say out loud — "the badger moved it" —
 * which is the only job a guest name has.
 */
const CREATURES = [
  'Badger',
  'Heron',
  'Otter',
  'Falcon',
  'Marten',
  'Ibis',
  'Lynx',
  'Kestrel',
  'Weasel',
  'Plover',
  'Stoat',
  'Curlew',
] as const

/** Six hues kept apart from the content palette; see `--of-p-*` in styles/tokens.css. */
export const PRESENCE_HUES = 6

export interface Guest {
  readonly name: string
  /** An index into the presence palette, not a colour value. */
  readonly hue: number
  /**
   * What a reaction or a vote this browser leaves is matched on, so "my
   * reaction" can be found and taken back. Random rather than derived from the
   * name, because two people can be the same otter.
   */
  readonly key: string
}

const GUEST_KEY = /^g_[a-z0-9]{16}$/

/** A guest stored before keys existed is still a guest, and keeps its name. */
function isStoredGuest(value: unknown): value is Omit<Guest, 'key'> & { key?: unknown } {
  if (typeof value !== 'object' || value === null) return false
  const { name, hue } = value as { name?: unknown; hue?: unknown }
  return typeof name === 'string' && typeof hue === 'number' && hue >= 0 && hue < PRESENCE_HUES
}

function newKey(): string {
  const bytes = new Uint8Array(8)
  crypto.getRandomValues(bytes)
  return `g_${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`
}

function invent(): Guest {
  const bytes = new Uint8Array(2)
  crypto.getRandomValues(bytes)
  const creature = CREATURES[(bytes[0] ?? 0) % CREATURES.length] ?? 'Guest'
  return { name: creature, hue: (bytes[1] ?? 0) % PRESENCE_HUES, key: newKey() }
}

/**
 * The guest this page settled on, kept in memory as well as in storage: with
 * storage blocked, every call used to invent somebody new, and the reaction
 * bar and the chips — which ask separately — disagreed about who "me" was.
 */
let remembered: Guest | null = null

/** For tests: forget the page's guest, as a new page load would. */
export function forgetGuestForTests(): void {
  remembered = null
}

/**
 * The same identity every time this browser opens a board, so a collaborator
 * who comes back after lunch is still the same otter.
 */
export function guestIdentity(): Guest {
  if (remembered !== null) return remembered
  let guest: Guest | null = null
  let fresh = false
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (isStoredGuest(stored)) {
      const key = typeof stored.key === 'string' && GUEST_KEY.test(stored.key) ? stored.key : null
      guest = { name: stored.name, hue: stored.hue, key: key ?? newKey() }
      fresh = key === null
    }
  } catch {
    // Unreadable or blocked storage. A fresh identity is a fine answer.
  }

  if (guest === null) {
    guest = invent()
    fresh = true
  }
  if (fresh) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(guest))
    } catch {
      // Not being able to remember it must not stop it being used.
    }
  }
  remembered = guest
  return guest
}
