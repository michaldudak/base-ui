import { platform } from '#utils/platform';
import { useTimeout } from '#utils/useTimeout';
import { useEffect } from '#utils/useEffect';
import type { MaybeAccessor } from '#utils/access';
import { access } from '#utils/access';

// Word Joiner is invisible and zero-width, so it forces a text mutation without shifting layout.
const LIVE_REGION_MARKER = '⁠';
// Safari VoiceOver needed roughly 200ms to reliably notice the initial polite live-region change.
export const INITIAL_LIVE_REGION_TEXT_MUTATION_RESET_DELAY = 200;

function findLastTextNode(root: HTMLElement): Text | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let lastTextNode: Text | null = null;

  while (walker.nextNode()) {
    const textNode = walker.currentNode as Text;
    if (textNode.nodeValue !== '') {
      lastTextNode = textNode;
    }
  }

  return lastTextNode;
}

/**
 * @param present Whether the live region element is currently rendered. Lets a conditionally
 * rendered region re-run the marker each time its element (re)appears with text.
 *
 * Solid port: returns the ref object; the caller assigns the element to it from its `ref`
 * callback.
 */
export function useInitialLiveRegionTextMutation<T extends HTMLElement>(
  present: MaybeAccessor<boolean> = true,
) {
  const timeout = useTimeout();
  const rootRef = { current: null as T | null };

  // Only the initial mounted announcement needs the marker; later text updates announce naturally.
  useEffect(
    () => [access(present)] as const,
    ([isPresent]) => {
      if (!isPresent || platform.os.ios) {
        return undefined;
      }

      const root = rootRef.current;
      if (root == null) {
        return undefined;
      }

      const textNode = findLastTextNode(root);
      if (textNode == null) {
        return undefined;
      }

      const originalValue = textNode.data;
      const markedValue = `${originalValue}${LIVE_REGION_MARKER}`;
      textNode.nodeValue = markedValue;

      timeout.start(INITIAL_LIVE_REGION_TEXT_MUTATION_RESET_DELAY, () => {
        if (textNode.nodeValue === markedValue) {
          textNode.nodeValue = originalValue;
        }
      });

      return () => {
        timeout.clear();

        if (textNode.nodeValue === markedValue) {
          textNode.nodeValue = originalValue;
        }
      };
    },
  );

  return rootRef;
}
