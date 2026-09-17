export type CommandErrorCode =
  | 'unauthorized'
  | 'unknown-object'
  | 'unknown-type'
  | 'object-locked'
  | 'invalid-input'
  | 'invalid-data'
  | 'not-resizable'
  | 'would-create-cycle'

/**
 * A rejected command. The document is guaranteed untouched: handlers validate
 * fully before producing a single patch, so there is no partial application to
 * roll back.
 */
export class CommandError extends Error {
  readonly code: CommandErrorCode

  constructor(code: CommandErrorCode, message: string) {
    super(message)
    this.name = 'CommandError'
    this.code = code
  }
}
