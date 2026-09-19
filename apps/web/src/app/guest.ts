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

/** Six hues kept apart from the content palette; see `--of-p-*` in styles.css. */
export const PRESENCE_HUES = 6

export interface Guest {
  readonly name: string
  /** An index into the presence palette, not a colour value. */
  readonly hue: number
}

function isGuest(value: unknown): value is Guest {
  if (typeof value !== 'object' || value === null) return false
  const { name, hue } = value as { name?: unknown; hue?: unknown }
  return typeof name === 'string' && typeof hue === 'number' && hue >= 0 && hue < PRESENCE_HUES
}

function invent(): Guest {
  const bytes = new Uint8Array(2)
  crypto.getRandomValues(bytes)
  const creature = CREATURES[(bytes[0] ?? 0) % CREATURES.length] ?? 'Guest'
  return { name: creature, hue: (bytes[1] ?? 0) % PRESENCE_HUES }
}

/**
 * The same identity every time this browser opens a board, so a collaborator
 * who comes back after lunch is still the same otter.
 */
export function guestIdentity(): Guest {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (isGuest(stored)) return stored
  } catch {
    // Unreadable or blocked storage. A fresh identity is a fine answer.
  }

  const guest = invent()
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(guest))
  } catch {
    // Not being able to remember it must not stop it being used.
  }
  return guest
}
