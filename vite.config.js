import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    open: true
  },
  build: {
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('@supabase')) return 'supabase-vendor';
            if (id.includes('lightweight-charts')) return 'charts-vendor';
            if (id.includes('html2canvas')) return 'html2canvas-vendor';
            return 'main-vendor';
          }
        }
      }
    }
  }
});
