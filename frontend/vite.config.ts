import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
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