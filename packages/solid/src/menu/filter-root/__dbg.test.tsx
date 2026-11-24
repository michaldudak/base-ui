import { createSignal } from 'solid-js';
import { Menu } from '@base-ui/solid/menu';
import { act, screen } from '@mui/internal-test-utils';
import { createRenderer } from '#test-utils';

describe('dbg', () => {
  const { render } = createRenderer();
  it('x', async () => {
      let setLabel: (label: string) => void = () => {};
      function AsyncLabel() {
        const [label, setLabelState] = createSignal('Loading');
        setLabel = setLabelState;
        return <>{label()}</>;
      }

      await render(() => (
        
          <Menu.Root open>
            <Menu.Portal>
              <Menu.Positioner>
                <Menu.Popup>
                  
                  <Menu.List>
                    <Menu.Item>
                      <AsyncLabel />
                    </Menu.Item>
                    <Menu.Item>Delete</Menu.Item>
                  </Menu.List>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        
      ));
      console.log('A', document.querySelector('[data-side]')?.getAttribute('style'));
      await act(async () => setLabel('Rename'));
      console.log('B', document.querySelector('[data-side]')?.getAttribute('style'));
      await act(async () => {});
      console.log('C', document.querySelector('[data-side]')?.getAttribute('style'));
  });
});
