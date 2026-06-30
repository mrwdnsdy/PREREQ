import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  // Set VITE_BASE (e.g. "/PREREQ/") for project GitHub Pages; defaults to root.
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/auth': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/projects': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/tasks': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/portfolio': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
}) 