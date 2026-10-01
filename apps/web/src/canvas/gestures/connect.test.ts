import { beforeEach, describe, expect, it } from 'vitest'

import { connect } from './connect.js'
import { beginEndpointDrag, endpoint } from './endpoint.js'
import { MADE, gestureBench, type GestureBench } from './gesture-bench.js'
import { gestureAt } from './types.js'

/**
 * The line modes: drawing a new connector, and dragging a point of one that
 * exists. Both rubber-band on interaction state (rule 4), ask the TYPE where a
 * drop attaches (rule 16), and hand a drag over when a handle makes something
 * (rule 25).
 */
let bench: GestureBench

beforeEach(() => {
  bench = gestureBench()
})

describe('drawing a connector', () => {
  function from(at: { x: number; y: number }) {
    bench.store().beginConnect({ kind: 'point', x: at.x, y: at.y }, at)
    return gestureAt(bench.pointer(at), 'connect', at, bench.store().viewport)
  }

  it('attaches to the object it is let go over, in one command', () => {
    const note = bench.make('sticky', { x: 400, y: 100, width: 100, height: 100 })
    const before = bench.harness.store.getDocument()

    const { during } = bench.drag(connect, from({ x: 100, y: 150 }), [
      { x: 300, y: 150 },
      { x: 450, y: 150 },
    ])

    expect(during.every((doc) => doc === before)).toBe(true)
    expect(bench.calls.map((call) => call.name)).toEqual(['createConnector'])
    expect(bench.calls[0]?.args[1]).toMatchObject({ kind: 'object', objectId: note })
    expect([...bench.store().selection]).toEqual([MADE])
    expect(bench.store().tool).toBe('select')
  })

  it('ends at a free point over empty board', () => {
    bench.drag(connect, from({ x: 100, y: 150 }), [{ x: 300, y: 220 }])
    expect(bench.calls[0]?.args[1]).toEqual({ kind: 'point', x: 300, y: 220 })
  })

  it('takes a stray click for nothing, not a line from nowhere to nowhere', () => {
    bench.drag(connect, from({ x: 100, y: 150 }), [{ x: 104, y: 153 }])
    expect(bench.calls).toEqual([])
  })

  it('holds the line to one axis with Shift, and attaches where the HELD line ends', () => {
    // The pointer is over the note; the held line is not, so nothing attaches.
    bench.make('sticky', { x: 300, y: 200, width: 100, height: 100 })
    bench.drag(connect, from({ x: 100, y: 150 }), [{ x: 350, y: 230 }], { shiftKey: true })
    expect(bench.calls[0]?.args[1]).toEqual({ kind: 'point', x: 350, y: 150 })
  })
})

describe('dragging a point of an existing connector', () => {
  let line: ReturnType<GestureBench['make']>

  beforeEach(() => {
    line = bench.make(
      'connector',
      { x: 0, y: 0, width: 0, height: 0 },
      {
        data: {
          from: { kind: 'point', x: 100, y: 100 },
          to: { kind: 'point', x: 300, y: 100 },
          routing: 'straight',
        },
      },
    )
    bench.store().setSelection([line])
  })

  function grab(id: string, at: { x: number; y: number }) {
    const handle = document.createElement('div')
    handle.setAttribute('data-endpoint-id', id)
    const active = beginEndpointDrag(
      bench.ctx,
      bench.pointer(at, { target: handle }),
      bench.store(),
    )
    if (active === null) throw new Error(`no handle ${id}`)
    return active
  }

  it('re-aims an end at the object it is dropped on, once, on release', () => {
    const note = bench.make('sticky', { x: 500, y: 50, width: 100, height: 100 })
    const before = bench.harness.store.getDocument()

    const { during } = bench.drag(endpoint, grab('to', { x: 300, y: 100 }), [
      { x: 400, y: 100 },
      { x: 550, y: 100 },
    ])

    expect(during.every((doc) => doc === before)).toBe(true)
    expect(bench.calls.map((call) => call.name)).toEqual(['retargetEndpoint'])
    const [id, end, drop] = bench.calls[0]?.args ?? []
    expect([id, end]).toEqual([line, 'to'])
    expect(drop).toMatchObject({ kind: 'object', objectId: note, final: true })
  })

  it('leaves an end at a free point over empty board', () => {
    bench.drag(endpoint, grab('to', { x: 300, y: 100 }), [{ x: 320, y: 260 }])
    expect(bench.calls[0]?.args[2]).toMatchObject({ kind: 'point', x: 320, y: 260, final: true })
  })

  it('commits nothing for an end that was pressed and let go', () => {
    const active = grab('to', { x: 300, y: 100 })
    endpoint.commit(bench.ctx, active, bench.pointer({ x: 300, y: 100 }), bench.store())
    expect(bench.calls).toEqual([])
  })

  it('adds ONE bend from a midpoint, however many frames the drag lasts', () => {
    // The midpoint hands the drag over to the vertex it creates (rule 25);
    // asked again as "insert here" it would add one bend per pointer event.
    const active = grab('midpoint:0', { x: 200, y: 100 })
    bench.drag(endpoint, active, [
      { x: 200, y: 140 },
      { x: 205, y: 170 },
      { x: 210, y: 200 },
    ])

    expect(active.endpointId).toBe('vertex:0')
    expect(bench.calls.map((call) => call.name)).toEqual(['updateData'])
    const [id, data] = bench.calls[0]?.args ?? []
    expect(id).toBe(line)
    expect((data as { points: unknown[] }).points).toHaveLength(1)
  })
})
