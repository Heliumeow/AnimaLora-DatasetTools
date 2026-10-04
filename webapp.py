"""dskit 本地小 Web UI —— 把「图片选择」和「tag 筛选修改」做成网页。

    python studio_data/dataset_tools/webapp.py            # 默认 http://127.0.0.1:8765
    python studio_data/dataset_tools/webapp.py --port 9000 --open

和 `cli.py` 共用同一个 `dskit` 适配层，所以网页上做的每一次写入都走仓库
原实现（`studio/services/dataset/tagedit.py` / `curation.py`），并且**默认
dry-run**、落盘前自动留还原点。

只监听 127.0.0.1：这是本机小工具，不要暴露到局域网。
"""
from __future__ import annotations

import argparse
import re
import sys
import webbrowser
from pathlib import Path

tools_dir = Path(__file__).resolve().parent
if str(tools_dir) not in sys.path:
    sys.path.insert(0, str(tools_dir))

from dskit import (  # noqa: E402
    REPO_ROOT,
    STUDIO_DATA,
    TOOLS_DIR,
    clean_empty_directories,
    copy_to_group,
    default_dest_dir,
    default_reject_dir,
    iter_folders,
    iter_images,
    list_backups,
    list_groups,
    remove_from_group,
    resolve_root,
    restore,
    run_edit,
    scope_for,
    select as select_rows,
    sort_rows,
    toggle_reject,
)
from dskit import bootstrap as _boot  # noqa: E402
from dskit.bootstrap import repo_browse, repo_scan, repo_tagedit, repo_thumb_cache  # noqa: E402
from dskit.cleaner import SplitOptions, split_caption_text  # noqa: E402
from dskit.editops import EditOp  # noqa: E402
from dskit.scope import ImageRef  # noqa: E402
from dskit.selector import ImageRow, Selector  # noqa: E402

# 复用仓库前端（studio/web/src）的 React 应用，构建产物在这里。
# 构建命令：python studio_data/dataset_tools/build_ui.py
UI_DIR = TOOLS_DIR / "ui"
UI_DIST = UI_DIR / "dist"
UI_INDEX = UI_DIST / "index.html"

# 仓库自己的 tag 词典（8MB JSON，形状就是前端 tagDict/store.ts 期望的
# {meta, entries}）—— 直接拿来给 chip 做中文翻译与补全，不另建词典。
TAG_DICT = STUDIO_DATA / "tag_dictionary" / "active.json"

# 用到的两个第三方包都已在仓库 venv 里（fastapi / uvicorn），不新增依赖
from fastapi import FastAPI, HTTPException, Request  # noqa: E402
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, Response  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, Field  # noqa: E402
from collections import Counter  # noqa: E402

app = FastAPI(title="dskit", docs_url=None, redoc_url=None)

# Vite 构建出的 /assets/*.js|*.css。check_dir=False：允许构建产物还不存在时
# 先挂上，之后再跑 build_ui.py 就不用重启服务（文件名带 hash，内容寻址）。
app.mount("/assets", StaticFiles(directory=UI_DIST / "assets", check_dir=False), name="assets")


# ---------------------------------------------------------------------------
# 筛选条件：网页传一份 dict，这里翻成 dskit 的 Selector
# ---------------------------------------------------------------------------
class FilterIn(BaseModel):
    any_tags: list[str] = Field(default_factory=list)
    all_tags: list[str] = Field(default_factory=list)
    not_tags: list[str] = Field(default_factory=list)
    tag_regex: str = ""
    folder: str = ""
    name: str = ""
    caption: str = "any"          # any | has | none
    min_tags: int | None = None
    max_tags: int | None = None
    limit: int | None = None
    sort: str = "path"
    reverse: bool = False


def _to_selector(f: FilterIn) -> Selector:
    has_caption = {"has": True, "none": False}.get(f.caption)
    return Selector(
        any_tags=f.any_tags, all_tags=f.all_tags, not_tags=f.not_tags,
        tag_regex=f.tag_regex, folders=[f.folder] if f.folder else [],
        names=[f.name] if f.name else [], has_caption=has_caption,
        min_tags=f.min_tags, max_tags=f.max_tags,
        limit=f.limit, sort=f.sort, reverse=f.reverse,
    )


class EditIn(BaseModel):
    root: str
    filter: FilterIn = Field(default_factory=FilterIn)
    picked: list[str] = Field(default_factory=list)
    reject_dir: str = ""
    view: str = "all"
    kind: str                  # add | remove | replace | dedupe | set | sanitize
    tags: list[str] = Field(default_factory=list)
    old: str = ""
    new: str = ""
    position: str | int = "back"
    move_existing: bool = False
    sanitize_opts: dict = Field(default_factory=dict)
    prose: str | None = None
    apply: bool = False
    backup: bool = True


class SelectIn(BaseModel):
    root: str
    filter: FilterIn = Field(default_factory=FilterIn)
    picked: list[str] = Field(default_factory=list)
    dest_dir: str = ""
    group: str
    move: bool = False
    apply: bool = False
    backup: bool = True


class UnselectIn(BaseModel):
    group_dir: str
    filter: FilterIn = Field(default_factory=FilterIn)
    picked: list[str] = Field(default_factory=list)
    apply: bool = False
    backup: bool = True


class RestoreIn(BaseModel):
    backup_dir: str
    apply: bool = False


# ---------------------------------------------------------------------------
# 工具
# ---------------------------------------------------------------------------
def _ref_for(root: Path, rel: str, reject_dir: Path | None = None) -> ImageRef:
    """把 root 或 reject_dir 相对路径（POSIX）还原成 ImageRef，并挡住越界路径。"""
    rel = rel.replace("\\", "/").strip("/")
    parts = [p for p in rel.split("/") if p not in ("", ".")]
    if not parts or any(p == ".." for p in parts):
        raise HTTPException(400, "非法路径")
    name = parts[-1]
    folder = "/".join(parts[:-1])

    # 1. 优先在 root 中寻找
    ref = ImageRef(root=root, folder=folder, name=name)
    try:
        ref.path.resolve().relative_to(root.resolve())
        if ref.path.is_file():
            return ref
    except ValueError:
        pass

    # 2. 若在 root 中不存在且提供了 reject_dir，则在 reject_dir 中寻找
    if reject_dir is not None:
        try:
            ref_rj = ImageRef(root=reject_dir, folder=folder, name=name)
            ref_rj.path.resolve().relative_to(reject_dir.resolve())
            if ref_rj.path.is_file():
                return ref_rj
        except (ValueError, OSError):
            pass

    if not ref.path.is_file():
        raise HTTPException(404, f"找不到图片：{rel}")
    return ref


def _rows(
    root: Path,
    f: FilterIn,
    picked: list[str],
    reject_dir: Path | None = None,
    view: str = "all",  # "all" | "accept" | "reject"
):
    """先按筛选枚举；支持训练集 (root) 与淘汰目录 (reject_dir) 混合三态视图与防递归隔离。"""
    sel = _to_selector(f)
    if picked:
        refs = [_ref_for(root, r, reject_dir=reject_dir) for r in picked]
        rows = select_rows(refs, Selector())
        for r in rows:
            if reject_dir and r.ref.root.resolve() == reject_dir.resolve():
                r.status = "reject"
            else:
                r.status = "accept"
        return rows, sel

    root = root.resolve()
    reject_path = reject_dir.resolve() if reject_dir else None

    # 判断 reject_dir 是否位于 root 内部（递归嵌套子目录）
    is_sub = False
    if reject_path and reject_path.is_dir() and reject_path != root:
        try:
            reject_path.relative_to(root)
            is_sub = True
        except ValueError:
            is_sub = False

    # 1. 枚举 root (训练集 / accept) 图片
    accept_refs: list[ImageRef] = []
    if root.is_dir():
        for r in iter_images(root):
            # 若 reject_dir 位于 root 内部，则严格排除落入 reject_dir 内部的文件
            if is_sub and r.path.resolve().is_relative_to(reject_path):
                continue
            accept_refs.append(r)

    # 2. 枚举 reject_dir (淘汰集 / reject) 图片
    reject_refs: list[ImageRef] = []
    if reject_path and reject_path.is_dir() and reject_path != root:
        reject_refs = iter_images(reject_path)

    # 3. 根据三态视图模式组合
    combined_refs: list[tuple[ImageRef, str]] = []
    if view == "accept":
        combined_refs = [(r, "accept") for r in accept_refs]
    elif view == "reject":
        combined_refs = [(r, "reject") for r in reject_refs]
    else:  # "all"
        combined_refs = [(r, "accept") for r in accept_refs] + [(r, "reject") for r in reject_refs]

    # 4. 执行选择器匹配与排序
    final_rows: list[ImageRow] = []
    for ref, status in combined_refs:
        tags, prose = repo_tagedit.read_caption_parts(ref.path)
        if sel.matches(ref, tags):
            final_rows.append(ImageRow(ref=ref, tags=tags, prose=prose, status=status))

    final_rows = sort_rows(final_rows, sel)
    return final_rows, sel


# ---------------------------------------------------------------------------
# 路由
# ---------------------------------------------------------------------------
_NEED_BUILD = """<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>dskit · 还没构建前端</title>
<style>
 body {{ font: 14px/1.7 ui-sans-serif, system-ui, sans-serif; background: #f6f5f1;
        color: #1c1b19; max-width: 46rem; margin: 4rem auto; padding: 0 1.5rem; }}
 code {{ background: #eceae3; padding: .15em .4em; border-radius: 4px; }}
 pre  {{ background: #eceae3; padding: .9rem 1rem; border-radius: 8px; overflow-x: auto; }}
</style></head><body>
<h1>dskit · 前端还没构建</h1>
<p>这个网页复用仓库 <code>studio/web/src</code> 里那套 React 组件（图片选择、
标签编辑、tag 分布），需要先用仓库自己的 Vite 打一次包：</p>
<pre>python studio_data/dataset_tools/build_ui.py</pre>
<p>脚本会自动把 <code>ui/node_modules</code> 接到仓库的 <code>studio/web/node_modules</code>
上，然后跑 <code>tsc</code> 与 <code>vite build</code>，产物落在
<code>{dist}</code>。命令跑完刷新本页即可。</p>
<p>（只想要命令行？<code>cli.py</code> 的全部子命令都不依赖这一步。）</p>
</body></html>
"""


@app.get("/")
def index():
    """前端壳。

    复用仓库前端 `studio/web/src` 的组件，构建产物在 `ui/dist/`（用
    `build_ui.py` 生成）。没构建过就返回一段构建指引，而不是另写一套
    备用 UI —— 两套 UI 会各自漂移，正是要避免的重复轮子。

    no-store：index.html 里引的是带 hash 的 assets，重建后文件名会变；
    缓存住这个壳会让浏览器一直去要已经删掉的旧 bundle（404 + 白屏）。
    /assets/* 是内容寻址的，可以放心让浏览器长缓存。
    """
    if UI_INDEX.is_file():
        return FileResponse(UI_INDEX, media_type="text/html; charset=utf-8",
                            headers={"Cache-Control": "no-store"})
    return HTMLResponse(_NEED_BUILD.format(dist=UI_DIST))


# 内联 favicon：省得浏览器每次 GET /favicon.ico 都在控制台留一条 404。
_FAVICON = (
    b'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">'
    b'<rect width="32" height="32" rx="7" fill="#4f46e5"/>'
    b'<text x="16" y="23" font-size="18" text-anchor="middle" fill="#ffffff"'
    b' font-family="ui-sans-serif,system-ui,sans-serif">d</text></svg>'
)


@app.get("/favicon.ico")
def favicon():
    return Response(_FAVICON, media_type="image/svg+xml",
                    headers={"Cache-Control": "public, max-age=86400"})


@app.get("/api/tag-dictionary/data")
def tag_dictionary_data():
    """tag 词典：直接吐仓库 studio_data/tag_dictionary/active.json。

    形状与 Studio 后端一致（`{meta, entries}`），所以复用来的
    `tagDict/store.ts` 不需要任何改动就能给 chip 上中文翻译和补全。
    """
    if not TAG_DICT.is_file():
        raise HTTPException(404, f"没有词典文件：{TAG_DICT}")
    return FileResponse(TAG_DICT, media_type="application/json")


# tag 翻译/补全偏好：复用来的 tagDict/prefs.ts 会 GET 一次做 seed、
# 用户切换时 PATCH 写回。本工具不落盘这份偏好，进程内记着即可。
_settings: dict = {"tag_dictionary": {"show_translation": True, "autocomplete": True}}


@app.get("/api/settings")
def get_settings():
    return _settings


@app.patch("/api/settings")
async def patch_settings(request: Request):
    body = await request.json()
    if isinstance(body, dict) and isinstance(body.get("tag_dictionary"), dict):
        _settings["tag_dictionary"].update(body["tag_dictionary"])
    return _settings


@app.get("/api/info")
def info():
    """启动时给前端的一份自检信息 —— 证明真的在用仓库代码。"""
    return {
        "repo_root": str(REPO_ROOT),
        "studio_data": str(STUDIO_DATA),
        "tools_dir": str(TOOLS_DIR),
        "default_root": str((REPO_ROOT / "studio_data" / "dataset_tools" / "_demo" / "素材库")),
        "repo_modules": {
            "scan": repo_scan.__file__,
            "tagedit": repo_tagedit.__file__,
            "thumb_cache": repo_thumb_cache.__file__,
        },
        "image_exts": sorted(_boot.IMAGE_EXTS),
        "meta_exts": list(_boot.META_EXTS),
    }


@app.get("/api/browse")
def browse(path: str = ""):
    """目录列举 —— 直接复用仓库的选路径控件后端。"""
    target = Path(path).expanduser() if path else REPO_ROOT
    try:
        data = repo_browse.list_dir(target, allow_outside_repo=True)
    except Exception as exc:  # DomainError 等
        raise HTTPException(400, str(exc))
    data["entries"] = [e for e in data["entries"] if e["type"] == "dir"]
    return data


@app.get("/api/scan")
def scan(root: str, reject_dir: str = ""):
    """目录总览 + 文件夹树。支持排除位于内部的淘汰目录。"""
    r = resolve_root(root)
    reject_path = resolve_root(reject_dir) if reject_dir else None

    is_sub = False
    rel_sub = ""
    if reject_path and reject_path.is_dir() and reject_path != r:
        try:
            rel_sub = str(reject_path.resolve().relative_to(r.resolve())).replace("\\", "/")
            is_sub = True
        except ValueError:
            is_sub = False

    folders = []
    for name in iter_folders(r):
        # 若淘汰目录在 root 内部，排除它及其子目录以防递归统计
        if is_sub and (name == rel_sub or name.startswith(f"{rel_sub}/")):
            continue
        d = r if name == "" else r / name
        info = repo_scan.scan_folder(d)
        ct = info.get("caption_types", {}) or {}
        folders.append({
            "name": name,
            "label": "(本层散图)" if name == "" else info.get("label", d.name),
            "repeat": 1 if name == "" else info.get("repeat", 1),
            "images": info.get("image_count", 0),
            "txt": ct.get("txt", 0), "json": ct.get("json", 0), "none": ct.get("none", 0),
        })

    reject_count = 0
    if reject_path and reject_path.is_dir() and reject_path != r:
        reject_count = len(iter_images(reject_path))

    return {
        "root": str(r),
        "reject_dir": str(reject_path) if reject_path else "",
        "exists": r.is_dir(),
        "total_images": sum(f["images"] for f in folders),
        "reject_images": reject_count,
        "is_reject_inside_root": is_sub,
        "weighted_steps_per_epoch": sum(f["images"] * f["repeat"] for f in folders),
        "folders": folders,
    }


@app.get("/api/images")
def images(root: str, f: str = "{}", reject_dir: str = "", view: str = "all"):
    """列图片。支持三态视图 (all | accept | reject) 与防递归隔离。"""
    r = resolve_root(root)
    reject_path = resolve_root(reject_dir) if reject_dir else None
    filt = FilterIn.model_validate_json(f) if f else FilterIn()
    rows, sel = _rows(r, filt, [], reject_dir=reject_path, view=view)
    return {
        "root": str(r),
        "reject_dir": str(reject_path) if reject_path else "",
        "view": view,
        "filter": sel.describe(),
        "enumerated": len(rows),
        "rows": [{
            "rel": row.ref.rel, "name": row.ref.name, "folder": row.ref.folder,
            "tags": row.tags, "tag_count": row.tag_count,
            "prose": getattr(row, "prose", ""),
            "status": getattr(row, "status", "accept"),
            "caption": repo_scan.caption_kind(row.ref.path),
        } for row in rows],
    }


@app.get("/api/tags")
def tags(root: str, f: str = "{}", top: int = 80, reject_dir: str = "", view: str = "all"):
    """tag 分布 —— 统计口径走上游 tagedit.stats，支持三态视图。"""
    r = resolve_root(root)
    reject_path = resolve_root(reject_dir) if reject_dir else None
    filt = FilterIn.model_validate_json(f) if f else FilterIn()
    rows, sel = _rows(r, filt, [], reject_dir=reject_path, view=view)
    counter: Counter[str] = Counter()
    for row in rows:
        counter.update(row.tags)
    total = len(rows)
    return {
        "total_images": total,
        "tags": [{"tag": t, "count": n, "ratio": (n / total) if total else 0.0}
                 for t, n in counter.most_common(top)],
    }


@app.get("/api/thumb")
def thumb(request: Request, root: str, rel: str, size: int = 192, reject_dir: str = ""):
    """缩略图：复用仓库 thumb_cache，支持从 root 或 reject_dir 读取原图生成缩略图。"""
    r = resolve_root(root)
    file_path: Path | None = None
    try:
        ref = _ref_for(r, rel)
        if ref.path.is_file():
            file_path = ref.path
    except HTTPException:
        pass

    if file_path is None and reject_dir:
        try:
            rj_root = resolve_root(reject_dir)
            ref_rj = _ref_for(rj_root, rel)
            if ref_rj.path.is_file():
                file_path = ref_rj.path
        except Exception:
            pass

    if file_path is None or not file_path.is_file():
        raise HTTPException(404, "缩略图不可用：原图不存在")

    src = repo_thumb_cache.get_or_make_thumb(file_path, size)
    if not src.is_file():
        raise HTTPException(404, "缩略图不可用")
    etag = f'W/"{src.stat().st_mtime_ns}-{size}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)
    media = "image/jpeg" if src.suffix.lower() in (".jpg", ".jpeg") else "image/png"
    return FileResponse(src, media_type=media, headers={
        "ETag": etag,
        "Cache-Control": "no-cache, must-revalidate",
    })


@app.get("/api/image/raw")
def image_raw(request: Request, root: str, rel: str, reject_dir: str = ""):
    """提供全保真原图查看，支持从 root 或 reject_dir 读取，带弱 etag 和缓存控制。"""
    r = resolve_root(root)
    file_path: Path | None = None
    try:
        ref = _ref_for(r, rel)
        if ref.path.is_file():
            file_path = ref.path
    except HTTPException:
        pass

    if file_path is None and reject_dir:
        try:
            rj_root = resolve_root(reject_dir)
            ref_rj = _ref_for(rj_root, rel)
            if ref_rj.path.is_file():
                file_path = ref_rj.path
        except Exception:
            pass

    if file_path is None or not file_path.is_file():
        raise HTTPException(404, "原图文件不存在")

    etag = f'W/"{file_path.stat().st_mtime_ns}-{file_path.stat().st_size}"'
    if request.headers.get("if-none-match") == etag:
        return Response(status_code=304)

    suffix = file_path.suffix.lower()
    media_map = {
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".webp": "image/webp",
        ".gif": "image/gif",
        ".avif": "image/avif",
    }
    media = media_map.get(suffix, "application/octet-stream")
    return FileResponse(file_path, media_type=media, headers={
        "ETag": etag,
        "Cache-Control": "public, max-age=3600",
    })


class RejectToggleIn(BaseModel):
    root: str
    rel: str
    reject_dir: str = ""
    apply: bool = True


@app.post("/api/reject/toggle")
def api_reject_toggle(body: RejectToggleIn):
    """就地原位切换保留/淘汰，镜像移动图片与伴生文件。"""
    r = resolve_root(body.root)
    reject_dir = Path(body.reject_dir).expanduser() if body.reject_dir else default_reject_dir(r)
    try:
        res = toggle_reject(r, body.rel, reject_dir, apply=body.apply)
    except Exception as exc:
        raise HTTPException(400, f"{type(exc).__name__}: {exc}")
    return res.to_dict()


class CleanEmptyIn(BaseModel):
    dirs: list[str] = Field(default_factory=list)


@app.post("/api/reject/clean-empty")
def api_reject_clean_empty(body: CleanEmptyIn):
    """递归清理空文件夹。"""
    dirs = [Path(d).expanduser() for d in body.dirs if d and d.strip()]
    if not dirs:
        raise HTTPException(400, "没有提供待清理的目录列表")
    count = clean_empty_directories(dirs)
    return {"cleaned": count}


class SplitCaptionIn(BaseModel):
    text: str
    options: dict = Field(default_factory=dict)


@app.post("/api/caption/split")
def api_caption_split(body: SplitCaptionIn):
    """在线切分测试与预览接口：支持方案 1 与方案 2 多选配置。"""
    opts = SplitOptions(**body.options) if body.options else SplitOptions()
    tags, prose = split_caption_text(body.text, opts)
    return {"tags": tags, "prose": prose}


@app.post("/api/edit")
def api_edit(body: EditIn):
    r = resolve_root(body.root)
    reject_path = resolve_root(body.reject_dir) if body.reject_dir else None
    rows, sel = _rows(r, body.filter, body.picked, reject_dir=reject_path, view=body.view)
    op = EditOp(kind=body.kind, tags=body.tags, position=body.position,
                move_existing=body.move_existing, old=body.old, new=body.new,
                sanitize_opts=body.sanitize_opts, prose=body.prose)
    try:
        res = run_edit(rows, r, op, apply=body.apply, backup=body.backup,
                       filter_desc=sel.describe())
    except Exception as exc:
        raise HTTPException(400, f"{type(exc).__name__}: {exc}")
    return {
        "scope_desc": sel.describe(),
        "hit": res.total,
        "affected": res.affected,
        "unchanged": res.unchanged,
        "applied": res.applied,
        "backup": str(res.backup) if res.backup else None,
        "changes": [{
            "rel": c["rel"], "added": c["added"], "removed": c["removed"],
            "before_count": len(c["before"]), "after_count": len(c["after"]),
        } for c in res.changes],
    }


@app.post("/api/select")
def api_select(body: SelectIn):
    r = resolve_root(body.root)
    rows, sel = _rows(r, body.filter, body.picked)
    dest = Path(body.dest_dir).expanduser() if body.dest_dir else default_dest_dir(r)
    try:
        res = copy_to_group([row.ref for row in rows], dest, body.group,
                            move=body.move, apply=body.apply, backup=body.backup,
                            root=r, filter_desc=sel.describe())
    except Exception as exc:
        raise HTTPException(400, f"{type(exc).__name__}: {exc}")
    return {
        "dest": str(res.dest), "group": res.group, "hit": len(rows),
        "copied": res.copied, "skipped": res.skipped, "missing": res.missing,
        "applied": body.apply, "moved": body.move,
        "backup": str(res.backup) if res.backup else None,
    }


@app.get("/api/groups")
def api_groups(dest_dir: str):
    return {"dest_dir": dest_dir, "groups": list_groups(Path(dest_dir).expanduser())}


@app.post("/api/unselect")
def api_unselect(body: UnselectIn):
    group_dir = resolve_root(body.group_dir)
    rows, sel = _rows(group_dir, body.filter, body.picked)
    res = remove_from_group(group_dir.parent, group_dir.name, [row.ref.name for row in rows],
                            apply=body.apply, backup=body.backup, root=group_dir,
                            filter_desc=sel.describe())
    return {
        "group_dir": str(group_dir), "hit": len(rows),
        "removed": res.copied, "missing": res.missing, "applied": body.apply,
        "backup": str(res.backup) if res.backup else None,
    }


@app.get("/api/backups")
def api_backups(limit: int = 30):
    return {"backups": list_backups(limit=limit)}


@app.post("/api/restore")
def api_restore(body: RestoreIn):
    return restore(body.backup_dir, apply=body.apply)


@app.exception_handler(ValueError)
def _on_value_error(request: Request, exc: ValueError):
    """`resolve_root` / 分组名校验这类输入问题 → 400 而不是 500。"""
    return JSONResponse({"detail": str(exc)}, status_code=400)


@app.exception_handler(re.error)
def _on_regex_error(request: Request, exc: re.error):
    return JSONResponse({"detail": f"正则不合法：{exc}"}, status_code=400)


@app.exception_handler(OSError)
def _on_os_error(request: Request, exc: OSError):
    """目录不存在 / 不是目录 —— 都是用户输入问题。"""
    status = 404 if isinstance(exc, FileNotFoundError) else 400
    return JSONResponse({"detail": f"{type(exc).__name__}: {exc}"}, status_code=status)


@app.exception_handler(Exception)
def _on_error(request: Request, exc: Exception):
    return JSONResponse({"detail": f"{type(exc).__name__}: {exc}"}, status_code=500)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="dskit webapp", description="dskit 本地 Web UI")
    ap.add_argument("--host", default="127.0.0.1", help="默认只监听本机")
    ap.add_argument("--port", type=int, default=8765)
    ap.add_argument("--open", action="store_true", help="启动后打开浏览器")
    args = ap.parse_args(argv)

    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
        except Exception:
            pass

    import uvicorn
    url = f"http://{args.host}:{args.port}/"
    print(f"dskit Web UI → {url}")
    print(f"仓库根：{REPO_ROOT}")
    if args.open:
        webbrowser.open(url)
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
