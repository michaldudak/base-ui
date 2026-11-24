# Changed and skipped tests

The Menu tests were translated from `packages/react` keeping their titles, structure and
assertions. A purely mechanical translation (the table in `PORTING_GUIDE.md`, section 8) is not
listed. These files list every test that needed more than that, and every skipped test, with the
reason:

- `shared-suites.md`: the shared helpers and suites in `test/` (`createRenderer`,
  `describeConformance`, popup, list, focus, detached-trigger and positioner suites, matchers).
- `menu-root.md`, `menu-popup.md`, `menu-items.md`: Root, Trigger, Popup, Positioner, Portal,
  Backdrop, Arrow, submenus and the item parts.
- `filter-root.md`, `filter-other.md`: filtering.
- `core-fixes.md`: changes made later while fixing failures and adding the Chromium run.

Skips fall into three groups: tests that need a component outside the proof of concept (Dialog,
AlertDialog, Popover, Menubar, ContextMenu, Toolbar, ScrollArea, `Menu.Viewport`), a router or
server rendering; React-only tests (Strict Mode, React 17); and nine tests with no Solid
equivalent: seven described under "Skipped: no Solid equivalent" in `filter-root.md`, and two
under "Native Solid state redesign" in `core-fixes.md`.
