import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      input: {
        iframe: path.resolve(__dirname, 'assets/iframe.html'),
      },
    },
    outDir: 'dist',
  },
  // Exclude @beacon/core from pre-bundling — its node16 .js extensions
  // cause Vite's optimizer to fail. Import types only; no runtime code from core.
  optimizeDeps: {
    exclude: ['@beacon/core'],
  },
  resolve: {
    alias: {
      '@beacon/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
});
