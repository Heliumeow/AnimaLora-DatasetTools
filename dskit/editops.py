"""批量 tag 编辑 —— 直接转发上游 `tagedit`，本模块只负责编排。

`add_tags` / `remove_tags` / `replace_tag` / `dedupe` 全部原样调用
`studio/services/dataset/tagedit.py` 的实现，一行 tag 变换规则都没有复制。

**dry-run 怎么做到「精确」而不是「猜」**
上游把「算出新 tag 列表」和「写盘」写在同一个循环里，没有可复用的纯函数。
与其自己重写一遍变换规则（那就成了第二个真相来源），这里用一个更稳的办法：
调用上游函数时，临时把上游模块里的 `write_tags` 换成「只记录、不落盘」的
版本。上游的真实逻辑照跑，只有最后一步写入被拦截 —— 于是预览结果和真正
执行的结果**必然一致**，也不会因为上游改规则而失真。
"""
from __future__ import annotations

import threading
from contextlib import contextmanager
from dataclasses import dataclass, field
from pathlib import Path

from .backup import Backup
from .bootstrap import repo_tagedit
from .cleaner import SanitizeOptions, sanitize_tags
from .scope import ImageRef, scope_for, train_dir_for
from .selector import ImageRow

__all__ = ["EditOp", "EditResult", "run_edit"]

#: 拦截 write_tags 期间必须独占 —— 上游模块全局只有一份，Web UI 可能并发
_PATCH_LOCK = threading.Lock()


@dataclass
class EditOp:
    """要做的 tag 变换。kind 决定读哪几个字段。"""

    kind: str  # add | remove | replace | dedupe | set | sanitize
    tags: list[str] = field(default_factory=list)
    position: str | int = "back"   # add 用：front | back | 整数索引 (如 0, 1, 2)
    move_existing: bool = False    # add 用：若 tag 已存在是否移到目标位置
    old: str = ""
    new: str = ""
    sanitize_opts: dict = field(default_factory=dict)
    prose: str | None = None

    def describe(self) -> str:
        if self.kind == "add":
            pos_str = str(self.position).strip().lower()
            if pos_str == "front" or pos_str == "0":
                where = "开头 (index 0)"
            elif pos_str == "back":
                where = "末尾"
            else:
                where = f"第 {self.position} 位 (index {self.position})"
            move_info = " [已存在则移动到指定位置]" if self.move_existing else ""
            return f"添加 tag 到{where}：{', '.join(self.tags)}{move_info}"
        if self.kind == "remove":
            return f"删除 tag：{', '.join(self.tags)}"
        if self.kind == "replace":
            return f"替换 tag：{self.old!r} → {self.new!r}"
        if self.kind == "dedupe":
            return "去重（保持原顺序）"
        if self.kind == "set":
            prose_info = f"（附带自然语言描述：{len(self.prose)} 字）" if self.prose else ""
            return f"保存 tag 列表：{', '.join(self.tags) if self.tags else '(清空)'} {prose_info}".strip()
        if self.kind == "sanitize":
            opts = SanitizeOptions(**self.sanitize_opts) if self.sanitize_opts else SanitizeOptions()
            details = []
            if opts.clean_bom_and_invisible:
                details.append("BOM与控制字符")
            if opts.fullwidth_to_halfwidth:
                details.append("半角化")
            if opts.strip_quotes:
                details.append("去引号")
            if opts.strip_custom_chars:
                details.append(f"剥离[{opts.strip_custom_chars}]")
            if opts.spacing_mode != "keep":
                details.append(opts.spacing_mode)
            if opts.case_mode != "keep":
                details.append(opts.case_mode)
            detail_str = f" ({', '.join(details)})" if details else ""
            return f"清洗与格式规范化{detail_str}"
        raise ValueError(f"未知操作：{self.kind}")


@dataclass
class EditResult:
    op: str
    applied: bool
    affected: int
    changes: list[dict]
    backup: Path | None
    total: int

    @property
    def unchanged(self) -> int:
        return self.total - self.affected


@contextmanager
def _capture_writes():
    """把上游 `write_tags` / `write_caption_parts` 换成只记录不落盘的版本，拿到精确的预览结果。"""
    captured: dict[Path, list[str]] = {}
    original = repo_tagedit.write_tags
    original_parts = getattr(repo_tagedit, "write_caption_parts", None)

    def spy(image: Path, tags: list[str]) -> Path:
        captured[Path(image)] = list(tags)
        # 返回值语义是「caption 落在哪」；预览阶段没人用它，给个同 stem 的猜测
        return image.with_suffix(".json") if image.with_suffix(".json").exists() \
            else image.with_suffix(".txt")

    def spy_parts(image: Path, tags: list[str], prose: str = "") -> Path:
        captured[Path(image)] = list(tags)
        return image.with_suffix(".json") if image.with_suffix(".json").exists() \
            else image.with_suffix(".txt")

    with _PATCH_LOCK:
        repo_tagedit.write_tags = spy  # type: ignore[assignment]
        if original_parts is not None:
            repo_tagedit.write_caption_parts = spy_parts  # type: ignore[assignment]
        try:
            yield captured
        finally:
            repo_tagedit.write_tags = original  # type: ignore[assignment]
            if original_parts is not None:
                repo_tagedit.write_caption_parts = original_parts  # type: ignore[assignment]


def _invoke(op: EditOp, scope: dict, train_dir: Path) -> int:
    """调上游做真正的变换，返回上游报的受影响文件数。"""
    if op.kind == "add":
        return repo_tagedit.add_tags(
            scope, train_dir, op.tags,
            position=op.position,
            move_existing=op.move_existing,
        )
    if op.kind == "remove":
        return repo_tagedit.remove_tags(scope, train_dir, op.tags)
    if op.kind == "replace":
        return repo_tagedit.replace_tag(scope, train_dir, op.old, op.new)
    if op.kind == "dedupe":
        return repo_tagedit.dedupe(scope, train_dir)
    if op.kind == "set":
        # 整段覆盖：上游没有批量「set」入口，但 write_tags / write_caption_parts 就是权威写法，
        # 作用域用上游自己的 _scope_image_paths 展开（与其余 op 同一把尺子）。
        n = 0
        for image in repo_tagedit._scope_image_paths(scope, train_dir):
            if op.prose is not None:
                repo_tagedit.write_caption_parts(image, list(op.tags), op.prose)
            else:
                repo_tagedit.write_tags(image, list(op.tags))
            n += 1
        return n
    if op.kind == "sanitize":
        opts = SanitizeOptions(**op.sanitize_opts) if op.sanitize_opts else SanitizeOptions()
        n = 0
        for image in repo_tagedit._scope_image_paths(scope, train_dir):
            cur = repo_tagedit.read_tags(image)
            cleaned = sanitize_tags(cur, opts)
            if cleaned != cur:
                repo_tagedit.write_tags(image, cleaned)
                n += 1
        return n
    raise ValueError(f"未知操作：{op.kind}")


def run_edit(
    rows: list[ImageRow],
    root: Path,
    op: EditOp,
    *,
    apply: bool = False,
    backup: bool = True,
    filter_desc: str = "",
) -> EditResult:
    """对选中的图片执行一次 tag 编辑。

    apply=False（默认）只预览：不建还原点、不写盘。
    apply=True 先登记还原点再落盘，之后可用 `dskit restore <还原点>` 回滚。
    """
    rows = list(rows)
    if not rows:
        return EditResult(op.describe(), apply, 0, [], None, 0)

    refs: list[ImageRef] = [r.ref for r in rows]
    scope = scope_for(refs)
    train_dir = train_dir_for(refs)
    before = {r.ref.path: list(r.tags) for r in rows}

    # 1) 先跑一遍「被拦截的」上游，拿到精确的变换结果。
    #    落盘时也只写这一遍算出来的差异，绝不重算 —— 预览即结果。
    with _capture_writes() as captured:
        _invoke(op, scope, train_dir)
    after = {r.ref.path: captured.get(r.ref.path, before[r.ref.path]) for r in rows}

    changed: list[ImageRow] = [
        r for r in rows
        if before[r.ref.path] != after[r.ref.path]
        or (op.kind == "set" and op.prose is not None and getattr(r, "prose", "") != op.prose)
    ]

    # 2) 还原点：只覆盖真正要变的那些文件（没 caption 的记成"这次新建"）
    store: Backup | None = None
    if apply and backup and changed:
        store = Backup(root=root, op=f"edit-{op.kind}", filter_desc=filter_desc)
        for r in changed:
            cap = repo_tagedit.caption_path(r.ref.path)
            if cap is not None:
                store.save(cap)
            else:
                # 上游 write_tags 在没有任何 caption 时新建同 stem 的 .txt
                store.will_create(r.ref.path.with_suffix(".txt"))

    # 3) 落盘：逐个调用上游 write_tags / write_caption_parts
    if apply:
        for r in changed:
            if op.kind == "set" and op.prose is not None:
                repo_tagedit.write_caption_parts(r.ref.path, list(after[r.ref.path]), op.prose)
            else:
                repo_tagedit.write_tags(r.ref.path, list(after[r.ref.path]))

    changes: list[dict] = []
    for r in changed:
        b = before[r.ref.path]
        a = after[r.ref.path]
        changes.append({
            "rel": r.ref.rel,
            "before": b,
            "after": a,
            "added": [t for t in a if t not in b],
            "removed": [t for t in b if t not in a],
        })

    backup_path = store.commit() if store is not None else None
    return EditResult(
        op=op.describe(),
        applied=apply,
        affected=len(changes),
        changes=changes,
        backup=backup_path,
        total=len(rows),
    )
