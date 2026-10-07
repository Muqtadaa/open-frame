import { connect } from './connect.js'
import { crop } from './crop.js'
import { divider } from './divider.js'
import { draw } from './draw.js'
import { endpoint } from './endpoint.js'
import { marquee } from './marquee.js'
import { pan } from './pan.js'
import { resize, rotate } from './transform.js'
import { translate } from './translate.js'
import { vote } from './vote.js'
import type { ActiveMode, GestureHandler } from './types.js'

/**
 * What each gesture mode does once it is running, one module apiece.
 *
 * A `Record` over every mode, so a new mode without a handler is a compile
 * error rather than a gesture that silently does nothing on release — the
 * same friction the cursor table and the object registry use.
 */
export const HANDLERS: Readonly<Record<ActiveMode, GestureHandler>> = {
  pan,
  translate,
  marquee,
  draw,
  resize,
  rotate,
  connect,
  endpoint,
  divider,
  crop,
  vote,
}
