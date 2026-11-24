import { describe, expect, it } from 'vitest';
import { Menu } from '@base-ui/solid/menu';
import { screen, waitFor } from '@mui/internal-test-utils';
import { createRenderer, describeConformance } from '#test-utils';

describe('<Menu.Portal />', () => {
  const { render } = createRenderer();

  describeConformance(
    (props) => <Menu.Portal keepMounted {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      render(node) {
        return render(() => <Menu.Root>{node()}</Menu.Root>);
      },
    }),
  );

  describe('prop: container', () => {
    it.each([
      { controlled: false, keepMounted: false },
      { controlled: true, keepMounted: false },
      { controlled: false, keepMounted: true },
    ])(
      'mounts and focuses an initially open menu inside an ancestor ref (controlled=$controlled, keepMounted=$keepMounted)',
      async ({ controlled, keepMounted }) => {
        function Test() {
          const container = { current: null as HTMLDivElement | null };
          return (
            <div
              ref={(node) => {
                container.current = node;
              }}
              data-testid="container"
            >
              <Menu.Root defaultOpen={!controlled} open={controlled ? true : undefined}>
                <Menu.Trigger>Open menu</Menu.Trigger>
                <Menu.Portal container={container} keepMounted={keepMounted} data-testid="portal">
                  <Menu.Positioner>
                    <Menu.Popup>
                      <Menu.Item>Item</Menu.Item>
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            </div>
          );
        }

        await render(() => <Test />);

        expect(screen.getByTestId('container')).toContainElement(screen.getByTestId('portal'));
        expect(screen.getByTestId('container')).toContainElement(screen.getByRole('menu'));
        await waitFor(() => expect(screen.getByRole('menu')).toHaveFocus());
      },
    );

    it('keeps a closed menu inside an ancestor ref when opening', async () => {
      function Test(props: { open: boolean }) {
        const container = { current: null as HTMLDivElement | null };
        return (
          <div
            ref={(node) => {
              container.current = node;
            }}
            data-testid="container"
          >
            <Menu.Root open={props.open}>
              <Menu.Trigger>Open menu</Menu.Trigger>
              <Menu.Portal container={container} keepMounted>
                <Menu.Positioner>
                  <Menu.Popup data-testid="popup">
                    <Menu.Item>Item</Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        );
      }

      const { setProps } = await render((props) => <Test open={false} {...props} />);
      const container = screen.getByTestId('container');
      const popup = screen.getByTestId('popup');
      expect(screen.queryByRole('menu')).toBeNull();
      expect(container).toContainElement(popup);

      await setProps({ open: true });

      expect(screen.getByRole('menu')).toBe(popup);
      expect(container).toContainElement(popup);
    });
  });
});
