import { createSignal, onCleanup, untrack } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { useIsoLayoutEffect } from '#utils/useEffect';
import { CompositeListContext } from './CompositeListContext';
import type { CompositeListContextValue } from './CompositeListContext';
import { CompositeListModel } from './CompositeListModel';
import type { CompositeListModelParameters } from './CompositeListModel';

export type { CompositeMetadata } from './CompositeListModel';

/**
 * Tracks the items registered through the returned context and keeps `elementsRef` and
 * `labelsRef` ordered by index. Render the value with `CompositeListContext`.
 *
 * Solid port: items register synchronously from their `ref` callbacks, before their elements are
 * in the document. The list resolves the registrations (document-order sort, `elementsRef`,
 * `labelsRef`, indexes, `onMapChange`) from its effect, which runs after the elements are
 * inserted: once after the list mounts, and once per batch of later registrations (the model's
 * `requestFlush` bumps a signal that the effect reads). Effects of a parent run before the list's
 * effect, so a parent's effect that runs in the same flush as a registration batch can still see
 * the refs as they were before the batch.
 */
export function useCompositeList<Metadata>(
  params: UseCompositeListParameters<Metadata>,
): CompositeListContextValue<Metadata> {
  // The equivalent of `useForcedRerendering`: the list's effect reads `flushVersion`.
  const [flushVersion, setFlushVersion] = createSignal(0, { ownedWrite: true });
  const requestFlush = () => setFlushVersion((version) => version + 1);
  // The initial values; the effect below keeps them up to date.
  const list = untrack(
    () =>
      new CompositeListModel<Metadata>({
        elementsRef: params.elementsRef,
        labelsRef: params.labelsRef,
        onMapChange: params.onMapChange,
        requestFlush,
      }),
  );

  // Item refs attach before this effect runs, so flushing here rebuilds the refs before paint
  // and while the originating event is still being handled in tests.
  useIsoLayoutEffect(
    () => [flushVersion(), params.elementsRef, params.labelsRef, params.onMapChange] as const,
    ([, elementsRef, labelsRef, onMapChange]) => {
      list.onMapChange = onMapChange;
      list.setRefs(elementsRef, labelsRef);

      if (list.dirty) {
        list.flush();
      }
    },
  );

  onCleanup(() => list.dispose());

  return list.context;
}

/**
 * Provides context for a list of items in a composite component.
 */
export function CompositeList<Metadata>(props: CompositeList.Props<Metadata>): JSX.Element {
  const context = useCompositeList(props);

  return <CompositeListContext value={context}>{props.children}</CompositeListContext>;
}

export interface CompositeListState {}

export interface UseCompositeListParameters<Metadata> extends Omit<
  CompositeListModelParameters<Metadata>,
  'requestFlush'
> {}

export interface CompositeListProps<Metadata> extends UseCompositeListParameters<Metadata> {
  children: JSX.Element;
}

export namespace CompositeList {
  export type State = CompositeListState;
  export type Props<Metadata> = CompositeListProps<Metadata>;
}
