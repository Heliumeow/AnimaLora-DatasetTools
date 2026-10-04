# 架构设计与运行时覆盖层 (Architecture & Runtime Overlay)

`dataset_tools (dskit)` 的设计哲学是：**完全复用宿主仓库的权威能力，但对宿主源码保持 0 侵入，确保上游 Git 更新完全免疫。**

---

## 一、为什么放在 `studio_data/`？

宿主仓库 AnimaLoraStudio 的 `.gitignore` 包含了 `studio_data/` 目录。
* **物理隔离**：本工具的所有代码（`dskit/`、`ui/`、`docs/`、`backups/` 等）均存放于 `studio_data/dataset_tools/` 内部，完全处于 Git 跟踪范围之外。
* **零冲突保证**：当官方仓库进行日常更新、拉取远程分支（`git pull` / `git checkout`）或重构时，本工具目录永远不会被覆盖、删除或产生合并冲突。

---

## 二、整体模块架构

```
                     ┌───────────────────────────────────────────────┐
                     │            User Interactions                  │
                     │    CLI (cli.py)       Web UI (webapp.py)      │
                     └───────┬───────────────────────────────┬───────┘
                             │                               │
                             ▼                               ▼
                 ┌───────────────────────────────────────────────────────┐
                 │                  dskit 适配层                         │
                 │                                                       │
                 │  - selector.py: 筛选谓词引擎 (Tag/Regex/Path 匹配)     │
                 │  - cleaner.py:  自然语言与 Tag 混合切分、格式清洗规范化 │
                 │  - reject.py:   镜像目录迁移、伴生文件打包、空目录清理 │
                 │  - curate.py:   训练分组归档复制与移出                │
                 │  - backup.py:   byte 级原子还原点与逆序回滚           │
                 │  - sheet.py:    单文件离线 HTML 图片墙生成器          │
                 │  - overlay.py:  运行时扩展函数定义                    │
                 │  - bootstrap.py:上游模块加载与运行时动态注入          │
                 └───────────────────────────┬───────────────────────────┘
                                             │ 运行时内存注入 (磁盘 0 改动)
                                             ▼
                 ┌───────────────────────────────────────────────────────┐
                 │          studio/ 宿主源码 (100% 官方原始版本)         │
                 │                                                       │
                 │  - studio/services/dataset/tagedit.py                 │
                 │  - studio/services/tagging/caption_format.py          │
                 │  - studio/services/dataset/scan.py                    │
                 │  - studio/services/dataset/curation.py                │
                 │  - studio/services/dataset/thumb_cache.py             │
                 │  - studio/services/dataset/browse.py                  │
                 │  - studio/infrastructure/paths.py                     │
                 └───────────────────────────────────────────────────────┘
```

---

## 三、运行时覆盖层 (Runtime Overlay) 机制

在最初开发过程中，为了实现“在任意位置添加 Tag”、“自然语言 Prose 保护”、“UTF-8 BOM 清洗”等功能，曾直接修改了 `studio/services/dataset/tagedit.py`。然而，这样会导致宿主 Git 跟踪树变脏，在上游执行 `git pull` 时极易被覆盖或报错。

为此，我们重构并设计了 **Runtime Overlay（运行时动态补丁）** 机制：

### 1. 动态装配流程
在 `dskit/bootstrap.py` 中：
1. 先定位宿主仓库根路径（向上查找 `studio/services/dataset/tagedit.py` 锚点）；
2. 正常 `import` 宿主原始模块（`repo_tagedit`, `repo_caption_format` 等）；
3. 执行 `_bind()` 校验宿主官方符号是否存在，确保兼容契约；
4. 调用 `overlay.py` 的 `apply_runtime_patches()` 函数：
   * 将 `read_caption_parts`、`write_caption_parts`、`add_tags_overlay` 等增强能力动态挂载到当前 Python 进程的模块对象中；
   * 将 `cleaner.py` 里的宏观与句法切分算法动态绑定给 `repo_caption_format`。

### 2. 技术收益
* **磁盘文件 100% 纯净**：执行 `git status`，宿主仓库没有任何被修改的 tracked 文件；
* **内存态无感增强**：当 `cli.py` 或 `webapp.py` 启动时，所有扩展功能在当前进程内即时生效；
* **更新免疫**：上游无论如何迭代 `tagedit.py` 的源码，本地工具代码由于储存在 `studio_data/` 且通过运行时注入，完全不受影响。

---

## 四、前端组件复用与解耦

Web UI 沿用了相同的解耦原则：
1. **组件复用而非复制**：
   * 通过 Vite 的 `alias @repo -> studio/web/src`，直接消费宿主前端已有的 `ImageGrid`、`TagEditor`、`TagStatsPanel`、`PathPicker`、`AppShell`、Tailwind 主题及多语言字典；
   * 通过 `build_ui.py` 建立系统 junction 软链接，共享宿主的 `node_modules`，不额外安装多余依赖包。
2. **双模式完全组件化 (Dual-Mode Componentization)**：
   * **`MainMode/`（主工作台模块）**：
     * `useMainDataset.ts`：将状态管理、多级筛选、淘汰放回、原子编辑、批量操作等业务逻辑从视图中完整抽离；
     * `Sidebar/`：细分为 `ScopeSection`、`RejectSection`、`FilterSection`、`GroupExportSection`、`BackupsSection`，各表单自包含状态，杜绝打字触发全局重渲染；
     * `Center/`：`MainGridPanel`（三态视图切换、虚拟缩略图墙）与 `LogConsole`（可拖拽高度日志控制台）；
     * `Editor/`：`SingleEditorPanel`（单图双通道标注、方案 1+2 自动切分）与 `BatchEditorPanel`（6 模块批量处理、深度规范化清洗、批量淘汰/放回）；
   * **`ZenMode/`（禅模式模块）**：
     * 沉浸式全屏复审、极速盲操按键状态机、画质分桶预警、多层级折叠目录树（`ZenFolderTree`）；
   * **`main.tsx`（极简外壳）**：
     * 从原先 1600+ 行巨石代码缩减至 ~400 行干净的声明式布局入口，纯粹负责组装 `AppShell`、顶栏与模态弹窗，职责单一清晰。
