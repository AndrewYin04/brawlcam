import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: resolve(__dirname),
  publicDir: resolve(__dirname, 'public'),
  build: {
    outDir: resolve(__dirname, '../dist'),
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        spike: resolve(__dirname, 'spike.html'),
      },
    },
  },
  worker: { format: 'es' },
  server: {
    host: true,
    proxy: {
      '/api': 'http://localhost:8787',
      '/ws': { target: 'ws://localhost:8787', ws: true },
    },
  },
});
