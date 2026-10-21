import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The configuration file runs in Node, but the types of Node are not part of
// the project. Only the one value that is read is declared here.
declare const process: { env: Record<string, string | undefined> }

// Where the API lives while the interface is served. The development and
// the preview server both need it.
const apiTarget = process.env.WJ_API_TARGET ?? 'http://127.0.0.1:8080'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // The same short path the typescript configuration declares.
    alias: {
      '@': '/src',
    },
  },
  server: {
    port: 5173,
    // Bind the address the Makefile advertises, not whichever one
    // "localhost" happens to resolve to.
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
  // The preview server serves the built interface, so it needs the same
  // way to the API as the development server.
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules/leaflet')) return 'map'
          if (id.includes('node_modules/@tiptap')) return 'editor'
          if (id.includes('node_modules/react')) return 'react'
          return undefined
        },
      },
    },
  },
})
