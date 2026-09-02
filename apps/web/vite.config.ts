/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8'));

/** Emits public/version.json so the deployed web build can announce new releases. */
function versionFile() {
  return {
    name: 'isa-version-file',
    buildStart() {
      mkdirSync(path.resolve(__dirname, 'public'), { recursive: true });
      writeFileSync(
        path.resolve(__dirname, 'public/version.json'),
        JSON.stringify({ version: pkg.version, builtAt: new Date().toISOString() }),
      );
    },
  };
}

export default defineConfig({
  plugins: [react(), versionFile()],
  base: './',
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  build: {
    outDir: 'dist',
    sourcemap: false,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks: {
          pdf: ['pdfjs-dist'],
          xlsx: ['xlsx'],
          charts: ['recharts'],
        },
      },
    },
  },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
