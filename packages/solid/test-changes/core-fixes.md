# Test changes: core (non-filtering) Menu fixes

- `src/menu/trigger/MenuTrigger.test.tsx`, "<Menu.Trigger /> removes the hover mouseup listener when unmounted before mouseup": the spy lookup selects the `mouseup` listener added with `{ once: true }` (`call[0] === 'mouseup' && typeof call[2] === 'object' && call[2].once`) instead of the first `mouseup` call. Solid runs the Root's effects before the trigger's, so `useDismiss`'s capture `mouseup` listener is added first and the original lookup picked it; in React the trigger's layout effect runs first. The `typeof` guard is only there because the third argument is typed `boolean | AddEventListenerOptions`. Interactions and assertions are unchanged.
- `src/menu/popup/MenuPopup.test.tsx`, "<Menu.Popup /> keeps focus on an input that autofocuses when the trigger is hidden as the menu closes": the input's `autofocus` attribute is replaced by `ref={(el) => queueMicrotask(() => el.focus())}`. React implements `autoFocus` by calling `.focus()` when the element is committed; neither Solid nor jsdom implements the `autofocus` attribute, so nothing focused the input. The ref runs before the element is connected, hence the microtask.
- `src/menu/root/MenuRoot.test.tsx`, "<Menu.Root /> prop: onItemHighlighted passes native mouse and pointer events for pointer highlights": the hand-built leave event is `new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' })` instead of `'pointerout'` (same init). Solid's `onPointerLeave` listens to the native `pointerleave` event, while React derives it from `pointerout`. The test still asserts that this exact event object is reported.
- `src/menu/root/MenuRoot.triggerless.test.tsx`, "<Menu.Root /> without a trigger preserves real trigger registration, initially present=false" and "... initially present=true": removed `Demo`'s effect that read `registered.mock.lastCall` and called `rootIds(...)`. The same `rootIds(store.select('floatingNodeId'), nodeId, store.select('floatingParentNodeId'), parentNodeId)` call, made from `registered.mock.lastCall`, now runs in the test body right after `await user.keyboard('{F2}')`. In Solid a parent's effects run before its descendants', so `Demo`'s effect ran before `CaptureTriggerIds` had registered anything. The assertions on `rootIds` are unchanged.
- `src/menu/root/MenuRoot.test.tsx`, "<Menu.Root /> open change requests ignores a request made before the root has mounted": changed to `it.skip` with the comment `// Solid port: effects run parent-first, so a child cannot request a change before its root has mounted`. The body is kept. In Solid a descendant's effect can't run before its ancestor's, so the scenario can't happen.

## Browser run (Chromium)

- `src/menu/positioner/MenuPositioner.test.tsx`, `positionerConformanceTests` call: `viewport: true` became `viewport: false`, so "uses top/left positioning with Viewport" and "updates positioning when Viewport mounts and unmounts" are not registered. `Menu.Viewport` is not ported (out of scope for the proof of concept).
- `test/setup.ts`: Solid passes the error that halted the reactive system to `reportError`, which a real browser turns into an uncaught error. It is ignored only while a test mocks `console.error`, the same rule as for the `[REACTIVITY_HALTED]` console message.

## Native Solid state redesign

Solid's reactivity diagnostics are enabled in `test/setup.ts` (`attribution.enable`), so a
component that syncs state with an effect now fails the test that renders it.

- `test/testUtils.ts`: new `allowSolidDiagnostics(...codes)`. It lets a test's own fixture trigger
  the named diagnostics; any other warning still fails.
- `root/MenuRoot.test.tsx`, "unmounts the popup when a layout effect closes it right after a press
  opens it" and "completes initial opening once when a later update replaces the container ref":
  call `allowSolidDiagnostics('EFFECT_WRITES_OWN_SOURCE', 'EFFECT_RELAY_TEAR')`. The fixtures are
  app code that writes state from an effect on purpose (that is what the tests are about).
- `root/MenuRoot.test.tsx`, "releases the subscriptions a submenu adds to its parent store when it
  unmounts" and "releases them under StrictMode": skipped, no Solid equivalent. A submenu's store
  no longer subscribes to its parent's store; its selectors read the parent's state reactively
  and Solid releases those dependencies with the submenu's owner. There is no subscription to
  count.
- `root/MenuRoot.test.tsx`, "notifies submenu subscribers…": the React test subscribes to the
  submenu's store and writes the parent's `rootId`. It now observes a submenu store accessor
  (`useState('keyboardEventRelay')`) from an effect and writes the parent's `keyboardEventRelay`.
  `rootId` is derived from a prop here and can't be written; the assertion is stricter (last call
  receives the new value).
- `root/MenuRoot.triggerless.test.tsx`, "preserves real trigger registration…": the
  `CaptureTriggerIds` fixture depends on `floatingNodeId` and `floatingParentNodeId` instead of
  reading them once. They are derived from the active trigger and settle one pass after the
  trigger registers.
