# CLI 完整使用说明 (CLI Reference Guide)

`cli.py` 是 `dataset_tools (dskit)` 的核心命令行工具。它不需要任何前端编译与 Node.js 运行时环境，仅依赖仓库已有的 Python 虚拟环境即可直接运行。

---

## 一、运行环境与命令前缀

在 Windows PowerShell 或 CMD 中运行以下命令。建议使用仓库根目录的虚拟环境解释器：

```powershell
# 指定 Python 解释器
d:\AnimaLoraStudio\venv\Scripts\python.exe studio_data\dataset_tools\cli.py <子命令> [参数...]

# 或者使用便捷启动器批处理文件（已处理编码）：
studio_data\dataset_tools\dskit.bat <子命令> [参数...]
```

---

## 二、通用安全与全局选项

* **`--apply`**：写盘开关。**所有编辑、复制、移动、还原命令默认都是 dry-run（只预览演练，绝不动盘）**。只有显式提供 `--apply` 才会真正写入磁盘。
* **`--no-backup`**：跳过写入前的自动还原点备份（默认会在落盘前自动留存还原点）。
* **`--json`**：以机器可读的标准 JSON 格式输出结果。
* **`--no-recursive`**：仅扫描指定根目录当前层级，不递归子文件夹。
* **`--include-hidden`**：包含以 `.` 开头的隐藏文件或目录（默认跳过）。

---

## 三、通用筛选器选项 (Filtering Options)

适用于 `ls`、`files`、`edit`、`select`、`tags` 等绝大部分子命令：

| 参数 | 说明 | 示例 |
| :--- | :--- | :--- |
| `--tag <TAG>` | 包含该 tag（可多次指定，任一满足即命中，OR 逻辑） | `--tag 1girl --tag 1boy` |
| `--all-tags <TAGS>` | 必须全部包含的 tags（英文逗号分隔，AND 逻辑） | `--all-tags "1girl,solo,smile"` |
| `--not-tag <TAG>` | 包含该 tag 即排除（可多次指定） | `--not-tag bad_hands` |
| `--tag-regex <REGEX>` | 正则表达式匹配任意 tag | `--tag-regex "^year\s+202\d$"` |
| `--folder <GLOB>` | 相对 root 的文件夹 glob 匹配（支持 `**` 跨层） | `--folder "10_girl/**"` |
| `--name <GLOB>` | 文件名 glob 匹配 | `--name "*_thumb.*"` |
| `--has-caption` | 仅挑选存在 `.txt` 或 `.json` caption 的图片 | `--has-caption` |
| `--no-caption` | 仅挑选缺失 caption 的孤立图片 | `--no-caption` |
| `--min-tags <N>` | 标签数量下限 | `--min-tags 10` |
| `--max-tags <N>` | 标签数量上限 | `--max-tags 30` |
| `--from-file <FILE>` | 从外部清单文件中读取相对路径过滤列表 | `--from-file pick.txt` |
| `--limit <N>` | 限制处理的最大图片数量 | `--limit 50` |
| `--sort <KEY>` | 排序字段：`path`（默认）、`name`、`folder`、`tags`（标签多优先）、`mtime` | `--sort tags` |
| `--reverse` | 倒序排列 | `--reverse` |

---

## 四、子命令详解

### 1. `info` —— 查看仓库符号绑定状态
用于自证当前工具是否成功挂载并复用了宿主仓库的权威模块。
```powershell
python studio_data\dataset_tools\cli.py info
```

### 2. `scan` —— 数据集全貌概览
递归统计图片总量、各子目录包含图片数、Caption 类型分布（txt/json/none）及 Kohya `5_concept` 权重步数计算。
```powershell
python studio_data\dataset_tools\cli.py scan "D:\dataset"
```

### 3. `ls` —— 列表与内容预览
根据筛选条件输出符合要求的图片清单，显示路径、Tag 数量与前几个代表性 Tag。
```powershell
python studio_data\dataset_tools\cli.py ls "D:\dataset" --tag 1girl --sort tags --limit 20
```

### 4. `tags` —— 全局 Tag 词频统计
按上游 `tagedit.stats` 口径统计筛选范围内所有图片的 Tag 出现频次与占比，排查常见标签与罕见错词。
```powershell
python studio_data\dataset_tools\cli.py tags "D:\dataset" --top 50
```

### 5. `edit` —— 核心批量标注修改器
支持 6 种原子操作之一（`--add` / `--remove` / `--replace` / `--dedupe` / `--set` / `--sanitize`）：

#### (1) 在指定位置添加 Tag (`--add`)
支持插入开头、末尾或任意数字索引位置，支持自动重新排序已有 Tag：
```powershell
# 1. 添加到最开头 (front / index 0)
python studio_data\dataset_tools\cli.py edit "D:\dataset" \
    --tag 1girl --add "masterpiece, best quality" --position front --apply

# 2. 插入到第 2 位 (index 1)，若已存在则将其移动到目标位置
python studio_data\dataset_tools\cli.py edit "D:\dataset" \
    --add "special_trigger" --at-index 1 --move-existing --apply
```

#### (2) 批量删除 Tag (`--remove`)
```powershell
python studio_data\dataset_tools\cli.py edit "D:\dataset" \
    --remove "low quality, worst quality, text" --apply
```

#### (3) 批量重命名 / 替换 Tag (`--replace`)
```powershell
python studio_data\dataset_tools\cli.py edit "D:\dataset" \
    --old "outdoors" --new "outdoor" --apply
```

#### (4) 保持原顺序去重 (`--dedupe`)
```powershell
python studio_data\dataset_tools\cli.py edit "D:\dataset" --dedupe --apply
```

#### (5) 格式清洗与规范化 (`--sanitize`)
集成 BOM 清除、全角半角转换、空格下划线统一、大小写转换与特殊字符过滤：
```powershell
# 全量清洗：清除BOM、半角化、去引号、空格转下划线、全部小写
python studio_data\dataset_tools\cli.py edit "D:\dataset" \
    --sanitize --halfwidth --strip-quotes --spacing space_to_underscore --case lowercase --apply

# 剥离指定干扰字符（例如去除 @ 符号）
python studio_data\dataset_tools\cli.py edit "D:\dataset" \
    --sanitize --strip-chars "@#" --apply
```

### 6. `select` —— 挑选并归档至训练分组
将符合条件的图片连同同 stem 伴生标注（`.txt`、`.json`、`.bak`）一同复制或移动至目标训练分组。
```powershell
# 复制命中素材至 D:\dataset__selected\10_girl
python studio_data\dataset_tools\cli.py select "D:\dataset" \
    --tag 1girl --group "10_girl" --apply

# 剪切/移动模式
python studio_data\dataset_tools\cli.py select "D:\dataset" \
    --tag 1girl --group "10_girl" --move --apply
```

### 7. `sheet` —— 离线单文件 HTML 图片墙导出
在不需要起本地 Web 服务的情况下，生成一个内嵌极速浏览与筛选交互的独立单文件 HTML 网页报表。
```powershell
python studio_data\dataset_tools\cli.py sheet "D:\dataset" --out "D:\report.html" --top-tags 40
```

### 8. `backups` 与 `restore` —— 还原点与灾难恢复
每次写盘均会自动记录精确变更文件与修改前状态：
```powershell
# 列出最近 20 个还原点
python studio_data\dataset_tools\cli.py backups

# 预览还原点回滚计划（dry-run）
python studio_data\dataset_tools\cli.py restore "studio_data/dataset_tools/backups/20261003-xxxx/manifest.json"

# 确认无误，真写回滚恢复文件
python studio_data\dataset_tools\cli.py restore "studio_data/dataset_tools/backups/20261003-xxxx/manifest.json" --apply
```
