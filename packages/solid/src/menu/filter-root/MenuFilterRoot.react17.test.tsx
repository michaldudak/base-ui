import { describe, it } from 'vitest';

// Solid port: this file tests React's id fallback for React 17, which has no `React.useId`
// (the `@base-ui/utils/safeReact` mock removed it). Solid has no such fallback and the Solid
// `createRenderer` has no `renderToString`/`hydrate`, so both tests are kept skipped with their
// bodies, translated to Solid syntax, as block comments.

describe('<Menu.FilterProvider><Menu.Root/></Menu.FilterProvider> with the React 17 id fallback', () => {
  // Solid port: React 17 only
  it.skip('omits partial ids during SSR and wires relationships after hydration', async () => {
    /*
    const { hydrate } = renderToString(() => (
      <Menu.FilterProvider>
        <Menu.Root defaultOpen>
          <Menu.Trigger>Actions</Menu.Trigger>
          <Menu.Portal keepMounted>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.Input aria-label="Filter actions" />
                <Menu.List>
                  <Menu.Item>Rename</Menu.Item>
                </Menu.List>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </Menu.FilterProvider>
    ));

    expect(document.querySelector('[id*="undefined"]')).toBe(null);

    hydrate();

    const trigger = screen.getByRole('button', { name: 'Actions' });
    const popup = screen.getByRole('dialog');
    const input = screen.getByRole('searchbox', { name: 'Filter actions' });
    const list = screen.getByRole('menu');
    const item = screen.getByRole('menuitem', { name: 'Rename' });

    await waitFor(() => {
      expect(trigger).toHaveAttribute('aria-controls', popup.id);
    });
    expect(input).toHaveAttribute('aria-controls', list.id);
    // Ids come from the fallback counter, which proves `React.useId` really is unavailable here.
    expect(item.id).toMatch(/^base-ui-\d+/);
    */
  });

  // Solid port: React 17 only
  it.skip('registers a submenu trigger after fallback ids resolve', async () => {
    /*
    const { hydrate } = renderToString(() => (
      <Menu.FilterProvider>
        <Menu.Root defaultOpen>
          <Menu.Trigger>Actions</Menu.Trigger>
          <Menu.Portal keepMounted>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.Input aria-label="Filter actions" />
                <Menu.List>
                  <Menu.FilterProvider>
                    <Menu.SubmenuRoot>
                      <Menu.SubmenuTrigger>More actions</Menu.SubmenuTrigger>
                      <Menu.Portal keepMounted>
                        <Menu.Positioner>
                          <Menu.Popup>
                            <Menu.Input aria-label="Filter more actions" />
                            <Menu.List>
                              <Menu.Item>Share</Menu.Item>
                            </Menu.List>
                          </Menu.Popup>
                        </Menu.Positioner>
                      </Menu.Portal>
                    </Menu.SubmenuRoot>
                  </Menu.FilterProvider>
                </Menu.List>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </Menu.FilterProvider>
    ));

    const { user } = hydrate();
    const input = screen.getByRole('searchbox', { name: 'Filter actions' });

    await waitFor(() => {
      expect(input).toHaveFocus();
    });
    await user.keyboard('[ArrowDown][ArrowRight]');

    const trigger = screen.getByRole('menuitem', { name: 'More actions' });
    const popup = await screen.findByRole('dialog', { name: 'More actions' });
    await waitFor(() => {
      expect(screen.getByRole('searchbox', { name: 'Filter more actions' })).toHaveFocus();
    });
    expect(trigger.id).toMatch(/^base-ui-\d+/);
    expect(trigger).toHaveAttribute('aria-controls', popup.id);
    */
  });
});
