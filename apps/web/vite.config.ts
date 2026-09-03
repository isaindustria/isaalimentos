/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import tailwindcss from '@tailwindcss/vite';
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
  plugins: [
    react(),
    tailwindcss(),
    versionFile(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'icon-192.png', 'brand/logo-512.png'],
      manifest: {
        name: 'ISA Alimentos · Gestão',
        short_name: 'ISA Gestão',
        description: 'Estoque, pedidos das lojas, produção e clientes da ISA Alimentos.',
        lang: 'pt-BR',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#ffffff',
        theme_color: '#e21420',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'brand/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'brand/logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        shortcuts: [
          { name: 'Pedidos', url: './#/pedidos' },
          { name: 'Estoque', url: './#/estoque' },
          { name: 'Produção', url: './#/producao' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,webp,svg,woff2}'],
        globIgnores: ['**/site/**', '**/brand/products/**', '**/push-sw.js'],
        navigateFallbackDenylist: [/^\/site/],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        importScripts: ['push-sw.js'],
        runtimeCaching: [
          { urlPattern: /^https:\/\/fonts\.googleapis\.com\//, handler: 'StaleWhileRevalidate', options: { cacheName: 'google-fonts' } },
          { urlPattern: /^https:\/\/fonts\.gstatic\.com\//, handler: 'CacheFirst', options: { cacheName: 'google-fonts-files', expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 } } },
          { urlPattern: /\/brand\/products\/.*\.webp$/, handler: 'CacheFirst', options: { cacheName: 'product-images', expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 } } },
        ],
      },
    }),
  ],
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
