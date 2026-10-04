// 显式把本项目的 Tailwind 配置对象传进去：CSS 入口文件在仓库
// （studio/web/src/index.css），靠隐式查找会误用仓库那份 config，
// 导致本 UI 自己的 class 扫不到。
import tailwindConfig from './tailwind.config.js'

export default {
  plugins: {
    tailwindcss: { config: tailwindConfig },
    autoprefixer: {},
  },
}
