"""dskit 命令行入口 —— 在任意文件夹上跑「图片选择」与「tag 筛选修改」。

    python studio_data/dataset_tools/cli.py <命令> <文件夹> [筛选条件] [...]

命令一览：
    info                本工具绑定了仓库里的哪些文件
    scan <root>         目录总览（图片数 / caption 类型 / 重复次数）
    ls <root>           列图片（tag 数、caption 格式、tag 预览）
    tags <root>         tag 分布
    files <root>        只输出路径清单（可喂给 --from-file）
    edit <root>         批量加 / 删 / 替换 / 去重 tag
    select <root>       把选中的图复制（或移动）进分组文件夹
    unselect <分组目录> 从分组里移出图片
    groups <目标根>     列已有分组
    sheet <root>        生成静态 HTML 图片墙（可视化挑选）
    restore <还原点>    回滚一次改动
    backups             列最近的还原点

除纯读取命令外，**默认 dry-run**：只打印将要发生什么，加 `--apply` 才落盘；
落盘前自动写还原点，`restore` 可一键回滚。
"""
from __future__ import annotations

import argparse
import sys
from collections import defaultdict
from pathlib import Path

# 直接用 python cli.py 运行时，脚本所在目录就是 sys.path[0]，dskit 可导入；
# 从别处 import 时这里兜一下。
if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent))

from dskit import (  # noqa: E402
    REPO_ROOT,
    STUDIO_DATA,
    TOOLS_DIR,
    build_sheet,
    copy_to_group,
    default_dest_dir,
    iter_folders,
    iter_images,
    list_backups,
    list_groups,
    load_pick_file,
    remove_from_group,
    resolve_root,
    restore,
    run_edit,
    scope_for,
    select,
)
from dskit import bootstrap as _boot  # noqa: E402
from dskit.bootstrap import repo_tagedit  # noqa: E402
from dskit.editops import EditOp  # noqa: E402
from dskit.report import dump_json, echo, human_bytes, kv, table, warn  # noqa: E402
from dskit.scope import train_dir_for  # noqa: E402
from dskit.selector import Selector  # noqa: E402

_SORTS = ("path", "name", "folder", "mtime", "tags")


def _q(text: str) -> str:
    """需要时才加引号，让打印出来的命令好读也好复制。"""
    return f'"{text}"' if (" " in text or not text) else text


def _self_cmd(*args: str) -> str:
    """拼一条能直接复制粘贴的本工具命令（用当前解释器 + 本文件的绝对路径）。"""
    return " ".join([_q(sys.executable), _q(str(Path(__file__).resolve())),
                     *(_q(a) for a in args)])



# ---------------------------------------------------------------------------
# 参数
# ---------------------------------------------------------------------------
def _common_parent() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(add_help=False)
    p.add_argument("--json", action="store_true", help="输出 JSON（给脚本/管道用）")
    p.add_argument("--no-recursive", action="store_true",
                   help="只处理 root 本层与它的直接子文件夹（默认递归全部层级）")
    p.add_argument("--include-hidden", action="store_true",
                   help="连点开头的隐藏文件夹一起处理")
    return p


def _selector_parent() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(add_help=False)
    g = p.add_argument_group("筛选条件（各条件之间是「且」，同一选项写多次是「或」）")
    g.add_argument("--tag", action="append", default=[], metavar="TAG",
                   help="含该 tag（可重复；大小写不敏感）")
    g.add_argument("--all-tags", action="append", default=[], metavar="TAG",
                   help="必须同时含该 tag")
    g.add_argument("--not-tag", action="append", default=[], metavar="TAG",
                   help="含该 tag 就排除")
    g.add_argument("--tag-regex", default=None, metavar="RE",
                   help="正则匹配任意一个 tag")
    g.add_argument("--folder", action="append", default=[], metavar="GLOB",
                   help="按子文件夹 glob 限定（相对 root，如 'sub/*'）")
    g.add_argument("--name", action="append", default=[], metavar="GLOB",
                   help="按文件名 glob 限定（如 '*.png'）")
    g.add_argument("--has-caption", dest="has_caption", action="store_const",
                   const=True, default=None, help="只要已有 caption 的")
    g.add_argument("--no-caption", dest="has_caption", action="store_const",
                   const=False, help="只要还没有 caption 的")
    g.add_argument("--min-tags", type=int, default=None, metavar="N")
    g.add_argument("--max-tags", type=int, default=None, metavar="N")
    g.add_argument("--from-file", default=None, metavar="FILE",
                   help="只选清单文件里列出的相对路径（HTML 图片墙导出 / files 输出）")
    g.add_argument("--limit", type=int, default=None, metavar="N",
                   help="最多取前 N 张")
    g.add_argument("--sort", choices=_SORTS, default="path",
                   help="排序方式（默认 path）")
    g.add_argument("--reverse", action="store_true")
    return p


def _write_parent() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(add_help=False)
    g = p.add_argument_group("写入")
    g.add_argument("--apply", action="store_true",
                   help="真的落盘（不加就是 dry-run，只打印将要做什么）")
    g.add_argument("--no-backup", action="store_true",
                   help="不写还原点（默认 --apply 时自动写）")
    return p


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="dskit",
        description="在任意文件夹上复用 AnimaLoraStudio 的图片选择与 tag 筛选编辑",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="默认 dry-run；加 --apply 才写盘，并在 studio_data/dataset_tools/backups/ 留还原点。",
    )
    sub = parser.add_subparsers(dest="cmd", required=True, metavar="命令")

    common = _common_parent()
    selp = _selector_parent()
    writep = _write_parent()

    def add(name, help_text, *parents, **kw):
        sp = sub.add_parser(name, help=help_text, description=help_text,
                            parents=list(parents))
        sp.set_defaults(handler=kw.pop("handler"))
        return sp

    sp = add("info", "显示本工具绑定了仓库里的哪些文件", common, handler=cmd_info)
    sp.add_argument("--check", action="store_true",
                    help="额外验证每张图片的 caption 读写是否可用（慢）")

    sp = add("scan", "目录总览：图片数 / caption 类型 / 重复次数", common, handler=cmd_scan)
    sp.add_argument("root", help="任意文件夹")

    sp = add("ls", "列图片（tag 数、caption 格式、tag 预览）", common, selp, handler=cmd_ls)
    sp.add_argument("root")
    sp.add_argument("--preview", type=int, default=3, metavar="N",
                    help="每张图显示前 N 个 tag（默认 3）")

    sp = add("tags", "tag 分布", common, selp, handler=cmd_tags)
    sp.add_argument("root")
    sp.add_argument("--top", type=int, default=50, metavar="N", help="只列前 N 个（默认 50）")

    sp = add("files", "只输出图片路径清单", common, selp, handler=cmd_files)
    sp.add_argument("root")
    sp.add_argument("--absolute", action="store_true", help="输出绝对路径")
    sp.add_argument("--out", default=None, metavar="FILE", help="写到文件而不是 stdout")

    sp = add("edit", "批量加 / 删 / 替换 / 去重 / 整段覆盖 tag", common, selp, writep, handler=cmd_edit)
    sp.add_argument("root")
    g = sp.add_argument_group("操作（六选一）")
    g.add_argument("--add", action="append", default=[], metavar="TAG[,TAG...]",
                   help="添加 tag（可重复，逗号分隔）")
    g.add_argument("--remove", action="append", default=[], metavar="TAG[,TAG...]",
                   help="删除 tag（可重复，逗号分隔）")
    g.add_argument("--replace", nargs=2, default=None, metavar=("OLD", "NEW"),
                   help="把 OLD 替换成 NEW")
    g.add_argument("--dedupe", action="store_true", help="去掉重复 tag，保持原顺序")
    g.add_argument("--set", dest="set_tags", default=None, metavar="TAG[,TAG...]",
                   help="整段覆盖为给定 tag（空串 = 清空该图的 tag）")
    g.add_argument("--sanitize", action="store_true",
                   help="清洗特殊字符与格式规范化（默认清理 BOM/幽灵控制字符，安全保留 @、#）")

    g_opts = sp.add_argument_group("操作选项")
    g_opts.add_argument("--position", default="back", metavar="POS",
                        help="--add 时的插入位置：front (或 0), back, 或数字索引（如 1, 2，默认 back）")
    g_opts.add_argument("--at-index", type=int, default=None, metavar="N",
                        help="--add 时的数字索引位置（等同于 --position N）")
    g_opts.add_argument("--move-existing", action="store_true",
                        help="--add 时若 tag 已存在，则移动到指定位置（默认跳过）")
    g_opts.add_argument("--strip-chars", default="", metavar="CHARS",
                        help="--sanitize 时剥离用户指定的特殊字符（例如 '@#'）")
    g_opts.add_argument("--strip-quotes", action="store_true",
                        help="--sanitize 时剥离外层单双引号")
    g_opts.add_argument("--halfwidth", action="store_true",
                        help="--sanitize 时全角标点转半角（如全角逗号、括号）")
    g_opts.add_argument("--case", choices=("keep", "lowercase", "uppercase"), default="keep",
                        help="--sanitize 时大小写转换模式（默认 keep）")
    g_opts.add_argument("--spacing", choices=("keep", "underscore_to_space", "space_to_underscore"), default="keep",
                        help="--sanitize 时空格与下划线转换模式（默认 keep）")
    g_opts.add_argument("--no-clean-bom", action="store_true",
                        help="--sanitize 时不清理 BOM/幽灵控制字符")

    sp = add("select", "把选中的图复制/移动进分组文件夹", common, selp, writep, handler=cmd_select)
    sp.add_argument("root", help="源文件夹（未分配素材）")
    sp.add_argument("--group", required=True, metavar="NAME", help="目标分组名")
    sp.add_argument("--dest-dir", default=None, metavar="DIR",
                    help="分组容器目录（默认是源文件夹的兄弟目录 <名字>__selected）")
    sp.add_argument("--move", action="store_true", help="移动而不是复制")

    sp = add("unselect", "从分组里移出图片", common, selp, writep, handler=cmd_unselect)
    sp.add_argument("group_dir", help="分组文件夹本身，如 D:\\pics__selected\\cats")

    sp = add("groups", "列已有分组", common, handler=cmd_groups)
    sp.add_argument("dest_dir", help="分组容器目录")

    sp = add("sheet", "生成静态 HTML 图片墙（可视化挑选 + 导出清单）",
             common, selp, handler=cmd_sheet)
    sp.add_argument("root")
    sp.add_argument("--out", default=None, metavar="FILE", help="输出 HTML 路径")
    sp.add_argument("--thumb", type=int, default=192, metavar="PX",
                    help="缩略图边长（默认 192；0 = 不内联缩略图）")
    sp.add_argument("--top-tags", type=int, default=60, metavar="N",
                    help="侧栏 tag 数（默认 60）")
    sp.add_argument("--title", default=None, help="页面标题")

    sp = add("restore", "回滚一次改动（读还原点的 manifest）", common, handler=cmd_restore)
    sp.add_argument("backup_dir")
    sp.add_argument("--apply", action="store_true", help="真的回滚（不加只预览）")

    sp = add("backups", "列最近的还原点", common, handler=cmd_backups)
    sp.add_argument("--limit", type=int, default=20, metavar="N")

    return parser


def _force_utf8() -> None:
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")  # type: ignore[union-attr]
        except Exception:
            pass


def _split_list(values) -> list[str]:
    out: list[str] = []
    for raw in values or []:
        for piece in str(raw).split(","):
            piece = piece.strip()
            if piece:
                out.append(piece)
    return out


def build_selector(args) -> Selector:
    pick: list[str] = []
    if getattr(args, "from_file", None):
        pick = load_pick_file(args.from_file)
    return Selector(
        any_tags=_split_list(args.tag),
        all_tags=_split_list(args.all_tags),
        not_tags=_split_list(args.not_tag),
        tag_regex=args.tag_regex,
        folders=list(args.folder or []),
        names=list(args.name or []),
        has_caption=args.has_caption,
        min_tags=args.min_tags,
        max_tags=args.max_tags,
        pick=pick,
        limit=args.limit,
        sort=args.sort,
        reverse=args.reverse,
    )


def _load(args):
    """公共前置：解析 root、枚举图片、读 tag、筛选。"""
    root = resolve_root(args.root)
    refs = iter_images(root, recursive=not args.no_recursive,
                       include_hidden=args.include_hidden)
    sel = build_selector(args)
    rows = select(refs, sel)
    return root, refs, sel, rows


# ---------------------------------------------------------------------------
# info
# ---------------------------------------------------------------------------
def cmd_info(args) -> int:
    mods = [
        ("图片扫描 / 扩展名白名单 / Kohya 前缀", _boot.repo_scan),
        ("caption 读写 / 批量编辑 / tag 统计", _boot.repo_tagedit),
        ("图片选择语义 / 文件夹名校验", _boot.repo_curation),
        ("缩略图缓存", _boot.repo_thumb_cache),
        ("JSON caption 解析", _boot.repo_caption_format),
        ("目录列举（选路径控件）", _boot.repo_browse),
        ("路径常量 / 安全拼接", _boot.repo_paths),
    ]
    rows = []
    for label, mod in mods:
        f = Path(getattr(mod, "__file__", "") or "")
        rows.append((label, mod.__name__, str(f), f.stat().st_size if f.is_file() else 0))
    payload = {
        "repo_root": str(REPO_ROOT),
        "studio_data": str(STUDIO_DATA),
        "tools_dir": str(TOOLS_DIR),
        "upstream": [
            {"role": r[0], "module": r[1], "file": r[2], "bytes": r[3]} for r in rows
        ],
    }
    if args.json:
        echo(dump_json(payload))
        return 0
    echo("本工具不实现业务逻辑，只 import 下列仓库文件：")
    echo()
    echo(table(
        [(r[0], r[1], human_bytes(r[3])) for r in rows],
        ["用途", "上游模块", "大小"],
    ))
    echo()
    echo(kv([
        ("仓库根", REPO_ROOT),
        ("studio_data", STUDIO_DATA),
        ("本工具目录", TOOLS_DIR),
    ]))
    echo()
    echo("上游源文件：")
    for r in rows:
        echo(f"  {r[2]}")
    return 0


# ---------------------------------------------------------------------------
# 只读命令
# ---------------------------------------------------------------------------
def cmd_scan(args) -> int:
    root = resolve_root(args.root)
    overview = _boot.repo_scan.scan_dataset_root(root)
    refs = iter_images(root, recursive=not args.no_recursive,
                       include_hidden=args.include_hidden)

    by_folder: dict[str, list] = defaultdict(list)
    for r in refs:
        by_folder[r.folder].append(r)

    rows = []
    for folder in iter_folders(root, recursive=not args.no_recursive,
                              include_hidden=args.include_hidden):
        items = by_folder.get(folder, [])
        label = folder or "(本层散图)"
        kinds: dict[str, int] = defaultdict(int)
        for r in items:
            kinds[_boot.repo_scan.caption_kind(r.path)] += 1
        repeat, _ = _boot.repo_scan.parse_repeat(
            folder.split("/")[-1] if folder else root.name
        )
        rows.append({
            "folder": label,
            "images": len(items),
            "txt": kinds.get("txt", 0),
            "json": kinds.get("json", 0),
            "none": kinds.get("none", 0),
            "repeat": repeat,
        })

    payload = {
        "root": str(root),
        "total_images": len(refs),
        "upstream_overview": overview,
        "folders": rows,
    }
    if args.json:
        echo(dump_json(payload))
        return 0

    echo(f"根目录：{root}")
    echo(table(
        [(r["folder"], r["images"], r["txt"], r["json"], r["none"], r["repeat"])
         for r in rows],
        ["文件夹", "图片", ".txt", ".json", "无caption", "repeat"],
    ))
    echo()
    echo(kv([
        ("图片总数（含嵌套子目录）", len(refs)),
        ("相关文件夹", len(rows)),
        ("上游 scan_dataset_root 的步数（只算一层）", overview.get("weighted_steps_per_epoch")),
    ]))
    return 0


def cmd_ls(args) -> int:
    root, refs, sel, rows = _load(args)
    items = []
    for r in rows:
        cap = repo_tagedit.caption_path(r.ref.path)
        fmt = "json" if cap and cap.suffix == ".json" else "txt" if cap else "-"
        items.append({
            "rel": r.ref.rel,
            "folder": r.ref.folder,
            "name": r.ref.name,
            "tags": r.tags,
            "tag_count": r.tag_count,
            "caption": fmt,
        })
    if args.json:
        echo(dump_json({"root": str(root), "filter": sel.describe(), "items": items}))
        return 0
    echo(f"{root}   筛选：{sel.describe()}")
    echo()
    if not items:
        warn("没有图片符合条件")
        return 1
    echo(table(
        [(i["rel"], i["tag_count"], i["caption"],
          " | ".join(i["tags"][: args.preview]))
         for i in items],
        ["图片（相对 root）", "tag数", "caption", f"前{args.preview}个tag"],
    ))
    echo()
    echo(f"共 {len(items)} 张（枚举范围 {len(refs)} 张）")
    return 0


def cmd_tags(args) -> int:
    root, refs, sel, rows = _load(args)
    if not rows:
        warn("没有图片符合条件")
        return 1
    # tag 统计走上游 stats()，与 Studio 本体 TagStatsPanel 同一口径
    pairs = _boot.repo_tagedit.stats(
        scope_for([r.ref for r in rows]), train_dir_for([r.ref for r in rows]),
        top=max(args.top, 1) if args.top else 10 ** 9,
    )
    total = len(rows)
    items = [
        {"tag": t, "count": n, "percent": round(n * 100.0 / total, 1)}
        for t, n in pairs[: args.top]
    ]
    if args.json:
        echo(dump_json({
            "root": str(root), "filter": sel.describe(),
            "images": total, "tags": items,
        }))
        return 0
    echo(f"{root}   筛选：{sel.describe()}")
    echo(f"统计范围：{total} 张图，共 {len(pairs)} 个不同 tag")
    echo()
    echo(table(
        [(i["tag"], i["count"], f"{i['percent']}%") for i in items],
        ["tag", "出现次数", "占图片比"],
    ))
    return 0


def cmd_files(args) -> int:
    root, refs, sel, rows = _load(args)
    lines = [str(r.ref.path) if args.absolute else r.ref.rel for r in rows]
    text = "\n".join(lines) + ("\n" if lines else "")
    if args.out:
        out = Path(args.out).expanduser()
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(text, "utf-8")
        warn(f"已写出 {len(lines)} 行 → {out}")
    else:
        sys.stdout.write(text)
    return 0 if lines else 1


# ---------------------------------------------------------------------------
# edit
# ---------------------------------------------------------------------------
def _edit_op(args) -> EditOp:
    add = _split_list(args.add)
    rem = _split_list(args.remove)
    set_tags = _split_list(args.set_tags) if args.set_tags is not None else None
    chosen = [bool(add), bool(rem), args.replace is not None, args.dedupe, set_tags is not None, args.sanitize]
    if sum(chosen) != 1:
        raise ValueError(
            "请在 --add / --remove / --replace / --dedupe / --set / --sanitize 里**只选一个**操作"
        )
    if add:
        pos = args.at_index if args.at_index is not None else args.position
        return EditOp(kind="add", tags=add, position=pos, move_existing=args.move_existing)
    if rem:
        return EditOp(kind="remove", tags=rem)
    if args.replace is not None:
        return EditOp(kind="replace", old=args.replace[0], new=args.replace[1])
    if set_tags is not None:
        return EditOp(kind="set", tags=set_tags)
    if args.sanitize:
        s_opts = {
            "clean_bom_and_invisible": not args.no_clean_bom,
            "strip_whitespace": True,
            "remove_empty": True,
            "fullwidth_to_halfwidth": args.halfwidth,
            "strip_quotes": args.strip_quotes,
            "strip_custom_chars": args.strip_chars,
            "case_mode": args.case,
            "spacing_mode": args.spacing,
        }
        return EditOp(kind="sanitize", sanitize_opts=s_opts)
    return EditOp(kind="dedupe")


def cmd_edit(args) -> int:
    op = _edit_op(args)
    root, refs, sel, rows = _load(args)
    result = run_edit(
        rows, root, op,
        apply=args.apply, backup=not args.no_backup, filter_desc=sel.describe(),
    )

    if args.json:
        echo(dump_json({
            "root": str(root),
            "filter": sel.describe(),
            "op": result.op,
            "applied": result.applied,
            "total": result.total,
            "affected": result.affected,
            "backup": str(result.backup) if result.backup else None,
            "changes": result.changes,
        }))
        return 0

    echo(f"{root}")
    echo(f"筛选：{sel.describe()}")
    echo(f"操作：{result.op}")
    echo()
    if not rows:
        warn("没有图片符合条件")
        return 1
    if not result.changes:
        echo(f"命中 {result.total} 张，但没有一张需要改动（结果与现在相同）。")
        return 0

    diff_rows = []
    for c in result.changes:
        parts = [f"+{t}" for t in c["added"]] + [f"-{t}" for t in c["removed"]]
        diff_rows.append((c["rel"], " ".join(parts), len(c["before"]), len(c["after"])))
    echo(table(diff_rows, ["图片", "变化", "原tag数", "新tag数"]))
    echo()
    echo(f"命中 {result.total} 张，其中 {result.affected} 张会变、{result.unchanged} 张不变。")

    if not args.apply:
        echo()
        echo("DRY-RUN：没有写盘。加 --apply 才会真正执行（并自动留还原点）。")
        return 0

    echo()
    echo(f"已写入 {result.affected} 个 caption。")
    if result.backup:
        echo(f"还原点：{result.backup}")
        echo(f"回滚：  {_self_cmd('restore', str(result.backup), '--apply')}")
    return 0


# ---------------------------------------------------------------------------
# select / unselect / groups
# ---------------------------------------------------------------------------
def cmd_select(args) -> int:
    root, refs, sel, rows = _load(args)
    dest_dir = Path(args.dest_dir).expanduser() if args.dest_dir else default_dest_dir(root)
    result = copy_to_group(
        [r.ref for r in rows], dest_dir, args.group,
        move=args.move, apply=args.apply, backup=not args.no_backup,
        root=root, filter_desc=sel.describe(),
    )
    verb = "移动" if args.move else "复制"
    if args.json:
        echo(dump_json({
            "root": str(root), "filter": sel.describe(),
            "dest": str(result.dest), "group": result.group,
            "applied": args.apply, "moved": args.move,
            "copied": result.copied, "skipped": result.skipped,
            "missing": result.missing,
            "backup": str(result.backup) if result.backup else None,
        }))
        return 0

    echo(f"源：  {root}")
    echo(f"筛选：{sel.describe()}")
    echo(f"目标：{result.dest}   （{verb}）")
    echo()
    echo(kv([
        ("命中图片", len(rows)),
        ("将" + verb, len(result.copied)),
        ("已在目标中（跳过）", len(result.skipped)),
        ("源文件不见了", len(result.missing)),
    ]))
    if result.skipped:
        echo()
        echo("跳过（目标已存在同名文件，与 Studio 原行为一致：不覆盖）：")
        for rel in result.skipped[:20]:
            echo(f"  {rel}")
        if len(result.skipped) > 20:
            echo(f"  … 另有 {len(result.skipped) - 20} 张")
    if result.missing:
        echo()
        echo("找不到源文件：")
        for rel in result.missing[:10]:
            echo(f"  {rel}")

    if not args.apply:
        echo()
        echo("DRY-RUN：没有动任何文件。加 --apply 才会真正" + verb + "。")
        return 0

    echo()
    echo(f"完成。图片 + 同 stem 的 {', '.join(_boot.META_EXTS)} 已一起{verb}。")
    if result.backup:
        echo(f"还原点：{result.backup}")
        echo(f"回滚：  {_self_cmd('restore', str(result.backup), '--apply')}")
    return 0


def cmd_unselect(args) -> int:
    group_dir = resolve_root(args.group_dir)
    refs = [r for r in iter_images(group_dir, recursive=False,
                                   include_hidden=args.include_hidden)
            if r.folder == ""]
    sel = build_selector(args)
    rows = select(refs, sel)
    result = remove_from_group(
        group_dir.parent, group_dir.name, [r.ref.name for r in rows],
        apply=args.apply, backup=not args.no_backup, root=group_dir,
        filter_desc=sel.describe(),
    )
    if args.json:
        echo(dump_json({
            "group_dir": str(group_dir), "filter": sel.describe(),
            "applied": args.apply, "removed": result.copied,
            "missing": result.missing,
            "backup": str(result.backup) if result.backup else None,
        }))
        return 0

    echo(f"分组：{group_dir}")
    echo(f"筛选：{sel.describe()}")
    echo()
    echo(kv([
        ("命中图片", len(rows)),
        ("将移出", len(result.copied)),
        ("找不到", len(result.missing)),
    ]))
    if result.copied:
        echo()
        for name in result.copied[:30]:
            echo(f"  - {name}")
        if len(result.copied) > 30:
            echo(f"  … 另有 {len(result.copied) - 30} 个")
    if not args.apply:
        echo()
        echo("DRY-RUN：没有删任何东西。加 --apply 才会真正移出（源目录始终不动）。")
        return 0

    echo()
    echo(f"已移出 {len(result.copied)} 个文件（连同同 stem 的 metadata）。")
    if result.backup:
        echo(f"还原点：{result.backup}")
        echo(f"回滚：  {_self_cmd('restore', str(result.backup), '--apply')}")
    return 0


def cmd_groups(args) -> int:
    dest_dir = Path(args.dest_dir).expanduser()
    groups = list_groups(dest_dir)
    if args.json:
        echo(dump_json({"dest_dir": str(dest_dir), "groups": groups}))
        return 0
    echo(f"分组容器：{dest_dir}")
    echo()
    if not groups:
        warn("还没有任何分组")
        return 1
    echo(table(
        [(g["name"], g["image_count"],
          ", ".join(f"{k}:{v}" for k, v in sorted(g["caption_types"].items())) or "-")
         for g in groups],
        ["分组", "图片数", "caption 类型"],
    ))
    return 0


# ---------------------------------------------------------------------------
# sheet
# ---------------------------------------------------------------------------
def cmd_sheet(args) -> int:
    root, refs, sel, rows = _load(args)
    if not rows:
        warn("没有图片符合条件，不生成图片墙")
        return 1
    out = build_sheet(
        root, rows,
        out=Path(args.out) if args.out else None,
        thumb=args.thumb, top_tags=args.top_tags,
        title=args.title, filter_desc=sel.describe(),
    )
    if args.json:
        echo(dump_json({"sheet": str(out), "images": len(rows),
                        "filter": sel.describe()}))
        return 0
    echo(f"筛选：{sel.describe()}")
    echo(f"图片墙已生成（{len(rows)} 张）：")
    echo(f"  {out}")
    echo()
    echo("双击打开 → 挑图 → 导出选中清单 selection.txt → 再跑：")
    echo("  " + _self_cmd("select", str(root), "--from-file", "selection.txt",
                            "--group", "分组名", "--apply"))
    return 0


# ---------------------------------------------------------------------------
# restore / backups
# ---------------------------------------------------------------------------
def cmd_backups(args) -> int:
    items = list_backups(limit=args.limit)
    if args.json:
        echo(dump_json({"backups": items}))
        return 0
    if not items:
        warn("还没有任何还原点")
        return 1
    echo(table(
        [(i["created"], i["op"], i["count"], i["dir"]) for i in items],
        ["时间(UTC)", "操作", "条目", "目录"],
    ))
    return 0


def cmd_restore(args) -> int:
    report = restore(args.backup_dir, apply=args.apply)
    if args.json:
        echo(dump_json(report))
        return 0 if not report["actions"] else 0
    echo(f"还原点：{report['backup_dir']}")
    echo(f"当时操作：{report['op']}")
    echo(f"作用根：{report['root']}")
    echo()
    if not report["actions"]:
        warn("这个还原点里没有可回滚的条目")
        return 1
    rows = []
    for a in report["actions"]:
        label = {"restore": "写回", "delete": "删除", "move": "搬回"}[a["kind"]]
        rows.append((label, a["rel"], "OK" if a["ok"] else "已不在"))
    echo(table(rows, ["动作", "文件", "状态"]))
    echo()
    if not args.apply:
        echo("DRY-RUN：什么都没改。加 --apply 才真正回滚。")
        return 0
    echo(f"已回滚 {len(report['actions'])} 个条目。")
    return 0


# ---------------------------------------------------------------------------
def main(argv=None) -> int:
    _force_utf8()
    parser = _build_parser()
    args = parser.parse_args(argv)
    try:
        return args.handler(args)
    except (FileNotFoundError, NotADirectoryError, ValueError, _boot.RepoNotFound) as exc:
        warn(f"错误：{exc}")
        return 1
    except KeyboardInterrupt:
        warn("已中断")
        return 130


if __name__ == "__main__":
    raise SystemExit(main())
