/**
 * The persisted document format version.
 *
 * Bump this whenever the SHAPE of the envelope or payload changes — renaming a
 * field, moving data between levels, changing how objects are keyed. Do NOT
 * bump it when a single object type evolves its own `data`: that is what the
 * per-type `dataVersion` is for. Keeping the two axes independent means adding
 * a field to `evidence` never forces every board on disk through a migration.
 */
export const CURRENT_SCHEMA_VERSION = 1

/** Marks a blob as an OpenFrame board before anything else is trusted about it. */
export const SCHEMA_FORMAT = 'openframe.board'
