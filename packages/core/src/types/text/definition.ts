import { appendParagraph, plainTextOf } from '../../domain/rich-text.js'
import { snapUp } from '../shared/snap-up.js'
import { defineObjectType } from '../../domain/registry.js'
import { resizeTokens } from '../shared/resize-tokens.js'
import { textToSpans } from '../shared/text-to-spans.js'
import { TEXT_VERSION, TextDataSchema, type TextData } from './schema.js'

export const TEXT_TYPE = 'text'

/** The widest a pasted text box is made, a comfortable line of reading. */
const PASTED_MEASURE = 640
/** An average character and a line of the default size, in world units: an estimate, not a layout. */
const CHAR_WIDTH = 9
const LINE_HEIGHT = 28
const INSET = 20

export const textType = defineObjectType<typeof TEXT_TYPE, TextData>({
  type: TEXT_TYPE,

  schema: TextDataSchema,
  currentVersion: TEXT_VERSION,
  /*
   * v2: `text` was a plain string until spans (ADR 0012).
   * v3: the size scale widened, and its tokens were renamed.
   */
  migrations: { 2: textToSpans, 3: resizeTokens },

  create: (init) => ({
    data: { text: init?.text ?? [{ text: '' }] },
    // Two lines of display type, on the grid: at 48 a fresh box held one,
    // and the first sentence typed wrapped out of sight.
    frame: { width: 240, height: 60 },
  }),

  appendText: (data, text) => ({ ...data, text: appendParagraph(data.text, text) }),

  /*
   * Words pasted from outside the board are a text box: a sticky is a unit of
   * content that gets clustered and counted, and a paragraph out of a
   * document is not one until somebody makes it one.
   *
   * Sized from the words, roughly, so a pasted paragraph is not squeezed into
   * the two lines a fresh box has: as wide as the longest line up to a
   * reading measure, and as tall as the lines wrap to.
   */
  fromOutside: {
    text: (text) => {
      const lines = plainTextOf(text).split('\n')
      const longest = Math.max(...lines.map((line) => line.length))
      const width = snapUp(Math.min(PASTED_MEASURE, Math.max(240, longest * CHAR_WIDTH + INSET)))
      const perLine = Math.max(1, Math.floor((width - INSET) / CHAR_WIDTH))
      const wrapped = lines.reduce(
        (sum, line) => sum + Math.max(1, Math.ceil(line.length / perLine)),
        0,
      )
      return { data: { text }, width, height: snapUp(Math.max(60, wrapped * LINE_HEIGHT + INSET)) }
    },
  },

  capabilities: {
    resizable: true,
    rotatable: false,
    textEditable: true,
    spatial: true,
    canHaveChildren: false,
    selectsAsUnit: false,
    hollow: false,
    connectable: true,
    markable: false,
    /*
     * No fill: text has no surface to fill. The registry is what stops the
     * toolbar offering a fill control for it.
     *
     * `textColor` rather than `color`, even though a text object's colour IS
     * its ink. On every other type `color` is a surface, so a selection
     * holding a sticky and a text used to intersect on `color` and one swatch
     * set the note's paper and the words' ink at once — one control meaning
     * two things (rule 21). The view still READS `color` so boards written
     * before this keep the colour they were given.
     */
    styleProps: ['textColor', 'font', 'align', 'verticalAlign', 'opacity'],
  },

  describe: (object) => {
    const text = plainTextOf(object.data.text)
    return {
      searchText: text,
      summary: text.trim() === '' ? 'Empty text' : text.slice(0, 120),
      gist: text.trim().slice(0, 120),
      fields: { text },
    }
  },
})
