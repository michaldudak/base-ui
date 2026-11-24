# Porting guide: `@base-ui/react` to `@base-ui/solid`

This is the rule book used to port Base UI's Menu to Solid 2.0. It is written for someone who
knows the React code base and has not written Solid. Follow it literally: independently ported
files only fit together when they all apply the same mapping.

Read first: `node_modules/solid-js/skills/solid-2.0/SKILL.md` (one page, Solid 2.0 for people who
know React or Solid 1). The full reference is `node_modules/solid-js/CHEATSHEET.md`.

## 0. Ground rules

- **Faithful port.** Every Solid file mirrors the React file with the same path
  (`packages/react/src/menu/item/MenuItem.tsx` becomes `packages/solid/src/menu/item/MenuItem.tsx`).
  Keep names, exports, comments, JSDoc, control flow and the order of statements. Change only what
  the framework forces. Do not redesign, simplify, or "improve". Behaviour must stay identical:
  the React tests are ported next to the code and must pass.
- **Never edit `packages/react` or `packages/utils`.** Copy what you need.
- `@base-ui/utils/<name>` is `#utils/<name>` here (`packages/solid/src/base-utils/<name>.ts`).
  If a util you need is not there yet, copy and port it into `src/base-utils`.
- `@floating-ui/react-dom` does not exist here. Types and middleware come from `@floating-ui/dom`.
- Do not cast to silence the type checker. `any` is acceptable only for prop bags (`HTMLProps`).
- Files that are not components or hooks (stores, selectors, pure functions, constants, data
  attribute enums) are copied verbatim, with imports adjusted.

## 1. The mental model

A React component function runs on every render. A Solid component function runs **once**. What
changes afterwards is not the function's local variables but _signals_ (reactive values). Code
that reads a signal inside a _tracking scope_ (JSX, `createMemo`, the first function of an effect)
re-runs when the signal changes; code that reads it anywhere else gets a snapshot.

Consequences that drive every rule below:

1. Anything a React hook "gets fresh on every render" must be passed around as a **function that
   reads it** (an _accessor_), and called at the place of use.
2. `props` is a reactive object. **Never destructure it** and never read `props.x` at the top of
   a component to store it in a variable. Write `props.x` (or a small `const x = () => props.x`)
   where the value is used.
3. Closures never go stale, because the function that created them never re-runs. So
   `useStableCallback`, `useCallback`, `useValueAsRef` and `useRefWithInit` have no equivalent:
   use a plain function or a plain variable.
4. **Signal writes are batched.** After `setX(1)`, `x()` still returns the old value until the
   end of the microtask (or an explicit `flush()`). Event handlers that need a value they just
   wrote must read it from the synchronous store (section 4) or from a local variable.

## 2. Mapping table

| React                                              | Solid                                                                                                                                   |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `React.forwardRef((props, ref) => ...)`            | `function X(componentProps: X.Props): JSX.Element`; `ref` is a prop                                                                     |
| `const { a, b = 1, ...elementProps } = props`      | `const elementProps = omit(props, 'a', 'b')`; read `props.a`, `props.b ?? 1` lazily                                                     |
| `React.useState(v)` (drives rendering)             | `createSignal(v, { ownedWrite: true })`                                                                                                 |
| `React.useState(v)` read back in handlers          | a field in the store, or a plain `let` plus a signal for rendering                                                                      |
| `React.useRef(v)`                                  | `const ref = { current: v }` (keep the `.current` shape)                                                                                |
| `useRefWithInit(fn)`                               | `const ref = { current: fn() }`                                                                                                         |
| `React.useMemo(fn, deps)`                          | `createMemo(fn)` (dependencies are tracked automatically)                                                                               |
| `useStableCallback(fn)` / `React.useCallback`      | `fn` (a plain function)                                                                                                                 |
| `useValueAsRef(v)`                                 | read the accessor where needed                                                                                                          |
| `React.useEffect(fn, deps)`                        | `useEffect(() => [deps], ([deps]) => { ... })` from `#utils/useEffect`                                                                  |
| `useIsoLayoutEffect(fn, deps)`                     | `useIsoLayoutEffect` from `#utils/useEffect` (same function)                                                                            |
| `useOnMount(fn)`                                   | `useOnMount(fn)` from `#utils/useEffect`                                                                                                |
| effect cleanup / unmount                           | return a function from the effect; `onCleanup(fn)` in a component body                                                                  |
| `useControlled({ controlled, default })`           | `useControlled({ controlled: () => props.x, default: () => props.defaultX })` from `#utils/useControlled`, returns `[accessor, setter]` |
| `useId()` / `useBaseUiId(id)`                      | `useId()` from `#utils/useId` / `useBaseUiId(() => props.id)`, returns an accessor                                                      |
| `useTimeout()` / `useAnimationFrame()`             | same names in `#utils/useTimeout`, `#utils/useAnimationFrame`                                                                           |
| `ReactDOM.flushSync(fn)`                           | `fn(); flush();` (`flush` from `solid-js`)                                                                                              |
| `React.createContext(undefined)` + `useContext`    | `createContext<T \| null>(null)` + `useContext` from `solid-js` (see 3.5)                                                               |
| `<Ctx.Provider value={v}>`                         | `<Ctx value={v}>`                                                                                                                       |
| `ReactDOM.createPortal(children, node)`            | `<Portal mount={node}>{children}</Portal>` from `@solidjs/web`                                                                          |
| `if (!mounted) return null`                        | `<Show when={mounted()}>...</Show>`, or `enabled` of `useRenderElement`                                                                 |
| `items.map((item) => <X key={item.id} />)`         | `<For each={items()}>{(item) => <X />}</For>`                                                                                           |
| `React.Children`, `cloneElement`, `isValidElement` | no equivalent; restructure with context or the `render` function                                                                        |
| `ReactStore`                                       | `SolidStore` from `#utils/store`                                                                                                        |
| `store.useState('key')` (a value)                  | `store.useState('key')` (an **accessor**)                                                                                               |
| `useRenderElement(tag, props, params)`             | same name, section 5                                                                                                                    |
| `mergeProps(a, b)`                                 | same name in `../merge-props`, section 5                                                                                                |
| `className`, `htmlFor`, `tabIndex`, `readOnly`     | `class`, `for`, `tabindex`, `readonly` (all attributes lowercase)                                                                       |
| `event.nativeEvent`                                | `event` (events are native)                                                                                                             |
| `event.isPropagationStopped()`                     | `event.cancelBubble`                                                                                                                    |
| `React.KeyboardEvent`, `React.MouseEvent`, ...     | `KeyboardEvent`, `MouseEvent`, ...                                                                                                      |
| `React.CSSProperties`                              | `JSX.CSSProperties` (kebab-case keys: `'pointer-events'`)                                                                               |
| `React.ReactNode`                                  | `JSX.Element` (`import type { JSX } from '@solidjs/web'`)                                                                               |
| `React.RefObject<T>`                               | `{ current: T }`                                                                                                                        |
| `React.Ref<T>` (a prop)                            | `(element: T) => void`                                                                                                                  |
| `'use client'`                                     | delete                                                                                                                                  |

Imports: reactive primitives come from `solid-js` (`createSignal`, `createMemo`, `createContext`,
`useContext`, `onCleanup`, `untrack`, `flush`, `omit`, `merge`, `Show`, `For`); DOM things come
from `@solidjs/web` (`Portal`, `dynamic`, `render`, `JSX` types).

## 3. Hooks

React hooks stay functions named `useX`. They are called once, from the component body.

### 3.1 Parameters

- A parameter that could differ between renders in React (it came from props, state, context or
  another hook) is typed `MaybeAccessor<T>` and read with `access()` from `#utils/access`, **at
  the place of use** (inside a handler, an effect's first function, or a memo):

  ```ts
  // React
  export function useThing(store: Store, { enabled = true, delay }: Props) {
    const onClick = useStableCallback(() => { if (enabled) start(delay); });
  // Solid
  export function useThing(store: Store, props: UseThingProps) {
    const onClick = () => {
      if (access(props.enabled) ?? true) start(access(props.delay));
    };
  ```

  The params object itself is not destructured (callers may pass an object with getters).

- A parameter that is a **callback** (`onOpenChange`, `getItems`) stays a plain function and is
  never passed through `access()`.
- A parameter that is a ref object stays `{ current: T }`.
- Stores, handles and other stable objects are passed as they are.

### 3.2 Return values

Keep the same keys as the React hook. For each returned value:

- A value React recomputes per render (`mounted`, `transitionStatus`, `open`, ids, derived
  booleans) is returned as an `Accessor<T>`.
- **Every bag of element props is returned as an `Accessor<HTMLProps>`** (a `createMemo` that
  returns the object; when the hook is disabled it returns `EMPTY_OBJECT`). Event handlers are
  created once, outside the memo, and referenced from it. This applies to the
  `{ reference, floating, item, trigger }` shape of the interaction hooks too: each key is an
  accessor.
- Functions (`setMounted`, `getItemProps`) and ref objects are returned as they are.

Callers then write `const { mounted, setMounted } = useTransitionStatus(open)` and call
`mounted()` where needed. Destructuring the _result_ is fine because its fields are accessors,
not values.

### 3.3 Effects

Use `useEffect` / `useIsoLayoutEffect` from `#utils/useEffect`:

```ts
// React
useIsoLayoutEffect(() => {
  if (!open || !element) return undefined;
  return addEventListener(element, 'scroll', onScroll);
}, [open, element]);

// Solid
useIsoLayoutEffect(
  () => [open(), store.useState('popupElement')()] as const, // see note on accessors below
  ([isOpen, element]) => {
    if (!isOpen || !element) return undefined;
    return addEventListener(element, 'scroll', onScroll);
  },
);
```

Rules:

- The first function lists the dependencies by **reading** them. It re-runs whenever one of them
  changes; the second function runs only if a value in the returned array actually changed.
- Create accessors (`store.useState(...)`, `createMemo`) in the hook body, not inside the first
  function. The example above is abbreviated; write `const element = store.useState('popupElement')`
  first and read `element()` in the dependency function.
- The second function must **not read signals or accessors**. Solid warns
  (`STRICT_READ_UNTRACKED`) and the test setup fails the test on any console warning. Pass what
  it needs through the dependency array. A value that React read from a ref or stable callback
  (so it was _not_ a dependency) is either read synchronously from the store
  (`store.state.x`, `store.select('x')`), or added as `untrack(() => x())` in the dependency
  function so it does not trigger a re-run.
- Writing signals inside the second function is fine for signals created with
  `{ ownedWrite: true }` (all internal signals) and for the store.
- An effect without a dependency array in React (runs after every render) has no direct
  equivalent. Work out what it reacts to and list that.
- Order differs from React: effects of a **parent run before those of its children**, and layout
  and passive effects are not separate phases. If React code relies on a child's layout effect
  having run before the parent's effect (typically registration of items), do the child's work
  synchronously in the component body or in its `ref` callback instead, and note it in a comment.
- React StrictMode double-invocation does not exist; delete code that only exists for it.

### 3.4 Refs to elements

```tsx
// React
const popupRef = React.useRef<HTMLDivElement | null>(null);
<div ref={useMergedRefs(forwardedRef, popupRef, store.useStateSetter('popupElement'))} />;

// Solid
const popupRef = { current: null as HTMLDivElement | null };
const setPopupElement = (element: HTMLDivElement | null) => {
  popupRef.current = element;
  store.set('popupElement', element);
};
onCleanup(() => setPopupElement(null));
// pass `ref: setPopupElement` in the params of useRenderElement
```

- A `ref` is a function called once with the element. `useRenderElement` merges the user's `ref`
  prop with `params.ref` (a function or an array of functions); there is no `useMergedRefs`.
- The ref runs **before the element is in the document** (`element.isConnected === false`) and
  it is never called with `null`. Clear state in `onCleanup`. Anything that measures or focuses
  the element belongs in an effect or `useOnMount`, which run after insertion.

### 3.5 Context

- `export const XContext = createContext<XContext | null>(null);` and keep the
  `useXContext(optional?)` helper with the same error message and the same return type
  (`useContext(XContext) ?? undefined`). The default must be `null`, not `undefined`: in Solid 2
  `useContext` **throws** when no provider is mounted and the default is `undefined`.
- The context **value is a stable object created once**. Fields that change are `Accessor<T>`;
  stores, callbacks and refs are plain. Consumers call the accessors where they use them. Do not
  recreate the object in a memo.
- **Children must be created inside the provider.** In Solid, context is found through the tree
  of owners at the moment a component is created, so this is wrong:

  ```tsx
  const element = useRenderElement('div', componentProps, {...}); // children created here
  return <XContext value={context}>{element}</XContext>;          // too late
  ```

  Write the call inside the JSX (JSX children are evaluated lazily, inside the provider):

  ```tsx
  return (
    <XContext value={context}>
      {useRenderElement('div', componentProps, {...})}
    </XContext>
  );
  ```

  For the same reason, a hook that must see a context has to be called under that provider.

## 4. Stores

`SolidStore` (`#utils/store`) is `ReactStore` for Solid: a synchronous, framework-neutral `Store`
plus accessors.

- Synchronous, always current, for handlers and effect bodies: `store.state.x`,
  `store.select('selector', ...args)`, `store.set(key, value)`, `store.update({...})`,
  `store.context.x`.
- Reactive, for JSX, memos and dependency functions: `const open = store.useState('open')`
  returns an accessor. Selector arguments may be accessors:
  `store.useState('isActive', () => props.index)`.
- `store.useSyncedValue('key', () => props.x)`, `store.useSyncedValues(() => ({ a: props.a }))`,
  `store.useSyncedValueWithCleanup`, `store.useControlledProp('openProp', () => props.open)`,
  `store.useContextCallback('onOpenChange', () => props.onOpenChange)`: same roles as in
  `ReactStore`, taking accessors. They apply the initial value immediately, so children created
  afterwards already see it.
- Selectors (`createSelector`, `createSelectorMemoized`) and store classes are copied verbatim;
  only the base class changes from `ReactStore` to `SolidStore`. Methods of store classes that
  are React hooks (`useX`) are ported with the rules of section 3.

## 5. Rendering elements

```tsx
export function MenuGroup(componentProps: MenuGroup.Props): JSX.Element {
  const elementProps = omit(componentProps, 'render', 'class', 'style');
  const [labelId, setLabelId] = createSignal<string | undefined>(undefined, { ownedWrite: true });

  const state: MenuGroupState = {
    // state is an object with getters, read lazily by data attributes and by the user's
    // `class`, `style` and `render` functions
    get open() { return open(); },
  };

  return (
    <MenuGroupContext value={{ setLabelId }}>
      {useRenderElement('div', componentProps, {
        state,
        ref: (element) => { ... },
        props: () => [{ role: 'group', 'aria-labelledby': labelId() }, elementProps],
        stateAttributesMapping,
      })}
    </MenuGroupContext>
  );
}
```

- `useRenderElement(tag, componentProps, params)` returns the element. `params`:
  `state`, `ref`, `props`, `stateAttributesMapping`, `enabled` (boolean or accessor; `false`
  renders nothing), `children` (a function, to render something other than `props.children`).
- `params.props` is an object, an array of sources, or **a function returning either**. Use the
  function form whenever a source depends on something reactive (it almost always does): it runs
  in a memo, so the element's attributes follow. Sources merge left to right like React's
  `mergeProps`: later wins; `class`, `style`, `ref` and event handlers are merged; the rightmost
  handler runs first and can call `event.preventBaseUIHandler()`. A source may be a prop getter
  `(mergedProps) => props`, as in React.
- Always put `elementProps` (the user's remaining props) where React put it.
- The element is created once and updated in place. It is re-created only when the `render` prop
  changes or `enabled` flips.
- `aria-*` and `data-*` booleans are rendered as `"true"`/`"false"` by `useRenderElement`, like
  React. Everything else follows Solid: `true` renders an empty attribute, `false`/`undefined`
  removes it.
- Public prop types: `BaseUIComponentProps<'div', State>` from `../../internals/types`
  (`class`, `style`, `render`, `children`, native attributes). The `render` prop is a tag name, a
  component, or `(props, state) => JSX.Element`. There is no element form.
- Keep the `export namespace X { export type Props = ...; export type State = ... }` blocks.

## 6. Events

Solid uses native DOM events. Handlers are `onClick`, `onKeyDown`, `onPointerDown`, ... on JSX and
in prop bags.

- React's `onFocus`/`onBlur` bubble; native `focus`/`blur` do not. When the React handler is on a
  container and relies on events from descendants, use **`onFocusIn`/`onFocusOut`**. On a leaf
  element keep `onFocus`/`onBlur`.
- React's `onChange` on text inputs is the native `input` event: use `onInput`.
- React's `onMouseEnter`/`onMouseLeave` are synthesized and fire for portalled descendants;
  native ones are not. Keep `onMouseEnter`/`onMouseLeave` unless the code depends on that.
- These events are _delegated_ by Solid (one listener on the document, React-style, and they
  **bubble through `<Portal>` to the logical parent** like in React): `beforeinput, click,
dblclick, contextmenu, focusin, focusout, input, keydown, keyup, mousedown, mousemove, mouseout,
mouseover, mouseup, pointerdown, pointermove, pointerout, pointerover, pointerup, touchend,
touchmove, touchstart`. All others (`focus`, `blur`, `mouseenter`, `mouseleave`, `pointerenter`,
  `pointerleave`, `scroll`, `wheel`, `change`, ...) are attached to the element directly and do
  not cross portals.
- `event.stopPropagation()` in a delegated handler stops other delegated handlers up the tree,
  as in React.
- `event.currentTarget` and `event.target` work as in React. There is no `event.persist()`.
- Listeners added with `addEventListener` (`#utils/addEventListener`) are unchanged.

## 7. Things that bite

- **Do not read reactive values at the top of a component or hook** (outside JSX, memos, and
  dependency functions). In development Solid warns, and the test setup turns the warning into a
  failure. The one legitimate "read once" is an initial value: wrap it in `untrack(() => props.x)`
  and say so in a comment.
- **Do not write signals at the top of a component or in a memo** unless the signal was created
  with `{ ownedWrite: true }`. The store is safe to write anywhere.
- An effect's second function must return `undefined` or a function. Use a block body.
- `onClick={cond() ? a : b}` binds once. Decide inside one stable handler.
- A JSX prop whose value is a call or other expression (`handle={Menu.createHandle()}`,
  `items={[1, 2]}`) compiles to a **getter that is re-evaluated on every read**. Anything that
  must keep its identity (handles, stores, arrays compared by reference) is created once in a
  `const` and passed by name.
- Inside an effect's cleanup, or anywhere else a "latest value" was read through a ref in React,
  read props with `untrack(() => props.x)` at the point of use.
- A callback read from a params object (`props.onNavigate`) is called as a plain property; a
  parameter whose _value_ is a function and may change (`handleClose`, a predicate) is passed
  through a getter on the params object, or wrapped as `() => fn`, never through `access()`.
- `<Show>` and conditional rendering dispose the subtree like a React unmount: `onCleanup`
  callbacks and effect cleanups run, children first.
- `<Portal mount={node}>` adds **no wrapper element**. Where React's code creates its own portal
  node, do the same and mount into it.
- A value returned from a hook as an accessor must be _called_. Passing `open` instead of
  `open()` to an attribute is the most common mistake; the type checker catches most of them, so
  keep types precise and run it.
- **`onCleanup` inside a `ref` callback throws** (`CLEANUP_IN_FORBIDDEN_SCOPE`) and halts the
  reactive system. Register the cleanup in the component body or in an effect.
- **Never read `props.children` (or call a `render` function) to inspect it.** Reading creates the
  elements and components. There is no way to look at children without rendering them.
- **Do not render conditional siblings around a focusable element.** When siblings appear or
  disappear, Solid may move the existing element with `insertBefore`, which blurs it in browsers
  without `Element.moveBefore`. Insert the extra nodes by hand (see the focus guards in
  `MenuTrigger`).
- **A function child is a render function only if it declares a parameter** (`children.length > 0`,
  the rule `<Show>` uses). A lone component child can arrive as a zero-argument accessor, which
  must be left for Solid to insert.
- **Parents' effects run before their children's**, the reverse of React, and there is no separate
  layout phase. Code that reads something "before an unmount effect clears it", or expects children
  to have registered, needs to be restructured rather than translated.
- React's `onFocus`/`onBlur` bubble; Solid's are the native, non-bubbling events. Use `onFocusIn`/
  `onFocusOut` where the React handler relied on bubbling.
- Library code imports `mergeProps` from `merge-props/mergeProps` (it leaves `children` out). The
  public one in `merge-props/index.ts` forwards `children` as a getter for consumers' render
  functions.

## 8. Tests

The requirement: **keep every test as it is**. Only React-specific syntax changes. Test files keep
their names, `describe`/`it` titles, order, and assertions. Record every test whose _body logic_
(not just syntax) had to change, or that had to be skipped, in `packages/solid/test-changes/<group>.md`
with the reason (one line per test: file, title, what changed, why).

Imports stay the same except the package name: `@mui/internal-test-utils` (aliased to a Solid
implementation), `#test-utils`, `vitest`; `@base-ui/react/menu` becomes `@base-ui/solid/menu`.

Mechanical changes:

| React test                                                             | Solid test                                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `await render(<Menu.Root>...</Menu.Root>)`                             | `await render(() => <Menu.Root>...</Menu.Root>)`                                                                   |
| `describeConformance(<Menu.Item />, () => ({...}))`                    | `describeConformance((props) => <Menu.Item {...props} />, () => ({...}))`                                          |
| conformance `render: (node) => render(<W>{node}</W>)`                  | `render: (node) => render(() => <W>{node()}</W>)`                                                                  |
| `const { setProps } = await render(<X a={1} />)`, `setProps({ a: 2 })` | `await render((props) => <X a={1} {...props} />)`, `await setProps({ a: 2 })`                                      |
| `rerender(<X a={2} />)`                                                | same as `setProps`                                                                                                 |
| `className="x"`                                                        | `class="x"`                                                                                                        |
| `render={<a href="/" />}`                                              | `render={(props) => <a {...props} href="/" />}` (own props after the spread: the element's props win, as in React) |
| `render={<Custom />}`                                                  | `render={Custom}`                                                                                                  |
| `function Test() { const [v, setV] = React.useState(0); ... {v} }`     | `const [v, setV] = createSignal(0); ... {v()}`                                                                     |
| `React.useRef<T>(null)` + `ref={ref}`                                  | `let el!: T;` + `ref={(node) => { el = node; }}`                                                                   |
| `React.createRef()`                                                    | same as above                                                                                                      |
| `tabIndex`, `onChange` (inputs)                                        | `tabindex`, `onInput`                                                                                              |
| `style={{ marginTop: 10 }}`                                            | `style={{ 'margin-top': '10px' }}`                                                                                 |
| `{cond && <X />}` depending on state                                   | `<Show when={cond()}><X /></Show>`                                                                                 |
| `{items.map((i) => <X key={i} />)}`                                    | `<For each={items}>{(i) => <X />}</For>` (or keep `.map` for static arrays)                                        |

- `fireEvent`, `act`, `flushMicrotasks`, `waitFor`, `screen`, `user` (from `await render`),
  `clock`, `isJSDOM`, `wait`, `waitSingleFrame` behave as in the React setup: pending Solid
  updates are applied before they return. Do not add `flush()` calls to tests. If a test only
  passes with an extra flush or wait, the port has a timing bug: fix the source.
- Tests that assert React-only behaviour (StrictMode, re-render counts, `React.Children`, the
  element form of `render`) are rewritten to the closest Solid equivalent and recorded.
- Tests that need a component outside the Menu scope (Dialog, Popover, Menubar, ContextMenu,
  ScrollArea, Toolbar) are kept in the file as `it.skip` with a `// Solid port: needs <X>` comment
  and recorded.
- Run: `cd packages/solid && pnpm vitest run <path> --disableConsoleIntercept` and
  `pnpm tsc -p tsconfig.json`. Any `console.error`/`console.warn` during a test fails it.
- A test must fail when the behaviour breaks. Never weaken an assertion, add a `waitFor` around
  a synchronous assertion, or skip a test to get green. If you cannot make a test pass, leave it
  failing and report it.
