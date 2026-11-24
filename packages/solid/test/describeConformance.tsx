import { describe } from 'vitest';
import type { JSX } from '@solidjs/web';
import { createDescribe } from '@mui/internal-test-utils';
import { testPropForwarding } from './conformanceTests/propForwarding';
import { testRefForwarding } from './conformanceTests/refForwarding';
import { testRenderProp } from './conformanceTests/renderProp';
import { testClassName } from './conformanceTests/className';
import type { BaseUIRenderResult } from './createRenderer';

export type ConformantComponentProps = {
  render?: keyof JSX.IntrinsicElements | ((props: Record<string, any>, state: any) => JSX.Element);
  ref?: (element: any) => void;
  'data-testid'?: string;
  class?: string | ((state: unknown) => string);
  style?: JSX.CSSProperties;
  nativeButton?: boolean;
  [key: string]: unknown;
};

/**
 * The component under test, as a function of the props a conformance test adds.
 * The Solid counterpart of the React element the React suite clones:
 * `(props) => <Separator {...props} />`.
 */
export type ConformantElement = (props: ConformantComponentProps) => JSX.Element;

/**
 * Options read by the Base UI conformance suites.
 */
export interface BaseUiConformanceTestsOptions {
  /**
   * Renders the element under test. `element` is a function returning it:
   * `render: (node) => render(() => <Menu.Root open>{node()}</Menu.Root>)`.
   */
  render: (element: () => JSX.Element) => Promise<BaseUIRenderResult>;
  /**
   * The constructor the forwarded ref is expected to be an instance of.
   */
  refInstanceof: abstract new (...args: any[]) => unknown;
  /**
   * The element the render-prop and prop-forwarding tests render in place of the default one.
   * Rendering a `button` also sets `nativeButton` on components that accept it, and for those
   * components the tests run again with a `div` and `nativeButton={false}`.
   * @default 'div'
   */
  testRenderPropWith?: keyof JSX.IntrinsicElements;
  /**
   * Whether the component accepts the `nativeButton` prop.
   */
  button?: boolean;
  /**
   * Whether the component is allowed to be wrapped by an extra element for testing.
   * @default true
   */
  wrappingAllowed?: boolean;
}

function describeConformanceFn(
  minimalElement: ConformantElement,
  getOptions: () => BaseUiConformanceTestsOptions,
) {
  testPropForwarding(minimalElement, getOptions);
  testRefForwarding(minimalElement, getOptions);
  testRenderProp(minimalElement, getOptions);
  testClassName(minimalElement, getOptions);

  const { button = false, testRenderPropWith } = getOptions();
  if (button && testRenderPropWith === 'button') {
    // Button parts also support rendering a non-button element with `nativeButton={false}`.
    describe('with a non-native button', () => {
      const getNonNativeOptions = (): BaseUiConformanceTestsOptions => ({
        ...getOptions(),
        testRenderPropWith: 'div',
      });
      testPropForwarding(minimalElement, getNonNativeOptions);
      testRenderProp(minimalElement, getNonNativeOptions);
    });
  }
}

export const describeConformance = createDescribe('Base UI component API', describeConformanceFn);
