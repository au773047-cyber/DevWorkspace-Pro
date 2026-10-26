import { defineConfig } from 'vite';

// Relative asset URLs allow the built app to be hosted at a domain root or
// under a sub-path (for example GitHub Pages or a custom /app/ path).
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    host: '0.0.0.0',
    strictPort: true,
  },
});
