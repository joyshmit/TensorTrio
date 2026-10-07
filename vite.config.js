import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  plugins: [
    VitePWA({
      registerType: 'autoUpdate',
      manifest: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,json,svg,png,ico,woff,woff2}'],
        navigateFallback: 'index.html',
      },
    }),
  ],
  worker: { format: 'es' },
  server: { headers: isolation },
  preview: { headers: isolation },
});
