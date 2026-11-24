import { expect, describe, it } from 'vitest';
import { screen } from '@mui/internal-test-utils';
import type { ConformantElement, BaseUiConformanceTestsOptions } from '../describeConformance';
import { throwMissingPropError } from './utils';

export function testClassName(
  element: ConformantElement,
  getOptions: () => BaseUiConformanceTestsOptions,
) {
  describe('prop: class', () => {
    const { render } = getOptions();

    if (!render) {
      throwMissingPropError('render');
    }

    it('should apply the class to the root element when passed as a string', async () => {
      await render(() => element({ class: 'test-class', 'data-testid': 'root' }));
      expect(screen.getByTestId('root')).toHaveClass('test-class');
    });
  });
}
