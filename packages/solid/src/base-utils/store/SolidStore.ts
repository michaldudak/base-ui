import { createMemo, createRenderEffect, createSignal, onCleanup, untrack } from 'solid-js';
import type { Accessor, Signal } from 'solid-js';
import { Store } from './Store';

/**
 * A value, or a function returning it. Selector arguments and synced values accept both so that a
 * component can pass a reactive read (`() => props.disabled`) or a constant.
 */
export type MaybeAccessor<T> = T | (() => T);

const CACHE_KEY = '__cacheKey__';

const NOT_NOTIFIED = Symbol('not notified');

/** Set on the tracking view of a store's state. */
const TRACKED = Symbol('tracked');

/**
 * Returned by the source of `useDerivedValue` when it has no value of its own: the key keeps the
 * value it has.
 */
export const KEEP = Symbol('keep');

interface Box {
  value: any;
}

interface DerivedValue {
  source: (previous: any) => any;
  signal: Signal<Box>;
}

function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

/**
 * A Store that supports controlled state keys, non-reactive values and provides utility methods
 * for Solid.
 *
 * The store is a plain synchronous object first: `state`, `select()`, `set()` and `update()` always
 * work with the latest value, which is what event handlers need (Solid 2 batches signal writes
 * until the next flush, so a signal read right after a write still returns the old value).
 *
 * On top of that, every state key is its own signal, created the first time something reads the
 * key reactively. `useState()` runs a selector against a tracking view of the state, so a memo
 * depends on exactly the keys its selector read and nothing else.
 *
 * A key can also be *derived*: `useSyncedValue(s)` and `useControlledProp` register an accessor
 * as the key's source instead of copying its value into the store from an effect. Readers of the
 * key then depend on the accessor directly and see a change in the same flush.
 */
export class SolidStore<
  State extends object,
  Context = Record<string, never>,
  Selectors extends Record<string, SelectorFunction<State>> = Record<string, never>,
> extends Store<State> {
  constructor(state: State, context: Context = {} as Context, selectors?: Selectors) {
    super(state);
    this.context = context;
    this.selectors = selectors;
    this.raw = state;
    this.signals = new Map();
    this.derived = new Map();
    this.overridable = new Map();
    this.cacheKey = undefined;

    this.sources = new Map();
    // Bumped by `notifyAll()`, which announces a change no key comparison can see (a value that
    // was mutated in place).
    const [epoch, setEpoch] = createSignal(0, { ownedWrite: true });
    this.epoch = epoch;
    this.bumpEpoch = () => setEpoch((count) => count + 1);

    const store = this;
    const shared = {
      has: (_: object, key: PropertyKey) => key in store.raw,
      ownKeys: () => Reflect.ownKeys(store.raw),
      set: (_: object, key: PropertyKey, value: unknown) => {
        if (key === CACHE_KEY) {
          store.cacheKey = value;
        } else {
          (store.raw as Record<PropertyKey, unknown>)[key] = value;
        }
        return true;
      },
    };
    this.plainHandler = {
      ...shared,
      get: (_, key) => store.readPlain(key as keyof State),
      getOwnPropertyDescriptor: (_, key) =>
        key in store.raw
          ? {
              value: store.readPlain(key as keyof State),
              enumerable: true,
              configurable: true,
              writable: true,
            }
          : undefined,
    };
    this.trackingHandler = {
      ...shared,
      get: (_, key) => store.readTracked(key as keyof State),
      getOwnPropertyDescriptor: (_, key) =>
        key in store.raw
          ? {
              value: store.readTracked(key as keyof State),
              enumerable: true,
              configurable: true,
              writable: true,
            }
          : undefined,
    };

    // `state` reads go through a view, so derived keys return their current value. A new view is
    // returned on each access: memoized selectors treat a state object they have already seen as
    // unchanged, like the React store whose state object is replaced on every update.
    Object.defineProperty(this, 'state', {
      configurable: true,
      enumerable: true,
      get: () => new Proxy({}, store.plainHandler) as State,
      set: (value: State) => {
        store.raw = value;
      },
    });
  }

  declare readonly context: Context;

  // Solid port: loosely typed so a store with more selectors (and a wider state) is assignable to
  // a store type with fewer (`MenuStore` to the popup positioner's store type). React consumes
  // this class from built declarations, where private members carry no type.
  declare private selectors: Record<PropertyKey, SelectorFunction<any>> | undefined;

  /** The stored values. A derived key keeps the last value its accessor had here. */
  declare private raw: any;

  declare private signals: Map<PropertyKey, Signal<Box>>;

  declare private derived: Map<PropertyKey, Accessor<any>>;

  /** The keys set up with `useDerivedValue`. */
  declare private overridable: Map<PropertyKey, DerivedValue>;

  declare private cacheKey: unknown;

  /**
   * Per key, a counter bumped when the key becomes derived or stops being derived, so that its
   * readers switch to the new source. Created the first time the key is read reactively.
   */
  declare private sources: Map<PropertyKey, Signal<number>>;

  declare private epoch: Accessor<number>;

  declare private bumpEpoch: () => void;

  declare private plainHandler: ProxyHandler<object>;

  declare private trackingHandler: ProxyHandler<object>;

  private readPlain(key: keyof State): unknown {
    if (key === CACHE_KEY) {
      return this.cacheKey;
    }
    const source = this.derived.get(key);
    if (source) {
      return untrack(source);
    }
    return this.raw[key];
  }

  private readTracked(key: keyof State): unknown {
    if (key === CACHE_KEY) {
      return this.cacheKey;
    }
    if (key === TRACKED) {
      return true;
    }
    if (typeof key === 'symbol') {
      return this.raw[key];
    }
    this.trackSource(key);
    this.epoch();
    const source = this.derived.get(key);
    if (source) {
      return source();
    }
    let signal = this.signals.get(key);
    if (!signal) {
      signal = this.createKeySignal(key);
    }
    return signal[0]().value;
  }

  private trackSource(key: PropertyKey) {
    let source = this.sources.get(key);
    if (!source) {
      // `ownedWrite` lets it be written while components are created.
      source = createSignal(0, { ownedWrite: true });
      this.sources.set(key, source);
    }
    source[0]();
  }

  private sourceChanged(key: PropertyKey) {
    this.sources.get(key)?.[1]((count) => count + 1);
  }

  // The value is boxed: a bare function would be taken for an updater by the setter (state holds
  // callbacks and prop getters).
  private createKeySignal(key: PropertyKey): Signal<Box> {
    const signal = createSignal<Box>(
      { value: this.raw[key] },
      { ownedWrite: true, name: `store.${String(key)}` },
    );
    this.signals.set(key, signal);
    return signal;
  }

  /**
   * A view of the state whose reads subscribe the current tracking scope to the keys read.
   * Use it inside a memo, JSX or an effect's dependency function.
   */
  get tracked(): State {
    return new Proxy({}, this.trackingHandler) as State;
  }

  /** The current state as a plain object, derived keys included. */
  private snapshot(): State {
    const result = { ...this.raw };
    for (const [key, source] of this.derived) {
      result[key] = untrack(source);
    }
    return result;
  }

  override setState(newState: State) {
    const previous = this.raw;
    if (previous === newState) {
      return;
    }
    // Wake the accessors first, so that listeners reading them after a `flush()` see the update.
    for (const [key, signal] of this.signals) {
      const value = (newState as any)[key];
      if (!Object.is(previous[key], value)) {
        signal[1]({ value });
      }
    }
    super.setState(newState);
  }

  override update<const Key extends keyof State>(changes: Pick<State, Key>) {
    for (const key in changes) {
      if (!Object.is(this.raw[key], changes[key])) {
        this.setState({ ...this.snapshot(), ...changes });
        return;
      }
    }
  }

  override set<Key extends keyof State>(key: Key, value: State[Key]) {
    if (!Object.is(this.raw[key], value)) {
      this.setState({ ...this.snapshot(), [key]: value });
    }
  }

  override notifyAll() {
    this.bumpEpoch();
    this.setState(this.snapshot());
  }

  /**
   * Makes `source` the value of a state key while the current owner lives. Readers of the key
   * depend on `source` itself, so nothing is copied into the store by an effect.
   * `fallbackToStored` keeps the stored value whenever `source` returns `undefined`.
   */
  private derive<Key extends keyof State>(
    key: Key,
    source: Accessor<State[Key] | undefined>,
    options: { fallbackToStored?: boolean; resetOnCleanup?: boolean } = {},
  ) {
    const read: Accessor<State[Key]> = options.fallbackToStored
      ? () => {
          const value = source();
          return value !== undefined ? value : this.readStored(key);
        }
      : (source as Accessor<State[Key]>);

    this.derived.set(key, read);
    this.sourceChanged(key);

    // Plain listeners (`subscribe`, `observe`) are told about a change too, and the stored value
    // follows, so that it is what remains once the key is no longer derived.
    let lastNotified: unknown = NOT_NOTIFIED;
    createRenderEffect(read, (value) => {
      if (this.derived.get(key) !== read || Object.is(lastNotified, value)) {
        return;
      }
      const isFirst = lastNotified === NOT_NOTIFIED;
      lastNotified = value;
      if (!options.fallbackToStored) {
        if (Object.is(this.raw[key], value)) {
          return;
        }
        this.raw = { ...this.raw, [key]: value };
      } else if (isFirst) {
        return;
      }
      super.setState(this.snapshot());
    });

    onCleanup(() => {
      if (this.derived.get(key) !== read) {
        return;
      }
      this.derived.delete(key);
      this.sourceChanged(key);
      if (options.resetOnCleanup) {
        this.set(key, undefined as State[Key]);
      } else {
        // Readers created while the key was derived have no signal for it yet; the ones that do
        // are brought up to date with the value that stays behind.
        const signal = this.signals.get(key);
        signal?.[1]({ value: this.raw[key] });
      }
    });
  }

  /**
   * Makes a state key follow a reactive computation while the current owner lives, like
   * `useSyncedValue`, except that the key can still be written.
   *
   * The key holds whichever came last: the latest result of `source`, or a value written with
   * `set()`/`update()`. `source` runs again when something it reads changes. It receives the
   * key's current value, and returns the new value, or `KEEP` to leave the key as it is.
   *
   * This is Solid's writable derived signal (`createSignal(fn)`). It is what state that resets
   * when something else changes is made of:
   *
   * ```ts
   * // Hover is enabled again whenever the menu closes.
   * store.useDerivedValue('hoverEnabled', () => (open() ? KEEP : true));
   * ```
   */
  useDerivedValue<Key extends keyof State>(
    key: Key,
    source: (previous: State[Key]) => State[Key] | typeof KEEP,
  ) {
    // A key can get rules from several places (a root and one of its parts, for example). The
    // rules that were there first are applied before this one.
    const outer = this.overridable.get(key);
    const combined = (previous: State[Key]): State[Key] => {
      const current = outer ? outer.source(previous) : previous;
      const value = source(current);
      return value === KEEP ? current : value;
    };

    const signal = createSignal<Box>(
      (previous) => {
        const current = previous ?? { value: this.raw[key] };
        const value = combined(current.value);
        return Object.is(value, current.value) ? current : { value };
      },
      { ownedWrite: true, name: `store.${String(key)}` },
    ) as Signal<Box>;

    const entry: DerivedValue = { source: combined, signal };
    this.signals.set(key, signal);
    this.overridable.set(key, entry);
    this.sourceChanged(key);

    const follow = (value: unknown) => {
      if (this.signals.get(key) !== signal || Object.is(this.raw[key], value)) {
        return false;
      }
      this.raw = { ...this.raw, [key]: value };
      return true;
    };

    // The stored value, which plain reads return, follows: now, and whenever `source` gives a
    // new value.
    follow(untrack(signal[0]).value);
    createRenderEffect(
      () => signal[0]().value,
      (value) => {
        if (follow(value)) {
          super.setState(this.raw);
        }
      },
    );

    onCleanup(() => {
      if (this.overridable.get(key) !== entry) {
        return;
      }
      if (outer) {
        // Back to the rules that were there before, starting from the value that stays behind.
        outer.signal[1]({ value: this.raw[key] });
        this.signals.set(key, outer.signal);
        this.overridable.set(key, outer);
      } else {
        this.overridable.delete(key);
        // Replaced by a plain signal holding the stored value the next time the key is read.
        this.signals.delete(key);
      }
      this.sourceChanged(key);
    });
  }

  /** The stored value of a key, tracked, ignoring a derived source. */
  private readStored<Key extends keyof State>(key: Key): State[Key] {
    let signal = this.signals.get(key);
    if (!signal) {
      signal = this.createKeySignal(key);
    }
    return signal[0]().value;
  }

  /**
   * Subscribes the current tracking scope to every state change of the store.
   * Prefer `useState` with a selector, or `tracked`, which subscribe to the keys they read.
   */
  track() {
    this.epoch();
    for (const key of Object.keys(this.raw)) {
      this.readTracked(key as keyof State);
    }
  }

  /**
   * Returns an accessor for a selector's result that updates when the result changes.
   * Selector arguments may be accessors; they are read reactively.
   */
  useState<Key extends keyof Selectors>(
    key: Key,
    ...args: MaybeAccessorArgs<SelectorArgs<Selectors[Key]>>
  ): Accessor<ReturnType<Selectors[Key]>>;

  useState(key: keyof Selectors, ...args: any[]): Accessor<any> {
    const [a1, a2, a3] = args;
    const selector = this.selectors![key];
    return createMemo(() => selector(this.tracked, read(a1), read(a2), read(a3)));
  }

  /**
   * Returns an accessor for an arbitrary selector function over the state.
   */
  use<Value>(selector: (state: State) => Value): Accessor<Value> {
    return createMemo(() => selector(this.tracked));
  }

  /**
   * Returns a value from the store's state using a selector function.
   * Not reactive: reads the current state.
   */
  select<Key extends keyof Selectors>(
    key: Key,
    ...args: SelectorArgs<Selectors[Key]>
  ): ReturnType<Selectors[Key]>;

  select(key: keyof Selectors, a1?: unknown, a2?: unknown, a3?: unknown) {
    const selector = this.selectors![key];
    return selector(this.state, a1, a2, a3);
  }

  /**
   * Like `select`, but subscribes the current tracking scope to the keys the selector reads.
   * For a selector read from a store that can change; otherwise use `useState`.
   */
  selectTracked<Key extends keyof Selectors>(
    key: Key,
    ...args: SelectorArgs<Selectors[Key]>
  ): ReturnType<Selectors[Key]>;

  selectTracked(key: keyof Selectors, a1?: unknown, a2?: unknown, a3?: unknown) {
    const selector = this.selectors![key];
    return selector(this.tracked, a1, a2, a3);
  }

  /**
   * `select` for a selector of another store that reads this store, a submenu's selector reading
   * its parent menu's store for example. `state` is the state the calling selector received: when
   * that is a tracking view, the read from this store is tracked as well, so the caller's
   * accessors follow both stores.
   */
  selectFor<Key extends keyof Selectors>(
    state: object,
    key: Key,
    ...args: SelectorArgs<Selectors[Key]>
  ): ReturnType<Selectors[Key]>;

  selectFor(state: object, key: keyof Selectors, a1?: unknown, a2?: unknown, a3?: unknown) {
    const selector = this.selectors![key];
    const tracked = (state as { [TRACKED]?: boolean })[TRACKED] === true;
    return selector(tracked ? this.tracked : this.state, a1, a2, a3);
  }

  /**
   * Makes a state key follow a reactive value while the current owner lives.
   */
  useSyncedValue<Key extends keyof State>(key: Key, value: Accessor<State[Key]>) {
    this.derive(key, createMemo(value));
  }

  /**
   * Like `useSyncedValue`, and resets the key to `undefined` when the owner is disposed.
   */
  useSyncedValueWithCleanup<Key extends KeysAllowingUndefined<State>>(
    key: Key,
    value: Accessor<State[Key]>,
  ) {
    this.derive(key, createMemo(value), { resetOnCleanup: true });
  }

  /**
   * Makes several state keys follow reactive values while the current owner lives.
   */
  useSyncedValues<const Key extends keyof State>(statePart: Accessor<Pick<State, Key>>) {
    const keys = Object.keys(untrack(statePart)) as Key[];
    for (const key of keys) {
      this.derive(
        key,
        createMemo(() => statePart()[key]),
      );
    }
  }

  /**
   * Makes a state key follow a controlled prop. While the prop is `undefined` the key keeps its
   * stored value.
   */
  useControlledProp<Key extends keyof State>(
    key: Key,
    controlled: Accessor<State[Key] | undefined>,
  ) {
    this.derive(key, createMemo(controlled), { fallbackToStored: true });

    if (process.env.NODE_ENV !== 'production') {
      const initiallyControlled = untrack(controlled) !== undefined;
      createRenderEffect(controlled, (next) => {
        const isControlled = next !== undefined;
        if (initiallyControlled !== isControlled) {
          console.error(
            `A component is changing the ${
              initiallyControlled ? '' : 'un'
            }controlled state of ${key.toString()} to be ${initiallyControlled ? 'un' : ''}controlled. Elements should not switch from uncontrolled to controlled (or vice versa).`,
          );
        }
      });
    }
  }

  /**
   * Registers a function in the store's context that always calls the latest callback.
   */
  useContextCallback<Key extends ContextFunctionKeys<Context>>(
    key: Key,
    fn: Accessor<ContextFunction<Context, Key> | undefined>,
  ) {
    (this.context as Record<Key, MaybeCallable>)[key] = (...args: any[]) => untrack(fn)?.(...args);
  }

  /**
   * Observes changes derived from the store's selectors and calls the listener when the selected
   * value changes. The listener is also called once immediately.
   */
  observe<Key extends keyof Selectors>(
    selector: Key,
    listener: (
      newValue: ReturnType<Selectors[Key]>,
      oldValue: ReturnType<Selectors[Key]>,
      store: this,
    ) => void,
  ): () => void;

  observe<Selector extends ObserveSelector<State>>(
    selector: Selector,
    listener: (newValue: ReturnType<Selector>, oldValue: ReturnType<Selector>, store: this) => void,
  ): () => void;

  observe(
    selector: keyof Selectors | ObserveSelector<State>,
    listener: (newValue: any, oldValue: any, store: this) => void,
  ) {
    let selectFn: ObserveSelector<State>;

    if (typeof selector === 'function') {
      selectFn = selector;
    } else {
      selectFn = this.selectors![selector] as ObserveSelector<State>;
    }

    let prevValue = selectFn(this.state);

    listener(prevValue, prevValue, this);

    return this.subscribe((nextState) => {
      const nextValue = selectFn(nextState);
      if (!Object.is(prevValue, nextValue)) {
        const oldValue = prevValue;
        prevValue = nextValue;
        listener(nextValue, oldValue, this);
      }
    });
  }
}

type MaybeCallable = (...args: any[]) => any;

type ContextFunctionKeys<Context> = {
  [Key in keyof Context]-?: Extract<Context[Key], MaybeCallable> extends never ? never : Key;
}[keyof Context];

type ContextFunction<Context, Key extends keyof Context> = Extract<Context[Key], MaybeCallable>;

type KeysAllowingUndefined<State> = {
  [Key in keyof State]-?: undefined extends State[Key] ? Key : never;
}[keyof State];

type ObserveSelector<State> = (state: State) => any;

type SelectorFunction<State> = (state: State, ...args: any[]) => any;

type Tail<T extends readonly any[]> = T extends readonly [any, ...infer Rest] ? Rest : [];

type SelectorArgs<Selector> = Selector extends (...params: infer Params) => any
  ? Tail<Params>
  : never;

type MaybeAccessorArgs<Args extends readonly any[]> = {
  [Index in keyof Args]: MaybeAccessor<Args[Index]>;
};
