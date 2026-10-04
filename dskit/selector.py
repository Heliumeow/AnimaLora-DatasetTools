"""图片筛选谓词 —— 对应前端「标签编辑」页在浏览器里做的那层过滤。

为什么要自己实现：仓库后端**没有** tag 筛选函数。`TagEdit.tsx` 是用
`folderFilter` + `filteredKeys` + `(cache.get(k) ?? []).includes(tag)` 在
前端筛的（`TagStatsPanel` 点 tag → 过滤列表）。所以「按 tag 选图」这一层
在脚本侧必须补上 —— 但 tag 的**读取**仍然只走 `tagedit.read_tags`，本模块
只负责「给定 tag 列表，要不要这张图」的匹配规则，不碰 caption 解析。
"""
from __future__ import annotations

import fnmatch
import re
from dataclasses import dataclass, field
from pathlib import Path

from .bootstrap import repo_tagedit
from .scope import ImageRef

__all__ = ["Selector", "ImageRow", "select", "sort_rows", "norm_tag", "load_pick_file"]


def norm_tag(tag: str) -> str:
    """tag 比较用的规范化形式（大小写不敏感、去首尾空白）。"""
    return tag.strip().casefold()


def load_pick_file(path) -> list[str]:
    """读一份「选中清单」（`files` 子命令 / HTML 图片墙导出的那种）。

    每行一个相对 root 的路径；`#` 开头与空行忽略；兼容 Windows 反斜杠。
    """
    out: list[str] = []
    for raw in Path(path).read_text("utf-8-sig").splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        out.append(line.replace("\\", "/"))
    return out


@dataclass
class Selector:
    """一组筛选条件。所有条件是 AND；每个列表内部是 OR。"""

    #: 含其中任意一个 tag（OR）
    any_tags: list[str] = field(default_factory=list)
    #: 必须全部含有的 tag（AND）
    all_tags: list[str] = field(default_factory=list)
    #: 含其中任意一个就排除
    not_tags: list[str] = field(default_factory=list)
    #: 正则，匹配任意一个 tag 即算命中
    tag_regex: str | None = None
    #: 相对 root 的文件夹 glob（`*` / `?` / `**` 语义）
    folders: list[str] = field(default_factory=list)
    #: 文件名 glob
    names: list[str] = field(default_factory=list)
    #: True 只要有 caption / False 只要没有 / None 不限
    has_caption: bool | None = None
    min_tags: int | None = None
    max_tags: int | None = None
    #: 从清单文件直接指定的路径（相对 root），与上面条件取交集
    pick: list[str] = field(default_factory=list)

    #: 输出控制（不参与是否命中，只影响最终列表）
    limit: int | None = None
    sort: str = "path"
    reverse: bool = False

    def __post_init__(self) -> None:
        self._regex = re.compile(self.tag_regex) if self.tag_regex else None
        self._norm_any = {norm_tag(t) for t in self.any_tags}
        self._norm_all = {norm_tag(t) for t in self.all_tags}
        self._norm_not = {norm_tag(t) for t in self.not_tags}
        self._pick = set(self.pick)

    # -- 单张图的判定 ------------------------------------------------------
    def matches(self, ref: ImageRef, tags: list[str]) -> bool:
        if self._pick and ref.rel not in self._pick:
            return False

        if self.folders and not any(
            _glob_folder(g, ref.folder) for g in self.folders
        ):
            return False
        if self.names and not any(fnmatch.fnmatch(ref.name, g) for g in self.names):
            return False

        if self.has_caption is not None:
            has = repo_tagedit.caption_path(ref.path) is not None
            if has != self.has_caption:
                return False

        if self.min_tags is not None and len(tags) < self.min_tags:
            return False
        if self.max_tags is not None and len(tags) > self.max_tags:
            return False

        if self._norm_any or self._norm_all or self._norm_not or self._regex:
            lowered = {norm_tag(t) for t in tags}
            if self._norm_not and (lowered & self._norm_not):
                return False
            if self._norm_all and not self._norm_all <= lowered:
                return False
            if self._norm_any and not (lowered & self._norm_any):
                return False
            if self._regex and not any(self._regex.search(t) for t in tags):
                return False
        return True

    @property
    def is_unfiltered(self) -> bool:
        return not (
            self._norm_any or self._norm_all or self._norm_not or self._regex
            or self.folders or self.names or self._pick
            or self.has_caption is not None
            or self.min_tags is not None or self.max_tags is not None
        )

    def describe(self) -> str:
        """人类可读的条件摘要，写进还原点 manifest 与 dry-run 输出。"""
        bits: list[str] = []
        if self.any_tags:
            bits.append("tag∈{" + ",".join(self.any_tags) + "}")
        if self.all_tags:
            bits.append("含全部{" + ",".join(self.all_tags) + "}")
        if self.not_tags:
            bits.append("排除{" + ",".join(self.not_tags) + "}")
        if self.tag_regex:
            bits.append(f"tag~/{self.tag_regex}/")
        if self.folders:
            bits.append("folder∈{" + ",".join(self.folders) + "}")
        if self.names:
            bits.append("name∈{" + ",".join(self.names) + "}")
        if self.has_caption is not None:
            bits.append("有caption" if self.has_caption else "无caption")
        if self.min_tags is not None:
            bits.append(f"tags>={self.min_tags}")
        if self.max_tags is not None:
            bits.append(f"tags<={self.max_tags}")
        if self.pick:
            bits.append(f"清单{len(self.pick)}项")
        return " 且 ".join(bits) if bits else "（无筛选：全部图片）"


def _glob_folder(pattern: str, folder: str) -> bool:
    """文件夹 glob：`**` 跨层级，`*` 只在本层（与常见 shell 直觉一致）。"""
    folder = folder or ""
    if pattern in ("**", "*"):
        return True
    if fnmatch.fnmatch(folder, pattern):
        return True
    # `a/**` 也要命中 a 本身
    if pattern.endswith("/**") and fnmatch.fnmatch(folder, pattern[:-3]):
        return True
    return False


@dataclass
class ImageRow:
    """一张图 + 它的 tag 与自然语言 prose —— 读一次缓存下来，避免下游重复读盘。"""

    ref: ImageRef
    tags: list[str]
    prose: str = ""
    status: str = "accept"

    @property
    def tag_count(self) -> int:
        return len(self.tags)


def select(
    refs: list[ImageRef], sel: Selector, *, read_tags: bool = True
) -> list[ImageRow]:
    """按条件筛出图片，并统一应用排序 / limit。"""
    rows: list[ImageRow] = []
    for ref in refs:
        if read_tags:
            tags, prose = repo_tagedit.read_caption_parts(ref.path)
        else:
            tags, prose = [], ""
        if sel.matches(ref, tags):
            rows.append(ImageRow(ref=ref, tags=tags, prose=prose))
    return sort_rows(rows, sel)


def sort_rows(rows: list[ImageRow], sel: Selector) -> list[ImageRow]:
    key = sel.sort
    if key == "name":
        fn = lambda r: (r.ref.name.lower(), r.ref.rel.lower())  # noqa: E731
    elif key == "folder":
        fn = lambda r: (r.ref.folder.lower(), r.ref.name.lower())  # noqa: E731
    elif key == "tags":
        # tag 多的排前面（分布浏览时最有用），同名再按路径稳定排序
        fn = lambda r: (-r.tag_count, r.ref.rel.lower())  # noqa: E731
    elif key == "mtime":
        fn = lambda r: (_safe_mtime(r.ref.path), r.ref.rel.lower())  # noqa: E731
    else:  # "path"
        fn = lambda r: r.ref.rel.lower()  # noqa: E731

    rows = sorted(rows, key=fn, reverse=sel.reverse)
    if sel.limit is not None and sel.limit >= 0:
        rows = rows[: sel.limit]
    return rows


def _safe_mtime(p: Path) -> float:
    try:
        return p.stat().st_mtime
    except OSError:
        return 0.0
