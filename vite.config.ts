import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'terser',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
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
