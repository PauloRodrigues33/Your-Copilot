import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'index.js',
        chunkFileNames: '[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    assetsInlineLimit: 0,
    sourcemap: true,
    minify: 'terser'
  },
  server: {
    port: 3000
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  }
}); 