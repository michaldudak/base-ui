import path from 'node:path';
import { defineConfig } from 'vite';
import solid from '@solidjs/vite-plugin';

export default defineConfig({
  plugins: [solid()],
  resolve: {
    alias: {
      '@base-ui/solid': path.resolve(import.meta.dirname, '..', '..', 'packages', 'solid', 'src'),
    },
  },
  server: {
    fs: { allow: [path.resolve(import.meta.dirname, '..', '..')] },
  },
});
