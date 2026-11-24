# Porting Base UI to SolidJS: findings from the Menu proof of concept

This package (`@base-ui/solid`, private) is a rewrite of Base UI's Menu for SolidJS 2.0. It is not a
wrapper around `@base-ui/react`: every file was ported or rewritten, and nothing imports React.
`PORTING_GUIDE.md` is the rule book that was used while porting. This document records what the
port took, where it differs from React, and what is still open.

## Status

- **Scope:** `Menu` with all its parts: Root, Trigger, Portal, Positioner, Popup, Arrow, Backdrop,
  Item, LinkItem, CheckboxItem, RadioGroup, RadioItem, the indicators, Group, GroupLabel, Separator,
  SubmenuRoot, SubmenuTrigger, detached triggers (`Menu.createHandle`, payloads), and filtering
  (FilterProvider, Input, List, Empty, Clear, FilterSubmenuRoot).
- **Not ported:** `Menu.Viewport`, Menubar, ContextMenu (only their context definitions exist, so
  Menu's checks for them compile), server rendering.
- **Tests (jsdom):** 1,043 pass, 276 are skipped, 0 fail (1,319 tests in 37 files). Most skips are
  browser-only tests (`skipIf(isJSDOM)`), as in React.
- **Tests (Chromium):** 1,272 pass, 47 are skipped, 0 fail. The 47 are listed in `test-changes/`:
  tests that need parts outside the scope, and nine with no Solid equivalent.
- **Solid diagnostics:** the test setup turns on Solid's attribution engine and every warning fails
  the test, so both runs are also free of `EFFECT_RELAY_TEAR`, `EFFECT_WRITES_OWN_SOURCE`,
  `WASTED_RECOMPUTE` and `UNSTABLE_MEMO_OUTPUT`. The playground's dev console is empty.
- **Playground:** `playground/solid` has the 11 Menu demos from the docs, checked in Chromium
  (68 scripted checks).

### Running it

```bash
pnpm install --filter @base-ui/solid --filter base-ui-playground-solid

cd packages/solid
pnpm vitest run src                       # jsdom
VITEST_ENV=chromium pnpm vitest run src   # real browser (needs a Playwright Chromium)
pnpm tsc -p tsconfig.json                 # types

cd ../../playground/solid
pnpm vite                                 # demos
```

`BROWSER_EXECUTABLE_PATH=/path/to/chrome` points the browser run at an existing Chromium.

## What the port took

### 1. A third of the code moved over unchanged, almost half needed real adaptation

The ledger at the end compares every file with its React original. By lines of code, a third of
the source is reused or only lightly touched (constants, data attributes, DOM utilities, event
predicates, list navigation maths). A little under half is "adapted": the same logic and
structure, with the hook plumbing rewritten. The rest was rewritten or is new: components whose
React version is dominated by render logic, and the state layer described in section 3.

Everything that does not touch React is portable as is. In Base UI that is more than it looks:
the base `Store`, floating tree, safe polygon, list navigation maths, typeahead matching, DOM and
event helpers. A shared, framework-neutral core is realistic for these. The popup and menu stores
are the exception: their selectors and write paths are shaped by how each framework keeps state
in sync (section 3), so they would be shared only in part.

### 2. Tests ported almost mechanically

All Menu test files were translated, keeping titles and assertions. 97% of the test lines are within
a light edit of the original. That needed a Solid stand-in for `@mui/internal-test-utils`
(`test/internal-test-utils.ts`, aliased in the Vitest config so test imports stay the same) and for
`createRenderer`, `describeConformance` and the shared suites. The main mechanical differences:

- `render(<X />)` became `render(() => <X />)`; `setProps` feeds a reactive props object.
- `fireEvent` had to reproduce React Testing Library's event pairs (`mouseEnter` also fires
  `mouseover`, `change` also fires `input`), because React's synthetic events hide them.
- `toBeVisible` in the React suite is, in practice, the lenient `chai-dom` check installed by
  `@mui/internal-test-utils`, not jest-dom's. The ported suite has to match it.

Every test that needed more than a mechanical change, and every skipped test, is listed with a
reason in `test-changes/*.md`.

### 3. The store survived, but state that React syncs with effects had to become derived

Keeping the framework-neutral `MenuStore` and bridging it to signals (`SolidStore`) worked well. The
store is synchronous, so event handlers read `store.state` right after writing it, which matters
because Solid 2 batches signal writes until the next flush. Components subscribe through
`store.useState(selector)`, which returns a memo.

React hooks map to plain functions called once. Their parameters became "value or accessor", their
return values became accessors, and prop bags became functions returning props. Deciding this
convention early (PORTING_GUIDE sections 3 to 5) is what made it possible to port files in
parallel.

What did not survive is how React Base UI keeps state in sync. It copies props into the store in
layout effects, resets state in effects when something else changes, and lets each trigger write
"I am the active trigger" from its own effect. A first, faithful port did the same. It passed the
tests, and Solid's development build reported it everywhere: an effect that writes state its own
inputs depend on makes the graph settle in two passes, and what is read in between is inconsistent
(`EFFECT_RELAY_TEAR`, `EFFECT_WRITES_OWN_SOURCE`). In React the same design costs a second render
and nobody is told.

The second pass of this port removed those effects. Every piece of state now has one of three
shapes (PORTING_GUIDE section 4 has the rules):

- **Derived.** A store key can have a source: `store.useSyncedValue('disabled', () => props.disabled)`
  makes the key _be_ the prop, instead of copying it. The active trigger, its element, the anchor,
  the popup id and the trigger count are selectors over a `triggers` map and the open state, not
  values each trigger writes. A submenu reads its parent's store reactively instead of subscribing
  to it.
- **Derived, but writable.** State that resets when something else changes ("hover is enabled
  again when the menu closes", "the payload follows the active trigger, unless a handle set one")
  uses `store.useDerivedValue(key, previous => ...)`, a thin layer over Solid's writable derived
  signal `createSignal(fn)`. The function returns the new value or `KEEP`.
- **An effect, only when the outside world is involved.** Focusing, measuring, waiting for
  animations, registering in a `Map`, dispatching events. These use `useExternalEffect`, and their
  dependencies never include what they write.

Two findings from that work are worth knowing before porting anything else:

- **Effects of one component do not run in the order they are declared.** Solid 2 runs them as
  their dependencies settle. The React idiom "the last effect stores the previous value in a ref
  for the next render" silently breaks; an effect takes the previous values of its own
  dependencies instead (the second argument of `useEffect` here).
- **The diagnostics are a good test oracle.** With them enabled in the test setup, 530 of the
  1,043 jsdom tests failed at first. After the redesign none do, and the jsdom run went from
  several minutes to under one, because nothing settles twice any more.

About 30 source files changed for this. The logic that decides _what_ happens (open-change
reasons, hover and dismiss rules, list navigation) is untouched; what changed is where values
live.

### 4. Where React and Solid really differ

These are the places where a faithful translation was wrong and the code had to be rethought. They
are the real cost of a port.

- **Effect order.** React runs child effects before parent effects, and layout effects before
  passive ones. Solid runs parents first and has one phase. Code that relied on "the child has
  registered by the time the parent's effect runs" needed restructuring (handle attachment in the
  popup root, the filter list's item subscription, the trigger remembered across a close).
- **Refs.** A Solid ref runs before the element is in the document, is never called with `null`,
  and cannot register cleanup. React code that measures in a ref or clears state on `ref(null)`
  moved to effects.
- **Children are not inspectable.** React can look at `children` and at a `render` element's props
  without rendering them. Solid `children` is a getter that creates DOM when read. Consequences:
  `mergeProps` must never read `children` (it forwards a getter), fixtures that keep JSX in objects
  need functions, and a filtered-out item cannot be asked for its current text (see Open issues).
- **No `render` element form.** `render` accepts a tag name, a component, or a function
  `(props, state) => JSX`. Props that React reads from the `render` element (an `aria-label` on a
  popup's render element, for example) must be set on the part itself.
- **Function children.** A payload render function must declare its parameter
  (`{(arg) => ...}`), the rule Solid's own `<Show>` uses, because a lone component child can itself
  arrive as a zero-argument accessor.
- **Reconciliation moves nodes.** Rendering the trigger's focus guards as conditional siblings made
  Solid move the trigger element with `insertBefore`, which blurs it in browsers without
  `Element.moveBefore`. The guards are now placed by hand. Anything that conditionally renders
  siblings around a focusable element has this risk.
- **Events are native.** `onFocus` does not bubble (React's does), `pointerleave` is the real event,
  `onChange` fires on commit (use `onInput`), capture handlers are separate listeners, and
  `preventBaseUIHandler` has to survive bubbling by itself. Some events are delegated by Solid and
  bubble through portals to the logical parent, others are not.
- **Inputs are not controlled.** Solid does not put a controlled value back after a rejected edit;
  the filter input emulates it.
- **`autofocus`** is left to the browser. React focuses on mount.
- **Context.** `useContext` throws when there is no provider and the default is `undefined`, and
  context is resolved when a component is created, so children must be created inside the provider.
- **Booleans in attributes.** Solid renders `true` as an empty attribute; `aria-*` and `data-*`
  booleans are stringified by `useRenderElement`.

### 5. Tooling

- Solid 2.0 tooling is young: `@solidjs/vite-plugin` and `@solidjs/testing-library` release
  candidates, and no Solid 2 version of the comparable libraries (Kobalte, Corvu, Ark) to learn from.
- The repository's ESLint config is React-specific, so `packages/solid` and `playground/solid` are
  excluded from it for now. A real port needs Solid lint rules (reactivity rules in particular,
  which would have caught several bugs found by tests).
- Docs, API extraction (`pnpm docs:api`) and the build were not touched.

## API differences for users

| React                             | Solid                                                                                                        |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `className`                       | `class` (string or `(state) => string`)                                                                      |
| `render={<a />}`                  | not available; `render="a"`, `render={Component}` or `render={(props, state) => <a {...props} />}`           |
| `children={({ payload }) => ...}` | same, but the parameter must be declared, and `payload` is read reactively (`arg.payload`), not destructured |
| `onChange` on `Menu.Input`        | `onInput`                                                                                                    |
| `React.useRef` + `ref`            | `ref={(element) => ...}`                                                                                     |
| synthetic events                  | native events with `preventBaseUIHandler()` added                                                            |
| `mergeProps(a, b)`                | same; `ref`s are merged into an array, `children` is forwarded lazily                                        |

Everything else (part names, props, data attributes, CSS variables, `onOpenChange` details and
reasons, handles) is unchanged.

## Open issues

1. **One state write is deferred by a microtask.** A filtered submenu hands focus back to its input
   when the parent's list navigation focuses its trigger. The trigger's `blur` then clears the
   parent's highlight while the effect that moved focus is still running. That write is queued
   with `queueMicrotask` so it lands after the effect (`MenuSubmenuTrigger`). The behaviour matches
   React, but a cleaner design would not focus the trigger in the first place.
2. **Text of a hidden filtered item.** An item that is filtered out is not rendered, and its
   children cannot be read without rendering them, so it keeps the text it last rendered. If its
   text changes while hidden, the filter matches the old text. Workaround: the item's `label` prop.
   Three tests are skipped for this.
3. **Detached triggers share one floating tree.** In React each detached trigger has its own tree
   and the menu follows the active trigger's tree. Here all triggers of a root use the root's tree.
   No behaviour difference was found (events are filtered by node id), but it is a structural
   deviation. A handle-bound trigger is also re-created when a root attaches or detaches, so it
   would lose focus at that moment.
4. **Freeze in the browser test run.** In Chromium, disposing a test's root while a filter input
   that `user.keyboard` typed into still has focus makes Solid's owner disposal loop forever
   (`disposeChildren`). The test setup blurs the focused element before cleanup to avoid it. It
   did not reproduce with real typing in the playground (closing the menu or unmounting the demo
   with the input focused), so it looks tied to the test environment, but the cause is not found.
5. **A ref container is resolved one microtask later** in `FloatingPortal` than in React (still
   before paint), to reproduce React's ref timing.
6. **Skipped tests.** Tests that need components outside the scope (Dialog, AlertDialog, Popover,
   Menubar, ContextMenu, Toolbar, ScrollArea, Viewport), a router, or server rendering are
   `it.skip` with a comment. See `test-changes/`.

## Ledger

Each Solid file is compared with the React file at the same path (`packages/react/src/...`, or
`packages/utils/src/...` for `base-utils`), ignoring imports, comments and whitespace.

- **Reused:** at least 98% identical.
- **Lightly adapted:** 80% to 98%.
- **Adapted:** 50% to 80%. Same structure and logic, different plumbing.
- **Rewritten:** below 50%.
- **New:** no React counterpart.

### Source files

| Category        |   Files | Lines of code | Share of lines |
| --------------- | ------: | ------------: | -------------: |
| Reused          |      90 |         3,332 |            19% |
| Lightly adapted |      28 |         2,421 |            14% |
| Adapted         |      65 |         7,811 |            44% |
| Rewritten       |      48 |         3,575 |            20% |
| New             |       3 |           481 |             3% |
| **Total**       | **234** |    **17,620** |                |

### Test files

| Category        |  Files | Lines of code | Share of lines |
| --------------- | -----: | ------------: | -------------: |
| Lightly adapted |     29 |        18,911 |            97% |
| Adapted         |      8 |           639 |             3% |
| **Total**       | **37** |    **19,550** |                |

### By area (source files)

| Area                           | Files | Reused | Lightly adapted | Adapted | Rewritten | New |
| ------------------------------ | ----: | -----: | --------------: | ------: | --------: | --: |
| `base-utils`                   |    35 |     22 |               4 |       3 |         3 |   3 |
| `context-menu`                 |     1 |        |                 |         |         1 |     |
| `direction-provider`           |     3 |      2 |                 |         |         1 |     |
| `filter-dropdown`              |    12 |      1 |               1 |       8 |         2 |     |
| `internals`                    |    25 |      8 |               6 |       5 |         6 |     |
| `internals/composite`          |     9 |      3 |                 |       3 |         3 |     |
| `internals/direction-context`  |     1 |        |                 |         |         1 |     |
| `internals/use-button`         |     2 |      1 |                 |       1 |           |     |
| `menu/(root files)`            |     2 |      1 |               1 |         |           |     |
| `menu/arrow`                   |     2 |      1 |                 |       1 |           |     |
| `menu/backdrop`                |     2 |      1 |                 |       1 |           |     |
| `menu/checkbox-item`           |     3 |      1 |                 |       2 |           |     |
| `menu/checkbox-item-indicator` |     2 |      1 |                 |       1 |           |     |
| `menu/clear`                   |     2 |      1 |                 |       1 |           |     |
| `menu/empty`                   |     1 |        |                 |       1 |           |     |
| `menu/filter-provider`         |     3 |      1 |                 |       1 |         1 |     |
| `menu/filter-root`             |    13 |      1 |               2 |       7 |         3 |     |
| `menu/filter-submenu-root`     |     1 |        |                 |       1 |           |     |
| `menu/group`                   |     2 |        |                 |       1 |         1 |     |
| `menu/group-label`             |     1 |        |                 |         |         1 |     |
| `menu/input`                   |     2 |      1 |                 |       1 |           |     |
| `menu/item`                    |     4 |      1 |                 |       1 |         2 |     |
| `menu/link-item`               |     2 |      1 |                 |         |         1 |     |
| `menu/list`                    |     1 |        |                 |         |         1 |     |
| `menu/popup`                   |     2 |      1 |                 |       1 |           |     |
| `menu/portal`                  |     2 |        |                 |       1 |         1 |     |
| `menu/positioner`              |     4 |      2 |               1 |       1 |           |     |
| `menu/radio-group`             |     3 |      1 |                 |       1 |         1 |     |
| `menu/radio-item`              |     3 |      1 |                 |       1 |         1 |     |
| `menu/radio-item-indicator`    |     2 |      1 |                 |       1 |           |     |
| `menu/root`                    |     2 |        |                 |       2 |           |     |
| `menu/store`                   |     2 |      1 |               1 |         |           |     |
| `menu/submenu-root`            |     2 |        |               1 |         |         1 |     |
| `menu/submenu-trigger`         |     2 |      1 |                 |         |         1 |     |
| `menu/trigger`                 |     3 |      1 |                 |       1 |         1 |     |
| `menu/utils`                   |     4 |      4 |                 |         |           |     |
| `menubar`                      |     1 |        |                 |       1 |           |     |
| `merge-props`                  |     2 |        |                 |         |         2 |     |
| `separator`                    |     3 |      2 |                 |       1 |           |     |
| `toolbar`                      |     1 |        |                 |       1 |           |     |
| `tooltip`                      |     1 |      1 |                 |         |           |     |
| `types`                        |     1 |        |                 |       1 |           |     |
| `utils`                        |     9 |      4 |               2 |         |         3 |     |
| `utils/popups`                 |    20 |      8 |               4 |       4 |         4 |     |
| `utils/popups/floating-root`   |     4 |      2 |               1 |         |         1 |     |
| `utils/popups/focus`           |     5 |      3 |                 |       1 |         1 |     |
| `utils/popups/interactions`    |    12 |      2 |               2 |       6 |         2 |     |
| `utils/popups/portal`          |     1 |        |                 |       1 |           |     |
| `utils/popups/positioning`     |     7 |      5 |                 |         |         2 |     |
| `utils/popups/tree`            |     3 |        |               2 |       1 |           |     |
| `utils/popups/viewport`        |     2 |      2 |                 |         |           |     |

<details>
<summary>Every file</summary>

| Solid file (`packages/solid/src/`)                                        | Origin                      | Category        | Similarity |
| ------------------------------------------------------------------------- | --------------------------- | --------------- | ---------: |
| `base-utils/access.ts`                                                    | (none)                      | New             |            |
| `base-utils/addEventListener.ts`                                          | `packages/utils`            | Reused          |       100% |
| `base-utils/createLogOnce.ts`                                             | `packages/utils`            | Reused          |       100% |
| `base-utils/empty.ts`                                                     | `packages/utils`            | Reused          |       100% |
| `base-utils/error.ts`                                                     | `packages/utils`            | Reused          |       100% |
| `base-utils/inertValue.ts`                                                | `packages/utils`            | Adapted         |        67% |
| `base-utils/isElementDisabled.ts`                                         | `packages/utils`            | Reused          |       100% |
| `base-utils/lruMemoize.ts`                                                | `packages/utils`            | Reused          |       100% |
| `base-utils/mergeCleanups.ts`                                             | `packages/utils`            | Reused          |       100% |
| `base-utils/mergeObjects.ts`                                              | `packages/utils`            | Reused          |       100% |
| `base-utils/owner.ts`                                                     | `packages/utils`            | Reused          |       100% |
| `base-utils/platform/engine.ts`                                           | `packages/utils`            | Reused          |       100% |
| `base-utils/platform/env.ts`                                              | `packages/utils`            | Reused          |       100% |
| `base-utils/platform/index.ts`                                            | `packages/utils`            | Reused          |       100% |
| `base-utils/platform/media-query.ts`                                      | `packages/utils`            | Reused          |       100% |
| `base-utils/platform/os.ts`                                               | `packages/utils`            | Reused          |       100% |
| `base-utils/platform/parts.ts`                                            | `packages/utils`            | Reused          |       100% |
| `base-utils/platform/screen-reader.ts`                                    | `packages/utils`            | Reused          |       100% |
| `base-utils/platform/shared.ts`                                           | `packages/utils`            | Reused          |       100% |
| `base-utils/shadowDom.ts`                                                 | `packages/utils`            | Reused          |       100% |
| `base-utils/store/SolidStore.ts`                                          | (none)                      | New             |            |
| `base-utils/store/Store.ts`                                               | `packages/utils`            | Lightly adapted |        92% |
| `base-utils/store/createSelector.ts`                                      | `packages/utils`            | Reused          |       100% |
| `base-utils/store/createSelectorMemoized.ts`                              | `packages/utils`            | Reused          |       100% |
| `base-utils/store/index.ts`                                               | `packages/utils`            | Adapted         |        60% |
| `base-utils/stringifyLocale.ts`                                           | `packages/utils`            | Reused          |       100% |
| `base-utils/useAnimationFrame.ts`                                         | `packages/utils`            | Lightly adapted |        95% |
| `base-utils/useControlled.ts`                                             | `packages/utils`            | Rewritten       |        33% |
| `base-utils/useEffect.ts`                                                 | (none)                      | New             |            |
| `base-utils/useEnhancedClickHandler.ts`                                   | `packages/utils`            | Adapted         |        54% |
| `base-utils/useId.ts`                                                     | `packages/utils`            | Rewritten       |         7% |
| `base-utils/useScrollLock.ts`                                             | `packages/utils`            | Lightly adapted |        96% |
| `base-utils/useTimeout.ts`                                                | `packages/utils`            | Lightly adapted |        87% |
| `base-utils/visuallyHidden.ts`                                            | `packages/utils`            | Rewritten       |        37% |
| `base-utils/warn.ts`                                                      | `packages/utils`            | Reused          |       100% |
| `context-menu/root/ContextMenuRootContext.ts`                             | `packages/react`, same path | Rewritten       |        44% |
| `direction-provider/DirectionProvider.tsx`                                | `packages/react`, same path | Rewritten       |        48% |
| `direction-provider/index.parts.ts`                                       | `packages/react`, same path | Reused          |       100% |
| `direction-provider/index.ts`                                             | `packages/react`, same path | Reused          |       100% |
| `filter-dropdown/clear/FilterDropdownClear.tsx`                           | `packages/react`, same path | Adapted         |        61% |
| `filter-dropdown/empty/FilterDropdownEmpty.tsx`                           | `packages/react`, same path | Adapted         |        60% |
| `filter-dropdown/group/FilterDropdownGroupContext.ts`                     | `packages/react`, same path | Adapted         |        59% |
| `filter-dropdown/group/useFilterDropdownGroup.ts`                         | `packages/react`, same path | Adapted         |        74% |
| `filter-dropdown/input/FilterDropdownInput.tsx`                           | `packages/react`, same path | Adapted         |        54% |
| `filter-dropdown/item/useFilterDropdownItem.ts`                           | `packages/react`, same path | Rewritten       |        42% |
| `filter-dropdown/list/FilterDropdownList.tsx`                             | `packages/react`, same path | Adapted         |        61% |
| `filter-dropdown/root/FilterDropdownRoot.tsx`                             | `packages/react`, same path | Adapted         |        51% |
| `filter-dropdown/root/FilterDropdownRootContext.ts`                       | `packages/react`, same path | Adapted         |        71% |
| `filter-dropdown/root/useFilterDropdownCloseQuery.ts`                     | `packages/react`, same path | Rewritten       |        12% |
| `filter-dropdown/store.ts`                                                | `packages/react`, same path | Lightly adapted |        95% |
| `filter-dropdown/utils/refocusOwner.ts`                                   | `packages/react`, same path | Reused          |       100% |
| `internals/TransitionStatusDataAttributes.ts`                             | `packages/react`, same path | Reused          |       100% |
| `internals/composite/composite.ts`                                        | `packages/react`, same path | Reused          |       100% |
| `internals/composite/item/CompositeItem.tsx`                              | `packages/react`, same path | Rewritten       |        49% |
| `internals/composite/item/useCompositeItem.ts`                            | `packages/react`, same path | Rewritten       |        49% |
| `internals/composite/list/CompositeList.tsx`                              | `packages/react`, same path | Adapted         |        59% |
| `internals/composite/list/CompositeListContext.ts`                        | `packages/react`, same path | Adapted         |        74% |
| `internals/composite/list/CompositeListModel.ts`                          | `packages/react`, same path | Reused          |        99% |
| `internals/composite/list/useCompositeListItem.ts`                        | `packages/react`, same path | Rewritten       |        44% |
| `internals/composite/listIndex.ts`                                        | `packages/react`, same path | Reused          |        99% |
| `internals/composite/root/CompositeRootContext.ts`                        | `packages/react`, same path | Adapted         |        67% |
| `internals/constants.ts`                                                  | `packages/react`, same path | Lightly adapted |        80% |
| `internals/createBaseUIEventDetails.ts`                                   | `packages/react`, same path | Reused          |       100% |
| `internals/createFlushBeforePaint.ts`                                     | `packages/react`, same path | Lightly adapted |        89% |
| `internals/direction-context/DirectionContext.tsx`                        | `packages/react`, same path | Rewritten       |        40% |
| `internals/filter.ts`                                                     | `packages/react`, same path | Reused          |       100% |
| `internals/getDisabledMountTransitionStyles.ts`                           | `packages/react`, same path | Lightly adapted |        80% |
| `internals/getStateAttributesProps.ts`                                    | `packages/react`, same path | Reused          |       100% |
| `internals/reason-parts.ts`                                               | `packages/react`, same path | Reused          |       100% |
| `internals/reasons.ts`                                                    | `packages/react`, same path | Reused          |       100% |
| `internals/resolvePopupLabel.ts`                                          | `packages/react`, same path | Adapted         |        70% |
| `internals/resolveRenderedId.ts`                                          | `packages/react`, same path | Rewritten       |        45% |
| `internals/resolveValueLabel.tsx`                                         | `packages/react`, same path | Lightly adapted |        93% |
| `internals/serializeValue.ts`                                             | `packages/react`, same path | Reused          |       100% |
| `internals/stateAttributesMapping.ts`                                     | `packages/react`, same path | Reused          |       100% |
| `internals/types.ts`                                                      | `packages/react`, same path | Adapted         |        54% |
| `internals/use-button/index.ts`                                           | `packages/react`, same path | Reused          |       100% |
| `internals/use-button/useButton.ts`                                       | `packages/react`, same path | Adapted         |        61% |
| `internals/useAnchorPositioning.ts`                                       | `packages/react`, same path | Adapted         |        52% |
| `internals/useAnimationsFinished.ts`                                      | `packages/react`, same path | Lightly adapted |        91% |
| `internals/useBaseUiId.ts`                                                | `packages/react`, same path | Rewritten       |        25% |
| `internals/useInitialLiveRegionTextMutation.ts`                           | `packages/react`, same path | Lightly adapted |        81% |
| `internals/useItemRegistry.ts`                                            | `packages/react`, same path | Adapted         |        58% |
| `internals/useOpenChangeComplete.tsx`                                     | `packages/react`, same path | Rewritten       |        43% |
| `internals/useRenderElement.tsx`                                          | `packages/react`, same path | Rewritten       |        15% |
| `internals/useTransitionStatus.ts`                                        | `packages/react`, same path | Rewritten       |        46% |
| `internals/useTriggerSwitchTransition.ts`                                 | `packages/react`, same path | Adapted         |        61% |
| `internals/useUnmountAfterClose.ts`                                       | `packages/react`, same path | Rewritten       |        39% |
| `menu/arrow/MenuArrow.test.tsx`                                           | `packages/react`, same path | Adapted         |        59% |
| `menu/arrow/MenuArrow.tsx`                                                | `packages/react`, same path | Adapted         |        54% |
| `menu/arrow/MenuArrowDataAttributes.ts`                                   | `packages/react`, same path | Reused          |       100% |
| `menu/backdrop/MenuBackdrop.test.tsx`                                     | `packages/react`, same path | Adapted         |        73% |
| `menu/backdrop/MenuBackdrop.tsx`                                          | `packages/react`, same path | Adapted         |        63% |
| `menu/backdrop/MenuBackdropDataAttributes.ts`                             | `packages/react`, same path | Reused          |       100% |
| `menu/checkbox-item-indicator/MenuCheckboxItemIndicator.test.tsx`         | `packages/react`, same path | Lightly adapted |        87% |
| `menu/checkbox-item-indicator/MenuCheckboxItemIndicator.tsx`              | `packages/react`, same path | Adapted         |        59% |
| `menu/checkbox-item-indicator/MenuCheckboxItemIndicatorDataAttributes.ts` | `packages/react`, same path | Reused          |       100% |
| `menu/checkbox-item/MenuCheckboxItem.test.tsx`                            | `packages/react`, same path | Lightly adapted |        85% |
| `menu/checkbox-item/MenuCheckboxItem.tsx`                                 | `packages/react`, same path | Adapted         |        55% |
| `menu/checkbox-item/MenuCheckboxItemContext.ts`                           | `packages/react`, same path | Adapted         |        61% |
| `menu/checkbox-item/MenuCheckboxItemDataAttributes.ts`                    | `packages/react`, same path | Reused          |       100% |
| `menu/clear/MenuClear.tsx`                                                | `packages/react`, same path | Adapted         |        67% |
| `menu/clear/MenuClearDataAttributes.ts`                                   | `packages/react`, same path | Reused          |       100% |
| `menu/empty/MenuEmpty.tsx`                                                | `packages/react`, same path | Adapted         |        67% |
| `menu/filter-provider/MenuFilterProvider.tsx`                             | `packages/react`, same path | Rewritten       |        47% |
| `menu/filter-provider/MenuFilterProviderContext.ts`                       | `packages/react`, same path | Adapted         |        67% |
| `menu/filter-provider/MenuFilterProviderOptions.ts`                       | `packages/react`, same path | Reused          |       100% |
| `menu/filter-root/MenuFilterContext.ts`                                   | `packages/react`, same path | Adapted         |        57% |
| `menu/filter-root/MenuFilterDropdown.tsx`                                 | `packages/react`, same path | Adapted         |        60% |
| `menu/filter-root/MenuFilterGroup.test.tsx`                               | `packages/react`, same path | Lightly adapted |        93% |
| `menu/filter-root/MenuFilterGroup.tsx`                                    | `packages/react`, same path | Rewritten       |        28% |
| `menu/filter-root/MenuFilterImpl.ts`                                      | `packages/react`, same path | Reused          |       100% |
| `menu/filter-root/MenuFilterList.tsx`                                     | `packages/react`, same path | Adapted         |        67% |
| `menu/filter-root/MenuFilterParts.test.tsx`                               | `packages/react`, same path | Adapted         |        54% |
| `menu/filter-root/MenuFilterPopup.test.tsx`                               | `packages/react`, same path | Lightly adapted |        92% |
| `menu/filter-root/MenuFilterPopup.tsx`                                    | `packages/react`, same path | Rewritten       |        36% |
| `menu/filter-root/MenuFilterRoot.initialHighlight.test.tsx`               | `packages/react`, same path | Lightly adapted |        94% |
| `menu/filter-root/MenuFilterRoot.react17.test.tsx`                        | `packages/react`, same path | Lightly adapted |        84% |
| `menu/filter-root/MenuFilterRoot.scoping.test.tsx`                        | `packages/react`, same path | Lightly adapted |        92% |
| `menu/filter-root/MenuFilterRoot.test.tsx`                                | `packages/react`, same path | Lightly adapted |        91% |
| `menu/filter-root/MenuFilterRoot.tsx`                                     | `packages/react`, same path | Adapted         |        54% |
| `menu/filter-root/MenuFilterRoot.webkit.test.tsx`                         | `packages/react`, same path | Lightly adapted |        87% |
| `menu/filter-root/moveHighlightFrom.ts`                                   | `packages/react`, same path | Lightly adapted |        94% |
| `menu/filter-root/useMenuFilterItem.test.tsx`                             | `packages/react`, same path | Lightly adapted |        90% |
| `menu/filter-root/useMenuFilterKeyDown.ts`                                | `packages/react`, same path | Lightly adapted |        90% |
| `menu/filter-root/useMenuFilterPopup.ts`                                  | `packages/react`, same path | Adapted         |        77% |
| `menu/filter-root/useMenuFilterRoot.ts`                                   | `packages/react`, same path | Rewritten       |        23% |
| `menu/filter-root/useMenuFilterSubmenuTrigger.test.tsx`                   | `packages/react`, same path | Lightly adapted |        92% |
| `menu/filter-root/useMenuFilterSubmenuTrigger.ts`                         | `packages/react`, same path | Adapted         |        61% |
| `menu/filter-root/useVirtualFocusParentHandoff.ts`                        | `packages/react`, same path | Adapted         |        54% |
| `menu/filter-submenu-root/MenuFilterSubmenuRoot.pointerFocus.test.tsx`    | `packages/react`, same path | Lightly adapted |        92% |
| `menu/filter-submenu-root/MenuFilterSubmenuRoot.test.tsx`                 | `packages/react`, same path | Lightly adapted |        93% |
| `menu/filter-submenu-root/MenuFilterSubmenuRoot.tsx`                      | `packages/react`, same path | Adapted         |        72% |
| `menu/group-label/MenuGroupLabel.test.tsx`                                | `packages/react`, same path | Adapted         |        78% |
| `menu/group-label/MenuGroupLabel.tsx`                                     | `packages/react`, same path | Rewritten       |        43% |
| `menu/group/MenuGroup.test.tsx`                                           | `packages/react`, same path | Adapted         |        64% |
| `menu/group/MenuGroup.tsx`                                                | `packages/react`, same path | Rewritten       |        33% |
| `menu/group/MenuGroupContext.ts`                                          | `packages/react`, same path | Adapted         |        64% |
| `menu/index.parts.ts`                                                     | `packages/react`, same path | Reused          |        98% |
| `menu/index.ts`                                                           | `packages/react`, same path | Lightly adapted |        97% |
| `menu/input/MenuInput.tsx`                                                | `packages/react`, same path | Adapted         |        52% |
| `menu/input/MenuInputDataAttributes.ts`                                   | `packages/react`, same path | Reused          |       100% |
| `menu/item/MenuItem.test.tsx`                                             | `packages/react`, same path | Lightly adapted |        83% |
| `menu/item/MenuItem.tsx`                                                  | `packages/react`, same path | Adapted         |        51% |
| `menu/item/MenuItemDataAttributes.ts`                                     | `packages/react`, same path | Reused          |       100% |
| `menu/item/useMenuItem.ts`                                                | `packages/react`, same path | Rewritten       |        49% |
| `menu/item/useMenuItemCommonProps.ts`                                     | `packages/react`, same path | Rewritten       |        49% |
| `menu/link-item/MenuLinkItem.test.tsx`                                    | `packages/react`, same path | Lightly adapted |        84% |
| `menu/link-item/MenuLinkItem.tsx`                                         | `packages/react`, same path | Rewritten       |        49% |
| `menu/link-item/MenuLinkItemDataAttributes.ts`                            | `packages/react`, same path | Reused          |       100% |
| `menu/list/MenuList.test.tsx`                                             | `packages/react`, same path | Lightly adapted |        91% |
| `menu/list/MenuList.tsx`                                                  | `packages/react`, same path | Rewritten       |        40% |
| `menu/popup/MenuPopup.test.tsx`                                           | `packages/react`, same path | Lightly adapted |        84% |
| `menu/popup/MenuPopup.tsx`                                                | `packages/react`, same path | Adapted         |        54% |
| `menu/popup/MenuPopupDataAttributes.ts`                                   | `packages/react`, same path | Reused          |       100% |
| `menu/popup/MenuPopupEnterTransition.test.tsx`                            | `packages/react`, same path | Lightly adapted |        92% |
| `menu/popup/MenuPopupTransitionState.test.tsx`                            | `packages/react`, same path | Lightly adapted |        85% |
| `menu/portal/MenuPortal.test.tsx`                                         | `packages/react`, same path | Adapted         |        77% |
| `menu/portal/MenuPortal.tsx`                                              | `packages/react`, same path | Rewritten       |        42% |
| `menu/portal/MenuPortalContext.ts`                                        | `packages/react`, same path | Adapted         |        71% |
| `menu/positioner/MenuPositioner.test.tsx`                                 | `packages/react`, same path | Lightly adapted |        83% |
| `menu/positioner/MenuPositioner.tsx`                                      | `packages/react`, same path | Adapted         |        52% |
| `menu/positioner/MenuPositionerContext.ts`                                | `packages/react`, same path | Lightly adapted |        80% |
| `menu/positioner/MenuPositionerCssVars.ts`                                | `packages/react`, same path | Reused          |       100% |
| `menu/positioner/MenuPositionerDataAttributes.ts`                         | `packages/react`, same path | Reused          |       100% |
| `menu/radio-group/MenuRadioGroup.test.tsx`                                | `packages/react`, same path | Adapted         |        64% |
| `menu/radio-group/MenuRadioGroup.tsx`                                     | `packages/react`, same path | Rewritten       |        40% |
| `menu/radio-group/MenuRadioGroupContext.ts`                               | `packages/react`, same path | Adapted         |        67% |
| `menu/radio-group/MenuRadioGroupDataAttributes.ts`                        | `packages/react`, same path | Reused          |       100% |
| `menu/radio-item-indicator/MenuRadioItemIndicator.test.tsx`               | `packages/react`, same path | Lightly adapted |        88% |
| `menu/radio-item-indicator/MenuRadioItemIndicator.tsx`                    | `packages/react`, same path | Adapted         |        59% |
| `menu/radio-item-indicator/MenuRadioItemIndicatorDataAttributes.ts`       | `packages/react`, same path | Reused          |       100% |
| `menu/radio-item/MenuRadioItem.test.tsx`                                  | `packages/react`, same path | Lightly adapted |        84% |
| `menu/radio-item/MenuRadioItem.tsx`                                       | `packages/react`, same path | Rewritten       |        48% |
| `menu/radio-item/MenuRadioItemContext.ts`                                 | `packages/react`, same path | Adapted         |        61% |
| `menu/radio-item/MenuRadioItemDataAttributes.ts`                          | `packages/react`, same path | Reused          |       100% |
| `menu/root/MenuRoot.detached-triggers.test.tsx`                           | `packages/react`, same path | Lightly adapted |        90% |
| `menu/root/MenuRoot.test.tsx`                                             | `packages/react`, same path | Lightly adapted |        86% |
| `menu/root/MenuRoot.triggerless.test.tsx`                                 | `packages/react`, same path | Lightly adapted |        84% |
| `menu/root/MenuRoot.tsx`                                                  | `packages/react`, same path | Adapted         |        57% |
| `menu/root/MenuRootContext.ts`                                            | `packages/react`, same path | Adapted         |        57% |
| `menu/store/MenuHandle.ts`                                                | `packages/react`, same path | Reused          |       100% |
| `menu/store/MenuStore.ts`                                                 | `packages/react`, same path | Lightly adapted |        88% |
| `menu/submenu-root/MenuSubmenuRoot.tsx`                                   | `packages/react`, same path | Lightly adapted |        83% |
| `menu/submenu-root/MenuSubmenuRootContext.ts`                             | `packages/react`, same path | Rewritten       |        45% |
| `menu/submenu-trigger/MenuSubmenuTrigger.screenReaderPress.test.tsx`      | `packages/react`, same path | Lightly adapted |        94% |
| `menu/submenu-trigger/MenuSubmenuTrigger.test.tsx`                        | `packages/react`, same path | Lightly adapted |        90% |
| `menu/submenu-trigger/MenuSubmenuTrigger.tsx`                             | `packages/react`, same path | Rewritten       |        45% |
| `menu/submenu-trigger/MenuSubmenuTrigger.voiceOver.test.tsx`              | `packages/react`, same path | Lightly adapted |        93% |
| `menu/submenu-trigger/MenuSubmenuTriggerDataAttributes.ts`                | `packages/react`, same path | Reused          |       100% |
| `menu/trigger/MenuTrigger.test.tsx`                                       | `packages/react`, same path | Lightly adapted |        84% |
| `menu/trigger/MenuTrigger.tsx`                                            | `packages/react`, same path | Rewritten       |        50% |
| `menu/trigger/MenuTriggerDataAttributes.ts`                               | `packages/react`, same path | Reused          |       100% |
| `menu/trigger/useMixedToggleClickHandler.ts`                              | `packages/react`, same path | Adapted         |        56% |
| `menu/utils/findRootOwnerId.ts`                                           | `packages/react`, same path | Reused          |       100% |
| `menu/utils/isKeyboardOpen.ts`                                            | `packages/react`, same path | Reused          |       100% |
| `menu/utils/stateAttributesMapping.ts`                                    | `packages/react`, same path | Reused          |       100% |
| `menu/utils/types.ts`                                                     | `packages/react`, same path | Reused          |       100% |
| `menubar/MenubarContext.ts`                                               | `packages/react`, same path | Adapted         |        60% |
| `merge-props/index.ts`                                                    | `packages/react`, same path | Rewritten       |        11% |
| `merge-props/mergeProps.ts`                                               | `packages/react`, same path | Rewritten       |        47% |
| `separator/Separator.test.tsx`                                            | `packages/react`, same path | Adapted         |        57% |
| `separator/Separator.tsx`                                                 | `packages/react`, same path | Adapted         |        51% |
| `separator/SeparatorDataAttributes.ts`                                    | `packages/react`, same path | Reused          |       100% |
| `separator/index.ts`                                                      | `packages/react`, same path | Reused          |       100% |
| `toolbar/root/ToolbarRootContext.ts`                                      | `packages/react`, same path | Adapted         |        73% |
| `tooltip/trigger/TooltipTriggerDataAttributes.ts`                         | `packages/react`, same path | Reused          |       100% |
| `types/index.ts`                                                          | `packages/react`, same path | Adapted         |        56% |
| `utils/dispatchClickWithModifiers.ts`                                     | `packages/react`, same path | Reused          |       100% |
| `utils/getCssDimensions.ts`                                               | `packages/react`, same path | Reused          |       100% |
| `utils/getFiniteAnimations.ts`                                            | `packages/react`, same path | Reused          |       100% |
| `utils/getHighlightReason.ts`                                             | `packages/react`, same path | Lightly adapted |        93% |
| `utils/getPseudoElementBounds.ts`                                         | `packages/react`, same path | Reused          |       100% |
| `utils/popups/CommonPopupDataAttributes.ts`                               | `packages/react`, same path | Reused          |       100% |
| `utils/popups/CommonTriggerDataAttributes.ts`                             | `packages/react`, same path | Reused          |       100% |
| `utils/popups/InternalBackdrop.tsx`                                       | `packages/react`, same path | Adapted         |        59% |
| `utils/popups/NullStore.ts`                                               | `packages/react`, same path | Lightly adapted |        91% |
| `utils/popups/constants.ts`                                               | `packages/react`, same path | Reused          |       100% |
| `utils/popups/createAttribute.ts`                                         | `packages/react`, same path | Reused          |       100% |
| `utils/popups/createEventEmitter.ts`                                      | `packages/react`, same path | Reused          |       100% |
| `utils/popups/element.ts`                                                 | `packages/react`, same path | Reused          |       100% |
| `utils/popups/event.ts`                                                   | `packages/react`, same path | Lightly adapted |        94% |
| `utils/popups/floating-root/FloatingRootStore.ts`                         | `packages/react`, same path | Lightly adapted |        90% |
| `utils/popups/floating-root/dispatchOpenChange.ts`                        | `packages/react`, same path | Reused          |       100% |
| `utils/popups/floating-root/getEmptyRootStore.ts`                         | `packages/react`, same path | Reused          |       100% |
| `utils/popups/floating-root/useFloatingRootStore.ts`                      | `packages/react`, same path | Rewritten       |        47% |
| `utils/popups/focus/FloatingFocusManager.tsx`                             | `packages/react`, same path | Adapted         |        67% |
| `utils/popups/focus/FocusGuard.tsx`                                       | `packages/react`, same path | Rewritten       |        45% |
| `utils/popups/focus/enqueueFocus.ts`                                      | `packages/react`, same path | Reused          |       100% |
| `utils/popups/focus/markOthers.ts`                                        | `packages/react`, same path | Reused          |       100% |
| `utils/popups/focus/tabbable.ts`                                          | `packages/react`, same path | Reused          |       100% |
| `utils/popups/interactions/gridNavigation.ts`                             | `packages/react`, same path | Lightly adapted |        93% |
| `utils/popups/interactions/hoverIntent.ts`                                | `packages/react`, same path | Lightly adapted |        98% |
| `utils/popups/interactions/safePolygon.ts`                                | `packages/react`, same path | Reused          |       100% |
| `utils/popups/interactions/useClick.ts`                                   | `packages/react`, same path | Adapted         |        70% |
| `utils/popups/interactions/useDismiss.ts`                                 | `packages/react`, same path | Adapted         |        79% |
| `utils/popups/interactions/useFocus.ts`                                   | `packages/react`, same path | Adapted         |        78% |
| `utils/popups/interactions/useHoverPopupInteraction.ts`                   | `packages/react`, same path | Adapted         |        62% |
| `utils/popups/interactions/useHoverShared.ts`                             | `packages/react`, same path | Reused          |       100% |
| `utils/popups/interactions/useHoverTriggerInteraction.ts`                 | `packages/react`, same path | Rewritten       |        45% |
| `utils/popups/interactions/useListNavigation.ts`                          | `packages/react`, same path | Adapted         |        52% |
| `utils/popups/interactions/useOpenInteractionType.ts`                     | `packages/react`, same path | Rewritten       |        45% |
| `utils/popups/interactions/useTypeahead.ts`                               | `packages/react`, same path | Adapted         |        61% |
| `utils/popups/popupHandle.ts`                                             | `packages/react`, same path | Reused          |       100% |
| `utils/popups/popupPositioner.ts`                                         | `packages/react`, same path | Rewritten       |        38% |
| `utils/popups/popupRoot.tsx`                                              | `packages/react`, same path | Adapted         |        51% |
| `utils/popups/popupStateMapping.ts`                                       | `packages/react`, same path | Reused          |       100% |
| `utils/popups/popupStoreUtils.ts`                                         | `packages/react`, same path | Rewritten       |        28% |
| `utils/popups/popupTriggerMap.ts`                                         | `packages/react`, same path | Lightly adapted |        92% |
| `utils/popups/portal/FloatingPortal.tsx`                                  | `packages/react`, same path | Adapted         |        53% |
| `utils/popups/positioning/CommonPositionerCssVars.ts`                     | `packages/react`, same path | Reused          |       100% |
| `utils/popups/positioning/adaptiveOriginConstants.ts`                     | `packages/react`, same path | Reused          |       100% |
| `utils/popups/positioning/adaptiveOriginMiddleware.ts`                    | `packages/react`, same path | Reused          |       100% |
| `utils/popups/positioning/arrow.ts`                                       | `packages/react`, same path | Reused          |        99% |
| `utils/popups/positioning/hideMiddleware.ts`                              | `packages/react`, same path | Reused          |       100% |
| `utils/popups/positioning/useFloating.ts`                                 | `packages/react`, same path | Rewritten       |        16% |
| `utils/popups/positioning/usePositioner.tsx`                              | `packages/react`, same path | Rewritten       |        39% |
| `utils/popups/store.ts`                                                   | `packages/react`, same path | Lightly adapted |        84% |
| `utils/popups/tree/FloatingTree.tsx`                                      | `packages/react`, same path | Adapted         |        50% |
| `utils/popups/tree/FloatingTreeStore.ts`                                  | `packages/react`, same path | Lightly adapted |        92% |
| `utils/popups/tree/nodes.ts`                                              | `packages/react`, same path | Lightly adapted |        96% |
| `utils/popups/types.ts`                                                   | `packages/react`, same path | Adapted         |        78% |
| `utils/popups/useAnchoredPopupScrollLock.ts`                              | `packages/react`, same path | Rewritten       |        44% |
| `utils/popups/usePopupHandleStore.ts`                                     | `packages/react`, same path | Rewritten       |        24% |
| `utils/popups/useTriggerFocusGuards.ts`                                   | `packages/react`, same path | Adapted         |        75% |
| `utils/popups/viewport/CommonPopupCssVars.ts`                             | `packages/react`, same path | Reused          |       100% |
| `utils/popups/viewport/CommonViewportDataAttributes.ts`                   | `packages/react`, same path | Reused          |       100% |
| `utils/resolveClassName.ts`                                               | `packages/react`, same path | Rewritten       |        29% |
| `utils/resolveRef.ts`                                                     | `packages/react`, same path | Lightly adapted |        88% |
| `utils/resolveStyle.ts`                                                   | `packages/react`, same path | Rewritten       |        29% |
| `utils/useFocusableWhenDisabled.ts`                                       | `packages/react`, same path | Rewritten       |        40% |

</details>
