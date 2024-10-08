'use client';
import * as React from 'react';
import { mergeReactProps } from '../../utils/mergeReactProps';
import type {
  UsePopoverCloseParameters,
  UsePopoverCloseReturnValue,
} from './usePopoverClose.types';
import { useEventCallback } from '../../utils/useEventCallback';

export function usePopoverClose(params: UsePopoverCloseParameters): UsePopoverCloseReturnValue {
  const { onClose } = params;

  const onCloseMemo = useEventCallback(onClose);

  const getCloseProps = React.useCallback(
    (externalProps = {}) => {
      return mergeReactProps<'button'>(externalProps, {
        onClick: onCloseMemo,
      });
    },
    [onCloseMemo],
  );

  return React.useMemo(
    () => ({
      getCloseProps,
    }),
    [getCloseProps],
  );
}
