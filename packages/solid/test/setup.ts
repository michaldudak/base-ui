import { afterEach, beforeEach, vi } from 'vitest';
import failOnConsole from 'vitest-fail-on-console';
import '@testing-library/jest-dom/vitest';
import './addVitestMatchers';
import { flush } from 'solid-js';
import { cleanup } from './internal-test-utils';
import { reset as resetError } from '../src/base-utils/error';
import { resetAnimationFrameScheduler } from '../src/base-utils/useAnimationFrame';

const cleanupStarted = new WeakSet<object>();

/** Flush pending updates and release the test's timers and rendered roots. */
async function cleanupTest(task: object) {
  cleanupStarted.add(task);

  try {
    if (vi.isFakeTimers()) {
      vi.runOnlyPendingTimers();
      flush();
    }
  } finally {
    vi.useRealTimers();
    cleanup();
    flush();
  }
}

afterEach(({ task }) => cleanupTest(task));

beforeEach(({ task, onTestFinished }) => {
  cleanupStarted.delete(task);
  onTestFinished(async () => {
    if (!cleanupStarted.has(task)) {
      await cleanupTest(task);
    }
  });
});

failOnConsole({
  silenceMessage: (message) => {
    // React logs an error to the console when a component throws while rendering, so tests of
    // such errors mock `console.error`. Solid reports the same situation with a
    // `[REACTIVITY_HALTED]` warning. It is tolerated only while a test mocks `console.error`,
    // that is, only where the React test tolerated React's report.
    return message.includes('[REACTIVITY_HALTED]') && vi.isMockFunction(console.error);
  },
});

afterEach(() => {
  vi.resetAllMocks();
  globalThis.BASE_UI_ANIMATIONS_DISABLED = true;
  // `warn` and `error` share one log-once store, so this also clears deduplicated warnings.
  resetError();
  // Drop animation frame callbacks that were scheduled but never ran.
  resetAnimationFrameScheduler();
});

globalThis.BASE_UI_ANIMATIONS_DISABLED = true;

if (typeof window !== 'undefined' && window?.navigator?.userAgent?.includes('jsdom')) {
  globalThis.requestAnimationFrame = (cb) => {
    setTimeout(() => cb(0), 0);
    return 0;
  };

  // Not yet supported: https://github.com/jsdom/jsdom/issues/2152
  (globalThis.window as any).Touch ??= class Touch {
    instance: any;

    constructor(instance: any) {
      this.instance = instance;
    }

    get identifier() {
      return this.instance.identifier;
    }

    get pageX() {
      return this.instance.pageX;
    }

    get pageY() {
      return this.instance.pageY;
    }

    get clientX() {
      return this.instance.clientX;
    }

    get clientY() {
      return this.instance.clientY;
    }
  };
}
