import { createSignal, For, onCleanup } from 'solid-js';
import { Dynamic } from '@solidjs/web';
import type { Component } from 'solid-js';
import Hero from './demos/hero';
import Submenu from './demos/submenu';
import CheckboxItems from './demos/checkbox-items';
import RadioItems from './demos/radio-items';
import GroupLabels from './demos/group-labels';
import OpenOnHover from './demos/open-on-hover';
import Arrow from './demos/arrow';
import DetachedTriggersSimple from './demos/detached-triggers-simple';
import DetachedTriggersControlled from './demos/detached-triggers-controlled';
import DetachedTriggersFull from './demos/detached-triggers-full';
import Filter from './demos/filter';

const DEMOS: { name: string; component: Component }[] = [
  { name: 'hero', component: Hero },
  { name: 'submenu', component: Submenu },
  { name: 'checkbox-items', component: CheckboxItems },
  { name: 'radio-items', component: RadioItems },
  { name: 'group-labels', component: GroupLabels },
  { name: 'open-on-hover', component: OpenOnHover },
  { name: 'arrow', component: Arrow },
  { name: 'detached-triggers-simple', component: DetachedTriggersSimple },
  { name: 'detached-triggers-controlled', component: DetachedTriggersControlled },
  { name: 'detached-triggers-full', component: DetachedTriggersFull },
  { name: 'filter', component: Filter },
];

function readHash() {
  const name = window.location.hash.slice(1);
  return DEMOS.some((demo) => demo.name === name) ? name : DEMOS[0].name;
}

export default function App() {
  const [current, setCurrent] = createSignal(readHash());

  const handleHashChange = () => setCurrent(readHash());
  window.addEventListener('hashchange', handleHashChange);
  onCleanup(() => window.removeEventListener('hashchange', handleHashChange));

  return (
    <div class="Layout">
      <nav class="Nav">
        <h1 class="NavTitle">Menu (Solid)</h1>
        <ul>
          <For each={DEMOS}>
            {(demo) => (
              <li>
                <a
                  href={`#${demo.name}`}
                  aria-current={current() === demo.name ? 'page' : undefined}
                >
                  {demo.name}
                </a>
              </li>
            )}
          </For>
        </ul>
      </nav>
      <main class="Main">
        <h2 class="DemoTitle">{current()}</h2>
        <div class="Stage" data-demo={current()}>
          <Dynamic component={DEMOS.find((demo) => demo.name === current())!.component} />
        </div>
      </main>
    </div>
  );
}
