import { createMemo, createRenderEffect, createSignal, onCleanup, untrack } from 'solid-js';
import type { Accessor } from 'solid-js';
import { Store } from './Store';

/**
 * A value, or a function returning it. Selector arguments and synced values accept both so that a
 * component can pass a reactive read (`() => props.disabled`) or a constant.
 */
export type MaybeAccessor<T> = T | (() => T);

function read<T>(value: MaybeAccessor<T>): T {
  return typeof value === 'function' ? (value as () => T)() : value;
}

/**
 * A Store that supports controlled state keys, non-reactive values and provides utility methods
 * for Solid.
 *
 * The store itself is synchronous and framework-agnostic: `state`, `select()`, `set()` and
 * `update()` always work with the latest value. Solid components read it through `useState()`,
 * which returns an accessor backed by a memo, so only the DOM that depends on a changed selector
 * result updates. This split matters in Solid 2, where signal writes are batched until the next
 * flush: event handlers must read `store.state` / `store.select()`, never the accessors, when they
 * need a value they have just written.
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
    // `ownedWrite` lets the store be written from inside owned scopes (component bodies, effects).
    const [version, setVersion] = createSignal(0, { ownedWrite: true });
    this.version = version;
    this.bumpVersion = () => setVersion((count) => count + 1);
  }

  declare readonly context: Context;

  // Solid port: loosely typed so a store with more selectors (and a wider state) is assignable to
  // a store type with fewer (`MenuStore` to the popup positioner's store type). React consumes
  // this class from built declarations, where private members carry no type.
  declare private selectors: Record<PropertyKey, SelectorFunction<any>> | undefined;

  declare private version: Accessor<number>;

  declare private bumpVersion: () => void;

  override setState(newState: State) {
    if (this.state === newState) {
      return;
    }
    // Wake the accessors first, so that listeners reading them after a `flush()` see the update.
    this.bumpVersion();
    super.setState(newState);
  }

  /**
   * Subscribes the current tracking scope to every state change of the store.
   * Prefer `useState` with a selector; use this to make an arbitrary `store.state` read reactive.
   */
  track() {
    this.version();
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
    return createMemo(() => {
      this.version();
      return selector(this.state, read(a1), read(a2), read(a3));
    });
  }

  /**
   * Returns an accessor for an arbitrary selector function over the state.
   */
  use<Value>(selector: (state: State) => Value): Accessor<Value> {
    return createMemo(() => {
      this.version();
      return selector(this.state);
    });
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
   * Keeps a state key in sync with a reactive value. The value is written immediately and again
   * whenever it changes.
   */
  useSyncedValue<Key extends keyof State>(key: Key, value: Accessor<State[Key]>) {
    createRenderEffect(value, (next) => {
      if (this.state[key] !== next) {
        this.set(key, next);
      }
    });
  }

  /**
   * Like `useSyncedValue`, and resets the key to `undefined` when the owner is disposed.
   */
  useSyncedValueWithCleanup<Key extends KeysAllowingUndefined<State>>(
    key: Key,
    value: Accessor<State[Key]>,
  ) {
    this.useSyncedValue(key, value);
    onCleanup(() => {
      this.set(key, undefined as State[Key]);
    });
  }

  /**
   * Keeps several state keys in sync with reactive values, in one store update.
   */
  useSyncedValues<const Key extends keyof State>(statePart: Accessor<Pick<State, Key>>) {
    createRenderEffect(
      // Read every value so the effect tracks them; a new object each time always re-applies.
      () => ({ ...statePart() }),
      (next) => {
        this.update(next);
      },
    );
  }

  /**
   * Keeps a state key in sync with a controlled prop. `undefined` leaves the key uncontrolled.
   */
  useControlledProp<Key extends keyof State>(
    key: Key,
    controlled: Accessor<State[Key] | undefined>,
  ) {
    createRenderEffect(controlled, (next) => {
      if (next !== undefined && !Object.is(this.state[key], next)) {
        this.setState({ ...this.state, [key]: next });
      }
    });

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
