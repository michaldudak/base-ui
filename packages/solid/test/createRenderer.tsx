import { $PROXY, createSignal, flush } from 'solid-js';
import type { JSX } from '@solidjs/web';
import { render as solidRender } from '@solidjs/testing-library';
import { userEvent } from '@testing-library/user-event';
import type { UserEvent } from '@testing-library/user-event';
import { beforeEach, vi } from 'vitest';
import { act, allQueries } from './internal-test-utils';

type FakeTimersConfig = NonNullable<Parameters<typeof vi.useFakeTimers>[0]>;

export interface CreateRendererOptions {
  clock?: 'fake' | 'real' | undefined;
  clockConfig?: number | Date | undefined;
  clockOptions?: FakeTimersConfig | undefined;
}

export interface RenderOptions {
  container?: HTMLElement | undefined;
  baseElement?: HTMLElement | undefined;
  wrapper?: ((props: { children: JSX.Element }) => JSX.Element) | undefined;
}

/**
 * What a test renders: a function returning JSX.
 * It receives the props set later with `setProps`, as a reactive object to spread:
 * `render((props) => <Menu.Root open={false} {...props} />)`.
 */
export type RenderUi = (props: Record<string, any>) => JSX.Element;

function createClock(
  defaultMode: 'fake' | 'real',
  config: number | Date | undefined,
  options: FakeTimersConfig | undefined,
) {
  const useFakeTimers = () => {
    vi.useFakeTimers({
      now: config,
      shouldClearNativeTimers: true,
      toFake: [
        'setTimeout',
        'setInterval',
        'clearTimeout',
        'clearInterval',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'performance',
        'Date',
      ],
      ...options,
    });
    if (config) {
      vi.setSystemTime(config);
    }
  };

  if (defaultMode === 'fake') {
    beforeEach(useFakeTimers);
  } else {
    beforeEach(() => {
      if (config) {
        vi.setSystemTime(config);
      }
    });
  }

  return {
    withFakeTimers: () => {
      if (vi.isFakeTimers()) {
        return;
      }
      beforeEach(useFakeTimers);
    },
    runToLast: () => {
      vi.runOnlyPendingTimers();
      flush();
    },
    isReal() {
      return !vi.isFakeTimers();
    },
    restore() {
      vi.useRealTimers();
    },
    tick(timeoutMS: number) {
      vi.advanceTimersByTime(timeoutMS);
      flush();
    },
    async tickAsync(timeoutMS: number) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(timeoutMS);
      });
    },
    runAll() {
      vi.runAllTimers();
      flush();
    },
  };
}

function createTestProps() {
  const [values, setValues] = createSignal<Record<string, any>>({});

  const proxy: Record<string, any> = new Proxy(
    {},
    {
      get(_, key) {
        if (key === $PROXY) {
          return proxy;
        }
        return typeof key === 'string' ? values()[key] : undefined;
      },
      has(_, key) {
        return key === $PROXY || key in values();
      },
      ownKeys() {
        return Reflect.ownKeys(values());
      },
      getOwnPropertyDescriptor(_, key) {
        if (typeof key !== 'string' || !(key in values())) {
          return undefined;
        }
        return { enumerable: true, configurable: true, get: () => values()[key] };
      },
    },
  );

  return {
    proxy,
    set: (newProps: Record<string, any>) => setValues((prev) => ({ ...prev, ...newProps })),
  };
}

export function createRenderer(globalOptions: CreateRendererOptions = {}) {
  const { clock: clockMode = 'real', clockConfig, clockOptions } = globalOptions;
  const clock = createClock(clockMode, clockConfig, clockOptions);

  async function render(ui: RenderUi, options: RenderOptions = {}) {
    const testProps = createTestProps();

    // The testing library registers its container for cleanup only after a successful render, so
    // a render that throws (the "throws when rendered outside ..." tests) would leave its DOM
    // behind for the following tests. The container is created here and removed on failure.
    const ownsContainer = options.container == null;
    const container =
      options.container ??
      (options.baseElement ?? document.body).appendChild(document.createElement('div'));

    let result;
    try {
      result = await act(async () =>
        solidRender(() => ui(testProps.proxy), {
          ...options,
          container,
          queries: allQueries,
        } as any),
      );
    } catch (error) {
      if (ownsContainer) {
        container.remove();
      }
      throw error;
    }

    const user: UserEvent = userEvent.setup({ document });

    /**
     * Changes the props the rendered function receives.
     * The Solid counterpart of re-rendering a React element with different props.
     */
    async function setProps(newProps: Record<string, any>) {
      await act(async () => {
        testProps.set(newProps);
      });
    }

    return { ...result, user, setProps };
  }

  return { clock, render };
}

export type BaseUIRenderResult = Awaited<ReturnType<ReturnType<typeof createRenderer>['render']>>;
