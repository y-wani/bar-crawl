import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Plain `vite dev` doesn't run the Vercel serverless functions in /api,
    // so the billed Places/Gemini proxy (/api/proxy) 404s locally. Forward
    // /api/* to the deployed function instead — it only needs the Firebase
    // ID token the browser already sends (App Check is dormant unless
    // APPCHECK_ENFORCE=true). NOTE: this spends the production Places/Gemini
    // budget and counts against the per-user rate limits. Point it elsewhere
    // (e.g. a preview deploy) with VITE_DEV_API_TARGET.
    proxy: {
      '/api': {
        target: process.env.VITE_DEV_API_TARGET || 'https://www.gobarhop.app',
        changeOrigin: true,
      },
    },
  },
  build: {
    minify: 'esbuild',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          mapbox: ['mapbox-gl'],
          three: ['three', '@react-three/fiber', '@react-three/drei'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
    '__dirname': JSON.stringify(''),
    'global': 'globalThis',
    'process': JSON.stringify({}),
  },
  resolve: {
    alias: {
      'fs': 'rollup-plugin-node-polyfills/polyfills/empty',
      'path': 'rollup-plugin-node-polyfills/polyfills/path',
    },
  },
})
