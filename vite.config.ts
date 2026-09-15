import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const buildId = new Date().toISOString();
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    {
      name: 'build-identity',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'build-info.json',
          source: JSON.stringify({ buildId }),
        });
      },
    },
  ],
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
