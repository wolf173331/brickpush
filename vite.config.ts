import { defineConfig } from 'vite';

export default defineConfig({
  base: '/brickpush/',
  server: {
    port: 3000,
    open: true,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: true,
  },
});
