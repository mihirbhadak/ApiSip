import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import sourceManifest from './public/manifest.json';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const buildId = new Date().toISOString();
export default defineConfig({
  define: { __BUILD_ID__: JSON.stringify(buildId) },
  plugins: [
    react(),
    {
      name: 'build-identity',
      async writeBundle() {
        const prefixIcons = (icons: Record<string, string>) =>
          Object.fromEntries(Object.entries(icons).map(([size, path]) => [size, 'dist/' + path]));
        const manifest = {
          ...sourceManifest,
          background: {
            ...sourceManifest.background,
            service_worker: 'dist/' + sourceManifest.background.service_worker,
          },
          icons: prefixIcons(sourceManifest.icons),
          action: {
            ...sourceManifest.action,
            default_icon: prefixIcons(sourceManifest.action.default_icon),
          },
        };
        await writeFile(resolve('manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
      },
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
        offscreen: resolve('offscreen.html'),
        'service-worker': resolve('src/background/service-worker.ts'),
      },
      output: { entryFileNames: '[name].js', chunkFileNames: 'assets/[name]-[hash].js' },
    },
  },
});
