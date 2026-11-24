import { expect, vi, describe, it, onTestFinished } from 'vitest';
import { act, fireEvent, ignoreActWarnings, screen, waitFor } from '@mui/internal-test-utils';
import { Menu } from '@base-ui/solid/menu';
import { describeConformance, createRenderer, isJSDOM, resetBrowserPointer } from '#test-utils';

describe('<Menu.Item />', () => {
  const { render, clock } = createRenderer({
    clockOptions: {
      shouldAdvanceTime: true,
    },
  });

  clock.withFakeTimers();

  describeConformance(
    (props) => <Menu.Item {...props} />,
    () => ({
      refInstanceof: window.HTMLDivElement,
      button: true,
      render: (node) => {
        return render(() => <Menu.Root open>{node()}</Menu.Root>);
      },
    }),
  );

  it('throws when rendered outside Menu.Root', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(render(() => <Menu.Item />)).rejects.toThrow(
        'Base UI: MenuRootContext is missing. Menu parts must be placed within <Menu.Root>.',
      );
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('calls the onClick handler when clicked', async () => {
    const onClick = vi.fn();
    const { user } = await render(() => (
      <Menu.Root open>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.Item onClick={onClick} id="item">
                Item
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    ));

    const item = screen.getByRole('menuitem');
    await user.click(item);

    expect(onClick.mock.calls.length).toBe(1);
  });

  it.skipIf(isJSDOM).each([
    { name: 'default', nativeButton: false },
    { name: 'native button', nativeButton: true },
  ])(
    'native press focuses a $name item before mouseup and click without hover focus',
    async ({ nativeButton }) => {
      // Testing Library's `user.click` calls `focus()` itself, so it can't verify browser focus.
      ignoreActWarnings();
      onTestFinished(resetBrowserPointer);
      const { userEvent } = await import('vitest/browser');
      let focusedAtMouseUp: Element | null = null;
      let focusedAtClick: Element | null = null;
      await render(() => (
        <Menu.Root open highlightItemOnHover={false}>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <input aria-label="Start" />
                <Menu.Item
                  closeOnClick={false}
                  nativeButton={nativeButton}
                  render={nativeButton ? (props) => <button type="button" {...props} /> : undefined}
                  onMouseUp={(event) => {
                    focusedAtMouseUp = event.currentTarget.ownerDocument.activeElement;
                  }}
                  onClick={(event) => {
                    focusedAtClick = event.currentTarget.ownerDocument.activeElement;
                  }}
                >
                  Item
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const input = screen.getByRole('textbox', { name: 'Start' });
      const item = screen.getByRole('menuitem', { name: 'Item' });
      await userEvent.click(input);
      expect(input).toHaveFocus();

      await userEvent.click(item);

      expect(focusedAtMouseUp).toBe(item);
      expect(focusedAtClick).toBe(item);
    },
  );

  it.each([{ press: 'mouse' }, { press: 'Enter' }])(
    'preserves focus moved by onClick after $press activation',
    async ({ press }) => {
      const { user } = await render(() => (
        <>
          <Menu.Root>
            <Menu.Trigger>Open</Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner>
                <Menu.Popup finalFocus={false}>
                  <Menu.Item onClick={() => screen.getByRole('textbox').focus()}>
                    Focus editor
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <textarea aria-label="Editor" />
        </>
      ));

      await user.click(screen.getByRole('button', { name: 'Open' }));
      const item = screen.getByRole('menuitem');
      expect(screen.getByRole('textbox')).not.toHaveFocus();

      if (press === 'Enter') {
        await act(() => item.focus());
        await user.keyboard('{Enter}');
      } else {
        await user.click(item);
      }

      expect(screen.queryByRole('menuitem')).toBe(null);
      expect(screen.getByRole('textbox')).toHaveFocus();
    },
  );

  it('does not close the menu when onClick prevents Base UI handler', async () => {
    const onClick = vi.fn((event) => event.preventBaseUIHandler());
    const { user } = await render(() => (
      <Menu.Root>
        <Menu.Trigger>Open</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.Item onClick={onClick}>Item</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    ));

    const trigger = screen.getByRole('button', { name: 'Open' });
    await user.click(trigger);

    const item = screen.getByRole('menuitem');
    await user.click(item);

    expect(onClick.mock.calls.length).toBe(1);
    expect(screen.queryByRole('menu')).not.toBe(null);
  });

  it('allows onMouseDown to call preventBaseUIHandler', async () => {
    await render(() => (
      <Menu.Root open>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.Item onMouseDown={(event) => event.preventBaseUIHandler()}>Item</Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    ));

    const item = screen.getByRole('menuitem');

    expect(() => fireEvent.mouseDown(item)).not.toThrow();
  });

  // Solid port: React re-renders the items whose highlight changed. Solid runs a render function
  // once, when the element is created, and updates the element in place afterwards, so no
  // render function runs again while the highlight moves.
  it('perf: does not rerender menu items unnecessarily', async ({ skip }) => {
    if (isJSDOM) {
      skip();
    }

    const renderItem1Spy = vi.fn();
    const renderItem2Spy = vi.fn();
    const renderItem3Spy = vi.fn();
    const renderItem4Spy = vi.fn();

    function loggingRoot(renderSpy: () => void) {
      return (props: Record<string, any>) => {
        renderSpy();
        return <li {...props} />;
      };
    }

    const { user } = await render(() => (
      <Menu.Root open>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.Item render={loggingRoot(renderItem1Spy)} id="item-1">
                1
              </Menu.Item>
              <Menu.Item render={loggingRoot(renderItem2Spy)} id="item-2">
                2
              </Menu.Item>
              <Menu.Item render={loggingRoot(renderItem3Spy)} id="item-3">
                3
              </Menu.Item>
              <Menu.Item render={loggingRoot(renderItem4Spy)} id="item-4">
                4
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    ));

    const menuItems = screen.getAllByRole('menuitem');
    await act(async () => {
      menuItems[0].focus();
    });

    renderItem1Spy.mockClear();
    renderItem2Spy.mockClear();
    renderItem3Spy.mockClear();
    renderItem4Spy.mockClear();

    expect(renderItem1Spy.mock.calls.length).toBe(0);

    await user.keyboard('{ArrowDown}'); // highlights '2'

    await waitFor(
      () => {
        expect(menuItems[1]).toHaveAttribute('data-highlighted');
      },
      { timeout: 1000 },
    );
    expect(menuItems[0]).not.toHaveAttribute('data-highlighted');

    // the elements are updated in place, so no render function runs again:
    expect(renderItem1Spy.mock.calls.length).toBe(0);
    expect(renderItem2Spy.mock.calls.length).toBe(0);
    expect(renderItem3Spy.mock.calls.length).toBe(0);
    expect(renderItem4Spy.mock.calls.length).toBe(0);
  });

  describe('prop: closeOnClick', () => {
    it('closes the menu when the item is clicked by default', async () => {
      const { user } = await render(() => (
        <Menu.Root>
          <Menu.Trigger>Open</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.Item>Item</Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const trigger = screen.getByRole('button', { name: 'Open' });
      await user.click(trigger);

      const item = screen.getByRole('menuitem');
      await user.click(item);

      expect(screen.queryByRole('menu')).toBe(null);
    });

    it('when `closeOnClick=false` does not close the menu when the item is clicked', async () => {
      const { user } = await render(() => (
        <Menu.Root>
          <Menu.Trigger>Open</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.Item closeOnClick={false}>Item</Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const trigger = screen.getByRole('button', { name: 'Open' });
      await user.click(trigger);

      const item = screen.getByRole('menuitem');
      await user.click(item);

      expect(screen.queryByRole('menu')).not.toBe(null);
    });
  });

  describe('disabled state', () => {
    it('can be focused but not interacted with when disabled', async () => {
      const handleClick = vi.fn();
      const handleKeyDown = vi.fn();
      const handleKeyUp = vi.fn();

      await render(() => (
        <Menu.Root open>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.Item
                  disabled
                  onClick={handleClick}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                >
                  Item
                </Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const item = screen.getByRole('menuitem');
      await act(() => item.focus());
      expect(item).toHaveFocus();

      fireEvent.keyDown(item, { key: 'Enter' });
      expect(handleKeyDown.mock.calls.length).toBe(0);
      expect(handleClick.mock.calls.length).toBe(0);

      fireEvent.keyUp(item, { key: 'Space' });
      expect(handleKeyUp.mock.calls.length).toBe(0);
      expect(handleClick.mock.calls.length).toBe(0);

      fireEvent.click(item);
      expect(handleKeyDown.mock.calls.length).toBe(0);
      expect(handleKeyUp.mock.calls.length).toBe(0);
      expect(handleClick.mock.calls.length).toBe(0);
    });

    it('skips a natively disabled item during keyboard navigation', async () => {
      const { user } = await render(() => (
        <Menu.Root open>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.Item>1</Menu.Item>
                <Menu.Item
                  nativeButton
                  render={(props) => <button type="button" disabled {...props} />}
                >
                  2
                </Menu.Item>
                <Menu.Item>3</Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const [firstItem, , lastItem] = screen.getAllByRole('menuitem');
      await act(async () => {
        firstItem.focus();
      });

      await user.keyboard('{ArrowDown}');
      await waitFor(() => {
        expect(lastItem).toHaveFocus();
      });

      await user.keyboard('{ArrowUp}');
      await waitFor(() => {
        expect(firstItem).toHaveFocus();
      });
    });
  });
});
