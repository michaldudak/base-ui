import { expect, describe, it } from 'vitest';
import { dynamic } from '@solidjs/web';
import { randomStringValue, screen } from '@mui/internal-test-utils';
import { mergeProps } from '@base-ui/solid/merge-props';
import { throwMissingPropError } from './utils';
import type { ConformantElement, BaseUiConformanceTestsOptions } from '../describeConformance';

export function testPropForwarding(
  element: ConformantElement,
  getOptions: () => BaseUiConformanceTestsOptions,
) {
  const { render, testRenderPropWith: elementTag = 'div', button = false } = getOptions();

  if (!render) {
    throwMissingPropError('render');
  }

  const Element = dynamic(() => elementTag as 'div', { static: true });
  const nativeButton = elementTag === 'button';

  describe('prop forwarding', () => {
    it('forwards custom props to the default element', async () => {
      const otherProps = {
        lang: 'fr',
        'data-foobar': randomStringValue(),
      };

      await render(() => element({ 'data-testid': 'root', ...otherProps }));

      const customRoot = screen.getByTestId('root');
      expect(customRoot).toHaveAttribute('lang', otherProps.lang);
      expect(customRoot).toHaveAttribute('data-foobar', otherProps['data-foobar']);
    });

    it('forwards custom props to the customized element defined with a function', async () => {
      const otherProps = {
        lang: 'fr',
        'data-foobar': randomStringValue(),
        ...(button && { nativeButton }),
      };

      await render(() =>
        element({
          render: (props: any) => {
            return <Element {...props} data-testid="custom-root" />;
          },
          ...otherProps,
        }),
      );

      const customRoot = screen.getByTestId('custom-root');
      expect(customRoot).toHaveAttribute('lang', otherProps.lang);
      expect(customRoot).toHaveAttribute('data-foobar', otherProps['data-foobar']);
    });

    // Solid: there is no element form of `render`; the tag name form takes its place.
    it('forwards custom props to the customized element defined using a tag name', async () => {
      const otherProps = {
        lang: 'fr',
        'data-foobar': randomStringValue(),
        ...(button && { nativeButton }),
      };

      await render(() =>
        element({
          render: elementTag,
          'data-testid': 'custom-root',
          ...otherProps,
        }),
      );

      const customRoot = screen.getByTestId('custom-root');
      expect(customRoot.tagName).toBe(elementTag.toUpperCase());
      expect(customRoot).toHaveAttribute('lang', otherProps.lang);
      expect(customRoot).toHaveAttribute('data-foobar', otherProps['data-foobar']);
    });

    it('forwards the custom `style` attribute defined on the component', async () => {
      await render(() =>
        element({
          style: { color: 'green' },
          'data-testid': 'custom-root',
        }),
      );

      const customRoot = screen.getByTestId('custom-root');
      expect(customRoot).toHaveAttribute('style');
      expect(customRoot.getAttribute('style')).toContain('color: green');
    });

    // Solid: the render element's own props are merged in the render function with `mergeProps`.
    it('forwards the custom `style` attribute defined in the render function', async () => {
      await render(() =>
        element({
          render: (props: any) => (
            <Element
              {...mergeProps(props, { style: { color: 'green' }, 'data-testid': 'custom-root' })}
            />
          ),
          ...(button && { nativeButton }),
        }),
      );

      const customRoot = screen.getByTestId('custom-root');
      expect(customRoot).toHaveAttribute('style');
      expect(customRoot.getAttribute('style')).toContain('color: green');
    });
  });
}
