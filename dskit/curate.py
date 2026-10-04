"""图片选择（「未分配素材 → 训练分组」）—— 复用上游 curation 的文件系统语义。

原仓库这一步在 `studio/services/dataset/curation.py`：
`copy_download_to_train` = 复制图片 + **同 stem 的 .txt/.json 一起带走**，目标
已存在就 skip；`remove_from_train` = 删分组里的图 + 同 stem metadata，源不动。
本模块严格照这个语义实现，并直接绑定上游的 `_META_EXTS` /
`_validate_folder` / `_validate_filename` —— 规则只有一份。

**分组放哪**
原功能的「未分配素材」（download/）和「训练分组」（train/）是**兄弟目录**。
这里保持一致：默认 `目标根 = root 的兄弟目录 <root名>__selected/`，分组是它
下面的子文件夹。这样扫源目录时永远看不到自己复制出来的产物（不会自我污染），
也可以 `--dest-dir` 指到任何地方。
"""
from __future__ import annotations

import shutil
from dataclasses import dataclass
from pathlib import Path

from .backup import Backup
from .bootstrap import repo_curation, repo_scan
from .scope import ImageRef

__all__ = ["default_dest_dir", "validate_group", "copy_to_group",
           "remove_from_group", "list_groups", "GroupResult"]


def default_dest_dir(root: Path) -> Path:
    """`D:\\pics` → `D:\\pics__selected`（源目录的兄弟，不污染源树）。"""
    root = Path(root)
    return root.parent / f"{root.name}__selected"


def validate_group(name: str) -> str:
    """分组名走上游 `curation._validate_folder` —— 与 Studio 本体的规则一致。

    顺带说明：上游允许 Kohya 的 `5_concept` 形式，所以分组名可以直接写成
    训练集的重复次数前缀。
    """
    name = (name or "").strip()
    try:
        repo_curation._validate_folder(name)
    except Exception as exc:  # DomainError 等，统一翻成 ValueError 给 CLI 层
        raise ValueError(
            f"分组名 {name!r} 不合法（上游规则 {repo_curation._FOLDER_PATTERN.pattern}）：{exc}"
        ) from exc
    return name


@dataclass
class GroupResult:
    group: str
    dest: Path
    moved: bool
    copied: list[str]
    skipped: list[str]
    missing: list[str]
    backup: Path | None

    @property
    def written(self) -> int:
        return len(self.copied)


def _meta_siblings(img: Path) -> list[Path]:
    """同 stem 的 caption 文件（上游认定要跟着图片一起走的那些）。"""
    return [img.with_suffix(ext) for ext in repo_curation._META_EXTS
            if img.with_suffix(ext).is_file()]


def copy_to_group(
    refs: list[ImageRef],
    dest_dir: Path,
    group: str,
    *,
    move: bool = False,
    apply: bool = False,
    backup: bool = True,
    root: Path | None = None,
    filter_desc: str = "",
) -> GroupResult:
    """把选中的图片复制（或 `move=True` 时移动）进 `dest_dir/group/`。"""
    group = validate_group(group)
    dest_dir = Path(dest_dir).expanduser()
    target = dest_dir / group
    copied: list[str] = []
    skipped: list[str] = []
    missing: list[str] = []

    store: Backup | None = None
    if apply and backup:
        store = Backup(
            root=Path(root) if root else (refs[0].root if refs else dest_dir),
            op=f"{'move' if move else 'copy'}-to-{group}",
            filter_desc=filter_desc,
        )

    for ref in refs:
        src = ref.path
        if not src.is_file():
            missing.append(ref.rel)
            continue
        dst = target / ref.name
        if dst.exists():
            # 与上游 copy_download_to_train 一致：已存在就跳过，不覆盖
            skipped.append(ref.rel)
            continue
        copied.append(ref.rel)
        if not apply:
            continue

        target.mkdir(parents=True, exist_ok=True)
        payload = [src, *_meta_siblings(src)]
        for item in payload:
            dp = target / item.name
            if store is not None:
                if move:
                    store.will_move(item, dp)
                else:
                    store.will_create(dp)
            if move:
                shutil.move(str(item), str(dp))
            else:
                shutil.copy2(item, dp)

    backup_path = store.commit() if store is not None else None
    return GroupResult(
        group=group, dest=target, moved=move,
        copied=copied, skipped=skipped, missing=missing, backup=backup_path,
    )


def remove_from_group(
    dest_dir: Path,
    group: str,
    names: list[str],
    *,
    apply: bool = False,
    backup: bool = True,
    root: Path | None = None,
    filter_desc: str = "",
) -> GroupResult:
    """从分组里移除（删图片 + 同 stem metadata），源目录不动 —— 对应 remove_from_train。"""
    group = validate_group(group)
    target = Path(dest_dir).expanduser() / group
    removed: list[str] = []
    missing: list[str] = []

    store: Backup | None = None
    if apply and backup:
        store = Backup(
            root=Path(root) if root else target,
            op=f"remove-from-{group}",
            filter_desc=filter_desc,
        )

    for name in names:
        # 上游 _validate_filename：单段文件名，不含路径分隔符
        try:
            repo_curation._validate_filename(name)
        except Exception:
            missing.append(name)
            continue
        img = target / name
        if not img.is_file():
            missing.append(name)
            continue
        removed.append(name)
        if not apply:
            continue
        payload = [img, *_meta_siblings(img)]
        if store is not None:
            for item in payload:
                store.save(item)
        for item in payload:
            item.unlink(missing_ok=True)

    backup_path = store.commit() if store is not None else None
    return GroupResult(
        group=group, dest=target, moved=False,
        copied=removed, skipped=[], missing=missing, backup=backup_path,
    )


def list_groups(dest_dir: Path) -> list[dict]:
    """列出目标根下已有的分组 —— 每组的图片数走上游 `scan.scan_folder`。"""
    dest_dir = Path(dest_dir).expanduser()
    if not dest_dir.is_dir():
        return []
    out: list[dict] = []
    for d in sorted((p for p in dest_dir.iterdir() if p.is_dir()),
                    key=lambda p: p.name.lower()):
        info = repo_scan.scan_folder(d)
        out.append({
            "name": d.name,
            "path": str(d),
            "image_count": info.get("image_count", 0),
            "caption_types": info.get("caption_types", {}),
        })
    return out
