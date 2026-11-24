import { afterEach, beforeEach, vi } from 'vitest';
import failOnConsole from 'vitest-fail-on-console';
import '@testing-library/jest-dom/vitest';
import './addVitestMatchers';
import { flush } from 'solid-js';
import { attribution } from 'solid-js/attribution';
import { cleanup } from './internal-test-utils';
import { reset as resetError } from '../src/base-utils/error';
import { resetAnimationFrameScheduler } from '../src/base-utils/useAnimationFrame';

// Solid's attribution engine reports effects that write state their own inputs depend on
// (`EFFECT_RELAY_TEAR`, `EFFECT_WRITES_OWN_SOURCE`): state that should be derived instead. The
// Vite plugin enables it in the dev server; enabling it here makes those reports fail tests.
// `log: false` leaves out the per-run "why did this run" log. `hotTime` is a wall-clock budget
// (8ms of compute per second in one scope), which says more about the machine and the test
// environment than about the code, so it is off here.
attribution.enable({ log: false, hotTime: false });

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
    // KNOWN ISSUE (see PORTING.md, "Open issues"): in a real browser, disposing a root while a
    // filter input that was typed into still has focus makes Solid's owner disposal loop forever.
    // Blurring first avoids it, so the browser run can finish. jsdom is not affected.
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused !== document.body) {
      focused.blur();
    }
    flush();
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

// Solid also hands the error that halted the reactive system to `reportError`, which a browser
// turns into an uncaught `error` event. The same rule applies: a test that mocks `console.error`
// expects the throw (and asserts it through the rejected `render`), so it is not reported twice.
if (typeof globalThis.reportError === 'function') {
  const originalReportError = globalThis.reportError;
  globalThis.reportError = (error: unknown) => {
    if (vi.isMockFunction(console.error)) {
      return;
    }
    originalReportError.call(globalThis, error);
  };
}

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
