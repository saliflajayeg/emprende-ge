import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// base '/' porque el dominio propio (emprendege.mercadosemu.com) sirve en la raíz.
export default defineConfig({
  base: '/',
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'GEmprende — Gestiona tu negocio',
        short_name: 'GEmprende',
        description:
          'Contabilidad, caja y fichas para tu negocio. Funciona sin conexión: los datos se guardan en tu dispositivo.',
        lang: 'es',
        dir: 'ltr',
        theme_color: '#0d9488',
        background_color: '#0d9488',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '/',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff,woff2,ico}'],
        navigateFallback: 'index.html',
        // No cachear la API de Supabase (siempre datos frescos/online)
        navigateFallbackDenylist: [/^\/rest\//, /^\/auth\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
})
