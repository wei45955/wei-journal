import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

declare const process: { env: Record<string, string | undefined> }

// Where the API lives while the interface is served locally.
const apiTarget = process.env.WJ_API_TARGET ?? 'http://127.0.0.1:8080'

const proxy = {
  '/api': { target: apiTarget, changeOrigin: false },
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: '0.0.0.0', proxy },
  preview: { port: 4173, proxy },
  build: {
    outDir: 'dist',
    sourcemap: false,
    // The editor and the map are split into their own chunks by the lazy
    // routes; the shell stays small so the first paint is quick on a phone.
    chunkSizeWarningLimit: 900,
  },
})
