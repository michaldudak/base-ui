'use client';
import * as React from 'react';
import PropTypes from 'prop-types';
import {
  elementAcceptingRef,
  exactProp,
  unstable_ownerDocument as ownerDocument,
  unstable_useForkRef as useForkRef,
  unstable_useEventCallback as useEventCallback,
} from '@mui/utils';

function mapEventPropToEvent<
  EventHandlerName extends ClickAwayMouseEventHandler | ClickAwayTouchEventHandler,
>(
  eventProp: EventHandlerName,
): EventHandlerName extends `on${infer EventName}` ? Lowercase<EventName> : never {
  return eventProp.substring(2).toLowerCase() as any;
}

function clickedRootScrollbar(event: MouseEvent, doc: Document) {
  return (
    doc.documentElement.clientWidth < event.clientX ||
    doc.documentElement.clientHeight < event.clientY
  );
}

type ClickAwayMouseEventHandler =
  | 'onClick'
  | 'onMouseDown'
  | 'onMouseUp'
  | 'onPointerDown'
  | 'onPointerUp';
type ClickAwayTouchEventHandler = 'onTouchStart' | 'onTouchEnd';

export interface ClickAwayListenerProps {
  /**
   * The wrapped element.
   */
  children: React.ReactElement;
  /**
   * If `true`, the React tree is ignored and only the DOM tree is considered.
   * This prop changes how portaled elements are handled.
   * @default false
   */
  disableReactTree?: boolean;
  /**
   * The mouse event to listen to. You can disable the listener by providing `false`.
   * @default 'onClick'
   */
  mouseEvent?: ClickAwayMouseEventHandler | false;
  /**
   * Callback fired when a "click away" event is detected.
   */
  onClickAway: (event: MouseEvent | TouchEvent) => void;
  /**
   * The touch event to listen to. You can disable the listener by providing `false`.
   * @default 'onTouchEnd'
   */
  touchEvent?: ClickAwayTouchEventHandler | false;
}

/**
 * Listen for click events that occur somewhere in the document, outside of the element itself.
 * For instance, if you need to hide a menu when people click anywhere else on your page.
 *
 * Demos:
 *
 * - [Click-Away Listener](https://mui.com/base-ui/react-click-away-listener/)
 *
 * API:
 *
 * - [ClickAwayListener API](https://mui.com/base-ui/react-click-away-listener/components-api/#click-away-listener)
 */
function ClickAwayListener(props: ClickAwayListenerProps): JSX.Element {
  const {
    children,
    disableReactTree = false,
    mouseEvent = 'onClick',
    onClickAway,
    touchEvent = 'onTouchEnd',
  } = props;
  const movedRef = React.useRef(false);
  const nodeRef = React.useRef<Element>(null);
  const activatedRef = React.useRef(false);
  const syntheticEventRef = React.useRef(false);

  React.useEffect(() => {
    // Ensure that this component is not "activated" synchronously.
    // https://github.com/facebook/react/issues/20074
    setTimeout(() => {
      activatedRef.current = true;
    }, 0);
    return () => {
      activatedRef.current = false;
    };
  }, []);

  const handleRef = useForkRef(
    // @ts-expect-error TODO upstream fix
    children.ref,
    nodeRef,
  );

  // The handler doesn't take event.defaultPrevented into account:
  //
  // event.preventDefault() is meant to stop default behaviors like
  // clicking a checkbox to check it, hitting a button to submit a form,
  // and hitting left arrow to move the cursor in a text input etc.
  // Only special HTML elements have these default behaviors.
  const handleClickAway = useEventCallback((event: MouseEvent | TouchEvent) => {
    // Given developers can stop the propagation of the synthetic event,
    // we can only be confident with a positive value.
    const insideReactTree = syntheticEventRef.current;
    syntheticEventRef.current = false;

    const doc = ownerDocument(nodeRef.current);

    // 1. IE11 support, which trigger the handleClickAway even after the unbind
    // 2. The child might render null.
    // 3. Behave like a blur listener.
    if (
      !activatedRef.current ||
      !nodeRef.current ||
      ('clientX' in event && clickedRootScrollbar(event, doc))
    ) {
      return;
    }

    // Do not act if user performed touchmove
    if (movedRef.current) {
      movedRef.current = false;
      return;
    }

    if (nodeRef.current.tagName === 'DIALOG' && nodeRef.current === event.target) {
      // Modal dialogs consider clicks on a backdrop as clicks on the dialog itself.
      // Clicking a backdrop should trigger onClickAway.

      if (hasClickedOutsideBoundingBox(event, nodeRef.current)) {
        onClickAway(event);
      }
    }

    let insideDOM;

    // If not enough, can use https://github.com/DieterHolvoet/event-propagation-path/blob/master/propagationPath.js
    if (event.composedPath) {
      insideDOM = event.composedPath().indexOf(nodeRef.current) > -1;
    } else {
      insideDOM =
        !doc.documentElement.contains(
          // @ts-expect-error returns `false` as intended when not dispatched from a Node
          event.target,
        ) ||
        nodeRef.current.contains(
          // @ts-expect-error returns `false` as intended when not dispatched from a Node
          event.target,
        );
    }

    if (!insideDOM && (disableReactTree || !insideReactTree)) {
      onClickAway(event);
    }
  });

  // Keep track of mouse/touch events that bubbled up through the portal.
  const createHandleSynthetic = (handlerName: string) => (event: React.SyntheticEvent) => {
    syntheticEventRef.current = true;

    const childrenPropsHandler = children.props[handlerName];
    if (childrenPropsHandler) {
      childrenPropsHandler(event);
    }
  };

  const childrenProps: { ref: React.Ref<Element> } & Pick<
    React.DOMAttributes<Element>,
    ClickAwayMouseEventHandler | ClickAwayTouchEventHandler
  > = { ref: handleRef };

  if (touchEvent !== false) {
    childrenProps[touchEvent] = createHandleSynthetic(touchEvent);
  }

  React.useEffect(() => {
    if (touchEvent !== false) {
      const mappedTouchEvent = mapEventPropToEvent(touchEvent);
      const doc = ownerDocument(nodeRef.current);

      const handleTouchMove = () => {
        movedRef.current = true;
      };

      doc.addEventListener(mappedTouchEvent, handleClickAway);
      doc.addEventListener('touchmove', handleTouchMove);

      return () => {
        doc.removeEventListener(mappedTouchEvent, handleClickAway);
        doc.removeEventListener('touchmove', handleTouchMove);
      };
    }

    return undefined;
  }, [handleClickAway, touchEvent]);

  if (mouseEvent !== false) {
    childrenProps[mouseEvent] = createHandleSynthetic(mouseEvent);
  }

  React.useEffect(() => {
    if (mouseEvent !== false) {
      const mappedMouseEvent = mapEventPropToEvent(mouseEvent);
      const doc = ownerDocument(nodeRef.current);

      doc.addEventListener(mappedMouseEvent, handleClickAway);

      return () => {
        doc.removeEventListener(mappedMouseEvent, handleClickAway);
      };
    }

    return undefined;
  }, [handleClickAway, mouseEvent]);

  return <React.Fragment>{React.cloneElement(children, childrenProps)}</React.Fragment>;
}

function hasClickedOutsideBoundingBox(event: MouseEvent | TouchEvent, element: Element) {
  const boundingRect = element.getBoundingClientRect();
  let clientX: number;
  let clientY: number;

  if ('touches' in event) {
    if (event.touches.length !== 1) {
      return false;
    }

    clientX = event.touches[0].clientX;
    clientY = event.touches[0].clientY;
  } else {
    clientX = event.clientX;
    clientY = event.clientY;
  }

  return (
    clientX < boundingRect.left ||
    clientX >= boundingRect.right ||
    clientY < boundingRect.top ||
    clientY >= boundingRect.bottom
  );
}

ClickAwayListener.propTypes /* remove-proptypes */ = {
  // ┌────────────────────────────── Warning ──────────────────────────────┐
  // │ These PropTypes are generated from the TypeScript type definitions. │
  // │ To update them, edit the TypeScript types and run `pnpm proptypes`. │
  // └─────────────────────────────────────────────────────────────────────┘
  /**
   * The wrapped element.
   */
  children: elementAcceptingRef.isRequired,
  /**
   * If `true`, the React tree is ignored and only the DOM tree is considered.
   * This prop changes how portaled elements are handled.
   * @default false
   */
  disableReactTree: PropTypes.bool,
  /**
   * The mouse event to listen to. You can disable the listener by providing `false`.
   * @default 'onClick'
   */
  mouseEvent: PropTypes.oneOf([
    'onClick',
    'onMouseDown',
    'onMouseUp',
    'onPointerDown',
    'onPointerUp',
    false,
  ]),
  /**
   * Callback fired when a "click away" event is detected.
   */
  onClickAway: PropTypes.func.isRequired,
  /**
   * The touch event to listen to. You can disable the listener by providing `false`.
   * @default 'onTouchEnd'
   */
  touchEvent: PropTypes.oneOf(['onTouchEnd', 'onTouchStart', false]),
} as any;

if (process.env.NODE_ENV !== 'production') {
  // eslint-disable-next-line
  (ClickAwayListener as any)['propTypes' + ''] = exactProp(ClickAwayListener.propTypes);
}

export { ClickAwayListener };
