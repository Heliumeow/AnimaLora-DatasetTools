/** dskit UI 的 Tailwind 配置。
 *
 * **主题只有一份**：直接 import 仓库 `studio/web/tailwind.config.js`，只覆盖
 * `content`。语义 token（bg-canvas / text-fg-primary / accent / …）因此不会
 * 跟仓库漂移 —— 仓库改了 token，这里重新构建即可跟上。
 *
 * 为什么要覆盖 `content`：复用的组件（ImageGrid / TagEditor / TagStatsPanel
 * …）源码在仓库 `studio/web/src` 下，Tailwind 必须扫到它们用到的 class，
 * 否则复用来的组件会掉样式；而仓库默认 content 是相对它自己的路径。
 *
 * 路径统一算成**绝对 + 正斜杠**：本项目的 cwd、配置文件位置、仓库源码位置
 * 三者不一致，相对 glob 容易解析到意外目录（fast-glob 也不吃反斜杠）。
 */
import { fileURLToPath } from 'node:url'

import repoConfig from '../../../studio/web/tailwind.config.js'

const posix = (u) => fileURLToPath(u).replace(/\\/g, '/')
const here = posix(new URL('./', import.meta.url))
const repoWebSrc = posix(new URL('../../../studio/web/src/', import.meta.url))

/** @type {import('tailwindcss').Config} */
export default {
  ...repoConfig,
  content: [
    `${here}index.html`,
    `${here}src/**/*.{ts,tsx}`,
    `${repoWebSrc}**/*.{ts,tsx}`,
  ],
}
