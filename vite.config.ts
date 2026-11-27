import { defineConfig } from 'vite';

// base: './' 让同一份构建产物既能部署在 Vercel 根路径，也能部署在 GitHub Pages 的 /仓库名/ 子路径
export default defineConfig({
  base: './',
  build: { target: 'es2020', chunkSizeWarningLimit: 900 },
  server: { host: true },
});
