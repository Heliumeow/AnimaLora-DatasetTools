"""构建 dskit 的 Web UI（`studio_data/dataset_tools/ui`）。

    python studio_data/dataset_tools/build_ui.py           # 类型检查 + 构建
    python studio_data/dataset_tools/build_ui.py --skip-check

为什么要有这个脚本：UI 复用仓库前端 `studio/web/src` 的组件，所以它没有自己的
一套依赖 —— 而是把 `ui/node_modules` 做成指向 `studio/web/node_modules` 的
**junction**（Windows 目录联接，不需要管理员权限），再用仓库里那份
TypeScript / Vite 来检查与打包。好处是不会出现第二份 300MB 的 node_modules，
也不会出现两套版本不同的 React。

构建产物在 `ui/dist/`，由 `webapp.py` 挂在 `/`。
"""
from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from dskit.bootstrap import REPO_ROOT  # noqa: E402

TOOLS_DIR = Path(__file__).resolve().parent
UI_DIR = TOOLS_DIR / "ui"
REPO_WEB = REPO_ROOT / "studio" / "web"
REPO_MODULES = REPO_WEB / "node_modules"
UI_MODULES = UI_DIR / "node_modules"

TSC = REPO_MODULES / "typescript" / "bin" / "tsc"
VITE = REPO_MODULES / "vite" / "bin" / "vite.js"


def _fail(message: str) -> int:
    print(f"错误：{message}", file=sys.stderr)
    return 1


def ensure_modules(link: Path = UI_MODULES) -> int:
    """确保 `ui/node_modules` 指向仓库那份（目录联接），缺了就建。"""
    if link.exists():
        return 0
    if not REPO_MODULES.is_dir():
        return _fail(
            f"仓库前端依赖没装：{REPO_MODULES} 不存在。\n"
            f"      先在 {REPO_WEB} 里跑一次 npm install。"
        )
    link.parent.mkdir(parents=True, exist_ok=True)
    # mklink /J 建 junction，不需要管理员；os.symlink 在 Windows 上要特权。
    proc = subprocess.run(
        ["cmd", "/c", "mklink", "/J", str(link), str(REPO_MODULES)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        return _fail(f"创建目录联接失败：{proc.stdout.strip()} {proc.stderr.strip()}")
    print(f"已建立目录联接：{link} -> {REPO_MODULES}")
    return 0


def _run(args: list[str], cwd: Path) -> int:
    print(f"$ {' '.join(args)}")
    proc = subprocess.run(args, cwd=str(cwd))
    return proc.returncode


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="构建 dskit 的 Web UI")
    parser.add_argument("--skip-check", action="store_true",
                        help="跳过 tsc 类型检查，只打包（快，但可能漏掉类型错误）")
    args = parser.parse_args(argv)

    node = shutil.which("node")
    if not node:
        return _fail("PATH 里找不到 node。UI 复用仓库前端的 Vite/React，需要 Node。")

    for tool, name in ((TSC, "typescript"), (VITE, "vite")):
        if not tool.is_file():
            return _fail(f"找不到 {tool}（仓库 {name} 未安装？先在 {REPO_WEB} 跑 npm install）")

    rc = ensure_modules()
    if rc:
        return rc

    if not args.skip_check:
        # 仓库自己的构建就是 `tsc -b && vite build`，这里跟齐。
        # 类型检查很重要：vite/esbuild 只转译不做类型检查，像「把对象当函数调」
        # 这类错误会一路漏到浏览器运行时。
        rc = _run([node, str(TSC), "--noEmit", "-p", "."], UI_DIR)
        if rc:
            return _fail("类型检查没过，先修掉上面的错误。")

    rc = _run([node, str(VITE), "build"], UI_DIR)
    if rc:
        return _fail("打包失败。")

    dist = UI_DIR / "dist"
    assets = sorted((dist / "assets").glob("*")) if (dist / "assets").is_dir() else []
    print("\n构建完成：")
    for f in [dist / "index.html", *assets]:
        if f.is_file():
            print(f"  {f.relative_to(TOOLS_DIR)}  {f.stat().st_size:,} 字节")
    print("\n启动：python studio_data/dataset_tools/webapp.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
