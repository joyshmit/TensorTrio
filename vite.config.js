import { defineConfig } from 'vite';

const isolation = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
};

export default defineConfig({
  worker: { format: 'es' },
  server: { headers: isolation },
  preview: { headers: isolation },
});
