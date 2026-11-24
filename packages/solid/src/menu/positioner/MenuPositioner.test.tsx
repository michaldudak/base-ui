import { beforeEach, expect, vi, describe, it } from 'vitest';
import { createSignal } from 'solid-js';
import userEvent from '@testing-library/user-event';
import { act, flushMicrotasks, screen, waitFor } from '@mui/internal-test-utils';
import { Menu } from '@base-ui/solid/menu';
import {
  describeConformance,
  createRenderer,
  isJSDOM,
  resetBrowserPointer,
  positionerConformanceTests,
} from '#test-utils';
import { DROPDOWN_COLLISION_AVOIDANCE, POPUP_COLLISION_AVOIDANCE } from '../../internals/constants';

const useAnchorPositioningSpy = vi.hoisted(() => vi.fn());

vi.mock('../../internals/useAnchorPositioning', async () => {
  const actual = await vi.importActual<typeof import('../../internals/useAnchorPositioning')>(
    '../../internals/useAnchorPositioning',
  );

  return {
    ...actual,
    useAnchorPositioning: ((...args: Parameters<typeof actual.useAnchorPositioning>) => {
      useAnchorPositioningSpy(...args);
      return actual.useAnchorPositioning(...args);
    }) satisfies typeof actual.useAnchorPositioning,
  };
});

function Trigger(props: Menu.Trigger.Props) {
  return (
    <Menu.Trigger
      {...props}
      render={(renderProps) => <div {...renderProps} />}
      nativeButton={false}
    />
  );
}

describe('<Menu.Positioner />', () => {
  beforeEach(resetBrowserPointer);

  const { render } = createRenderer();

  beforeEach(() => {
    useAnchorPositioningSpy.mockClear();
  });

  it('throws when rendered outside Menu.Portal', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    try {
      await expect(
        render(() => (
          <Menu.Root open>
            <Menu.Positioner />
          </Menu.Root>
        )),
      ).rejects.toThrow('Base UI: <Menu.Portal> is missing.');
    } finally {
      errorSpy.mockRestore();
    }
  });

  it('enables lazy flipping for a filter menu', async () => {
    await render(() => (
      <Menu.FilterProvider>
        <Menu.Root open>
          <Menu.Trigger>Actions</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.Input aria-label="Filter" />
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      </Menu.FilterProvider>
    ));

    // `'placement'` and not `true`: the filter menu locks the alignment as well as the side, so a
    // popup that flipped once does not jitter back while typing resizes it. Combobox stays on
    // `true` (side only), which is what it shipped with.
    expect(useAnchorPositioningSpy.mock.lastCall?.[0].lazyFlip).toBe('placement');
  });

  describe('collision avoidance', () => {
    function SubmenuApp(props: {
      collisionAvoidance?: Menu.Positioner.Props['collisionAvoidance'];
    }) {
      return (
        <Menu.Root open>
          <Menu.Trigger>Actions</Menu.Trigger>
          <Menu.Portal>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.SubmenuRoot open>
                  <Menu.SubmenuTrigger>More</Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner data-testid="submenu-positioner" {...props}>
                      <Menu.Popup />
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      );
    }

    function lastCallFor(positioner: HTMLElement) {
      const calls = useAnchorPositioningSpy.mock.calls.filter(
        ([params]) => params.interactionStore.select('positionerElement') === positioner,
      );
      return calls[calls.length - 1]?.[0];
    }

    // Solid port: needs ContextMenu
    it.skip('uses the dropdown default for a context menu', async () => {
      /*
      await render(() => (
        <ContextMenu.Root>
          <ContextMenu.Trigger>Area</ContextMenu.Trigger>
          <ContextMenu.Portal keepMounted>
            <ContextMenu.Positioner data-testid="positioner">
              <ContextMenu.Popup />
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      expect(lastCallFor(screen.getByTestId('positioner'))?.collisionAvoidance).toEqual(
        DROPDOWN_COLLISION_AVOIDANCE,
      );
      */
    });

    // Solid port: needs Menubar
    it.skip('uses the dropdown default for a menubar menu', async () => {
      /*
      await render(() => (
        <Menubar>
          <Menu.Root open>
            <Menu.Trigger>File</Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner data-testid="positioner">
                <Menu.Popup />
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </Menubar>
      ));

      expect(lastCallFor(screen.getByTestId('positioner'))?.collisionAvoidance).toEqual(
        DROPDOWN_COLLISION_AVOIDANCE,
      );
      */
    });

    it('uses the popup default for a submenu', async () => {
      await render(() => <SubmenuApp />);

      expect(lastCallFor(screen.getByTestId('submenu-positioner'))?.collisionAvoidance).toEqual(
        POPUP_COLLISION_AVOIDANCE,
      );
    });

    it('uses the collisionAvoidance prop over the default', async () => {
      const collisionAvoidance = { side: 'none', align: 'none' } as const;
      await render(() => <SubmenuApp collisionAvoidance={collisionAvoidance} />);

      expect(lastCallFor(screen.getByTestId('submenu-positioner'))?.collisionAvoidance).toBe(
        collisionAvoidance,
      );
    });
  });

  it('leaves lazy flipping off for a plain menu', async () => {
    await render(() => (
      <Menu.Root open>
        <Menu.Trigger>Actions</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner>
            <Menu.Popup />
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    ));

    expect(useAnchorPositioningSpy.mock.lastCall?.[0].lazyFlip).toBe(false);
  });

  describeConformance(
    (props) => <Menu.Positioner {...props} />,
    () => ({
      render: (node) => {
        return render(() => (
          <Menu.Root open>
            <Menu.Portal>{node()}</Menu.Portal>
          </Menu.Root>
        ));
      },
      refInstanceof: window.HTMLDivElement,
    }),
  );

  describe('layout viewport', () => {
    // Solid port: needs ContextMenu
    it.skip('uses the layout viewport for a root context menu', async () => {
      /*
      await render(() => (
        <ContextMenu.Root open>
          <ContextMenu.Portal>
            <ContextMenu.Positioner>
              <ContextMenu.Popup>Popup</ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      expect(useAnchorPositioningSpy.mock.lastCall?.[0].shift).toEqual({
        crossAxis: true,
        rootBoundary: 'layoutViewport',
      });
      */
    });

    // Solid port: needs ContextMenu
    it.skip('disables cross-axis shifting when side collision avoidance is flip', async () => {
      /*
      await render(() => (
        <ContextMenu.Root open>
          <ContextMenu.Portal>
            <ContextMenu.Positioner collisionAvoidance={{ side: 'flip' }}>
              <ContextMenu.Popup>Popup</ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      expect(useAnchorPositioningSpy.mock.lastCall?.[0].shift).toEqual({
        crossAxis: false,
        rootBoundary: 'layoutViewport',
      });
      */
    });

    // Solid port: needs ContextMenu
    it.skip('preserves explicit context-menu placement and offsets', async () => {
      /*
      await render(() => (
        <ContextMenu.Root open>
          <ContextMenu.Portal>
            <ContextMenu.Positioner side="right" align="center" sideOffset={11} alignOffset={13}>
              <ContextMenu.Popup>Popup</ContextMenu.Popup>
            </ContextMenu.Positioner>
          </ContextMenu.Portal>
        </ContextMenu.Root>
      ));

      expect(useAnchorPositioningSpy.mock.lastCall?.[0]).toMatchObject({
        side: 'right',
        align: 'center',
        sideOffset: 11,
        alignOffset: 13,
      });
      */
    });

    // Solid port: needs ContextMenu
    it.skip('uses the visual viewport for a context menu submenu', async () => {
      /*
      await render(() => (
        <ContextMenu.Root open>
          <ContextMenu.SubmenuRoot defaultOpen>
            <ContextMenu.Portal>
              <ContextMenu.Positioner>
                <ContextMenu.Popup>Popup</ContextMenu.Popup>
              </ContextMenu.Positioner>
            </ContextMenu.Portal>
          </ContextMenu.SubmenuRoot>
        </ContextMenu.Root>
      ));

      expect(useAnchorPositioningSpy).toHaveBeenCalled();
      expect(useAnchorPositioningSpy.mock.lastCall?.[0].shift).toBe(undefined);
      */
    });
  });

  it('closes an open submenu with a sibling reason when its controlled parent closes', async () => {
    const onSubmenuOpenChange = vi.fn();
    let closeParent = () => {};

    function Test() {
      const [open, setOpen] = createSignal(true);
      closeParent = () => setOpen(false);

      return (
        <Menu.Root open={open()}>
          <Menu.Trigger>Open</Menu.Trigger>
          <Menu.Portal keepMounted>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.SubmenuRoot defaultOpen onOpenChange={onSubmenuOpenChange}>
                  <Menu.SubmenuTrigger>More</Menu.SubmenuTrigger>
                  <Menu.Portal>
                    <Menu.Positioner>
                      <Menu.Popup data-testid="submenu-popup" />
                    </Menu.Positioner>
                  </Menu.Portal>
                </Menu.SubmenuRoot>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      );
    }

    await render(() => <Test />);
    expect(screen.queryByTestId('submenu-popup')).not.toBe(null);

    await act(async () => {
      closeParent();
    });

    await waitFor(() => {
      expect(onSubmenuOpenChange.mock.lastCall?.[0]).toBe(false);
    });
    expect(onSubmenuOpenChange.mock.lastCall?.[1].reason).toBe('sibling-open');
  });

  describe.skipIf(isJSDOM)('prop: anchor', () => {
    it('should be placed near the specified element when a ref is passed', async () => {
      function TestComponent() {
        const anchor = { current: null as HTMLDivElement | null };

        return (
          <div style={{ margin: '50px' }}>
            <Menu.Root open>
              <Menu.Portal>
                <Menu.Positioner
                  side="bottom"
                  align="start"
                  anchor={anchor}
                  arrowPadding={0}
                  data-testid="positioner"
                >
                  <Menu.Popup>
                    <Menu.Item>1</Menu.Item>
                    <Menu.Item>2</Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            <div
              data-testid="anchor"
              style={{ 'margin-top': '100px' }}
              ref={(node) => {
                anchor.current = node;
              }}
            />
          </div>
        );
      }

      await render(() => <TestComponent />);

      const positioner = screen.getByTestId('positioner');
      const anchor = screen.getByTestId('anchor');

      const anchorPosition = anchor.getBoundingClientRect();

      await flushMicrotasks();

      expect(positioner.style.getPropertyValue('transform')).toBe(
        `translate(${anchorPosition.left}px, ${anchorPosition.bottom}px)`,
      );
    });

    it('should be placed near the specified element when an element is passed', async () => {
      function TestComponent() {
        const [anchor, setAnchor] = createSignal<HTMLDivElement | null>(null);
        const handleRef = (element: HTMLDivElement | null) => {
          setAnchor(element);
        };

        return (
          <div style={{ margin: '50px' }}>
            <Menu.Root open>
              <Menu.Portal>
                <Menu.Positioner
                  side="bottom"
                  align="start"
                  anchor={anchor()}
                  arrowPadding={0}
                  data-testid="positioner"
                >
                  <Menu.Popup>
                    <Menu.Item>1</Menu.Item>
                    <Menu.Item>2</Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            <div data-testid="anchor" style={{ 'margin-top': '100px' }} ref={handleRef} />
          </div>
        );
      }

      await render(() => <TestComponent />);

      const positioner = screen.getByTestId('positioner');
      const anchor = screen.getByTestId('anchor');

      const anchorPosition = anchor.getBoundingClientRect();

      await flushMicrotasks();

      expect(positioner.style.getPropertyValue('transform')).toBe(
        `translate(${anchorPosition.left}px, ${anchorPosition.bottom}px)`,
      );
    });

    it('should be placed near the specified element when a function returning an element is passed', async () => {
      function TestComponent() {
        const [anchor, setAnchor] = createSignal<HTMLDivElement | null>(null);
        const handleRef = (element: HTMLDivElement | null) => {
          setAnchor(element);
        };

        const getAnchor = () => anchor();

        return (
          <div style={{ margin: '50px' }}>
            <Menu.Root open>
              <Menu.Portal>
                <Menu.Positioner
                  side="bottom"
                  align="start"
                  anchor={getAnchor}
                  arrowPadding={0}
                  data-testid="positioner"
                >
                  <Menu.Popup>
                    <Menu.Item>1</Menu.Item>
                    <Menu.Item>2</Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            <div data-testid="anchor" style={{ 'margin-top': '100px' }} ref={handleRef} />
          </div>
        );
      }

      await render(() => <TestComponent />);

      const positioner = screen.getByTestId('positioner');
      const anchor = screen.getByTestId('anchor');

      const anchorPosition = anchor.getBoundingClientRect();

      await flushMicrotasks();

      expect(positioner.style.getPropertyValue('transform')).toBe(
        `translate(${anchorPosition.left}px, ${anchorPosition.bottom}px)`,
      );
    });

    it('should be placed at the specified position', async () => {
      const boundingRect = {
        x: 200,
        y: 100,
        top: 100,
        left: 200,
        bottom: 100,
        right: 200,
        height: 0,
        width: 0,
        toJSON: () => {},
      };

      const virtualElement = { getBoundingClientRect: () => boundingRect };

      await render(() => (
        <Menu.Root open>
          <Menu.Portal>
            <Menu.Positioner
              side="bottom"
              align="start"
              anchor={virtualElement}
              arrowPadding={0}
              data-testid="positioner"
            >
              <Menu.Popup>
                <Menu.Item>1</Menu.Item>
                <Menu.Item>2</Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const positioner = screen.getByTestId('positioner');
      expect(positioner.style.getPropertyValue('transform')).toBe(`translate(200px, 100px)`);
    });

    it('should accept a non-memoized function as an anchor', async () => {
      function TestComponent() {
        return (
          <div style={{ margin: '50px' }}>
            <Menu.Root open>
              <Menu.Portal>
                <Menu.Positioner
                  side="bottom"
                  align="start"
                  anchor={() => null}
                  arrowPadding={0}
                  data-testid="positioner"
                >
                  <Menu.Popup>
                    <Menu.Item>1</Menu.Item>
                    <Menu.Item>2</Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
          </div>
        );
      }

      await render(() => <TestComponent />);

      expect(screen.getByTestId('positioner')).toBeInTheDocument();
      expect(screen.getAllByRole('menuitem')).toHaveLength(2);
    });

    it('should react to the anchor changing from a ref to undefined and back', async () => {
      function TestComponent() {
        const anchorRef = { current: null as HTMLDivElement | null };
        const [currentAnchor, setCurrentAnchor] = createSignal<
          { current: HTMLDivElement | null } | undefined
        >(anchorRef);

        return (
          <div style={{ margin: '50px' }}>
            <button type="button" onClick={() => setCurrentAnchor(undefined)}>
              undefined
            </button>
            <button type="button" onClick={() => setCurrentAnchor(anchorRef)}>
              ref
            </button>
            <Menu.Root open>
              <Menu.Trigger>trigger</Menu.Trigger>
              <Menu.Portal>
                <Menu.Positioner
                  side="bottom"
                  align="start"
                  anchor={currentAnchor()}
                  arrowPadding={0}
                  data-testid="positioner"
                >
                  <Menu.Popup>
                    <Menu.Item>1</Menu.Item>
                    <Menu.Item>2</Menu.Item>
                  </Menu.Popup>
                </Menu.Positioner>
              </Menu.Portal>
            </Menu.Root>
            <div
              data-testid="anchor"
              style={{ 'margin-top': '100px', width: '10px', height: '10px' }}
              ref={(node) => {
                anchorRef.current = node;
              }}
            />
          </div>
        );
      }

      await render(() => <TestComponent />);

      const positioner = screen.getByTestId('positioner');
      const anchorElement = screen.getByTestId('anchor');

      const setUndefinedButton = screen.getByRole('button', { name: 'undefined' });
      const setRefButton = screen.getByRole('button', { name: 'ref' });
      const trigger = screen.getByRole('button', { name: 'trigger' });

      let anchorRect = anchorElement.getBoundingClientRect();
      await flushMicrotasks();
      expect(positioner.style.getPropertyValue('transform')).toBe(
        `translate(${anchorRect.left}px, ${anchorRect.bottom}px)`,
      );

      await userEvent.click(setUndefinedButton);
      await flushMicrotasks();

      const triggerRect = trigger.getBoundingClientRect();
      expect(positioner.style.getPropertyValue('transform')).toBe(
        `translate(${Math.floor(triggerRect.left)}px, ${triggerRect.bottom}px)`,
      );

      await userEvent.click(setRefButton);
      await flushMicrotasks();

      anchorRect = anchorElement.getBoundingClientRect();
      expect(positioner.style.getPropertyValue('transform')).toBe(
        `translate(${anchorRect.left}px, ${anchorRect.bottom}px)`,
      );
    });
  });

  describe.skipIf(isJSDOM)('prop: keepMounted', () => {
    it('when keepMounted=true, should keep the content mounted when closed', async () => {
      const { userEvent: user } = await import('vitest/browser');

      await render(() => (
        <Menu.Root modal={false}>
          <Menu.Trigger>Toggle</Menu.Trigger>
          <Menu.Portal keepMounted>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.Item>1</Menu.Item>
                <Menu.Item>2</Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const trigger = screen.getByRole('button', { name: 'Toggle' });

      expect(screen.queryByRole('menu', { hidden: true })).not.toBe(null);
      expect(screen.queryByRole('menu', { hidden: true })).toBeInaccessible();

      await user.click(trigger, { delay: 20 });
      await waitFor(() => {
        expect(screen.queryByRole('menu', { hidden: false })).not.toBe(null);
      });
      expect(screen.queryByRole('menu', { hidden: false })).not.toBeInaccessible();

      await user.click(trigger, { delay: 20 });
      await waitFor(() => {
        expect(screen.queryByRole('menu', { hidden: true })).not.toBe(null);
      });
      await waitFor(() => {
        expect(screen.queryByRole('menu', { hidden: true })).toBeInaccessible();
      });
    });

    it('when keepMounted=false, should unmount the content when closed', async () => {
      const { userEvent: user } = await import('vitest/browser');

      await render(() => (
        <Menu.Root modal={false}>
          <Menu.Trigger>Toggle</Menu.Trigger>
          <Menu.Portal keepMounted={false}>
            <Menu.Positioner>
              <Menu.Popup>
                <Menu.Item>1</Menu.Item>
                <Menu.Item>2</Menu.Item>
              </Menu.Popup>
            </Menu.Positioner>
          </Menu.Portal>
        </Menu.Root>
      ));

      const trigger = screen.getByRole('button', { name: 'Toggle' });

      expect(screen.queryByRole('menu', { hidden: true })).toBe(null);

      await user.click(trigger, { delay: 20 });
      await flushMicrotasks();
      await waitFor(() => {
        expect(screen.queryByRole('menu', { hidden: false })).not.toBe(null);
      });
      expect(screen.queryByRole('menu', { hidden: false })).not.toBeInaccessible();

      await user.click(trigger, { delay: 20 });
      await waitFor(() => {
        expect(screen.queryByRole('menu', { hidden: true })).toBe(null);
      });
    });
  });

  const triggerStyle = { width: '72px', height: '36px' };
  const popupStyle = { width: '52px', height: '24px' };

  // Solid port: needs Menubar
  describe.skip('Menubar parent', () => {
    it('uses bottom as the default side when the menubar is horizontal', async () => {
      /*
      let side = 'none';

      await render(() => (
        <Menubar>
          <Menu.Root open>
            <Trigger style={triggerStyle}>File</Trigger>
            <Menu.Portal>
              <Menu.Positioner
                sideOffset={(data) => {
                  side = data.side;
                  return 0;
                }}
              >
                <Menu.Popup style={popupStyle}>Open</Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </Menubar>
      ));

      expect(side).toBe('bottom');
      */
    });

    it('uses inline-end as the default side when the menubar is vertical', async () => {
      /*
      let side = 'none';

      await render(() => (
        <Menubar orientation="vertical">
          <Menu.Root open>
            <Trigger style={triggerStyle}>File</Trigger>
            <Menu.Portal>
              <Menu.Positioner
                sideOffset={(data) => {
                  side = data.side;
                  return 0;
                }}
              >
                <Menu.Popup style={popupStyle}>Open</Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </Menubar>
      ));

      expect(side).toBe('inline-end');
      */
    });
  });

  positionerConformanceTests({
    render,
    viewport: true,
    createComponent: (props) => (
      <Menu.Root {...props.root}>
        <Trigger {...props.trigger}>Trigger</Trigger>
        <Menu.Portal>
          <Menu.Positioner {...props.positioner}>
            <Menu.Popup {...props.popup}>
              {props.viewport ? <Menu.Viewport>Popup</Menu.Viewport> : 'Popup'}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    ),
  });
});
