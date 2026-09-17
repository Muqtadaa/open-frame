/**
 * Branded identifiers.
 *
 * A `BoardId` and an `ObjectId` are both strings at runtime, but the brand
 * makes them mutually unassignable at compile time. Passing an `AssetId` where
 * an `ObjectId` belongs is a type error rather than a silent lookup miss.
 *
 * The brand is erased at runtime — these serialize as ordinary strings.
 */
declare const brand: unique symbol

type Brand<T, B extends string> = T & { readonly [brand]: B }

export type BoardId = Brand<string, 'BoardId'>
export type ObjectId = Brand<string, 'ObjectId'>
export type AssetId = Brand<string, 'AssetId'>
export type UserId = Brand<string, 'UserId'>
export type TransactionId = Brand<string, 'TransactionId'>

/**
 * A fractional index: the sort key for an object among its siblings.
 *
 * This is a string, not a number, and it is compared lexicographically. See
 * `order.ts` for why, and `docs/architecture/03-document-model.md` for the
 * full rationale.
 */
export type OrderKey = Brand<string, 'OrderKey'>

/**
 * Casts a raw string to a branded id.
 *
 * Only for deserialization boundaries and tests — everywhere else, ids should
 * flow from the `IdGenerator` port or from data already read out of a document.
 */
export const asBoardId = (value: string): BoardId => value as BoardId
export const asObjectId = (value: string): ObjectId => value as ObjectId
export const asAssetId = (value: string): AssetId => value as AssetId
export const asUserId = (value: string): UserId => value as UserId
export const asTransactionId = (value: string): TransactionId => value as TransactionId
export const asOrderKey = (value: string): OrderKey => value as OrderKey
