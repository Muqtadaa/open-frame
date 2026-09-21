import { describe, expect, it } from 'vitest'

import { CODE_LANGUAGES } from './schema.js'
import { canTidy, tidyCode, tidyKindOf } from './format.js'

describe('what each language can take', () => {
  it('refuses the languages whose indentation is their syntax', () => {
    // Re-indenting these changes what they MEAN. Python's blocks are its
    // leading space; a diff's first column is the operation; Markdown's is a
    // code block or a nested list.
    expect(tidyKindOf('python')).toBe('none')
    expect(tidyKindOf('diff')).toBe('none')
    expect(tidyKindOf('markdown')).toBe('none')
    expect(tidyKindOf('yaml')).toBe('none')
  })

  it('leaves them exactly as they were', () => {
    const python = 'def f():\n        return 1\n'
    expect(tidyCode(python, 'python')).toBeNull()
  })

  it('says so before a control offers it', () => {
    expect(canTidy('python')).toBe(false)
    expect(canTidy('typescript')).toBe(true)
  })

  it('has an answer for every language offered', () => {
    for (const language of CODE_LANGUAGES) {
      expect(typeof tidyKindOf(language)).toBe('string')
    }
  })
})

describe('json', () => {
  it('is formatted exactly, not merely indented', () => {
    expect(tidyCode('{"b":1,"a":[1,2]}', 'json')).toBe(
      '{\n  "b": 1,\n  "a": [\n    1,\n    2\n  ]\n}',
    )
  })

  /*
   * A fragment is the common case on a board — half a response body, pasted
   * out of a log. Exact formatting is not available for it, but lining up its
   * brackets is, and a control that does nothing at all reads as broken.
   */
  it('indents a fragment it cannot parse rather than doing nothing', () => {
    expect(tidyCode('{\n"a": 1,\n"b": {\n"c": 2\n}', 'json')).toBe(
      '{\n  "a": 1,\n  "b": {\n    "c": 2\n  }',
    )
  })
})

describe('brace languages', () => {
  it('indents a nested block', () => {
    const before = 'function f() {\nif (x) {\nreturn 1\n}\n}'
    expect(tidyCode(before, 'typescript')).toBe(
      'function f() {\n  if (x) {\n    return 1\n  }\n}',
    )
  })

  it('pulls a closing line out to the level it closes', () => {
    expect(tidyCode('a {\nb\n}', 'css')).toBe('a {\n  b\n}')
  })

  it('flattens what was over-indented to begin with', () => {
    expect(tidyCode('        const a = 1\n            const b = 2', 'javascript')).toBe(
      'const a = 1\nconst b = 2',
    )
  })

  it('strips trailing space from a blank line', () => {
    expect(tidyCode('a\n   \nb', 'go')).toBe('a\n\nb')
  })

  /*
   * The one that made the naive version wrong. A brace inside a string is not
   * structure, and counting it pulls every following line out one level — the
   * failure is invisible on the line that causes it and obvious ten lines
   * later, which is the worst way for a formatter to be wrong.
   */
  it('ignores a brace inside a string', () => {
    const before = 'function f() {\nconst a = "}"\nconst b = 2\n}'
    expect(tidyCode(before, 'javascript')).toBe(
      'function f() {\n  const a = "}"\n  const b = 2\n}',
    )
  })

  it('ignores a brace inside a line comment', () => {
    const before = 'function f() {\n// }\nconst b = 2\n}'
    expect(tidyCode(before, 'javascript')).toBe(
      'function f() {\n  // }\n  const b = 2\n}',
    )
  })

  it('never indents below zero when a file opens with a closer', () => {
    expect(tidyCode('}\n}\na', 'java')).toBe('}\n}\na')
  })
})

describe('markup', () => {
  it('indents nested elements', () => {
    expect(tidyCode('<div>\n<p>hi</p>\n</div>', 'html')).toBe(
      '<div>\n  <p>hi</p>\n</div>',
    )
  })

  it('keeps a matched pair on one line flat', () => {
    expect(tidyCode('<div>\n<p>hi</p>\n<p>there</p>\n</div>', 'html')).toBe(
      '<div>\n  <p>hi</p>\n  <p>there</p>\n</div>',
    )
  })

  /*
   * A void element has no closing tag, so counting it as an opener indents
   * the entire rest of the document one level deeper — for ever, and worse
   * with every `<br>`.
   */
  it('does not indent for ever after a void element', () => {
    expect(tidyCode('<div>\n<br>\n<img src="a">\n<p>hi</p>\n</div>', 'html')).toBe(
      '<div>\n  <br>\n  <img src="a">\n  <p>hi</p>\n</div>',
    )
  })

  it('does not treat a self-closing tag as an opener', () => {
    expect(tidyCode('<div>\n<Foo />\n<p>hi</p>\n</div>', 'xml')).toBe(
      '<div>\n  <Foo />\n  <p>hi</p>\n</div>',
    )
  })

  it('does not count a declaration as an opener', () => {
    expect(tidyCode('<?xml version="1.0"?>\n<a>\n<b/>\n</a>', 'xml')).toBe(
      '<?xml version="1.0"?>\n<a>\n  <b/>\n</a>',
    )
  })
})
