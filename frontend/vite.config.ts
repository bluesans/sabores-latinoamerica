/// <reference types="vitest/config" />

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/sabores-latinoamerica/',
  plugins: [react()],
  server: {
    proxy: {
      '/sabores-latinoamerica/api': {
        target: 'http://localhost',
        changeOrigin: false,
      },
    },
  },
  preview: {
    proxy: {
      '/sabores-latinoamerica/api': {
        target: 'http://localhost',
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
