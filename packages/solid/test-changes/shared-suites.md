# shared-suites

Ports of the shared suites in `packages/solid/test/`: `popupConformanceTests.tsx`,
`popupListConformanceTests.tsx`, `popupFocusPropsTests.tsx`,
`detachedTriggersConformanceTests.tsx` and `positionerConformanceTests.tsx`.

## Config contracts

The types use `Component` from `solid-js` and `JSX` from `@solidjs/web`. Every `createComponent` is a
**Solid component**: the suite renders it as `<TestedComponent ... />` and may change its props
later. Callers read `props.x` lazily (spread `{...props.root}` and so on) and never destructure.

### `popupConformanceTests(config: PopupTestConfig)`

- `createComponent: Component<TestedComponentProps>`, where
  `TestedComponentProps = { root?: RootProps; popup?: PopupProps; trigger?: TriggerProps; portal?: PortalProps }`.
  Spread `{...props.root}` on Root, `{...props.trigger}` on Trigger, `{...props.portal}` on Portal
  and `{...props.popup}` on Popup. `props.root` is replaced with `setProps({ root: {...} })`.
  - `RootProps = { actionsRef?: { current: { close: () => void; unmount: () => void } | null }; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean, eventDetails: OpenChangeEventDetails) => void; onOpenChangeComplete?: (open: boolean) => void }`
  - `TriggerProps = { 'data-testid'?: string; delay?: number }`
  - `PopupProps = { class?: string; id?: string; 'data-testid'?: string }`
  - `PortalProps = { keepMounted?: boolean }`
- `triggerMouseAction: 'click' | 'hover'`
- `render: ReturnType<typeof createRenderer>['render']`
- `expectedPopupRole?: string`
- `expectedAriaHasPopupValue?: string`
- `alwaysMounted?: 'only-after-open'`
- `combobox?: boolean`
- `exitAnimation?: boolean`
- `openReason?: string`

### `popupListConformanceTests(config: PopupListTestConfig)`

- `render: ReturnType<typeof createRenderer>['render']`
- `createComponent: Component<PopupListTestProps>`, where `PopupListTestProps =`
  `{ root?: Record<string, unknown> | undefined; items: readonly string[]; disabledItems: readonly string[]; onItemClick?: JSX.EventHandler<HTMLElement, MouseEvent> | undefined; scrollerStyle: JSX.CSSProperties; itemStyle: JSX.CSSProperties }`.
  Example: `(props) => <Menu.Root {...props.root}>...<Menu.List data-testid="scroller" style={props.scrollerStyle}><For each={props.items}>{(item) => <Menu.Item disabled={props.disabledItems.includes(item)} style={props.itemStyle} onClick={props.onItemClick}><span>{item}</span></Menu.Item>}</For></Menu.List>...</Menu.Root>`.
  The style objects use kebab-case keys and string values (`'30px'`).
- `itemRole: 'option' | 'menuitem'`
- `focusModel?: 'dom' | 'virtual'`
- `homeEnd?: boolean`
- `selectable?: boolean`
- `enterSpaceOpen?: boolean`
- `typeahead?: boolean`
- `modal?: boolean`
- `triggerClickCloses?: boolean`
- `listEnd: 'wrap' | 'stop' | 'escape'`

### `popupFocusPropsTests(config: PopupFocusPropsTestsConfig)`

- `render: ReturnType<typeof createRenderer>['render']`
- `createComponent: Component<{ initialFocus: FocusPropValue; finalFocus: FocusPropValue; children: JSX.Element }>`.
  `children` is a `JSX.Element` (not a function): render it as `{props.children}`. Pass
  `initialFocus={props.initialFocus}` / `finalFocus={props.finalFocus}`.
  - `FocusPropValue = boolean | { current: HTMLElement | null } | ((interactionType: InteractionType) => boolean | HTMLElement | null | void) | undefined`
    (`InteractionType` from `#utils/useEnhancedClickHandler`).
- `initialFocus?: boolean`
- `triggerRole?: 'button' | 'combobox'`
- `alwaysMounted?: boolean`
- `mouseCloseType?: InteractionType`

### `detachedTriggersConformanceTests(config: DetachedTriggersTestConfig)`

`AnyComponent = Component<any>`. Pass the parts themselves (`Root: Menu.Root`).

- `render: ReturnType<typeof createRenderer>['render']`
- `createHandle: () => DetachedTriggersTestHandle`, where
  `DetachedTriggersTestHandle = { open(triggerId: string): void; close(): void; readonly isOpen: boolean }`
- `Root: AnyComponent`. The suite passes its children as a function
  `(state: { payload: unknown }) => JSX.Element` and reads `state.payload` lazily in JSX.
- `Trigger: AnyComponent`
- `Portal: AnyComponent`
- `Positioner?: AnyComponent`
- `Popup: AnyComponent`
- `Viewport?: AnyComponent`
- `Close?: AnyComponent`
- `triggerProps?: Record<string, unknown>`
- `openInteractions: readonly [OpenInteraction, ...OpenInteraction[]]`, where
  `OpenInteraction = 'click' | 'hover' | 'focus'`
- `ariaExpanded: boolean`
- `throwOnMissingTrigger: boolean`

### `positionerConformanceTests(config: PositionerTestConfig)`

- `render: ReturnType<typeof createRenderer>['render']`
- `createComponent: Component<PositionerTestComponentProps>`, where `PositionerTestComponentProps =`
  `{ root: { open: boolean }; trigger: { style: JSX.CSSProperties }; positioner: PositionerTestProps; popup: { style: JSX.CSSProperties }; viewport: boolean }`.
  Spread `{...props.root}`, `{...props.trigger}`, `{...props.positioner}` and `{...props.popup}`
  on the parts, and use `{props.viewport ? <Menu.Viewport>Popup</Menu.Viewport> : 'Popup'}`. All
  of them may change after the first render.
  - `PositionerTestProps = { 'data-testid': string; side?: Side; align?: Align; sideOffset?: number | OffsetFunction; alignOffset?: number | OffsetFunction; collisionPadding?: number; collisionAvoidance?: CollisionAvoidance | undefined; render?: (props: HTMLProps, state: unknown) => JSX.Element }`
    (types from `../src/internals/useAnchorPositioning` and `../src/internals/types`).
- `viewport?: boolean`
- `defaultSide?: Side`
- `defaultCollisionAvoidance?: 'popup' | 'dropdown'`
- `stableState?: boolean`

## Non-mechanical test changes

- `popupConformanceTests.tsx`, "Popup conformance > prop: onOpenChangeComplete without animations > is called on open in the commit that mounts the popup": Solid has no `React.Profiler`. Commits are counted with a `MutationObserver` on `document.body`, whose callback runs after the flush that changed the DOM. `onOpenChangeComplete` records the commit it ran in: `commits + 1` if the popup is already in the document, otherwise `commits`. The assertion `completeCommit === mountCommit` is unchanged.
- `popupConformanceTests.tsx`, all tests rendered with `NON_STRICT`: the option was dropped, because Solid has no StrictMode.
- `popupConformanceTests.tsx`, all tests: `prepareComponent(props)` became the component `PreparedComponent`, and `rerender(prepareComponent({ root }))` became `setProps({ root })`. This is the mechanical `setProps` mapping applied to the nested `root` prop.
- `popupListConformanceTests.tsx`, "Popup list conformance > dismissal > closes only itself on Escape inside a dialog": `it.skip` (needs Dialog). The fixture's `wrap` is replaced by identity, and the React wrapper is kept in a comment.
- `positionerConformanceTests.tsx`, "Positioner conformance > passes the same state object while nothing it holds changes": `expect(states.length).toBeGreaterThan(renderCountBefore)` became `toBe(renderCountBefore)`. In Solid the element is updated in place, so `render` is not called again (a re-render count is React-only behaviour). The identity assertion `states.at(-1) === stateBefore` is kept.
- `detachedTriggersConformanceTests.tsx`, every test that passed `handle={getHandle()}` / `handle={createHandle()}` inline: the handle is created once before `render` (`const handle = getHandle();`). An inline call in a Solid JSX attribute compiles to a getter, which would create a new handle on every read.
- `detachedTriggersConformanceTests.tsx`, "... root ownership > resolves a trigger still registered to the previous root during a transient overlap": the `React.useLayoutEffect(..., [])` in `OpenOnMount` became `useIsoLayoutEffect(() => [], ...)` from `#utils/useEffect`. Solid runs parent effects before child effects, so the timing relative to the roots' registration differs from React's commit.

## Matchers

- `toBeVisible` / `toBeHidden` (`test/addVitestMatchers.ts`): reimplemented with the semantics the React package actually runs with. There, `@mui/internal-test-utils` installs the `chai-dom` versions (computed `visibility` only), which win over the `@testing-library/jest-dom` ones. Without this, ported tests that render an open menu without a trigger failed, because such a popup keeps `opacity: 0` in both libraries.
