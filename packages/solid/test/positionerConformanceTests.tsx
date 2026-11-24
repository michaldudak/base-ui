import { createSignal } from 'solid-js';
import type { Component, Setter } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { describe, expect, it } from 'vitest';
import { act, screen, waitFor } from '@mui/internal-test-utils';
import { DirectionProvider } from '@base-ui/solid/direction-provider';
import type { HTMLProps } from '../src/internals/types';
import type { createRenderer } from '#test-utils';
import { isJSDOM, waitForPositioned } from '#test-utils';
import type {
  Align,
  CollisionAvoidance,
  OffsetFunction,
  Side,
} from '../src/internals/useAnchorPositioning';

// The anchor sits at the viewport origin and the popup is centered below it, so the positioner
// starts at x = (anchorWidth - popupWidth) / 2 and y = anchorHeight.
const anchorWidth = 72;
const anchorHeight = 36;
const popupWidth = 52;
const popupHeight = 24;
const baselineX = (anchorWidth - popupWidth) / 2;
const baselineY = anchorHeight;

const triggerStyle: JSX.CSSProperties = {
  width: `${anchorWidth}px`,
  height: `${anchorHeight}px`,
  'box-sizing': 'border-box',
};
const popupStyle: JSX.CSSProperties = { width: `${popupWidth}px`, height: `${popupHeight}px` };

const offsetCases = [
  {
    prop: 'sideOffset',
    numberPosition: (offset: number) => ({ x: baselineX, y: baselineY + offset }),
    offsetFunction: ((data) => data.positioner.width + data.anchor.width) as OffsetFunction,
    functionPosition: { x: baselineX, y: baselineY + popupWidth + anchorWidth },
  },
  {
    prop: 'alignOffset',
    numberPosition: (offset: number) => ({ x: baselineX + offset, y: baselineY }),
    offsetFunction: ((data) => data.positioner.width) as OffsetFunction,
    functionPosition: { x: baselineX + popupWidth, y: baselineY },
  },
] as const;

const callbackDataCases: Array<{
  description: string;
  positioner: Pick<PositionerTestProps, 'side' | 'align'>;
  key: 'side' | 'align';
  direction: 'ltr' | 'rtl';
  expected: string;
}> = [
  {
    description: 'the latest side after a flip',
    positioner: { side: 'left' },
    key: 'side',
    direction: 'ltr',
    expected: 'right',
  },
  {
    description: 'the latest align after a flip',
    positioner: { side: 'right', align: 'start' },
    key: 'align',
    direction: 'ltr',
    expected: 'end',
  },
  {
    description: 'the logical side after a flip',
    positioner: { side: 'inline-start' },
    key: 'side',
    direction: 'ltr',
    expected: 'inline-end',
  },
  {
    description: 'the logical side in RTL mode',
    positioner: { side: 'inline-start' },
    key: 'side',
    direction: 'rtl',
    expected: 'inline-start',
  },
];

/**
 * Tests the anchor positioning behavior that every `*.Positioner` part shares through
 * `useAnchorPositioning`. All cases need real layout, so they run in the browser only.
 */
export function positionerConformanceTests(config: PositionerTestConfig) {
  const {
    render,
    createComponent,
    viewport: hasViewport = false,
    defaultSide = 'bottom',
    defaultCollisionAvoidance = 'dropdown',
    stableState = true,
  } = config;

  const TestedComponent = createComponent;

  // The Solid counterpart of `prepareComponent`: a component, so options that change stay reactive.
  function PreparedComponent(options: {
    positioner?: Partial<PositionerTestProps>;
    popup?: { style?: JSX.CSSProperties };
    open?: boolean;
    viewport?: boolean;
  }) {
    return (
      <TestedComponent
        root={{ open: options.open ?? true }}
        trigger={{ style: triggerStyle }}
        positioner={{ 'data-testid': 'positioner', ...options.positioner }}
        popup={{ style: options.popup?.style ?? popupStyle }}
        viewport={options.viewport ?? false}
      />
    );
  }

  describe.skipIf(isJSDOM)('Positioner conformance', () => {
    describe.each(offsetCases)(
      'prop: $prop',
      ({ prop, numberPosition, offsetFunction, functionPosition }) => {
        it('offsets the positioner when a number is specified', async () => {
          const offset = 7;
          await render(() => <PreparedComponent positioner={{ [prop]: offset }} />);

          const positioner = screen.getByTestId('positioner');
          const { x, y } = numberPosition(offset);
          expect(positioner.style.transform).toBe(`translate(${x}px, ${y}px)`);
          expect(positioner.getBoundingClientRect()).toMatchObject({ x, y });
        });

        it('offsets the positioner when a function is specified', async () => {
          await render(() => <PreparedComponent positioner={{ [prop]: offsetFunction }} />);

          const positioner = screen.getByTestId('positioner');
          const { x, y } = functionPosition;
          expect(positioner.style.transform).toBe(`translate(${x}px, ${y}px)`);
          expect(positioner.getBoundingClientRect()).toMatchObject({ x, y });
        });

        it.each(callbackDataCases)(
          'reads $description inside the function',
          async ({ positioner, key, direction, expected }) => {
            let value = 'none';
            const positionerProps = {
              ...positioner,
              [prop]: ((data) => {
                value = data[key];
                return 0;
              }) satisfies OffsetFunction,
            };
            const element = () => <PreparedComponent positioner={positionerProps} />;

            await render(() => (
              <DirectionProvider direction={direction}>{element()}</DirectionProvider>
            ));

            expect(value).toBe(expected);
            expect(screen.getByTestId('positioner')).toHaveAttribute(`data-${key}`, expected);
          },
        );
      },
    );

    // https://github.com/mui/base-ui/issues/5131
    it('rests exactly at collisionPadding from the colliding edge', async () => {
      const collisionPadding = 12;
      let setOpen!: Setter<boolean>;

      function App() {
        const [open, setOpenState] = createSignal(false);
        setOpen = setOpenState;

        return (
          // Anchor pinned near the bottom so the bottom-side popup flips to the top and
          // collides with the top viewport edge.
          <div style={{ position: 'fixed', bottom: '8px', left: '16px' }}>
            <PreparedComponent
              open={open()}
              positioner={{
                side: 'bottom',
                sideOffset: 8,
                collisionPadding,
                collisionAvoidance: { fallbackAxisSide: 'none' },
              }}
              popup={{
                style: {
                  width: '200px',
                  height: '1000px',
                  'max-height': 'var(--available-height)',
                },
              }}
            />
          </div>
        );
      }

      await render(() => <App />);
      await act(async () => setOpen(true));

      const positioner = screen.getByTestId('positioner');
      await waitFor(() => {
        expect(positioner).toHaveAttribute('data-side', 'top');
      });

      // The preferred-side bias used by flip() must not leak into the resting position:
      // the popup should sit exactly `collisionPadding` away from the top edge, not +1px.
      await waitFor(() => {
        expect(Math.round(positioner.getBoundingClientRect().top)).toBe(collisionPadding);
      });
    });

    it('places the popup on the default side when it fits', async () => {
      await render(() => (
        <div style={{ position: 'fixed', top: '200px', left: '200px' }}>
          <PreparedComponent />
        </div>
      ));

      expect(screen.getByTestId('positioner')).toHaveAttribute('data-side', defaultSide);
    });

    describe('prop: collisionAvoidance', () => {
      // The popup fits neither above nor below the anchor, but fits beside it, so only a fallback to
      // the perpendicular axis moves it to the side.
      function prepareTallPopup(collisionAvoidance?: CollisionAvoidance) {
        return () => (
          <div style={{ position: 'fixed', top: '50%', left: '16px' }}>
            <PreparedComponent
              positioner={{ side: 'bottom', collisionAvoidance }}
              popup={{ style: { width: `${popupWidth}px`, height: '75vh' } }}
            />
          </div>
        );
      }

      const collisionDefaults = {
        popup: { collisionAvoidance: { fallbackAxisSide: 'end' }, side: /^right$/ },
        dropdown: { collisionAvoidance: { fallbackAxisSide: 'none' }, side: /^(top|bottom)$/ },
      } as const;

      it(`uses the ${defaultCollisionAvoidance} default when the prop is not set`, async () => {
        await render(prepareTallPopup());

        const positioner = screen.getByTestId('positioner');
        await waitForPositioned(positioner);
        expect(positioner.getAttribute('data-side')).toMatch(
          collisionDefaults[defaultCollisionAvoidance].side,
        );
      });

      it('uses the prop over the default', async () => {
        const other =
          collisionDefaults[defaultCollisionAvoidance === 'popup' ? 'dropdown' : 'popup'];
        await render(prepareTallPopup(other.collisionAvoidance));

        const positioner = screen.getByTestId('positioner');
        await waitForPositioned(positioner);
        expect(positioner.getAttribute('data-side')).toMatch(other.side);
      });
    });

    it.skipIf(!stableState)(
      'passes the same state object while nothing it holds changes',
      async () => {
        const states: unknown[] = [];

        function App(props: { color: string }) {
          return (
            <PreparedComponent
              positioner={{
                render: (renderProps, state) => {
                  states.push(state);
                  return <div {...renderProps} />;
                },
              }}
              popup={{ style: { ...popupStyle, color: props.color } }}
            />
          );
        }

        const { setProps } = await render((props) => <App color="red" {...props} />);
        const stateBefore = states.at(-1);
        const renderCountBefore = states.length;

        await setProps({ color: 'blue' });

        // Solid port: the element is updated in place, so `render` is not called again.
        expect(states.length).toBe(renderCountBefore);
        expect(states.at(-1)).toBe(stateBefore);
      },
    );

    it('uses transform positioning without Viewport', async () => {
      await render(() => <PreparedComponent />);

      const positioner = screen.getByTestId('positioner');
      await waitFor(() => {
        expect(positioner.style.transform).toBe(`translate(${baselineX}px, ${baselineY}px)`);
      });
    });

    if (hasViewport) {
      it('uses top/left positioning with Viewport', async () => {
        await render(() => <PreparedComponent viewport />);

        const positioner = screen.getByTestId('positioner');
        await waitForPositioned(positioner);
        expect(positioner.style.transform).toBe('');
        // A pass can measure the popup before it has a size, so wait for the final coordinates.
        await waitFor(() => {
          expect(positioner.style.left).toBe(`${baselineX}px`);
        });
        await waitFor(() => {
          expect(positioner.style.top).toBe(`${baselineY}px`);
        });
      });

      it('updates positioning when Viewport mounts and unmounts', async () => {
        function App() {
          const [showViewport, setShowViewport] = createSignal(false);

          return (
            <>
              <PreparedComponent viewport={showViewport()} />
              {/* Rendered after the anchor to keep the anchor at the viewport origin. */}
              <button type="button" onClick={() => setShowViewport((value) => !value)}>
                Toggle Viewport
              </button>
            </>
          );
        }

        const { user } = await render(() => <App />);
        const positioner = screen.getByTestId('positioner');
        const toggle = screen.getByRole('button', { name: 'Toggle Viewport' });

        expect(positioner.style.transform).toBe(`translate(${baselineX}px, ${baselineY}px)`);

        await user.click(toggle);
        await waitFor(() => {
          expect(positioner.style.transform).toBe('');
        });
        await waitFor(() => {
          expect(positioner.style.top).toBe(`${baselineY}px`);
        });

        await user.click(toggle);
        await waitFor(() => {
          expect(positioner.style.transform).toBe(`translate(${baselineX}px, ${baselineY}px)`);
        });
      });
    }
  });
}

export interface PositionerTestProps {
  'data-testid': string;
  side?: Side;
  align?: Align;
  sideOffset?: number | OffsetFunction;
  alignOffset?: number | OffsetFunction;
  collisionPadding?: number;
  collisionAvoidance?: CollisionAvoidance | undefined;
  render?: (props: HTMLProps, state: unknown) => JSX.Element;
}

export interface PositionerTestComponentProps {
  /**
   * Props to spread on the Root part.
   */
  root: { open: boolean };
  /**
   * Props to spread on the element the positioner is anchored to.
   */
  trigger: { style: JSX.CSSProperties };
  /**
   * Props to spread on the Positioner part.
   */
  positioner: PositionerTestProps;
  /**
   * Props to spread on the Popup part.
   */
  popup: { style: JSX.CSSProperties };
  /**
   * Whether to wrap the popup content in the component's Viewport part.
   */
  viewport: boolean;
}

export interface PositionerTestConfig {
  /**
   * Render function returned from `createRenderer`.
   */
  render: ReturnType<typeof createRenderer>['render'];
  /**
   * Returns an open popup whose Positioner is anchored to an element at the viewport origin.
   * Its parameters contain props to be spread on the component's parts.
   * A Solid component reading `props` lazily: `<Menu.Root {...props.root}>`,
   * `<Menu.Positioner {...props.positioner}>`, `{props.viewport ? ... : ...}`.
   */
  createComponent: Component<PositionerTestComponentProps>;
  /**
   * Whether the component has a Viewport part, which switches the positioner to top/left
   * positioning.
   * @default false
   */
  viewport?: boolean;
  /**
   * The side the Positioner places the popup on when `side` isn't set.
   * @default 'bottom'
   */
  defaultSide?: Side;
  /**
   * The `collisionAvoidance` default the Positioner uses: `'popup'` falls back to the
   * perpendicular axis when neither side fits, `'dropdown'` doesn't.
   * @default 'dropdown'
   */
  defaultCollisionAvoidance?: 'popup' | 'dropdown';
  /**
   * Whether the Positioner passes the same state object to `render` while nothing in it changes.
   * @default true
   */
  stableState?: boolean;
}
