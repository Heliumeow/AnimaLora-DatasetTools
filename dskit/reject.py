"""深度镜像淘汰与归档 (LoRA Dataset Reject & Cull)

借鉴并继承 studio_data/select pic/select_pic.py 的核心设计：
1. 深度镜像多层级目录归档：保持多级相对路径，在源目录与淘汰目录间毫秒级原位迁移。
2. 伴生文件全家桶打包：.txt, .json, .caption, .txt.bak, .caption.bak 等伴生文件一同移动。
3. 双向原位切换 (Toggle Reject / Accept)：支持秒级撤销与放回。
4. 空目录递归清理：支持清理因文件迁移而遗留的空文件夹。
"""
from __future__ import annotations

import os
import shutil
from dataclasses import dataclass
from pathlib import Path

from .bootstrap import repo_curation

# 伴生文件扩展名（在上游 _META_EXTS 基础上增加备份与扩展标注文件）
EXTRA_META_EXTS = (
    ".txt", ".json", ".caption", ".txt.bak", ".caption.bak",
    ".tags", ".tags.bak", ".prompt", ".prompt.bak"
)


def get_meta_siblings(file_path: Path) -> list[Path]:
    """寻找与图片同名同路径的所有伴生标注与备份文件。"""
    siblings: list[Path] = []
    all_exts = set(repo_curation._META_EXTS) | set(EXTRA_META_EXTS)
    stem_name = file_path.stem
    parent = file_path.parent
    for ext in all_exts:
        candidate = parent / f"{stem_name}{ext}"
        if candidate.is_file() and candidate.resolve() != file_path.resolve():
            siblings.append(candidate)
    return siblings


@dataclass
class ToggleRejectResult:
    rel: str
    status: str              # 'reject' | 'accept'
    src_base: str
    dest_base: str
    moved_files: list[str]
    applied: bool

    def to_dict(self) -> dict:
        return {
            "rel": self.rel,
            "status": self.status,
            "src_base": self.src_base,
            "dest_base": self.dest_base,
            "moved_files": self.moved_files,
            "applied": self.applied,
        }


def default_reject_dir(root: Path) -> Path:
    """默认淘汰目录：`D:\\dataset` -> `D:\\dataset_rejected`（父目录下平行淘汰目录）。"""
    root = Path(root).resolve()
    return root.parent / f"{root.name}_rejected"


def toggle_reject(
    root: Path,
    rel: str,
    reject_dir: Path,
    *,
    apply: bool = True,
) -> ToggleRejectResult:
    """就地在源目录 (root) 与淘汰目录 (reject_dir) 之间按相对镜像路径迁移图片及其伴生标注。

    - 若图片当前存在于 root，则迁移至 reject_dir (状态变更为 'reject')；
    - 若图片已存在于 reject_dir，则原路迁移回 root (状态变更为 'accept')；
    - 伴生标注全家桶同步移动，自动创建多级目标父目录。
    """
    root = Path(root).resolve()
    reject_dir = Path(reject_dir).resolve()
    rel_clean = rel.replace("\\", "/").strip("/")

    path_in_root = root / rel_clean
    path_in_reject = reject_dir / rel_clean

    if path_in_root.is_file():
        # 从 root -> reject_dir
        src_img = path_in_root
        dst_img = path_in_reject
        new_status = "reject"
        src_base = str(root)
        dest_base = str(reject_dir)
    elif path_in_reject.is_file():
        # 从 reject_dir -> root
        src_img = path_in_reject
        dst_img = path_in_root
        new_status = "accept"
        src_base = str(reject_dir)
        dest_base = str(root)
    else:
        raise FileNotFoundError(f"图片在源目录和淘汰目录均不存在：{rel_clean}")

    # 获取所有需要移动的配对文件（主图 + 伴生标注）
    payload = [src_img, *get_meta_siblings(src_img)]
    moved_files: list[str] = []

    for src_file in payload:
        # 计算在目标基准目录下的镜像路径
        rel_from_src = src_file.relative_to(Path(src_base))
        dst_file = Path(dest_base) / rel_from_src
        moved_files.append(str(rel_from_src).replace("\\", "/"))

        if apply:
            dst_file.parent.mkdir(parents=True, exist_ok=True)
            shutil.move(str(src_file), str(dst_file))

    return ToggleRejectResult(
        rel=rel_clean,
        status=new_status,
        src_base=src_base,
        dest_base=dest_base,
        moved_files=moved_files,
        applied=apply,
    )


def clean_empty_directories(directories: list[Path]) -> int:
    """递归清理空文件夹（自底向上扫描，避免误删非空目录）。"""
    removed_count = 0
    for base in directories:
        base_path = Path(base).resolve()
        if not base_path.is_dir():
            continue
        # topdown=False 确保由深到浅先删最里层空目录
        for root_dir, dirs, files in os.walk(str(base_path), topdown=False):
            dir_p = Path(root_dir)
            if dir_p == base_path:
                continue
            try:
                # 若目录为空，删除
                if not any(dir_p.iterdir()):
                    dir_p.rmdir()
                    removed_count += 1
            except OSError:
                pass
    return removed_count
