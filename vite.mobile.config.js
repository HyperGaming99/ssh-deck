import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

// Handy-Bundle: "electron" im preload.js wird durch die Brücke zum Node-Teil ersetzt (mobile/web/electron-web.js)
const bridge = () => ({ name: 'deck-bridge', transformIndexHtml: (html) => html.replace('<script type="module" src="/src/main.jsx">', '<script type="module" src="/mobile/web/main.js"></script>\n<script type="module" src="/src/main.jsx">') });
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), bridge()],
  resolve: { alias: { '@': path.resolve(import.meta.dirname, 'src') } },
  build: { outDir: 'mobile/www', emptyOutDir: true, chunkSizeWarningLimit: 1500 },
});
