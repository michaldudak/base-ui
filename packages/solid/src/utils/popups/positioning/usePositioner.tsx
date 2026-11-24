import type { JSX } from '@solidjs/web';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { popupStateMapping } from '../popupStateMapping';
import { useRenderElement } from '../../../internals/useRenderElement';
import type { UseRenderElementComponentProps } from '../../../internals/useRenderElement';
import { getDisabledMountTransitionStyles } from '../../../internals/getDisabledMountTransitionStyles';
import type { TransitionStatus } from '../../../internals/useTransitionStatus';

type RefCallback = ((element: HTMLDivElement) => void) | undefined | null;

interface UsePositionerOptions {
  styles: MaybeAccessor<JSX.CSSProperties>;
  transitionStatus: MaybeAccessor<TransitionStatus>;
  props?: object | undefined;
  refs?: RefCallback | RefCallback[] | undefined;
  hidden?: MaybeAccessor<boolean | undefined>;
  inert?: MaybeAccessor<boolean | undefined>;
}

/**
 * Renders the shared outer Positioner element used by popup components.
 * Applies the common role, hidden state, transition styles, state attributes, and optional inert styling.
 */
export function usePositioner<State extends Record<string, any>>(
  componentProps: UseRenderElementComponentProps<State>,
  state: State,
  options: UsePositionerOptions,
): JSX.Element {
  const style = (): JSX.CSSProperties => {
    const result: JSX.CSSProperties = { ...access(options.styles) };

    if (access(options.inert) ?? false) {
      result['pointer-events'] = 'none';
    }

    return result;
  };

  return useRenderElement('div', componentProps, {
    state,
    ref: options.refs,
    props: () => [
      { role: 'presentation', hidden: access(options.hidden), style: style() },
      getDisabledMountTransitionStyles(access(options.transitionStatus)),
      options.props,
    ],
    stateAttributesMapping: popupStateMapping,
  });
}
