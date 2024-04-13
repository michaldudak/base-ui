'use client';
import * as React from 'react';
import { unstable_useId as useId, unstable_useForkRef as useForkRef } from '@mui/utils';
import { useTabsContext } from '../useTabs/TabsContext';
import { useCompoundItem } from '../useCompound';
import { UseTabPanelParameters, UseTabPanelReturnValue } from './useTabPanel.types';
import { mergeReactProps } from '../utils/mergeReactProps';

function tabPanelValueGenerator(otherTabPanelValues: Set<string | number>) {
  return otherTabPanelValues.size;
}

/**
 *
 * Demos:
 *
 * - [Tabs](https://mui.com/base-ui/react-tabs/#hooks)
 *
 * API:
 *
 * - [useTabPanel API](https://mui.com/base-ui/react-tabs/hooks-api/#use-tab-panel)
 */
function useTabPanel(parameters: UseTabPanelParameters): UseTabPanelReturnValue {
  const { value: valueParam, id: idParam, rootRef: externalRef } = parameters;
  const { value: selectedTabValue, getTabId, orientation, direction } = useTabsContext();

  const id = useId(idParam);
  const ref = React.useRef<HTMLElement>(null);
  const handleRef = useForkRef(ref, externalRef);
  const metadata = React.useMemo(() => ({ id, ref }), [id]);

  const { id: value } = useCompoundItem(valueParam ?? tabPanelValueGenerator, metadata);

  const hidden = value !== selectedTabValue;

  const correspondingTabId = value !== undefined ? getTabId(value) : undefined;

  const getRootProps = React.useCallback(
    (
      externalProps: React.ComponentPropsWithoutRef<'div'> = {},
    ): React.ComponentPropsWithRef<'div'> => {
      return mergeReactProps(externalProps, {
        'aria-labelledby': correspondingTabId ?? undefined,
        hidden,
        id: id ?? undefined,
        role: 'tabpanel',
        tabIndex: hidden ? -1 : 0,
        ref: handleRef,
      });
    },
    [correspondingTabId, handleRef, hidden, id],
  );

  return {
    hidden,
    getRootProps,
    rootRef: handleRef,
    orientation,
    direction,
  };
}

export { useTabPanel };
