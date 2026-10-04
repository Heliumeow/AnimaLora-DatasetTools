"""输出格式化 —— 表格 / JSON，只有排版，没有业务判断。"""
from __future__ import annotations

import json
import sys
from typing import Any, Iterable, Sequence

__all__ = ["table", "kv", "dump_json", "human_bytes", "echo", "warn"]


def _width(text: str) -> int:
    """按终端显示宽度算：CJK 全角字符占 2 列。"""
    return sum(2 if _is_wide(ch) else 1 for ch in text)


def _is_wide(ch: str) -> bool:
    cp = ord(ch)
    return (
        0x1100 <= cp <= 0x115F
        or 0x2E80 <= cp <= 0xA4CF
        or 0xAC00 <= cp <= 0xD7A3
        or 0xF900 <= cp <= 0xFAFF
        or 0xFE30 <= cp <= 0xFE6F
        or 0xFF00 <= cp <= 0xFF60
        or 0xFFE0 <= cp <= 0xFFE6
        or 0x20000 <= cp <= 0x3FFFD
    )


def _pad(text: str, width: int) -> str:
    return text + " " * max(0, width - _width(text))


def table(rows: Iterable[Sequence[Any]], headers: Sequence[str] | None = None) -> str:
    """等宽对齐的表格；空白列宽按内容 + CJK 宽度计算。"""
    cells = [[("" if c is None else str(c)) for c in row] for row in rows]
    if headers:
        cells = [[str(h) for h in headers], *cells]
    if not cells:
        return ""
    ncol = max(len(r) for r in cells)
    for r in cells:
        r.extend([""] * (ncol - len(r)))
    widths = [_width(max((r[i] for r in cells), key=_width, default=""))
              for i in range(ncol)]
    lines = []
    for idx, r in enumerate(cells):
        line = "  ".join(_pad(c, widths[i]) for i, c in enumerate(r)).rstrip()
        lines.append(line)
        if headers and idx == 0:
            lines.append("  ".join("-" * w for w in widths))
    return "\n".join(lines)


def kv(pairs: Iterable[tuple[str, Any]], *, indent: int = 0) -> str:
    """`名称 : 值` 的对齐块。"""
    pairs = [(k, "" if v is None else str(v)) for k, v in pairs]
    if not pairs:
        return ""
    w = max(_width(k) for k, _ in pairs)
    pad = " " * indent
    return "\n".join(f"{pad}{_pad(k, w)} : {v}" for k, v in pairs)


def dump_json(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, indent=2, default=str)


def human_bytes(n: int) -> str:
    step = 1024.0
    value = float(n)
    for unit in ("B", "KB", "MB", "GB", "TB"):
        if value < step or unit == "TB":
            return f"{value:.0f}{unit}" if unit == "B" else f"{value:.1f}{unit}"
        value /= step
    return f"{value:.1f}TB"


def echo(*parts: Any) -> None:
    print(*parts)


def warn(*parts: Any) -> None:
    print(*parts, file=sys.stderr)
