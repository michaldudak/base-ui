import { createMemo, createSignal } from 'solid-js';
import type { Accessor } from 'solid-js';
import { useIsoLayoutEffect } from '#utils/useEffect';

type RegisterItem<Key, Item> = (key: Key, item: Item) => () => void;

/**
 * Collects item registrations into one immutable snapshot per update.
 * Also returns the live registry for reads that must include the registrations of the current
 * update before its snapshot is published.
 */
export function useItemRegistry<Key, Item>(): ItemRegistry<Key, Item> {
  const itemRegistry = new Map<Key, Item>();

  const [registryVersion, setRegistryVersion] = createSignal(0, { ownedWrite: true });

  const isUpdateScheduledRef = { current: false };

  // Items can register without their parent updating. Schedule one parent update for the whole
  // batch so every registration is included in the next snapshot.
  const scheduleRegistryUpdate = () => {
    if (isUpdateScheduledRef.current) {
      return;
    }

    isUpdateScheduledRef.current = true;
    setRegistryVersion((version) => version + 1);
  };

  const registerItem = (key: Key, item: Item) => {
    itemRegistry.set(key, item);
    scheduleRegistryUpdate();

    return () => {
      itemRegistry.delete(key);
      scheduleRegistryUpdate();
    };
  };

  // The mutable registry is stable. Its version explicitly controls when to publish a copy.
  const registeredItems = createMemo<ReadonlyMap<Key, Item>>(() => {
    registryVersion();
    return new Map(itemRegistry);
  });

  useIsoLayoutEffect(
    () => [registryVersion()] as const,
    () => {
      isUpdateScheduledRef.current = false;
    },
  );

  return { items: registeredItems, registerItem, liveItems: itemRegistry };
}

export interface ItemRegistry<Key, Item> {
  /** The snapshot published after the latest update's registrations. */
  items: Accessor<ReadonlyMap<Key, Item>>;
  registerItem: RegisterItem<Key, Item>;
  /** The registry itself, including registrations whose snapshot hasn't been published yet. */
  liveItems: ReadonlyMap<Key, Item>;
}
