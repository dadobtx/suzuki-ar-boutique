import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  base: process.env.VITE_TARGET === 'ghpages' ? '/suzuki-ar-boutique/' : '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null, // We'll register manually in kiosk mode
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,wasm,task}'],
        maximumFileSizeToCacheInBytes: 50 * 1024 * 1024, // 50MB for MediaPipe models
        runtimeCaching: [
          {
            urlPattern: /catalog\.json$/,
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'catalog-cache' },
          },
        ],
      },
      manifest: false, // No web-app manifest in MVP
    }),
  ],
  define: {
    __GIT_SHA__: JSON.stringify(process.env.VITE_GIT_SHA ?? 'dev'),
    __BUILD_DATE__: JSON.stringify(new Date().toISOString()),
  },
});
