import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// base: './' para que funcione servido desde cualquier subcarpeta (GitHub Pages, file://, etc.)
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
})
