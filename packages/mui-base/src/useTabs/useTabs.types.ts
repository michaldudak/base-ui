import * as React from 'react';
import { TabsProviderValue } from './TabsProvider';

export interface UseTabsParameters {
  /**
   * The value of the currently selected `Tab`.
   * If you don't want any selected `Tab`, you can set this prop to `false`.
   */
  value?: string | number | null;
  /**
   * The default value. Use when the component is not controlled.
   */
  defaultValue?: string | number | null;
  /**
   * The component orientation (layout flow direction).
   * @default 'horizontal'
   */
  orientation?: 'horizontal' | 'vertical';
  /**
   * The direction of the text.
   * @default 'ltr'
   */
  direction?: 'ltr' | 'rtl';
  /**
   * Callback invoked when new value is being set.
   */
  onChange?: (event: React.SyntheticEvent | null, value: number | string | null) => void;
}

interface UseTabsRootElementOwnProps {
  dir: React.HTMLAttributes<HTMLElement>['dir'];
}

/**
 * Props that are received by the root element of the Tabs.
 */
export type UseTabsRootElementProps<TOther = {}> = Omit<TOther, keyof UseTabsRootElementOwnProps> &
  UseTabsRootElementOwnProps;

export interface UseTabsReturnValue {
  /**
   * Returns the values to be passed to the tabs provider.
   */
  contextValue: TabsProviderValue;
  getRootProps: (externalProps?: React.HTMLAttributes<HTMLDivElement>) => UseTabsRootElementProps;
}
