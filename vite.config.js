import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
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
      },
      devOptions: {
        enabled: true,
        type: 'module',
      },
    }),
  ],
})
