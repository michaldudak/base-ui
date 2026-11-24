import { expect, describe, it } from 'vitest';
import type { ConformantElement, BaseUiConformanceTestsOptions } from '../describeConformance';
import { throwMissingPropError } from './utils';

export function testRefForwarding(
  element: ConformantElement,
  getOptions: () => BaseUiConformanceTestsOptions,
) {
  describe('ref', () => {
    it('attaches the ref', async () => {
      const { render, refInstanceof } = getOptions();

      if (!render) {
        throwMissingPropError('render');
      }

      let ref: unknown = null;
      await render(() =>
        element({
          ref: (el) => {
            ref = el;
          },
        }),
      );

      expect(ref).toBeInstanceOf(refInstanceof);
    });
  });
}
