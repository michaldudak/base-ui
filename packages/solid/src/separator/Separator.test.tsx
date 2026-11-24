import { expect, describe, it } from 'vitest';
import { screen } from '@mui/internal-test-utils';
import { Separator } from '@base-ui/solid/separator';
import { createRenderer, describeConformance } from '#test-utils';

describe('<Separator />', () => {
  const { render } = createRenderer();

  describeConformance((props) => <Separator {...props} />, () => ({
    render,
    refInstanceof: window.HTMLDivElement,
  }));

  it('renders a div with the `separator` role', async () => {
    await render(() => <Separator />);
    expect(screen.getByRole('separator')).toBeVisible();
  });

  describe('prop: orientation', () => {
    it.each([{ orientation: 'horizontal' }, { orientation: 'vertical' }] as const)(
      'sets aria-orientation="$orientation"',
      async ({ orientation }) => {
        await render(() => <Separator orientation={orientation} />);

        expect(screen.getByRole('separator')).toHaveAttribute('aria-orientation', orientation);
      },
    );
  });

  // Solid-specific: props stay reactive without re-creating the element.
  it('updates the element in place when a prop changes', async () => {
    const { setProps } = await render((props) => <Separator orientation="horizontal" {...props} />);
    const separator = screen.getByRole('separator');
    expect(separator).toHaveAttribute('data-orientation', 'horizontal');

    await setProps({ orientation: 'vertical', class: (state: Separator.State) => state.orientation });

    expect(screen.getByRole('separator')).toBe(separator);
    expect(separator).toHaveAttribute('aria-orientation', 'vertical');
    expect(separator).toHaveAttribute('data-orientation', 'vertical');
    expect(separator).toHaveClass('vertical');
  });
});
