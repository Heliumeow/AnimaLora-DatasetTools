# dskit · LoRA 数据集标注与极速筛选工具集

`dataset_tools (dskit)` 是专为 Stable Diffusion / SDXL / Flux 数据集准备、清洗、标注修改与素材初筛设计的轻量化脚本工具。

它位于 `studio_data/`（被 Git 忽略）目录下，采用 **Runtime Adapter（运行时适配覆盖层）** 架构：**既能深度复用 AnimaLoraStudio 仓库已有的权威后端能力与 React 高阶组件，又对宿主源码保持 0 侵入。上游代码更新（`git pull`）时完全不受影响、零冲突风险。**

---

## 🌟 核心亮点

1. **零 Git 污染与更新免疫 (Zero Intrusion & Update-Proof)**：
   * 宿主 `studio/` 源码 100% 保持官方原版，`git status` 完全干净；
   * 所有自然语言识别、任意位置 Tag 插入、BOM 清洗等扩展能力均通过运行时动态注入（[overlay.py](file:///D:/AnimaLoraStudio/studio_data/dataset_tools/dskit/overlay.py)），不怕上游覆盖。
2. **沉浸式「禅模式 (Zen Mode)」与主模式全联动淘汰体系**：
   * 汲取 `select pic` 极速筛选精髓：`Space` 原地保留/淘汰（画面不突兀跳走），`←`/`→`/滚轮极速翻页，`Tab` 切入编辑；
   * 主模式与禅模式**统一共用淘汰目录配置**与**三态视图**（全部/仅保留/仅淘汰），淘汰图片带醒目橙色警告角标；
   * 深度镜像多层级目录归档，同名伴生标注（`.txt`、`.json`、`.caption`、`.bak`）全家桶同步打包迁移，支持原路毫秒级放回与空目录自动清理；
   * **防递归与防重复隔离**：当淘汰目录设在主目录内部时，底层自动检测并彻底隔离排除，杜绝扫描与视图中的双倍重影；
   * 可折叠多层级目录树（`ZenFolderTree`），展示各分类 `📁 (保留数/总数)`，支持切图双向平滑自动滚动。
3. **自然语言 (Prose) 智能识别与双通道隔离保护**：
   * 采用“宏观开篇正则 + 句法动名词密度”算法，精准分离半角逗号混排的真实 Tag 与自然语言段落；
   * 前端提供双通道独立编辑框，彻底杜绝自然语言被当做单个 Tag 误切碎或被冲掉。
4. **Tag 命名与格式规范化 (Sanitation & Formatting)**：
   * 一键清除 UTF-8 BOM 标记、不可见控制字符、全角转半角、去引号、空格与下划线互转、大小写标准化。
5. **指定位置 (x-th) Tag 批量编辑**：
   * 支持向开头 (`front`)、末尾 (`back`) 或任意指定索引位置插入 Tag，支持自动重新排序已有 Tag (`--move-existing`)。
6. **企业级安全模型**：
   * **所有写操作默认 Dry-Run 预览**；真写前自动生成 byte 级精确还原点，支持一键无损回滚。

---

## 🚀 快速上手

### 1. 命令行 (CLI) 快速体验
无需编译前端，直接使用仓库 Python 环境运行：

```powershell
# 1. 扫描数据集总览
d:\AnimaLoraStudio\venv\Scripts\python.exe studio_data\dataset_tools\cli.py scan "D:\dataset"

# 2. 筛选并查看图片 (默认 dry-run 演练)
d:\AnimaLoraStudio\venv\Scripts\python.exe studio_data\dataset_tools\cli.py ls "D:\dataset" --tag 1girl --sort tags

# 3. 在第 1 位插入特定触发词，确认后加 --apply 真写
d:\AnimaLoraStudio\venv\Scripts\python.exe studio_data\dataset_tools\cli.py edit "D:\dataset" \
    --add "my_trigger" --at-index 0 --move-existing --apply
```

### 2. 本地 Web UI 与 禅模式
复用仓库已有的 React 高级组件与 Vite 构建工具链：

```powershell
# 首次运行前编译一次前端（仅需几秒）
d:\AnimaLoraStudio\venv\Scripts\python.exe studio_data\dataset_tools\build_ui.py

# 启动本地 Web 服务并自动在浏览器打开
d:\AnimaLoraStudio\venv\Scripts\python.exe studio_data\dataset_tools\webapp.py --port 8765 --open
```

* 网页右上角点击 **`【🧘 禅模式 (Z)】`**，或在图片上点击 **🔍 放大镜**，即可切入沉浸式全屏复审与标注！

---

## 📚 详细文档导航 (Detailed Documentation)

为了让每个使用场景都有详尽的技术参考与指导，请查阅 `docs/` 下的各专题细则：

| 细则文档 | 涵盖内容 |
| :--- | :--- |
| 📖 [**CLI 完整使用说明**](file:///D:/AnimaLoraStudio/studio_data/dataset_tools/docs/01_cli_guide.md) | 全子命令详解（`scan`、`ls`、`edit`、`select`、`sheet`、`restore` 等）、全部过滤参数、位置添加与清洗命令示例。 |
| 🧘 [**Web UI 与 禅模式全景指南**](file:///D:/AnimaLoraStudio/studio_data/dataset_tools/docs/02_webui_and_zen_mode.md) | Web 工作台布局、全键盘流盲操速查表、画质分桶预警、多层级折叠目录树、双通道标注、镜像淘汰与空目录清理。 |
| 🏗️ [**架构设计与运行时覆盖层**](file:///D:/AnimaLoraStudio/studio_data/dataset_tools/docs/03_architecture_and_overlay.md) | 深度解析如何借助 Runtime Overlay 实现对宿主 `studio/` 源码 0 侵入，确保上游 Git 更新完全免疫。 |
| ⚠️ [**局限性与后续路线图**](file:///D:/AnimaLoraStudio/studio_data/dataset_tools/docs/04_limitations_and_roadmap.md) | 不保证实现的内容、当前已知技术边界、未来 AI 打标模型接入、感知哈希视觉去重等开放路线。 |

---

## 📁 目录结构概览

```
studio_data/dataset_tools/
├── README.md               # 本文档（总览入口）
├── cli.py                  # CLI 命令行入口
├── webapp.py               # 本地 Web 服务（FastAPI，提供原图、淘汰镜像与切分接口）
├── build_ui.py             # Web UI 编译脚本（挂载符号链接并构建产物）
├── dskit.bat               # Windows 便捷批处理启动器
├── docs/                   # 专题细则文档目录
│   ├── 01_cli_guide.md                 # CLI 详细参考手册
│   ├── 02_webui_and_zen_mode.md        # Web UI 与禅模式操作指南
│   ├── 03_architecture_and_overlay.md  # 架构设计与运行时动态补丁机制
│   └── 04_limitations_and_roadmap.md   # 局限性、不保证事项与后续路线图
├── dskit/                  # 核心适配层与增强引擎
│   ├── bootstrap.py        # 宿主仓库定位、权威符号检查与补丁挂载
│   ├── overlay.py          # 运行时动态覆盖层（Prose 读写保护、索引加 Tag 等）
│   ├── cleaner.py          # 宏观开篇正则与句法密度切分算法、格式规范化
│   ├── reject.py           # 深度镜像相对目录归档、伴生文件打包、空目录清理
│   ├── curate.py           # 训练分组文件复制/移动逻辑
│   ├── selector.py         # Tag / Glob / Regex 高性能筛选谓词
│   ├── editops.py          # 批量编辑原子事务编排与 Dry-run 拦截
│   ├── backup.py           # byte 级原子还原点与逆序回滚引擎
│   ├── sheet.py            # 离线单文件 HTML 图片墙生成器
│   └── scope.py            # 任意深度文件夹作用域映射
├── ui/                     # Web UI 前端工程
│   ├── src/
│   │   ├── main.tsx        # 主界面工作台骨架（AppShell、图片网格、TagStatsPanel）
│   │   ├── api.ts          # 前端 HTTP 请求适配层
│   │   └── ZenMode/        # 沉浸式禅模式独立解耦子模块
│   │       ├── ZenModeModal.tsx      # 全屏 HUD 主容器
│   │       ├── useZenHotkeys.ts      # 键盘/滚轮状态机 Hook
│   │       ├── ZenFolderTree.tsx     # 左侧可折叠多层级文件树与双向联动
│   │       ├── ZenTopBar.tsx         # 顶部状态栏（徽章、分桶胶囊、空目录清理）
│   │       ├── ZenImageViewer.tsx    # 原图自适应展示视口
│   │       ├── ZenCaptionEditor.tsx  # 双通道标注与自动写盘编辑器
│   │       └── types.ts              # 禅模式专有类型定义
│   └── dist/               # 生产编译产物（已打包就绪）
├── backups/                # 写操作自动生成的还原点目录
└── sheets/                 # 导出的 HTML 图片墙目录
```
