import {
  asAssetId,
  asObjectId,
  asTransactionId,
  type AssetId,
  type ObjectId,
  type TransactionId,
} from '../domain/ids.js'

/**
 * Identity, as a dependency — for the same reason as `Clock`: deterministic
 * tests, and a single place to change the id format.
 *
 * Ids are prefixed so that a bare string in a log or a database row still says
 * what it is.
 */
export interface IdGenerator {
  objectId(): ObjectId
  assetId(): AssetId
  transactionId(): TransactionId
}

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'

/**
 * 16 random base-36 characters (~82 bits). Collision-safe for board-scale
 * content without pulling in a dependency, and generated from the platform CSPRNG
 * so ids stay unguessable if they are ever exposed in a URL.
 */
function randomSuffix(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += ALPHABET.charAt(byte % ALPHABET.length)
  return out
}

export function createIdGenerator(): IdGenerator {
  return {
    objectId: () => asObjectId(`obj_${randomSuffix()}`),
    assetId: () => asAssetId(`ast_${randomSuffix()}`),
    transactionId: () => asTransactionId(`tx_${randomSuffix()}`),
  }
}

/** Predictable ids for tests and fixtures. */
export function createSequentialIdGenerator(seed = 0): IdGenerator {
  let n = seed
  const next = (): string => String(++n).padStart(4, '0')
  return {
    objectId: () => asObjectId(`obj_${next()}`),
    assetId: () => asAssetId(`ast_${next()}`),
    transactionId: () => asTransactionId(`tx_${next()}`),
  }
}
