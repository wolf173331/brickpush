// 使用兼容的JavaScript配置文件
export default {
  base: '/brickpush/', // 重要：GitHub Pages部署需要这个配置
  server: {
    port: 3000,
    open: true,
    host: '0.0.0.0',
  },
  build: {
    outDir: 'docs', // 重要：GitHub Pages使用docs文件夹
    assetsDir: 'assets',
    sourcemap: true,
  },
}