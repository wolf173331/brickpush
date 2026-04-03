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
  // 让 src/constants 目录下的 JSON 可以通过 fetch 直接访问
  publicDir: 'public',
});
