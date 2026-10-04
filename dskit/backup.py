"""还原点 —— 任何会改数据的操作之前先把原状记下来，之后能一键回滚。

用户明确要求「默认 dry-run，--apply 才真写；并提供备份还原点」。本模块实现
后半句：`Backup` 在写入前登记 undo 动作，`commit()` 落一个 `manifest.json`；
`restore()` 读 manifest 逆序回滚。manifest 是自描述的纯 JSON —— 即使脚本哪天
被删了，手写几行 shutil.copy 也能照着它还原。

undo 只有三种原语：
  restore  把备份里的副本写回目标路径
  delete   目标当时不存在、是这次操作新建的 → 删掉
  move     这次是移动 → 从新位置搬回原位置
"""
from __future__ import annotations

import json
import shutil
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from .bootstrap import BACKUP_DIR

__all__ = ["Backup", "restore", "list_backups", "MANIFEST_NAME"]

MANIFEST_NAME = "manifest.json"
_FORMAT_VERSION = 1


def _now_stamp() -> str:
    return datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")


@dataclass
class Backup:
    """一次写入操作的还原点。

    用法：先 `save()` / `will_create()` / `will_move()` 登记，真正写完再
    `commit()`。全程不 commit 就等于什么都没发生过（dry-run 时不会建目录）。
    """

    root: Path
    op: str
    filter_desc: str = ""
    #: False 时所有登记都是空操作（--no-backup）
    enabled: bool = True
    dir: Path | None = None
    _undo: list[dict] = field(default_factory=list, repr=False)
    _files_dir: Path | None = field(default=None, repr=False)

    # -- 登记 ---------------------------------------------------------------
    def save(self, target: Path) -> None:
        """目标现在存在 → 备份一份，undo 时写回。"""
        if not self.enabled or not target.is_file():
            return
        files_dir = self._prepare()
        slot = files_dir / f"{len(self._undo):04d}_{target.name}"
        try:
            shutil.copy2(target, slot)
        except OSError:
            return
        self._undo.append({
            "kind": "restore",
            "target": str(target),
            "saved": str(slot.relative_to(self.dir)),
            "rel": self._rel(target),
        })

    def will_create(self, target: Path) -> None:
        """目标现在不存在、写入会新建它 → undo 时删掉。"""
        if not self.enabled or target.exists():
            return
        self._prepare()
        self._undo.append({
            "kind": "delete",
            "target": str(target),
            "rel": self._rel(target),
        })

    def will_move(self, src: Path, dst: Path) -> None:
        """这次把 src 移到 dst → undo 时搬回去（dst 的内容由 move 自己带回）。"""
        if not self.enabled:
            return
        self._prepare()
        self._undo.append({
            "kind": "move",
            "src": str(src),
            "dst": str(dst),
            "rel": self._rel(src),
        })

    # -- 落盘 ---------------------------------------------------------------
    def commit(self) -> Path | None:
        """写 manifest。没有任何 undo 项就不建目录。"""
        if not self.enabled or not self._undo or self.dir is None:
            return None
        manifest = {
            "version": _FORMAT_VERSION,
            "created": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "op": self.op,
            "filter": self.filter_desc,
            "root": str(self.root),
            "count": len(self._undo),
            "undo": self._undo,
        }
        path = self.dir / MANIFEST_NAME
        path.write_text(
            json.dumps(manifest, ensure_ascii=False, indent=2), "utf-8"
        )
        return path

    # -- 内部 ---------------------------------------------------------------
    def _prepare(self) -> Path:
        if self.dir is None:
            self.dir = _unique_dir(BACKUP_DIR / f"{_now_stamp()}-{_slug(self.op)}")
            self._files_dir = self.dir / "files"
        assert self._files_dir is not None
        self._files_dir.mkdir(parents=True, exist_ok=True)
        return self._files_dir

    def _rel(self, target: Path) -> str:
        try:
            return target.resolve().relative_to(self.root.resolve()).as_posix()
        except ValueError:
            return target.as_posix()


def _slug(text: str) -> str:
    keep = [c if (c.isalnum() or c in "-_") else "-" for c in text.strip()]
    slug = "".join(keep).strip("-")
    while "--" in slug:
        slug = slug.replace("--", "-")
    return (slug or "op")[:40]


def _unique_dir(base: Path) -> Path:
    if not base.exists():
        return base
    for i in range(2, 1000):
        cand = base.with_name(f"{base.name}-{i}")
        if not cand.exists():
            return cand
    raise RuntimeError(f"还原点目录名冲突：{base}")


def list_backups(limit: int = 20) -> list[dict]:
    """列出最近的还原点（新→旧）。"""
    if not BACKUP_DIR.is_dir():
        return []
    out: list[dict] = []
    for d in sorted((p for p in BACKUP_DIR.iterdir() if p.is_dir()), reverse=True):
        man = d / MANIFEST_NAME
        if not man.is_file():
            continue
        try:
            data = json.loads(man.read_text("utf-8"))
        except (OSError, ValueError):
            continue
        out.append({
            "dir": str(d),
            "created": data.get("created", ""),
            "op": data.get("op", ""),
            "filter": data.get("filter", ""),
            "count": data.get("count", len(data.get("undo", []))),
        })
        if len(out) >= limit:
            break
    return out


def restore(backup_dir, *, apply: bool = False) -> dict:
    """按 manifest 逆序回滚。默认只报告将要做什么（dry-run）。"""
    backup_dir = Path(backup_dir).expanduser()
    if backup_dir.is_file() and backup_dir.name == MANIFEST_NAME:
        backup_dir = backup_dir.parent
    manifest_path = backup_dir / MANIFEST_NAME
    if not manifest_path.is_file():
        raise FileNotFoundError(f"还原点缺少 {MANIFEST_NAME}：{backup_dir}")

    data = json.loads(manifest_path.read_text("utf-8"))
    actions: list[dict] = []
    for item in reversed(data.get("undo", [])):
        kind = item.get("kind")
        if kind == "restore":
            src = backup_dir / item["saved"]
            dst = Path(item["target"])
            actions.append({
                "kind": kind, "rel": item.get("rel", dst.name),
                "ok": src.is_file(), "detail": f"{src} → {dst}",
            })
            if apply and src.is_file():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
        elif kind == "delete":
            target = Path(item["target"])
            actions.append({
                "kind": kind, "rel": item.get("rel", target.name),
                "ok": target.exists(), "detail": f"删除 {target}",
            })
            if apply and target.exists():
                target.unlink()
        elif kind == "move":
            src = Path(item["dst"])   # 当前所在（被移过去的位置）
            dst = Path(item["src"])   # 原来的位置
            actions.append({
                "kind": kind, "rel": item.get("rel", dst.name),
                "ok": src.exists(), "detail": f"{src} → {dst}",
            })
            if apply and src.exists():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.move(str(src), str(dst))

    return {
        "backup_dir": str(backup_dir),
        "root": data.get("root", ""),
        "op": data.get("op", ""),
        "applied": apply,
        "actions": actions,
    }
