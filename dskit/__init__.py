"""dskit —— 在**任意文件夹**上复用 AnimaLoraStudio 既有的图片选择 / tag 能力。

本包不含业务逻辑，只有一层适配：
    studio_data/dataset_tools/dskit/bootstrap.py  定位仓库并绑定上游符号
    studio_data/dataset_tools/dskit/scope.py      任意文件夹 → 上游作用域
    studio_data/dataset_tools/dskit/selector.py   tag 筛选谓词（上游没有这一层）
    studio_data/dataset_tools/dskit/editops.py    批量改 tag（转发上游 tagedit）
    studio_data/dataset_tools/dskit/curate.py     图片选择（复用上游 curation 语义）
    studio_data/dataset_tools/dskit/backup.py     还原点
    studio_data/dataset_tools/dskit/sheet.py      静态 HTML 图片墙
"""
from .backup import Backup, list_backups, restore
from .bootstrap import (
    BACKUP_DIR,
    IMAGE_EXTS,
    META_EXTS,
    REPO_ROOT,
    STUDIO_DATA,
    TOOLS_DIR,
)
from .curate import (
    GroupResult,
    copy_to_group,
    default_dest_dir,
    list_groups,
    remove_from_group,
    validate_group,
)
from .editops import EditOp, EditResult, run_edit
from .reject import (
    ToggleRejectResult,
    clean_empty_directories,
    default_reject_dir,
    toggle_reject,
)
from .scope import ImageRef, iter_folders, iter_images, resolve_root, scope_for
from .selector import ImageRow, Selector, load_pick_file, select, sort_rows
from .sheet import build_sheet

__all__ = [
    "REPO_ROOT", "STUDIO_DATA", "TOOLS_DIR", "BACKUP_DIR", "IMAGE_EXTS", "META_EXTS",
    "ImageRef", "iter_images", "iter_folders", "resolve_root", "scope_for",
    "Selector", "ImageRow", "select", "sort_rows", "load_pick_file",
    "EditOp", "EditResult", "run_edit",
    "Backup", "restore", "list_backups",
    "copy_to_group", "remove_from_group", "list_groups", "default_dest_dir",
    "validate_group", "GroupResult",
    "toggle_reject", "default_reject_dir", "clean_empty_directories", "ToggleRejectResult",
    "build_sheet",
]
