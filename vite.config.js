import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { apiPlugin } from './vite-api-plugin.js'

export default defineConfig({
  optimizeDeps: {
    exclude: ['web-ifc'], // WASM module — don't pre-bundle
  },
  plugins: [
    apiPlugin(), // dev-only: runs /api/* serverless functions in-process
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src/sw',
      filename: 'service-worker.js',
      registerType: 'prompt',
      injectRegister: false,
      manifest: false, // using public/manifest.json directly
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
        maximumFileSizeToCacheInBytes: 12 * 1024 * 1024, // 12MB — large bundle due to web-ifc WASM + PDF libs
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
