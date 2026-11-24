import { expect, vi, describe, it } from 'vitest';
import { fireEvent, act, waitFor, screen } from '@mui/internal-test-utils';
import { Menu } from '@base-ui/solid/menu';
import { describeConformance, createRenderer, isJSDOM } from '#test-utils';
import { MenuRadioGroupContext } from '../radio-group/MenuRadioGroupContext';

const testRadioGroupContext: MenuRadioGroupContext = {
  value: () => '0',
  setValue: () => {},
  disabled: () => false,
};

describe('<Menu.RadioItem />', () => {
  const { render, clock } = createRenderer({
    clockOptions: {
      shouldAdvanceTime: true,
    },
  });

  clock.withFakeTimers();

  describeConformance(
    (props) => <Menu.RadioItem value="0" {...props} />,
    () => ({
      render: (node) => {
        return render(() => (
          <Menu.Root open>
            <MenuRadioGroupContext value={testRadioGroupContext}>{node()}</MenuRadioGroupContext>
          </Menu.Root>
        ));
      },
      refInstanceof: window.HTMLDivElement,
    }),
  );

  it('throws when rendered outside Menu.RadioGroup', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(
        render(() => (
          <Menu.Root open>
            <Menu.RadioItem value="one" />
          </Menu.Root>
        )),
      ).rejects.toThrow(
        'Base UI: MenuRadioGroupContext is missing. MenuRadioGroup parts must be placed within <Menu.RadioGroup>.',
      );
    } finally {
      errorSpy.mockRestore();
    }
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

    await render(() => (
      <Menu.Root open>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.RadioGroup>
                <Menu.RadioItem value={1} render={loggingRoot(renderItem1Spy)} id="item-1">
                  1
                </Menu.RadioItem>
                <Menu.RadioItem value={2} render={loggingRoot(renderItem2Spy)} id="item-2">
                  2
                </Menu.RadioItem>
                <Menu.RadioItem value={3} render={loggingRoot(renderItem3Spy)} id="item-3">
                  3
                </Menu.RadioItem>
                <Menu.RadioItem value={4} render={loggingRoot(renderItem4Spy)} id="item-4">
                  4
                </Menu.RadioItem>
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    ));

    const menuItems = screen.getAllByRole('menuitemradio');
    await act(async () => {
      menuItems[0].focus();
    });

    renderItem1Spy.mockClear();
    renderItem2Spy.mockClear();
    renderItem3Spy.mockClear();
    renderItem4Spy.mockClear();

    expect(renderItem1Spy.mock.calls.length).toBe(0);

    fireEvent.keyDown(menuItems[0], { key: 'ArrowDown' }); // highlights '2'

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

  describe('state management', () => {
    it('adds the state and ARIA attributes when selected', async () => {
      const { user } = await render(() => (
        <Menu.Root>
          <Menu.Trigger>Open</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.RadioGroup defaultValue={0}>
                  <Menu.RadioItem value={1}>Item</Menu.RadioItem>
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const trigger = screen.getByRole('button', { name: 'Open' });
      await user.click(trigger);

      const item = screen.getByRole('menuitemradio');
      await user.click(item);

      expect(item).toHaveAttribute('aria-checked', 'true');
      expect(item).toHaveAttribute('data-checked', '');
    });

    it.each([{ key: 'Space' }, { key: 'Enter' }])(
      'selects the item when $key is pressed',
      async ({ key }) => {
        const { user } = await render(() => (
          <Menu.Root>
            <Menu.Trigger>Open</Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner>
                <Menu.RadioGroup defaultValue={0}>
                  <Menu.RadioItem value={1}>Item</Menu.RadioItem>
                </Menu.RadioGroup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ));

        const trigger = screen.getByRole('button', { name: 'Open' });
        await act(async () => {
          trigger.focus();
        });
        await user.keyboard('[ArrowDown]');
        const item = screen.getByRole('menuitemradio');

        await waitFor(() => {
          expect(item).toHaveFocus();
        });

        await user.keyboard(`[${key}]`);
        expect(item).toHaveAttribute('data-checked', '');
      },
    );

    it.skipIf(isJSDOM)(
      'does not select when Space is pressed during an active typeahead session',
      async () => {
        const onValueChange = vi.fn();
        const { user } = await render(() => (
          <Menu.Root open>
            <Menu.Portal>
              <Menu.Positioner>
                <Menu.Popup>
                  <Menu.RadioGroup defaultValue={0} onValueChange={onValueChange}>
                    <Menu.RadioItem value={1}>Item One</Menu.RadioItem>
                    <Menu.RadioItem value={2}>Item Two</Menu.RadioItem>
                  </Menu.RadioGroup>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        ));

        const [itemOne, itemTwo] = screen.getAllByRole('menuitemradio');

        await act(async () => {
          itemOne.focus();
        });

        await user.keyboard('Item T');

        await waitFor(() => {
          expect(itemTwo).toHaveFocus();
        });

        await user.keyboard('[Space]');
        await user.keyboard('[Space]');

        expect(onValueChange.mock.calls.length > 0).toBe(false);
        expect(itemTwo).toHaveAttribute('aria-checked', 'false');
      },
    );

    it('calls `onValueChange` when the item is clicked', async () => {
      const onValueChange = vi.fn();
      const { user } = await render(() => (
        <Menu.Root>
          <Menu.Trigger>Open</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.RadioGroup defaultValue={0} onValueChange={onValueChange}>
                  <Menu.RadioItem value={1}>Item</Menu.RadioItem>
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const trigger = screen.getByRole('button', { name: 'Open' });
      await user.click(trigger);

      const item = screen.getByRole('menuitemradio');
      await user.click(item);

      expect(onValueChange.mock.calls.length).toBe(1);
      expect(onValueChange.mock.lastCall?.[0]).toBe(1);
    });

    it('does not select when `onValueChange` cancels the event', async () => {
      const { user } = await render(() => (
        <Menu.Root>
          <Menu.Trigger>Open</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.RadioGroup
                  defaultValue={0}
                  onValueChange={(_, eventDetails) => {
                    eventDetails.cancel();
                  }}
                >
                  <Menu.RadioItem value={1}>Item</Menu.RadioItem>
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const trigger = screen.getByRole('button', { name: 'Open' });
      await user.click(trigger);

      const item = screen.getByRole('menuitemradio');
      await user.click(item);

      expect(item).toHaveAttribute('aria-checked', 'false');
      expect(item).not.toHaveAttribute('data-checked');
    });

    it('keeps the state when closed and reopened', async () => {
      const { user } = await render(() => (
        <Menu.Root modal={false}>
          <Menu.Trigger>Open</Menu.Trigger>
          <Menu.Portal keepMounted>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.RadioGroup defaultValue={0}>
                  <Menu.RadioItem value={1}>Item</Menu.RadioItem>
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const trigger = screen.getByRole('button', { name: 'Open' });
      await user.click(trigger);

      const item = screen.getByRole('menuitemradio');
      await user.click(item);

      await user.click(trigger); // close the menu

      await waitFor(() => {
        expect(screen.queryByRole('menu')).toBe(null);
      });

      await user.click(trigger); // reopen the menu

      const itemAfterReopen = await screen.findByRole('menuitemradio');
      expect(itemAfterReopen).toHaveAttribute('aria-checked', 'true');
      expect(itemAfterReopen).toHaveAttribute('data-checked', '');
    });
  });

  describe('prop: closeOnClick', () => {
    it('when `closeOnClick=true`, closes the menu when the item is clicked', async () => {
      const { user } = await render(() => (
        <Menu.Root>
          <Menu.Trigger>Open</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.RadioGroup defaultValue={0}>
                  <Menu.RadioItem closeOnClick value={1}>
                    Item
                  </Menu.RadioItem>
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const trigger = screen.getByRole('button', { name: 'Open' });
      await user.click(trigger);

      const item = screen.getByRole('menuitemradio');
      await user.click(item);

      expect(screen.queryByRole('menu')).toBe(null);
    });

    it('does not close the menu when the item is clicked by default', async () => {
      const { user } = await render(() => (
        <Menu.Root>
          <Menu.Trigger>Open</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.RadioGroup defaultValue={0}>
                  <Menu.RadioItem value={1}>Item</Menu.RadioItem>
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const trigger = screen.getByRole('button', { name: 'Open' });
      await user.click(trigger);

      const item = screen.getByRole('menuitemradio');
      await user.click(item);

      expect(screen.queryByRole('menu')).not.toBe(null);
    });
  });

  describe('prop: focusableWhenDisabled', () => {
    it('can be focused but not interacted with when a radio group is disabled', async () => {
      const handleClick = vi.fn();
      const handleKeyDown = vi.fn();
      const handleKeyUp = vi.fn();
      const handleValueChange = vi.fn();

      await render(() => (
        <Menu.Root open>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.RadioGroup defaultValue={0} disabled onValueChange={handleValueChange}>
                  <Menu.RadioItem
                    value="one"
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                  >
                    one
                  </Menu.RadioItem>
                  <Menu.RadioItem
                    value="two"
                    onClick={handleClick}
                    onKeyDown={handleKeyDown}
                    onKeyUp={handleKeyUp}
                  >
                    two
                  </Menu.RadioItem>
                </Menu.RadioGroup>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const [item1, item2] = screen.getAllByRole('menuitemradio');

      expect(item1).toHaveAttribute('data-disabled');
      expect(item2).toHaveAttribute('data-disabled');

      await act(() => item1.focus());
      expect(item1).toHaveFocus();

      fireEvent.keyDown(item1, { key: 'Enter' });
      expect(handleKeyDown.mock.calls.length).toBe(0);
      expect(handleClick.mock.calls.length).toBe(0);
      expect(handleValueChange.mock.calls.length).toBe(0);

      fireEvent.keyUp(item1, { key: 'Space' });
      expect(handleKeyDown.mock.calls.length).toBe(0);
      expect(handleClick.mock.calls.length).toBe(0);
      expect(handleValueChange.mock.calls.length).toBe(0);

      fireEvent.click(item1);
      expect(handleClick.mock.calls.length).toBe(0);
      expect(handleValueChange.mock.calls.length).toBe(0);

      fireEvent.keyDown(item1, { key: 'ArrowDown' });
      expect(handleKeyDown.mock.calls.length).toBe(0);
      expect(item2).toHaveFocus();

      fireEvent.keyDown(item2, { key: 'Enter' });
      expect(handleKeyDown.mock.calls.length).toBe(0);
      expect(handleClick.mock.calls.length).toBe(0);
      expect(handleValueChange.mock.calls.length).toBe(0);

      fireEvent.keyUp(item2, { key: 'Space' });
      expect(handleKeyDown.mock.calls.length).toBe(0);
      expect(handleClick.mock.calls.length).toBe(0);
      expect(handleValueChange.mock.calls.length).toBe(0);

      fireEvent.click(item2);
      expect(handleClick.mock.calls.length).toBe(0);
      expect(handleValueChange.mock.calls.length).toBe(0);
    });
  });

  it('can be focused but not interacted with when individual items are disabled', async () => {
    const handleClick = vi.fn();
    const handleKeyDown = vi.fn();
    const handleKeyUp = vi.fn();
    const handleValueChange = vi.fn();

    await render(() => (
      <Menu.Root open>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup>
              <Menu.RadioGroup defaultValue={0} onValueChange={handleValueChange}>
                <Menu.RadioItem
                  value="one"
                  onClick={handleClick}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                  disabled
                >
                  one
                </Menu.RadioItem>
                <Menu.RadioItem
                  value="two"
                  onClick={handleClick}
                  onKeyDown={handleKeyDown}
                  onKeyUp={handleKeyUp}
                >
                  two
                </Menu.RadioItem>
              </Menu.RadioGroup>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    ));

    const [item1, item2] = screen.getAllByRole('menuitemradio');

    expect(item1).toHaveAttribute('data-disabled');
    expect(item2).not.toHaveAttribute('data-disabled');

    await act(() => item1.focus());
    expect(item1).toHaveFocus();

    fireEvent.keyDown(item1, { key: 'Enter' });
    expect(handleKeyDown.mock.calls.length).toBe(0);
    expect(handleClick.mock.calls.length).toBe(0);
    expect(handleValueChange.mock.calls.length).toBe(0);

    fireEvent.keyUp(item1, { key: 'Space' });
    expect(handleKeyDown.mock.calls.length).toBe(0);
    expect(handleClick.mock.calls.length).toBe(0);
    expect(handleValueChange.mock.calls.length).toBe(0);

    fireEvent.click(item1);
    expect(handleClick.mock.calls.length).toBe(0);
    expect(handleValueChange.mock.calls.length).toBe(0);

    fireEvent.keyDown(item1, { key: 'ArrowDown' });
    expect(handleKeyDown.mock.calls.length).toBe(0);
    expect(item2).toHaveFocus();

    fireEvent.keyDown(item2, { key: 'Enter' });
    expect(handleKeyDown.mock.calls.length).toBe(1);
    expect(handleClick.mock.calls.length).toBe(1);
    expect(handleValueChange.mock.calls.length).toBe(1);
    expect(handleValueChange.mock.calls[0][0]).toBe('two');

    fireEvent.keyDown(item2, { key: 'ArrowDown' });
    await waitFor(() => {
      expect(item1).toHaveFocus();
    });
  });
});
