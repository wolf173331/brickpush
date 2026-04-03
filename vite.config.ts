import { defineConfig } from 'vite';

export default defineConfig({
  // GitHub Pages 用 /brickpush/，COS/其他根目录部署用 /
  base: process.env.VITE_BASE_PATH ?? '/brickpush/',
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
  publicDir: 'public',
});
