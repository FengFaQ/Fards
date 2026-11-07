import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

const inCI = !!process.env.GITHUB_ACTIONS;
const base = process.env.VITE_BASE ?? (inCI ? '/Fards/' : '/');

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
});
