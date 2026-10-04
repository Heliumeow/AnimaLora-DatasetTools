"""运行时适配层与上游补丁 (Runtime Adapter & Monkey Patching)

目标：将所有扩展功能（自然语言 Prose 拆分/拼合、带索引与移动的 tag 添加、防冲掉保护）
完全收敛在 studio_data/dataset_tools 内部，保证宿主仓库 `studio/` 下的文件保持 100% 纯净。
即便上游仓库执行 `git pull` 更新代码，也不会产生任何 git 冲突或覆盖。
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Literal

from .cleaner import combine_caption_text, split_caption_text


def read_caption_parts(image: Path) -> tuple[list[str], str]:
    """统一读 caption（txt / json），返回 (tags, prose)。自动分离纯 tag 列表与自然语言。"""
    from .bootstrap import repo_caption_format, repo_tagedit

    p = repo_tagedit.caption_path(image)
    if p is None:
        return [], ""
    if p.suffix == ".json":
        try:
            data = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            return [], ""
        if isinstance(data, dict):
            tags = data.get("tags")
            if (
                "artist" in data
                or "character" in data
                or "copyright" in data
                or "general" in data
                or "meta" in data
                or "rating" in data
                or "environment" in data
                or "quality" in data
            ):
                tags_list = repo_caption_format.caption_json_to_tags(data)
            elif isinstance(tags, list):
                tags_list = [str(t) for t in tags]
            else:
                tags_list = []
            ai = data.get("ai_output") if isinstance(data.get("ai_output"), dict) else {}
            prose = str(ai.get("nl") or data.get("nl") or "")
            return tags_list, prose
        return [], ""

    # txt: 支持 UTF-8 及带 BOM 的情况，自动切分纯 tags 与自然语言
    try:
        text = p.read_text(encoding="utf-8-sig")
    except UnicodeDecodeError:
        text = p.read_text(encoding="utf-8", errors="replace")
    return split_caption_text(text)


def read_tags_overlay(image: Path) -> list[str]:
    """统一读 caption（txt / json）；不存在 → []。自动排除自然语言部分。"""
    tags, _ = read_caption_parts(image)
    return tags


def write_caption_parts(image: Path, tags: list[str], prose: str = "") -> Path:
    """写 caption（同时保存 tags 与 prose）。已有 .json 就更新；否则写 .txt。"""
    js = image.with_suffix(".json")
    if js.exists():
        try:
            data = json.loads(js.read_text(encoding="utf-8"))
        except Exception:
            data = {}
        if not isinstance(data, dict):
            data = {}
        data["tags"] = list(tags)
        if "ai_output" in data and isinstance(data["ai_output"], dict):
            data["ai_output"]["nl"] = prose
        else:
            data["nl"] = prose
        js.write_text(
            json.dumps(data, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        return js

    txt = image.with_suffix(".txt")
    content = combine_caption_text(tags, prose)
    txt.write_text(content, encoding="utf-8")
    return txt


def write_tags_overlay(image: Path, tags: list[str]) -> Path:
    """写 caption。已有 .json 就更新；否则写 .txt。自动保护原有 prose。"""
    _, old_prose = read_caption_parts(image)
    return write_caption_parts(image, tags, old_prose)


def add_tags_overlay(
    scope: dict[str, Any],
    train_dir: Path,
    tags: list[str],
    *,
    position: Literal["front", "back"] | int | str = "back",
    move_existing: bool = False,
) -> int:
    """对 scope 内所有 caption 加 tags。

    position: "front" (等同于 0), "back" (末尾, 默认), 或数字索引 (如 0, 1, 2, -1)。
    move_existing: 若 True，当 tag 已存在时先从原位置移除再插入目标位置；
                   若 False (默认)，已存在的 tag 直接跳过不重复添加。
    返回受影响文件数。
    """
    from .bootstrap import repo_tagedit

    new = [t.strip() for t in tags if t.strip()]
    if not new:
        return 0
    new_set = set(new)
    affected = 0
    for img in repo_tagedit._scope_image_paths(scope, train_dir):
        cur = repo_tagedit.read_tags(img)
        cur_set = set(cur)
        if move_existing:
            cur_clean = [t for t in cur if t not in new_set]
            to_insert = list(new)
        else:
            cur_clean = list(cur)
            to_insert = [t for t in new if t not in cur_set]

        if not to_insert and cur_clean == cur:
            continue

        pos_str = str(position).strip().lower()
        if pos_str == "front":
            idx = 0
        elif pos_str == "back":
            idx = len(cur_clean)
        else:
            try:
                idx = int(position)
            except (ValueError, TypeError):
                idx = len(cur_clean)

        if idx < 0:
            idx = max(0, len(cur_clean) + idx + 1)

        if idx <= 0:
            merged = to_insert + cur_clean
        elif idx >= len(cur_clean):
            merged = cur_clean + to_insert
        else:
            merged = cur_clean[:idx] + to_insert + cur_clean[idx:]

        if merged != cur:
            repo_tagedit.write_tags(img, merged)
            affected += 1
    return affected


def apply_runtime_patches():
    """在运行时将扩展能力打入上游模块，完全不动磁盘上的仓库源码。"""
    from .bootstrap import repo_caption_format, repo_tagedit

    # 1. 补全 repo_caption_format
    if not hasattr(repo_caption_format, "split_caption_text"):
        repo_caption_format.split_caption_text = split_caption_text
    if not hasattr(repo_caption_format, "combine_caption_text"):
        repo_caption_format.combine_caption_text = combine_caption_text

    # 2. 补全与升级 repo_tagedit
    repo_tagedit.read_caption_parts = read_caption_parts
    repo_tagedit.write_caption_parts = write_caption_parts
    repo_tagedit.read_tags = read_tags_overlay
    repo_tagedit.write_tags = write_tags_overlay
    repo_tagedit.add_tags = add_tags_overlay
