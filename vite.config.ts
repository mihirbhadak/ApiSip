import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    sourcemap: true,
    rollupOptions: {
      input: {
        inspector: resolve('inspector.html'),
        'service-worker': resolve('src/background/service-worker.ts'),
      },
      output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js' },
    },
  },
});
