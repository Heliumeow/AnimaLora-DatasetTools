"""任意文件夹 → 仓库 `tagedit` 作用域的适配层。

上游 `tagedit` 只认一种结构：`train_dir/<子文件夹>/图片`（见
`studio/services/dataset/tagedit.py:_scope_image_paths`）。要在**任意**文件夹
上复用它，本模块统一取：

    train_dir = root.parent
    folder    = 相对 root.parent 的 POSIX 路径

    散图（直接躺在 root 里）→ folder = "root名"
    一级子文件夹            → folder = "root名/sub"
    深层嵌套                → folder = "root名/a/b/c"

于是 `read_one` / `write_one` / `add_tags` / `remove_tags` / `replace_tag` /
`dedupe` / `stats` / `list_captions_in_folder` 全都原样可用 —— 脚本不复制
任何一行 tag 读写逻辑，也不要求用户把数据摆成训练集的样子。
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from .bootstrap import repo_tagedit

__all__ = [
    "ImageRef", "resolve_root", "iter_folders", "iter_images",
    "scope_for", "train_dir_for", "folder_scope",
]


@dataclass(frozen=True)
class ImageRef:
    """一张图在「任意文件夹」坐标系里的位置，同时能翻译成上游 scope 项。"""

    #: 用户指定的根目录（已 resolve）
    root: Path
    #: 相对 root 的 POSIX 目录；"" 表示散图直接躺在 root 里
    folder: str
    name: str

    @property
    def path(self) -> Path:
        return (self.root / self.folder / self.name) if self.folder else (self.root / self.name)

    @property
    def rel(self) -> str:
        """相对 root 的 POSIX 路径 —— 人读 / 写清单文件用这个。"""
        return f"{self.folder}/{self.name}" if self.folder else self.name

    @property
    def train_dir(self) -> Path:
        """喂给上游的作用域根。"""
        return self.root.parent

    @property
    def scope_folder(self) -> str:
        """喂给上游的 folder 参数（相对 root.parent）。"""
        return f"{self.root.name}/{self.folder}" if self.folder else self.root.name

    def as_scope_item(self) -> dict[str, str]:
        return {"folder": self.scope_folder, "name": self.name}


def resolve_root(value) -> Path:
    """把用户给的路径规范化成 root，并挡住上游适配无法表达的情况。"""
    root = Path(value).expanduser()
    if not root.exists():
        raise FileNotFoundError(f"根目录不存在：{root}")
    root = root.resolve()
    if not root.is_dir():
        raise NotADirectoryError(f"不是目录：{root}")
    if root.parent == root:
        # 盘符根（D:\）没有父目录，train_dir = root.parent 会塌成它自己，
        # scope_folder 变成空串。与其产出静默错误的结果，不如直接说清楚。
        raise ValueError(
            f"不能拿盘符根目录当 root：{root}。"
            "上游作用域需要一个父目录来锚定，请指向它下面的某个文件夹。"
        )
    return root


def _sorted_subdirs(d: Path, *, include_hidden: bool) -> list[Path]:
    try:
        subs = [c for c in d.iterdir() if c.is_dir()]
    except OSError:
        return []
    if not include_hidden:
        subs = [c for c in subs if not c.name.startswith(".")]
    return sorted(subs, key=lambda p: p.name.lower())


def iter_folders(
    root: Path, *, recursive: bool = True, include_hidden: bool = False
) -> list[str]:
    """root 下所有需要看的目录，相对 root 的 POSIX 路径，"" 在最前。

    recursive=True（默认）：整棵树，顺序是「父目录紧跟其子树」的先序 DFS。
    recursive=False：只有 `""` 和 root 的**一级**子目录。

    注意这里只产出「目录名」，不含每层的图片数 —— 想知道某一层**直接**
    有几张图，用上游 `scan.scan_folder(那一层)`，别用 `iter_images(那一层)`。
    """
    folders = [""]
    if not recursive:
        folders += [s.name for s in _sorted_subdirs(root, include_hidden=include_hidden)]
        return folders

    stack: list[tuple[Path, str]] = [(root, "")]
    while stack:
        d, rel = stack.pop()
        if rel:
            folders.append(rel)
        subs = _sorted_subdirs(d, include_hidden=include_hidden)
        # 逆序入栈，保证弹出时还是字典序；子目录紧跟在父目录后面（先序）
        for sub in reversed(subs):
            srel = f"{rel}/{sub.name}" if rel else sub.name
            stack.append((sub, srel))
    return folders


def iter_images(
    root: Path, *, recursive: bool = True, include_hidden: bool = False
) -> list[ImageRef]:
    """枚举 root 下所有图片。

    每个目录的图片列表直接调上游 `tagedit._imgs_in`，扩展名白名单 / 排序口径
    与 Studio 本体完全一致，不在这里另立一套。

    `recursive=False` 的语义跟着 `iter_folders` 走：**root 自己 + 它的一级
    子目录**都算，也就是「深度 ≤ 1」。只想数 root 里直接躺着的图，请用
    `[r for r in iter_images(root, recursive=False) if r.folder == ""]`。
    """
    root = resolve_root(root)
    refs: list[ImageRef] = []
    for folder in iter_folders(root, recursive=recursive, include_hidden=include_hidden):
        d = (root / folder) if folder else root
        for img in repo_tagedit._imgs_in(d):
            refs.append(ImageRef(root=root, folder=folder, name=img.name))
    return refs


def scope_for(refs) -> dict:
    """把一批 ImageRef 打包成上游 `{"kind":"files"}` scope。

    假定所有 ref 共享同一个 root（同一次调用里都是），train_dir 取 refs[0] 的。
    """
    refs = list(refs)
    return {"kind": "files", "items": [r.as_scope_item() for r in refs]}


def train_dir_for(refs) -> Path:
    refs = list(refs)
    if not refs:
        raise ValueError("空 scope 没有 train_dir")
    return refs[0].train_dir


def folder_scope(folder: str) -> dict:
    """train_dir 下的单个 folder scope（配合 train_dir_for 用）。"""
    return {"kind": "folder", "name": folder}
