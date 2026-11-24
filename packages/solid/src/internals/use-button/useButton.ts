import { untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { isHTMLElement } from '@floating-ui/utils/dom';
import { error } from '#utils/error';
import { access } from '#utils/access';
import type { MaybeAccessor } from '#utils/access';
import { useEffect, useIsoLayoutEffect } from '#utils/useEffect';
import { callEventHandler, makeEventPreventable, mergeProps } from '../../merge-props';
import { useCompositeRootContext } from '../composite/root/CompositeRootContext';
import type { BaseUIEvent, HTMLProps } from '../types';
import { useFocusableWhenDisabled } from '../../utils/useFocusableWhenDisabled';
import { dispatchClickWithModifiers } from '../../utils/dispatchClickWithModifiers';

const EXTERNAL_HANDLER_KEYS = ['onClick', 'onMouseDown', 'onKeyUp', 'onKeyDown', 'onPointerDown'];

export function useButton(parameters: UseButtonParameters = {}): UseButtonReturnValue {
  const disabled = () => access(parameters.disabled) ?? false;
  const tabIndex = () => access(parameters.tabIndex) ?? 0;
  const isNativeButton = () => access(parameters.native) ?? true;

  const elementRef = { current: null as HTMLElement | null };

  const compositeRootContext = useCompositeRootContext(true);
  const isCompositeItem = () => access(parameters.composite) ?? compositeRootContext !== undefined;

  const { props: focusableWhenDisabledProps } = useFocusableWhenDisabled({
    focusableWhenDisabled: () => access(parameters.focusableWhenDisabled),
    disabled,
    composite: isCompositeItem,
    tabIndex,
    isNativeButton,
  });

  if (process.env.NODE_ENV !== 'production') {
    useEffect(
      () => [isNativeButton()] as const,
      ([isNative]) => {
        if (!elementRef.current) {
          return;
        }

        const isButtonTag = isButtonElement(elementRef.current);

        if (isNative) {
          if (!isButtonTag) {
            const message =
              'A component that acts as a button expected a native <button> because the ' +
              '`nativeButton` prop is true. Rendering a non-<button> removes native button ' +
              'semantics, which can impact forms and accessibility. Use a real <button> in the ' +
              '`render` prop, or set `nativeButton` to `false`.';
            error(message);
          }
        } else if (isButtonTag) {
          const message =
            'A component that acts as a button expected a non-<button> because the `nativeButton` ' +
            'prop is false. Rendering a <button> keeps native behavior while Base UI applies ' +
            'non-native attributes and handlers, which can add unintended extra attributes (such ' +
            'as `role` or `aria-disabled`). Use a non-<button> in the `render` prop, or set ' +
            '`nativeButton` to `true`.';
          error(message);
        }
      },
    );
  }

  // handles a disabled composite button rendering another button, e.g.
  // <Toolbar.Button disabled render={<Menu.Trigger />} />
  // the `disabled` prop needs to pass through 2 `useButton`s then finally
  // delete the `disabled` attribute from DOM
  const updateDisabled = (
    isDisabled: boolean,
    focusableWhenDisabledDisabled: boolean | undefined,
    isComposite: boolean,
  ) => {
    const element = elementRef.current;

    if (!isButtonElement(element)) {
      return;
    }

    if (
      isComposite &&
      isDisabled &&
      focusableWhenDisabledDisabled === undefined &&
      element.disabled
    ) {
      element.disabled = false;
    }
  };

  useIsoLayoutEffect(
    () => [disabled(), focusableWhenDisabledProps().disabled, isCompositeItem()] as const,
    ([isDisabled, focusableWhenDisabledDisabled, isComposite]) => {
      updateDisabled(isDisabled, focusableWhenDisabledDisabled, isComposite);
    },
  );

  // Called inside the `props` function of `useRenderElement`, so the reactive reads below are
  // tracked there. Event handlers read the current values when they run.
  const getButtonProps = (externalProps: GenericButtonProps = {}) => {
    const externalOnClick = externalProps.onClick;
    const externalOnMouseDown = externalProps.onMouseDown;
    const externalOnKeyUp = externalProps.onKeyUp;
    const externalOnKeyDown = externalProps.onKeyDown;
    const externalOnPointerDown = externalProps.onPointerDown;
    // `children` is left out: reading it creates the child elements, and `mergeProps` drops it.
    const otherExternalProps: HTMLProps = {};
    Object.keys(externalProps).forEach((key) => {
      if (key !== 'children' && !EXTERNAL_HANDLER_KEYS.includes(key)) {
        otherExternalProps[key] = externalProps[key];
      }
    });

    return mergeProps(
      {
        onClick(event: MouseEvent) {
          if (disabled()) {
            event.preventDefault();
            return;
          }
          callEventHandler(externalOnClick, event);
        },
        onMouseDown(event: MouseEvent) {
          if (!disabled()) {
            callEventHandler(externalOnMouseDown, event);
          }
        },
        onKeyDown(event: BaseUIEvent<KeyboardEvent>) {
          if (disabled()) {
            return;
          }

          const isNative = isNativeButton();
          const isComposite = isCompositeItem();

          makeEventPreventable(event);
          callEventHandler(externalOnKeyDown, event);
          if (event.baseUIHandlerPrevented) {
            return;
          }

          const isCurrentTarget = event.target === event.currentTarget;
          const currentTarget = event.currentTarget as Element;
          const isButton = isButtonElement(currentTarget);
          const isLink = !isNative && isValidLinkElement(currentTarget);
          const shouldClick = isCurrentTarget && (isNative ? isButton : !isLink);
          const isEnterKey = event.key === 'Enter';
          const isSpaceKey = event.key === ' ';
          const role = currentTarget.getAttribute('role');
          const isTextNavigationRole =
            role?.startsWith('menuitem') || role === 'option' || role === 'gridcell';

          if (isCurrentTarget && isComposite && isSpaceKey) {
            if (event.defaultPrevented && isTextNavigationRole) {
              return;
            }

            event.preventDefault();

            // Only a native-mode item that isn't a real <button> is excluded.
            if (!isNative || isButton) {
              event.preventBaseUIHandler();
              dispatchClickWithModifiers(currentTarget, event);
            }

            return;
          }

          // Keyboard accessibility for native and non-native elements.
          if (!shouldClick || isNative || (!isSpaceKey && !isEnterKey)) {
            // Space activates links on keyup (`role="button"` semantics, matching the
            // composite path); prevent the page scroll Space would otherwise trigger.
            // Enter is left to the browser's native link activation.
            if (isCurrentTarget && isLink && isSpaceKey) {
              event.preventDefault();
            }
            return;
          }

          // Match native buttons: preventing the keydown's default cancels activation.
          if (event.defaultPrevented) {
            return;
          }

          event.preventDefault();

          if (isEnterKey) {
            event.preventBaseUIHandler();
            dispatchClickWithModifiers(currentTarget, event);
          }
        },
        onKeyUp(event: BaseUIEvent<KeyboardEvent>) {
          if (disabled()) {
            return;
          }

          const isNative = isNativeButton();
          const isComposite = isCompositeItem();

          // calling preventDefault in keyUp on a <button> will not dispatch a click event if Space is pressed
          // https://codesandbox.io/p/sandbox/button-keyup-preventdefault-dn7f0
          makeEventPreventable(event);
          callEventHandler(externalOnKeyUp, event);

          if (
            event.target === event.currentTarget &&
            isNative &&
            isComposite &&
            isButtonElement(event.currentTarget as HTMLElement) &&
            event.key === ' '
          ) {
            event.preventDefault();
            return;
          }

          if (event.baseUIHandlerPrevented) {
            return;
          }

          // Keyboard accessibility for non interactive elements.
          // Match native buttons: preventing the keyup's default cancels Space activation.
          // Limitation: unlike a native <button>, a prevented *keydown* cannot cancel the
          // activation — no state is kept between keydown and keyup, so we can't tell
          // whether the keydown was prevented or even happened on this element.
          if (
            event.target === event.currentTarget &&
            !isNative &&
            !isComposite &&
            !event.defaultPrevented &&
            event.key === ' '
          ) {
            event.preventBaseUIHandler();
            dispatchClickWithModifiers(event.currentTarget as Element, event);
          }
        },
        onPointerDown(event: PointerEvent) {
          if (disabled()) {
            event.preventDefault();
            return;
          }
          callEventHandler(externalOnPointerDown, event);
        },
      },
      isNativeButton() ? { type: 'button' } : { role: 'button' },
      focusableWhenDisabledProps(),
      otherExternalProps,
    );
  };

  const buttonRef = (element: HTMLElement) => {
    elementRef.current = element;
    // A snapshot of the current values; the effect above re-applies them when they change.
    untrack(() =>
      updateDisabled(disabled(), focusableWhenDisabledProps().disabled, isCompositeItem()),
    );
  };

  return {
    getButtonProps,
    buttonRef,
  };
}

function isButtonElement(elem: Element | null): elem is HTMLButtonElement {
  return isHTMLElement(elem) && elem.tagName === 'BUTTON';
}

function isValidLinkElement(elem: Element | null): elem is HTMLAnchorElement {
  return isHTMLElement(elem) && elem.tagName === 'A' && Boolean((elem as HTMLAnchorElement).href);
}

interface GenericButtonProps extends Omit<HTMLProps, 'onClick'>, AdditionalButtonProps {
  onClick?: ((event: Event) => void) | [(data: any, event: Event) => void, any] | undefined;
}

interface AdditionalButtonProps extends Partial<{
  'aria-disabled': JSX.AriaAttributes['aria-disabled'];
  disabled: boolean;
  role: JSX.HTMLAttributes<any>['role'];
  tabindex?: number | undefined;
}> {}

export interface UseButtonParameters {
  /**
   * Whether the component should ignore user interaction.
   * @default false
   */
  disabled?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether the button may receive focus even if it is disabled.
   * @default false
   */
  focusableWhenDisabled?: MaybeAccessor<boolean | undefined>;
  tabIndex?: MaybeAccessor<number | undefined>;
  /**
   * Whether the component is being rendered as a native button.
   * @default true
   */
  native?: MaybeAccessor<boolean | undefined>;
  /**
   * Whether the button is part of a composite widget.
   * When `true`, keyboard activation for Space occurs on keydown rather than keyup.
   * @default inferred from CompositeRoot context
   */
  composite?: MaybeAccessor<boolean | undefined>;
}

export interface UseButtonReturnValue {
  /**
   * Resolver for the button props.
   * @param externalProps additional props for the button
   * @returns props that should be spread on the button
   */
  getButtonProps: (externalProps?: GenericButtonProps) => HTMLProps;
  /**
   * A ref to the button DOM element. This ref should be passed to the rendered element.
   * It is not a part of the props returned by `getButtonProps`.
   */
  buttonRef: (element: HTMLElement) => void;
}

export interface UseButtonState {}
