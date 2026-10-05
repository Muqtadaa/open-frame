# 04 · Object type registry

← [Documentation index](../README.md) · Source: [`registry.ts`](../../packages/core/src/domain/registry.ts) · [`views/registry.ts`](../../apps/web/src/views/registry.ts)

The registry exists to answer one question: **how do you add a new kind of
canvas object without editing the whole application?**

---

## Two registries, not one

The obvious design puts everything in one registration call — schema, factory,
renderer, editor. That cannot work here, because `renderer` and `editor` are
React components and the domain must not depend on React.

So the registry is split:

|                        | Lives in        | Contains                                                         | Knows about React |
| ---------------------- | --------------- | ---------------------------------------------------------------- | :---------------: |
| `ObjectTypeDefinition` | `packages/core` | schema, version, migrations, factory, capabilities, `describe()` |        ❌         |
| `ObjectViewDefinition` | `apps/web`      | `Renderer`, `InlineEditor`, defaults, `tool`, `readsMarks`       |        ✅         |

They are joined by the type string at startup, and **either can be missing
without the other breaking**:

- Definition but no view → renders as a labelled placeholder (`FallbackView`)
- View but no definition → never instantiated; the command layer rejects it

The first case is exactly what lets a board containing a future `evidence`
object open in today's build instead of crashing.

A view is a leaf, so it cannot reach the dispatcher or know who is looking. A
view that is ANSWERED on the board, as a poll is, declares `readsMarks`. Its
objects are then handed `marks`: what people have marked on the object, who is
looking, whether they may write, and an `act` that dispatches a command. Only
those objects subscribe. Fields a type declares come in six kinds: `text`,
`longText`, `tags`, `select`, `boolean` (a checkbox) and `choices` (a list of
`{ id, label }` whose labels are edited and whose ids never are).

---

## The domain half

```ts
interface ObjectTypeDefinition<TType extends string, TData> {
  readonly type: TType

  readonly schema: ZodType<TData>
  readonly currentVersion: number
  readonly migrations: Readonly<Record<number, (data: unknown) => unknown>>

  readonly create: (init?: Partial<TData>) => {
    data: TData
    frame: { width: number; height: number }
  }

  readonly capabilities: {
    resizable
    rotatable
    textEditable
    canHaveChildren
    connectable: boolean
    styleProps: readonly StyleProp[]
  }

  readonly getBounds?: (object: ObjectBase<TType, TData>) => Rect
  readonly describe: (object: ObjectBase<TType, TData>) => ObjectDescription
}
```

### Why `describe()` is required

```ts
interface ObjectDescription {
  readonly searchText: string // everything a user might search for
  readonly summary: string // one line, for AI context and lists
  readonly fields: Readonly<Record<string, string | number | readonly string[]>>
}
```

This is the single seam that **board search, AI context serialization, MCP
`get_objects` and export** all read from. Without it, each of those features
grows its own `switch (object.type)` and adding a semantic type stops being a
two-file change.

It is the least obvious method in the registry and the one that most protects
the architecture.

### Type erasure

Authors write a fully typed definition; `defineObjectType` erases it into an
`ErasedObjectTypeDefinition` that generic code consumes. That function contains
**the only casts in the domain layer**, and they are safe because the registry
never hands a definition an object of a different type.

Interface members use function-property syntax (`readonly create: (…) => …`)
rather than method shorthand. Methods are bivariant in TypeScript — a known
unsoundness — while properties are contravariant and therefore actually checked.

---

## Adding `evidence`: the complete change set

```
NEW    packages/core/src/types/evidence/schema.ts        Zod schema + type
NEW    packages/core/src/types/evidence/definition.ts    ObjectTypeDefinition
NEW    packages/core/src/types/evidence/index.test.ts    schema + migration tests
EDIT   packages/core/src/types/index.ts                  ONE registration line
NEW    apps/web/src/views/EvidenceView.tsx        Renderer + InlineEditor
EDIT   apps/web/src/views/index.ts                ONE registration line
```

```ts
export const evidenceType = defineObjectType<'evidence', EvidenceData>({
  type: 'evidence',
  schema: EvidenceDataSchema,
  currentVersion: 1,
  migrations: {},
  create: (init) => ({
    data: { text: '', tags: [], linkedInsightIds: [], ...init },
    frame: { width: 220, height: 140 },
  }),
  capabilities: {
    resizable: true,
    rotatable: false,
    textEditable: true,
    canHaveChildren: false,
    connectable: true,
    styleProps: ['color', 'fill', 'opacity'],
  },
  describe: (o) => ({
    searchText: [o.data.text, o.data.source, o.data.participant, ...o.data.tags]
      .filter(Boolean)
      .join(' '),
    summary: `Evidence: ${o.data.text.slice(0, 80)}`,
    fields: { text: o.data.text, participant: o.data.participant ?? '', tags: o.data.tags },
  }),
})
```

**Zero changes** to: the command layer, the dispatcher, undo, persistence,
serialization, migration infrastructure, the viewport, hit testing, culling,
selection, the tool rail, the keymap, the cursor, the pointer controller,
search, AI serialization or MCP tools.

### Making it from the rail

A type that people make from the rail says so on its view, in the same file:

```ts
const evidenceTool: ObjectTool = {
  label: 'Evidence',
  keys: ['e'],
  order: 80,
  place: 'click', // or 'draw' (drag to size) or 'connect'
  Icon: () => <EvidenceIcon />,
  cursor: () => ({ body: 'M4 4h16v16H4z' }),
}

export const evidenceView = defineObjectView<EvidenceData>({
  type: 'evidence',
  tool: evidenceTool,
  // ...
})
```

The rail, the keymap, the cursor and the pointer all read it through
`views.tools()`. A tool with choices to make first declares `initial`,
`data(options)` for what the object is created with, an optional `cycleKey`
plus `cycle`, and an `options.Picker` that the rail opens from the armed
button. The shape tool declares all of these.

The claim was tested, not assumed. `decision` was given a tool in
`DecisionView.tsx` and nothing else was changed. It appeared on the rail, its
key armed it, and a press placed one.

Until tracks A-6 this was not true. Adding a tool meant editing seven more
files: the `Tool` union, the keymap, the pointer controller, the cursor table,
and the rail's groups, icons and flyouts. None of them compared `object.type`,
so the rule 5 scan could not see them. It now scans tool comparisons as well
(`apps/web/src/registry-rule.test.ts`).

---

## The anti-`switch` rule

`switch (object.type)` is permitted in exactly one place: the registry lookup
itself. Anywhere else it is a design failure, and two tests fail the build if
it appears:

- [`architecture.test.ts`](../../packages/core/src/architecture.test.ts) checks
  core;
- [`registry-rule.test.ts`](../../apps/web/src/registry-rule.test.ts) checks the
  web app outside `views/`. It also catches comparing `.type`, or a tool,
  against a registered type name.

If behaviour varies by object type, it belongs in the registry — that is what
makes a new type pick it up for free.

---

## The contract test

[`registry-contract.test.ts`](../../packages/core/src/types/registry-contract.test.ts)
runs the same assertions against **every registered type**: valid factory
output, a migration for every version, rejection of newer versions, rejection of
invalid data, real style properties, and a working `describe()`.

A new type is covered by those guarantees the moment it is registered.

---

## Next

- [05 · Commands and undo](05-commands-and-undo.md) — how objects change
- [06 · Schema and migrations](06-schema-and-migrations.md) — how types evolve
