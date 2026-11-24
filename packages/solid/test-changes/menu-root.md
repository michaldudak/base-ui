# Test changes: menu-root

Tests in `root/MenuRoot.test.tsx`, `root/MenuRoot.triggerless.test.tsx` and
`root/MenuRoot.detached-triggers.test.tsx` whose translation needed more than the mechanical table of
PORTING_GUIDE section 8, or that are skipped.

## `root/MenuRoot.test.tsx`

- Shared fixture `TestMenuContents` (used by every test in "when using $name" and others):
  `popupProps.children` is a function returning JSX (`() => JSX.Element`) instead of JSX, and the
  `itemElements`/`items` arrays became functions returning the array. JSX inside an object literal
  prop is compiled into a getter, so it would be created again (outside the menu's context) on every
  read of `popupProps`. The fixture calls it once inside `Menu.Popup`, through `<Show>`. The keys of
  the item arrays are gone.
- Shared fixture `DetachedTriggerMenu`: `useRefWithInit(() => new Menu.Handle()).current` became
  `new Menu.Handle()` (the body runs once).
- "highlights the first item when the items render a microtask after a keyboard opening":
  `RenderNextMicrotask` uses `useIsoLayoutEffect` (no deps) and `setReady(true); flush();` in place
  of `ReactDOM.flushSync`; it renders its children through `<Show>`.
- "returns focus to the trigger from an alert dialog opened by an item after a screen reader press":
  skipped (`it.skip`, was `it.skipIf(isJSDOM)`), body kept as a block comment. Needs AlertDialog.
- "keeps the menu and dialog open when pressing Shift+Tab inside a nested dialog": skipped, body
  kept as a block comment. Needs Dialog.
- "keeps focus in a nested alert dialog popup when the pointer leaves the triggering menu item":
  skipped (was `it.skipIf(isJSDOM)`), body kept as a block comment. Needs AlertDialog.
- "keeps pending focus in a nested dialog when the pointer leaves the triggering menu item":
  skipped (was `it.skipIf(isJSDOM)`), body kept as a block comment. Needs Dialog.
- "keeps the dialog open after a press-drag-release activation" (describe "opening a dialog from an
  item", Blink only): skipped, body kept as a block comment. Needs Dialog. The `CDPSession` type
  import is dropped with it.
- "triggers a menu item and closes the menu on click, drag, release", "continues arrow navigation
  from a checkbox item selected by drag release", "focuses a disabled item on drag release without
  activating it", "closes the menu on click, drag outside, release" (describe "mouse interaction",
  browser only): the `afterEach` that imported `cleanup` from `vitest-browser-react` calls `cleanup`
  from `@mui/internal-test-utils` instead, and "closes the menu on click, drag outside, release"
  renders with the `render` from `createRenderer` instead of `vitest-browser-react`'s. That package
  is React-only.
- "completes initial opening once when a later update replaces the container ref": the
  `key={containerId}` div became `<Show when={containerId()} keyed>` so the element is re-created
  when the id changes, and its `ref` callback writes the `{ current }` container object. The
  `{ strict: false }` render option is dropped (React StrictMode only).
- "skips null items when navigating": `{!itemsFiltered && <>...</>}` became `<Show>`.
- "does not re-render the trigger while navigating the list": unchanged logic. In Solid the
  trigger's `render` function runs once, so `triggerRenders` stays 0 for a different reason than in
  React (no re-render at all rather than stable props).
- "does not report a stale highlight reason for a later list change", "reports highlights correctly
  after onItemHighlighted is removed and added back", "reports clearing a highlight made before
  onItemHighlighted was added": `ReportingMenu` renders `inserted` through `<Show>`;
  `setProps` works through `render((props) => <ReportingMenu ... {...props} />)`.
- "releases the subscriptions a submenu adds to its parent store when it unmounts" and "releases
  them under StrictMode": React `rerender` became `setProps({ showSubmenu })` (only `showSubmenu`
  goes through the props proxy, so `StoreCapture` reads `onStore` without reading a signal in a
  component body). The rerender that only repeated the same props is `setProps` with the same
  value, a no-op in Solid. `React.StrictMode`/`React.Fragment` are stand-in components that render
  their children: there is no StrictMode in Solid, so the StrictMode variant runs the same tree.
- "notifies submenu subscribers when shared parent state changes under StrictMode": the
  `React.StrictMode` wrapper is the same pass-through stand-in.
- "requests the submenu dismissal on Escape from the body", "closes the submenu on Escape from the
  body when the root cancels its dismissal": `Test` reads `props.open` (was destructured);
  `setProps` works through `render((props) => <Test open={false} {...props} />)`.
- "drops a request made after the root unmounts": `Fixture` renders the root through `<Show>`.
- "ignores a request made before the root has mounted", "accepts a request made after the root has
  mounted in the same commit": `OpenOnMount` uses `useIsoLayoutEffect(() => [], ...)`. Note that
  Solid runs a parent's effects before its children's (React: children first), so the relative order
  of `OpenOnMount`'s effect and the root's may differ from React.
- "reopens immediately when re-hovering the trigger during its close transition" (browser only):
  `dangerouslySetInnerHTML={{ __html: style }}` became `innerHTML={style}`.
- `DirectionProvider` is imported from `@base-ui/solid/direction-provider`.

## `root/MenuRoot.triggerless.test.tsx`

- "preserves real trigger registration, initially present=%s": `{hasTrigger && <>...</>}` became
  `<Show>`, effects use `useIsoLayoutEffect` with explicit deps. Logic unchanged, but it relies on
  React running `CaptureTriggerIds`'s layout effect (child) before `Demo`'s (parent), so that
  `registered.mock.lastCall` is set when `Demo` reads it. Solid runs parent effects first, so this
  test may read `undefined` there.

## `root/MenuRoot.detached-triggers.test.tsx`

- `detachedTriggersConformanceTests`: `Viewport: Menu.Viewport` dropped; Menu.Viewport is not part
  of the Solid port (the config field is optional; it only enables the inline scale check).
- "does not apply the trigger-change instant to a hover close after switching triggers", "does not
  restore the trigger-change instant after a hover close has started" (through
  `renderHoverDetachedTriggers`) and "does not restore the trigger-change instant when a controlled
  close commits late" (browser only): the popup's `render` function recorded `state.instant` on
  every React render. A Solid render function runs once, so it now records from a
  `useIsoLayoutEffect` on `[state.transitionStatus, state.instant]`, which runs whenever either
  changes. The Root's function child reads `state.payload` lazily (was destructured).
- "nested menus" `TwoTriggerMenu`: `React.useMemo(() => Menu.createHandle(), [])` became
  `Menu.createHandle()`.
- describe "controlled open and triggerId fed from the change details, while StoreInspector
  serializes the store" / "opens from each trigger, an item, and both external buttons": skipped
  (`describe.skip`), body kept as a block comment. Needs `StoreInspector` (from
  `@base-ui/utils/store`), which is not ported to Solid.
