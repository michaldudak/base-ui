import { expect, describe, it } from 'vitest';
import { dynamic } from '@solidjs/web';
import type { JSX } from '@solidjs/web';
import { randomStringValue, screen } from '@mui/internal-test-utils';
import { mergeProps } from '@base-ui/solid/merge-props';
import type { ConformantElement, BaseUiConformanceTestsOptions } from '../describeConformance';
import { throwMissingPropError } from './utils';

export function testRenderProp(
  element: ConformantElement,
  getOptions: () => BaseUiConformanceTestsOptions,
) {
  const {
    render,
    testRenderPropWith: elementTag = 'div',
    button = false,
    wrappingAllowed = true,
  } = getOptions();

  if (!render) {
    throwMissingPropError('render');
  }

  const Element = dynamic(() => elementTag as 'div', { static: true });
  const nativeButton = elementTag === 'button';

  // Solid: `ref` is a regular prop, so there is no `forwardRef`.
  function Wrapper(props: Record<string, any>): JSX.Element {
    return wrappingAllowed ? (
      <div data-testid="base-ui-wrapper">
        <Element {...props} data-testid="wrapped" />
      </div>
    ) : (
      <Element {...props} data-testid="wrapped" />
    );
  }

  describe('prop: render', () => {
    it('renders a customized root element with a function', async () => {
      const testValue = randomStringValue();

      await render(() =>
        element({
          render: (props: any) => {
            return <Wrapper {...props} data-test-value={testValue} />;
          },
          ...(button && { nativeButton }),
        }),
      );

      expect(screen.queryAllByTestId('base-ui-wrapper')).toHaveLength(wrappingAllowed ? 1 : 0);
      expect(screen.queryByTestId('wrapped')).not.toBe(null);
      expect(screen.queryByTestId('wrapped')).toHaveAttribute('data-test-value', testValue);
    });

    // Solid: a component takes the place of React's element form.
    it('renders a customized root element with a component', async () => {
      await render(() =>
        element({
          render: Wrapper,
          ...(button && { nativeButton }),
        }),
      );

      expect(screen.queryAllByTestId('base-ui-wrapper')).toHaveLength(wrappingAllowed ? 1 : 0);
      expect(screen.queryByTestId('wrapped')).not.toBe(null);
    });

    it('should pass the ref to the custom component', async () => {
      let instanceFromRef: HTMLElement | null = null;

      function Test() {
        return element({
          ref: (el: HTMLElement | null) => {
            instanceFromRef = el;
          },
          render: (props: any) => {
            return <Wrapper {...props} />;
          },
          'data-testid': 'wrapped',
          ...(button && { nativeButton }),
        });
      }

      await render(() => <Test />);
      expect(instanceFromRef!.tagName).toBe(elementTag.toUpperCase());
      expect(instanceFromRef!).toHaveAttribute('data-testid', 'wrapped');
    });

    it('should merge the rendering element ref with the custom component ref', async () => {
      let refA: HTMLElement | null = null;
      let refB: HTMLElement | null = null;

      function Test() {
        return element({
          ref: (el: HTMLElement | null) => {
            refA = el;
          },
          render: (props: any) => (
            <Wrapper
              {...mergeProps(props, {
                ref: (el: HTMLElement | null) => {
                  refB = el;
                },
              })}
            />
          ),
          'data-testid': 'wrapped',
          ...(button && { nativeButton }),
        });
      }

      await render(() => <Test />);

      expect(refA).not.toBe(null);
      expect(refA!.tagName).toBe(elementTag.toUpperCase());
      expect(refA!).toHaveAttribute('data-testid', 'wrapped');
      expect(refB).not.toBe(null);
      expect(refB!.tagName).toBe(elementTag.toUpperCase());
      expect(refB!).toHaveAttribute('data-testid', 'wrapped');
    });

    it('should merge the rendering element class with the custom component class', async () => {
      function Test() {
        return element({
          class: 'component-classname',
          render: (props: any) => (
            <Element {...mergeProps(props, { class: 'render-prop-classname' })} />
          ),
          'data-testid': 'test-component',
          ...(button && { nativeButton }),
        });
      }

      await render(() => <Test />);

      const component = screen.getByTestId('test-component');
      expect(component.classList.contains('component-classname')).toBe(true);
      expect(component.classList.contains('render-prop-classname')).toBe(true);
    });

    it('should merge the rendering element resolved class with the custom component class', async () => {
      function Test() {
        return element({
          class: () => 'conditional-component-classname',
          render: (props: any) => (
            <Element {...mergeProps(props, { class: 'render-prop-classname' })} />
          ),
          'data-testid': 'test-component',
          ...(button && { nativeButton }),
        });
      }

      await render(() => <Test />);

      const component = screen.getByTestId('test-component');
      expect(component.classList.contains('conditional-component-classname')).toBe(true);
      expect(component.classList.contains('render-prop-classname')).toBe(true);
    });
  });
}
