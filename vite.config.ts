import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  base: './',
  server: {
    port: 5173,
    strictPort: true,
    // NOTE: All /api/* requests are handled locally via Electron IPC.
    // No proxy to external backend (project-nexus) in standalone mode.
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
