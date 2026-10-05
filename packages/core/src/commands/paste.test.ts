import { beforeEach, describe, expect, it } from 'vitest'

import { childrenOf, type AssetRef } from '../domain/document.js'
import { asAssetId, type ObjectId } from '../domain/ids.js'
import type { AnyOpenFrameObject } from '../domain/object.js'
import { richFromPlain } from '../domain/rich-text.js'
import {
  assetsToCarry,
  CLIPBOARD_VERSION,
  copyObjects,
  wordsOf,
  type ClipboardContent,
} from '../schema/clipboard.js'
import { serializeObject } from '../schema/serialize.js'
import { createTestHarness, type TestHarness } from '../testing.js'
import type { ConnectorData } from '../types/connector/schema.js'
import type { RelationData } from '../types/relation/schema.js'
import type { NewObjectSpec } from './types.js'

/**
 * A copy is what was selected, everything inside it, and the links that touch
 * it; a paste puts that down again under new ids, from this board or another.
 *
 * Everything here goes through `copyObjects` and the `PasteObjects` command,
 * which is all the clipboard in the app does — the system clipboard only
 * carries the content between the two.
 */

let h: TestHarness

beforeEach(() => {
  h = createTestHarness()
})

function create(spec: NewObjectSpec): ObjectId {
  const result = h.dispatcher.dispatch({ kind: 'CreateObjects', objects: [spec] })
  if (!result.ok) throw result.error
  const id = result.affected[0]
  if (id === undefined) throw new Error('expected an object')
  return id
}

const note = (text: string, x = 0, y = 0, parentId: ObjectId | null = null) =>
  create({ type: 'sticky', x, y, parentId, data: { text: richFromPlain(text) } })

function line(from: ConnectorData['from'], to: ConnectorData['to']): ObjectId {
  return create({ type: 'connector', x: 0, y: 0, data: { from, to } })
}

const attached = (objectId: ObjectId): ConnectorData['from'] => ({
  kind: 'object',
  objectId,
  anchor: { kind: 'auto' },
})

const relate = (from: ObjectId, to: ObjectId) =>
  create({ type: 'relation', x: 0, y: 0, data: { from, to, predicate: 'cites' } })

function copy(ids: readonly ObjectId[]): ClipboardContent {
  const content = copyObjects(h.store.getDocument(), ids, h.registry)
  if (content === null) throw new Error('expected something copied')
  return content
}

/** The objects a paste created, in the order it created them. */
function paste(content: unknown, dx = 100, dy = 50): AnyOpenFrameObject[] {
  const result = h.dispatcher.dispatch({ kind: 'PasteObjects', content, dx, dy })
  if (!result.ok) throw result.error
  const doc = h.store.getDocument()
  return result.affected.map((id) => {
    const object = doc.objects.get(id)
    if (object === undefined) throw new Error(`pasted ${id} is missing`)
    return object
  })
}

const elsewhere = (content: ClipboardContent): ClipboardContent => ({
  ...content,
  board: 'board_somewhere_else',
})

const ofType = (objects: readonly AnyOpenFrameObject[], type: string) =>
  objects.filter((object) => object.type === type)

function only<T>(items: readonly T[]): T {
  expect(items).toHaveLength(1)
  const [item] = items
  if (item === undefined) throw new Error('expected one')
  return item
}

describe('what a copy holds', () => {
  it('brings everything inside a frame, in its frame', () => {
    const frame = create({ type: 'frame', x: 0, y: 0, width: 400, height: 300 })
    note('inside', 20, 20, frame)
    note('also inside', 200, 20, frame)

    const pasted = paste(copy([frame]))
    const copyOfFrame = only(ofType(pasted, 'frame'))
    const members = ofType(pasted, 'sticky')
    expect(members).toHaveLength(2)
    for (const member of members) expect(member.parentId).toBe(copyOfFrame.id)
    expect(childrenOf(h.store.getDocument(), frame)).toHaveLength(2)
  })

  it('brings a group with its members, still grouped', () => {
    const a = note('a', 0, 0)
    const b = note('b', 200, 0)
    const result = h.dispatcher.dispatch({ kind: 'GroupObjects', ids: [a, b] })
    if (!result.ok) throw result.error
    const group = [...h.store.getDocument().objects.values()].find((o) => o.type === 'group')
    if (group === undefined) throw new Error('expected a group')

    const pasted = paste(copy([group.id]))
    const copyOfGroup = only(ofType(pasted, 'group'))
    expect(ofType(pasted, 'sticky').map((member) => member.parentId)).toEqual([
      copyOfGroup.id,
      copyOfGroup.id,
    ])
  })

  it('puts everything down the distance it was asked to', () => {
    const a = note('a', 10, 20)
    const [pasted] = paste(copy([a]), 100, 50)
    expect(pasted?.frame).toMatchObject({ x: 110, y: 70 })
  })

  it('keeps a turn and a hidden object hidden, and lets go of a lock', () => {
    const a = create({ type: 'shape', x: 0, y: 0, width: 100, height: 100 })
    for (const command of [
      { kind: 'RotateObjects', rotations: [{ id: a, rotation: Math.PI / 6 }] },
      { kind: 'SetHidden', ids: [a], hidden: true },
      { kind: 'SetLocked', ids: [a], locked: true },
    ] as const) {
      const result = h.dispatcher.dispatch(command)
      if (!result.ok) throw result.error
    }
    const original = h.store.getObject(a)

    const [pasted] = paste(copy([a]))
    expect(original?.frame.rotation).toBeCloseTo(Math.PI / 6)
    expect(original?.hidden).toBe(true)
    expect(pasted?.frame.rotation).toBeCloseTo(Math.PI / 6)
    expect(pasted?.hidden).toBe(true)
    expect(pasted?.locked).toBe(false)
  })

  it('stacks the copies the way the originals were stacked', () => {
    const below = note('below')
    const above = note('above')
    const pasted = paste(copy([above, below]))
    expect(
      pasted.map((object) => (object.data as { text: { text: string }[] }).text[0]?.text),
    ).toEqual(['below', 'above'])
  })

  it('is one change to undo', () => {
    const frame = create({ type: 'frame', x: 0, y: 0, width: 400, height: 300 })
    note('inside', 20, 20, frame)
    const before = h.store.getDocument().objects.size
    paste(copy([frame]))
    h.dispatcher.undo()
    expect(h.store.getDocument().objects.size).toBe(before)
  })

  it('leaves out what people did to the original', () => {
    const a = note('a')
    h.dispatcher.dispatch({
      kind: 'ToggleReaction',
      target: a,
      glyph: 'plus-one',
      by: { key: 'g_otter', name: 'Otter', hue: 30 },
    })
    const pasted = paste(copy([a]))
    expect(pasted.map((object) => object.type)).toEqual(['sticky'])
  })
})

describe('what a paste will not put down, whatever the copy says', () => {
  /*
   * A copy made here never holds these, but a paste reads content that came
   * through the system clipboard and may have been made by anything. A mark
   * points at an object it was made on, and a vote round at a board's
   * session; neither is something a copy of a note carries.
   */
  it('leaves out marks and sessions written into a copy by hand', () => {
    const a = note('a')
    h.dispatcher.dispatch({
      kind: 'ToggleReaction',
      target: a,
      glyph: 'plus-one',
      by: { key: 'g_otter', name: 'Otter', hue: 30 },
    })
    const started = h.dispatcher.dispatch({
      kind: 'StartVoteRound',
      title: 'Which matters most?',
      scope: { kind: 'board' },
      perPerson: 3,
      hidden: false,
      by: { key: 'g_otter', name: 'Otter', hue: 30 },
    })
    if (!started.ok) throw started.error
    const doc = h.store.getDocument()
    const extras = [...doc.objects.values()]
      .filter((object) => object.type === 'reaction' || object.type === 'vote-round')
      .map(serializeObject)
    expect(extras).toHaveLength(2)

    const content = copy([a])
    const pasted = paste({ ...content, objects: [...content.objects, ...extras] })
    expect(pasted.map((object) => object.type)).toEqual(['sticky'])
  })

  /*
   * `CreateObjects` takes parentage on trust, so a copy that names a parent
   * no command could have given it — one that holds nothing, or one that is
   * inside the object it holds — must not reach it (Codex, on #74).
   */
  it('puts down loose what names a parent that cannot hold it, or that it holds', () => {
    const outer = create({ type: 'frame', x: 0, y: 0, width: 400, height: 300, data: {} })
    const inner = create({ type: 'frame', x: 20, y: 20, width: 200, height: 150, data: {} })
    const a = note('a', 40, 40)
    const b = note('b', 60, 60)
    const content = copy([outer, inner, a, b])
    const named: Record<string, ObjectId> = { [outer]: inner, [inner]: outer, [a]: b }
    const forged = {
      ...content,
      objects: content.objects.map((object) => ({
        ...object,
        parentId: named[object.id] ?? null,
      })),
    }

    const pasted = paste(forged)
    // The two frames name each other: the one put down first is loose and
    // the other stays inside its copy. A note holds nothing.
    expect(pasted).toHaveLength(4)
    const [first, second] = pasted
    expect(pasted.map((object) => object.parentId)).toEqual([null, first?.id, null, null])
    expect(second?.type).toBe('frame')
  })
})

/**
 * A paste at the pointer puts the top-left of what it creates THERE, so the
 * origin is measured on what the paste reproduces. Rotation is reproduced
 * now, so a turned shape is measured by the box around it — the old paste
 * created it upright and had to measure its frame instead (Codex, on #18).
 */
describe('where a paste lands', () => {
  function landsAt(ids: readonly ObjectId[], at: { x: number; y: number }) {
    const content = copy(ids)
    const pasted = paste(content, at.x - content.origin.x, at.y - content.origin.y)
    const doc = h.store.getDocument()
    const boxes = pasted
      .filter((object) => !h.registry.drawnFromEnds(object))
      .map((object) => h.registry.boundsOf(object, doc))
    return {
      x: Math.min(...boxes.map((box) => box.x)),
      y: Math.min(...boxes.map((box) => box.y)),
    }
  }

  it('puts a turned shape’s corner at the pointer', () => {
    const shape = create({ type: 'shape', x: 100, y: 100, width: 100, height: 100 })
    h.dispatcher.dispatch({
      kind: 'RotateObjects',
      rotations: [{ id: shape, rotation: Math.PI / 4 }],
    })
    const at = landsAt([shape], { x: 500, y: 500 })
    expect(at.x).toBeCloseTo(500)
    expect(at.y).toBeCloseTo(500)
  })

  it('measures by what has extent, not by a line running off to one side', () => {
    const a = note('a', 100, 100)
    const away = line(attached(a), { kind: 'point', x: -900, y: -900 })
    const at = landsAt([a, away], { x: 500, y: 500 })
    expect(at).toEqual({ x: 500, y: 500 })
  })
})

describe('a line that is copied', () => {
  it('joins the copies when both of its ends came along', () => {
    const a = note('a', 0, 0)
    const b = note('b', 400, 0)
    const joined = line(attached(a), attached(b))

    const pasted = paste(copy([a, b, joined]))
    const [copyOfA, copyOfB] = ofType(pasted, 'sticky')
    const data = only(ofType(pasted, 'connector')).data as ConnectorData
    expect(data.from).toMatchObject({ kind: 'object', objectId: copyOfA?.id })
    expect(data.to).toMatchObject({ kind: 'object', objectId: copyOfB?.id })
  })

  it('stays joined to an original on the board it came from', () => {
    const a = note('a', 0, 0)
    const b = note('b', 400, 0)
    const joined = line(attached(a), attached(b))

    const pasted = paste(copy([a, joined]))
    const data = only(ofType(pasted, 'connector')).data as ConnectorData
    expect(data.from).toMatchObject({ objectId: only(ofType(pasted, 'sticky')).id })
    expect(data.to).toMatchObject({ kind: 'object', objectId: b })
  })

  it('lets go where the original was, on another board', () => {
    const a = note('a', 0, 0)
    const b = note('b', 400, 0)
    const joined = line(attached(a), attached(b))
    const content = copy([a, joined])
    const wasAt = content.ends[joined]?.to
    if (wasAt === undefined) throw new Error('expected the end recorded')

    const pasted = paste(elsewhere(content), 100, 50)
    const data = only(ofType(pasted, 'connector')).data as ConnectorData
    expect(data.from).toMatchObject({ kind: 'object' })
    expect(data.to).toEqual({ kind: 'point', x: wasAt.x + 100, y: wasAt.y + 50 })
  })

  it('carries a free end along with the copy', () => {
    const free = line({ kind: 'point', x: 10, y: 10 }, { kind: 'point', x: 90, y: 10 })
    const data = only(paste(copy([free]), 100, 50)).data as ConnectorData
    expect(data.from).toEqual({ kind: 'point', x: 110, y: 60 })
    expect(data.to).toEqual({ kind: 'point', x: 190, y: 60 })
  })
})

describe('a provenance link that is copied', () => {
  it('links the copies when both sides came along', () => {
    const evidence = note('P07 could not find the price')
    const insight = note('Pricing is hidden')
    relate(insight, evidence)

    const pasted = paste(copy([evidence, insight]))
    const [copyOfEvidence, copyOfInsight] = ofType(pasted, 'sticky')
    const link = only(ofType(pasted, 'relation')).data as RelationData
    expect(link.from).toBe(copyOfInsight?.id)
    expect(link.to).toBe(copyOfEvidence?.id)
  })

  it('keeps citing the original on the board it came from', () => {
    const evidence = note('P07 could not find the price')
    const insight = note('Pricing is hidden')
    relate(insight, evidence)

    const pasted = paste(copy([insight]))
    const link = only(ofType(pasted, 'relation')).data as RelationData
    expect(link.from).toBe(only(ofType(pasted, 'sticky')).id)
    expect(link.to).toBe(evidence)
  })

  it('is dropped on another board when a side stayed behind', () => {
    const evidence = note('P07 could not find the price')
    const insight = note('Pricing is hidden')
    relate(insight, evidence)

    const pasted = paste(elsewhere(copy([insight])))
    expect(pasted.map((object) => object.type)).toEqual(['sticky'])
  })
})

describe('a picture that is copied', () => {
  const held: AssetRef = {
    id: asAssetId('ast_here'),
    mimeType: 'image/png',
    byteSize: 10,
    width: 4,
    height: 4,
    locator: 'idb:ast_here',
  }
  const picture = () =>
    create({
      type: 'image',
      x: 0,
      y: 0,
      data: { asset: held, naturalWidth: 4, naturalHeight: 4, alt: 'a chart' },
    })

  it('names the bytes a paste on another board has to take along', () => {
    expect(assetsToCarry(copy([picture(), note('words')]), h.registry)).toEqual([held])
  })

  it('shows what the bytes became where it landed', () => {
    const uploaded: AssetRef = { ...held, id: asAssetId('ast_there'), locator: 'room:ast_there' }
    const result = h.dispatcher.dispatch({
      kind: 'PasteObjects',
      content: elsewhere(copy([picture()])),
      dx: 0,
      dy: 0,
      assets: { [held.id]: uploaded },
    })
    if (!result.ok) throw result.error
    const pasted = h.store.getObject(only(result.affected))
    expect((pasted?.data as { asset: AssetRef }).asset).toEqual(uploaded)
  })

  it('keeps the bytes it had when nothing was uploaded for it', () => {
    const [pasted] = paste(copy([picture()]))
    expect((pasted?.data as { asset: AssetRef }).asset).toEqual(held)
  })
})

describe('what a paste will not take', () => {
  it('refuses something that is not a copy of a board', () => {
    const result = h.dispatcher.dispatch({
      kind: 'PasteObjects',
      content: { hello: 'world' },
      dx: 0,
      dy: 0,
    })
    expect(result.ok).toBe(false)
  })

  it('refuses a copy from a newer version of the format', () => {
    const content = { ...copy([note('a')]), version: CLIPBOARD_VERSION + 1 }
    const result = h.dispatcher.dispatch({ kind: 'PasteObjects', content, dx: 0, dy: 0 })
    expect(result.ok).toBe(false)
  })

  it('leaves out an object it cannot read, and pastes the rest', () => {
    const content = copy([note('kept'), note('from the future')])
    const [kept, future] = content.objects
    if (kept === undefined || future === undefined) throw new Error('expected two')
    const pasted = paste({ ...content, objects: [kept, { ...future, dataVersion: 999 }] })
    expect(pasted).toHaveLength(1)
  })

  it('checks every object against its type, as a board load does', () => {
    const content = copy([note('a')])
    const [object] = content.objects
    if (object === undefined) throw new Error('expected one')
    const result = h.dispatcher.dispatch({
      kind: 'PasteObjects',
      content: { ...content, objects: [{ ...object, data: { text: 42 } }] },
      dx: 0,
      dy: 0,
    })
    expect(result.ok).toBe(false)
  })
})

/*
 * The plain text a copy carries, for a document or a chat window: a frame
 * pasted there is the notes inside it, and a long note arrives whole
 * (Codex, on #75).
 */
describe('the words on a copy', () => {
  it('are every object it holds, each in full', () => {
    const frame = create({
      type: 'frame',
      x: 0,
      y: 0,
      width: 400,
      height: 300,
      data: { name: 'Findings' },
    })
    const long = 'Pricing is hidden behind a sales call. '.repeat(10).trim()
    note(long, 20, 20, frame)
    const b = note('b', 500, 0)
    relate(frame, b)

    expect(wordsOf(h.store.getDocument(), copy([frame]), h.registry)).toEqual(['Findings', long])
  })
})

describe('duplicating', () => {
  it('is a copy and a paste, so a frame brings what it holds', () => {
    const frame = create({ type: 'frame', x: 0, y: 0, width: 400, height: 300 })
    note('inside', 20, 20, frame)
    const result = h.dispatcher.dispatch({ kind: 'DuplicateObjects', ids: [frame], dx: 10, dy: 10 })
    if (!result.ok) throw result.error
    const frames = [...h.store.getDocument().objects.values()].filter((o) => o.type === 'frame')
    expect(frames).toHaveLength(2)
    for (const each of frames) expect(childrenOf(h.store.getDocument(), each.id)).toHaveLength(1)
  })
})
