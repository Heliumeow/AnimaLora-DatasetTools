import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 本目录：studio_data/dataset_tools/ui/
// 仓库 Web 前端源码：<repo>/studio/web/src —— 通过别名 @repo 直接 import，
// 不复制组件、不 fork 样式；主题变量与 Tailwind 语义 token 也沿用仓库那份。
const REPO_WEB_SRC = fileURLToPath(new URL('../../../studio/web/src', import.meta.url))

export default defineConfig({
  plugins: [react()],
  base: '/',
  resolve: {
    alias: {
      '@repo': REPO_WEB_SRC,
    },
  },
  server: {
    port: 5174,
    // 开发模式下把 /api 转给 webapp.py（默认 8765）
    proxy: { '/api': 'http://127.0.0.1:8765' },
    fs: { allow: ['..', '../../..'] },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 700,
  },
})
