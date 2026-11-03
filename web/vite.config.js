import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

const shared = fileURLToPath(new URL('../server/src/shared', import.meta.url));
const page = (path) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  base: process.env.VITE_BASE || '/',
  resolve: { alias: { '@shared': shared } },
  server: { port: 5173, fs: { allow: ['..'] } },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      input: {
        // Home is the size page
        size: page('size/index.html'),
        dashboard: page('dashboard/index.html'),
        settings: page('settings/index.html'),
        auth: page('auth/index.html'),
        pay: page('pay/index.html'),
        paid: page('paid/index.html'),
      },
      output: { manualChunks: { three: ['three'], supabase: ['@supabase/supabase-js'] } },
    },
  },
});
