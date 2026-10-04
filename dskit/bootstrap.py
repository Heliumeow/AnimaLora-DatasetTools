"""把 AnimaLoraStudio 仓库的既有实现接进来 —— 全仓唯一 import 上游的入口。

为什么单独一个模块：本目录在 `studio_data/` 下（`.gitignore` 覆盖），不是
仓库代码。脚本里**不含**任何 tag 读写 / 图片扫描 / 缩略图逻辑，那些全部
转发给仓库里的权威实现，避免造重复轮子，也避免上游改了行为而脚本偷偷跑偏。

关于绑定 `_` 开头的上游符号
---------------------------
`curation._META_EXTS` / `_validate_folder` / `_validate_filename` /
`_list_image_entries`、`tagedit._imgs_in` / `_scope_image_paths` 在仓库里是
私有名。它们没有公开 API，但确实是那些规则的**单一权威源**（扩展名白名单、
Kohya 文件夹名校验、图片列表口径）。在这里重新实现一份，就等于制造第二个
真相来源，上游改规则时会漂移 —— 那才是真正的技术债。所以选择显式绑定，
并在缺失时**大声报错**指向本文，而不是静默降级成自己的近似实现。
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

#: 用哪个文件判断「这就是 AnimaLoraStudio 仓库根」
_REPO_MARKER = Path("studio") / "services" / "dataset" / "tagedit.py"

#: 仓库根可用环境变量覆盖（本目录被拷出仓库时才需要）
_REPO_ENV = "ANIMALORA_REPO"


class RepoNotFound(RuntimeError):
    """定位不到仓库，或上游重构掉了本工具依赖的符号。"""


def _is_repo(p: Path) -> bool:
    return (p / _REPO_MARKER).is_file()


def find_repo_root() -> Path:
    """按 环境变量 → 从本文件向上找 marker 的顺序定位仓库根。"""
    env = os.environ.get(_REPO_ENV, "").strip()
    if env:
        cand = Path(env).expanduser()
        if not _is_repo(cand):
            raise RepoNotFound(
                f"{_REPO_ENV}={env!r} 不像 AnimaLoraStudio 仓库根"
                f"（缺少 {_REPO_MARKER}）。"
            )
        return cand.resolve()
    for parent in Path(__file__).resolve().parents:
        if _is_repo(parent):
            return parent
    raise RepoNotFound(
        f"找不到 AnimaLoraStudio 仓库根（需要存在 {_REPO_MARKER}）。"
        f"把本目录放回仓库的 studio_data/ 下，或用 {_REPO_ENV} 指定仓库根。"
    )


REPO_ROOT = find_repo_root()
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))


def _bind(module, *names: str):
    """确认上游还有这些符号；缺了就直接报错，别让脚本跑出半对的结果。"""
    missing = [n for n in names if not hasattr(module, n)]
    if missing:
        raise RepoNotFound(
            f"上游 {module.__name__} 已没有 {', '.join(missing)} —— "
            "AnimaLoraStudio 重构了这些符号。请更新 "
            "studio_data/dataset_tools/dskit/bootstrap.py 的绑定表，"
            "让它指向新的权威实现（不要在本工具里复制一份逻辑）。"
        )
    return module


# --------------------------------------------------------------------------
# 上游模块
# --------------------------------------------------------------------------
from studio.infrastructure import paths as repo_paths  # noqa: E402
from studio.services.dataset import browse as repo_browse  # noqa: E402
from studio.services.dataset import curation as repo_curation  # noqa: E402
from studio.services.dataset import scan as repo_scan  # noqa: E402
from studio.services.dataset import tagedit as repo_tagedit  # noqa: E402
from studio.services.dataset import thumb_cache as repo_thumb_cache  # noqa: E402
from studio.services.tagging import caption_format as repo_caption_format  # noqa: E402

_bind(
    repo_scan,
    "IMAGE_EXTS", "parse_repeat", "caption_kind",
    "scan_folder", "scan_dataset_root",
)
_bind(
    repo_tagedit,
    "caption_path", "read_tags", "write_tags", "stats",
    "add_tags", "remove_tags", "replace_tag", "dedupe",
    "list_captions_in_folder", "list_all_captions", "read_one", "write_one",
    "_imgs_in", "_scope_image_paths",
)
_bind(
    repo_curation,
    "_FOLDER_PATTERN", "_META_EXTS", "_validate_folder", "_validate_filename",
    "_list_image_entries",
)
_bind(repo_thumb_cache, "get_or_make_thumb", "clear_cache")
_bind(repo_paths, "REPO_ROOT", "STUDIO_DATA", "safe_join", "validate_path_component")
_bind(repo_browse, "list_dir")
_bind(repo_caption_format, "caption_json_to_tags", "split_tags")

# --------------------------------------------------------------------------
# 本项目自己的目录（都落在 studio_data/ 下，不进 git）
# --------------------------------------------------------------------------
#: 本工具集根目录 —— studio_data/dataset_tools/
TOOLS_DIR = Path(__file__).resolve().parent.parent
#: 改 tag / 复制移动前的还原点
BACKUP_DIR = TOOLS_DIR / "backups"
#: HTML 图片墙默认输出目录
SHEET_DIR = TOOLS_DIR / "sheets"

# --------------------------------------------------------------------------
# 便捷别名（脚本里用这些短名，一眼能看出是上游能力）
# --------------------------------------------------------------------------
#: 上游的图片扩展名白名单 —— 不要在这里另写一份
IMAGE_EXTS = repo_scan.IMAGE_EXTS
#: 上游认定「和图片同 stem 的 caption 后缀」
META_EXTS = repo_curation._META_EXTS
#: studio_data 实际位置（可能被 studio_data_location.json 指针改写）
STUDIO_DATA = repo_paths.STUDIO_DATA
#: 缩略图缓存目录（studio_data/thumb_cache）—— 与 Studio 本体共用
THUMB_CACHE_DIR = repo_paths.THUMB_CACHE_DIR

# --------------------------------------------------------------------------
# 挂载运行时增强补丁（保持宿主 studio 目录源码 100% 纯净）
# --------------------------------------------------------------------------
from .overlay import apply_runtime_patches  # noqa: E402
apply_runtime_patches()

__all__ = [
    "REPO_ROOT", "STUDIO_DATA", "TOOLS_DIR", "BACKUP_DIR", "SHEET_DIR",
    "THUMB_CACHE_DIR", "IMAGE_EXTS", "META_EXTS", "RepoNotFound",
    "repo_paths", "repo_browse", "repo_curation", "repo_scan", "repo_tagedit",
    "repo_thumb_cache", "repo_caption_format",
]
