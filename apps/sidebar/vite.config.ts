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
  // Exclude @meridian/core from pre-bundling — its node16 .js extensions
  // cause Vite's optimizer to fail. Import types only; no runtime code from core.
  optimizeDeps: {
    exclude: ['@meridian/core'],
  },
  resolve: {
    alias: {
      '@meridian/core': path.resolve(__dirname, '../../packages/core/src/index.ts'),
    },
  },
});
