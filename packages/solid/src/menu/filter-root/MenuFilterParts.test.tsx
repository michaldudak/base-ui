import type { JSX } from '@solidjs/web';
import { screen } from '@mui/internal-test-utils';
import { expect, vi, describe, it } from 'vitest';
import { Menu } from '@base-ui/solid/menu';
import { createRenderer, describeConformance } from '#test-utils';

describe('Menu filter parts conformance', () => {
  const { render } = createRenderer();

  function renderInPopup(
    node: () => JSX.Element,
    filterProps?: Partial<Menu.FilterProvider.Props>,
    withInput = true,
  ) {
    return render(() => (
      <Menu.FilterProvider {...filterProps}>
        <Menu.Root open>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                {withInput && <Menu.Input aria-label="Filter" />}
                {node()}
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </Menu.FilterProvider>
    ));
  }

  function renderInList(node: () => JSX.Element) {
    return renderInPopup(() => <Menu.List>{node()}</Menu.List>);
  }

  describeConformance(
    (props) => <Menu.Trigger {...props} />,
    () => ({
      refInstanceof: window.HTMLButtonElement,
      button: true,
      render: (node) =>
        render(() => (
          <Menu.FilterProvider>
            <Menu.Root>{node()}</Menu.Root>
          </Menu.FilterProvider>
        )),
    }),
  );

  describeConformance(
    (props) => <Menu.Input {...props} />,
    () => ({
      refInstanceof: window.HTMLInputElement,
      render: (node) => renderInPopup(node, undefined, false),
    }),
  );

  describeConformance(
    (props) => <Menu.Clear {...props} />,
    () => ({
      refInstanceof: window.HTMLButtonElement,
      button: true,
      render: (node) => renderInPopup(node, { defaultValue: 'query' }),
    }),
  );

  it('excludes Clear from the tab order and accessibility tree', async () => {
    await renderInPopup(() => <Menu.Clear aria-label="Clear filter" />, { defaultValue: 'query' });

    const clear = screen.getByLabelText('Clear filter');
    expect(clear).toHaveAttribute('tabindex', '-1');
    expect(clear).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('button', { name: 'Clear filter' })).toBe(null);
  });

  describeConformance(
    (props) => <Menu.Empty {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      render: (node) => renderInPopup(node),
    }),
  );

  describeConformance(
    (props) => <Menu.List {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      render: (node) => renderInPopup(node),
    }),
  );

  describeConformance(
    (props) => (
      <Menu.Popup {...props}>
        <Menu.Input aria-label="Filter" />
      </Menu.Popup>
    ),
    () => ({
      refInstanceof: window.HTMLDivElement,
      render: (node) =>
        render(() => (
          <Menu.FilterProvider>
            <Menu.Root open>
              <Menu.Portal>
                <Menu.Positioner>{node()}</Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </Menu.FilterProvider>
        )),
    }),
  );

  describeConformance(
    (props) => <Menu.Item {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      button: true,
      render: renderInList,
    }),
  );

  describeConformance(
    (props) => <Menu.LinkItem href="#" {...props} />,
    () => ({
      refInstanceof: window.HTMLAnchorElement,
      render: renderInList,
    }),
  );

  describeConformance(
    (props) => <Menu.CheckboxItem {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      render: renderInList,
    }),
  );

  describeConformance(
    (props) => (
      <Menu.RadioGroup {...props}>
        <Menu.RadioItem value="value" />
      </Menu.RadioGroup>
    ),
    () => ({
      refInstanceof: window.HTMLDivElement,
      render: renderInList,
    }),
  );

  describeConformance(
    (props) => <Menu.RadioItem value="value" {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      render: (node) =>
        renderInList(() => <Menu.RadioGroup defaultValue="value">{node()}</Menu.RadioGroup>),
    }),
  );

  describeConformance(
    (props) => <Menu.Group {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      render: renderInList,
    }),
  );

  describeConformance(
    (props) => <Menu.Arrow {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      render: (node) => renderInPopup(node),
    }),
  );

  describeConformance(
    (props) => <Menu.Backdrop {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      render: (node) =>
        render(() => (
          <Menu.FilterProvider>
            <Menu.Root open>
              <Menu.Portal>
                {node()}
                <Menu.Positioner>
                  <Menu.Popup>
                    <Menu.Input aria-label="Filter" />
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </Menu.FilterProvider>
        )),
    }),
  );

  describeConformance(
    (props) => <Menu.Separator {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      render: renderInList,
    }),
  );

  describeConformance(
    (props) => <Menu.SubmenuTrigger {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      button: true,
      render: (node) =>
        renderInList(() => (
          <Menu.FilterProvider>
            <Menu.SubmenuRoot>{node()}</Menu.SubmenuRoot>
          </Menu.FilterProvider>
        )),
    }),
  );

  it('throws when Trigger is rendered without a root or handle', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(render(() => <Menu.Trigger />)).rejects.toThrow(
        'Base UI: <Menu.Trigger> must be either used within a <Menu.Root> component or provided with a handle.',
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it.each([
    ['Input', () => <Menu.Input />],
    ['Clear', () => <Menu.Clear />],
    ['Empty', () => <Menu.Empty />],
  ])('throws when <Menu.%s> is rendered without a filter provider', async (part, element) => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(render(element)).rejects.toThrow(
        `Base UI: <Menu.${part}> must be placed in a menu wrapped in <Menu.FilterProvider>.`,
      );
    } finally {
      errorSpy.mockRestore();
    }
  });
});
