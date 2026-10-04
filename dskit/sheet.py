"""HTML 图片墙 —— 把「图片选择 / tag 筛选」变成一个可视化页面，不需要起服务。

为什么做成静态单文件而不是网页应用：缩略图用 base64 内联，所以双击 HTML 就能
看，没有 CORS / file:// 限制，也不用后台进程。挑选完点「导出选中清单」，得到
一份相对路径列表，再喂给 `cli.py select --from-file` 或 `edit --from-file`。

缩略图直接走仓库的 `studio/services/dataset/thumb_cache.get_or_make_thumb`
—— 和 Studio 本体共用同一个 `studio_data/thumb_cache/`，同一张图不会算两遍。
"""
from __future__ import annotations

import base64
import json
from datetime import datetime
from pathlib import Path

from .bootstrap import SHEET_DIR, repo_thumb_cache
from .selector import ImageRow

__all__ = ["build_sheet", "DEFAULT_THUMB"]

DEFAULT_THUMB = 192

_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>__TITLE__</title>
<style>
  :root{
    --bg:#14161a; --panel:#1c1f26; --line:#2b303a; --fg:#e6e8ee; --dim:#9aa3b2;
    --accent:#5b9dff; --inc:#2f8f5b; --exc:#b4463f; --card:#20242c;
  }
  *{box-sizing:border-box}
  body{margin:0;font:13px/1.5 -apple-system,"Segoe UI","Microsoft YaHei",sans-serif;
       background:var(--bg);color:var(--fg)}
  header{position:sticky;top:0;z-index:20;background:var(--panel);
         border-bottom:1px solid var(--line);padding:10px 14px}
  .row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
  h1{font-size:14px;margin:0;font-weight:600}
  .meta{color:var(--dim);font-size:12px}
  input[type=search]{background:#0f1115;border:1px solid var(--line);color:var(--fg);
    border-radius:6px;padding:5px 9px;min-width:240px;font-size:12px}
  button{background:#252a33;border:1px solid var(--line);color:var(--fg);
    border-radius:6px;padding:5px 10px;cursor:pointer;font-size:12px}
  button:hover{border-color:var(--accent)}
  button.primary{background:var(--accent);border-color:var(--accent);color:#0b0d10;
    font-weight:600}
  main{display:grid;grid-template-columns:270px 1fr;gap:14px;padding:14px;
       align-items:start}
  aside{position:sticky;top:64px;max-height:calc(100vh - 84px);overflow:auto;
        background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:10px}
  .taglist{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
  .chip{background:#252a33;border:1px solid var(--line);border-radius:999px;
        padding:2px 9px;font-size:11px;cursor:pointer;user-select:none;white-space:nowrap}
  .chip:hover{border-color:var(--accent)}
  .chip.inc{background:var(--inc);border-color:var(--inc);color:#fff}
  .chip.exc{background:var(--exc);border-color:var(--exc);color:#fff;text-decoration:line-through}
  .grid{display:grid;gap:10px;
        grid-template-columns:repeat(auto-fill,minmax(__CARD__px,1fr))}
  .card{background:var(--card);border:1px solid var(--line);border-radius:8px;
        overflow:hidden;position:relative}
  .card.sel{border-color:var(--accent);box-shadow:0 0 0 2px rgba(91,157,255,.25)}
  .card.hide{display:none}
  .thumb{display:block;width:100%;aspect-ratio:1;object-fit:cover;background:#0f1115}
  .thumb.empty{display:flex;align-items:center;justify-content:center;
               color:var(--dim);font-size:11px}
  .body{padding:6px 8px 8px}
  .name{font-size:11px;word-break:break-all;line-height:1.35}
  .folder{font-size:10px;color:var(--dim);word-break:break-all;margin-top:2px}
  .tags{margin-top:5px;display:flex;flex-wrap:wrap;gap:3px}
  .tag{font-size:10px;background:#2b303a;border-radius:4px;padding:1px 5px;
       cursor:pointer;color:#c6cdda}
  .tag:hover{background:var(--accent);color:#0b0d10}
  .pick{position:absolute;top:6px;left:6px;width:18px;height:18px;cursor:pointer;
        accent-color:var(--accent)}
  .empty-note{color:var(--dim);padding:30px;text-align:center;grid-column:1/-1}
  kbd{background:#0f1115;border:1px solid var(--line);border-radius:4px;
      padding:0 4px;font-size:10px}
</style>
</head>
<body>
<header>
  <div class="row">
    <h1>__TITLE__</h1>
    <span class="meta" id="stats"></span>
  </div>
  <div class="row" style="margin-top:8px">
    <input type="search" id="q" placeholder="搜索文件名 / tag（空格分词，全部命中）">
    <button id="selfiltered">选中当前筛选结果</button>
    <button id="clear">清空选择</button>
    <button id="invert">反选</button>
    <button class="primary" id="export">导出选中清单</button>
    <button id="copycmd">复制 select 命令</button>
  </div>
  <div class="row meta" style="margin-top:6px">
    tag 侧栏：左键=必须包含 · <kbd>Ctrl</kbd>+左键=排除 · 再点一次取消
    ｜ 卡片上点 tag 同「必须包含」
  </div>
</header>
<main>
  <aside>
    <div class="meta">tag 分布（前 __TOP__，点击筛选）</div>
    <div class="row" style="margin-top:6px">
      <button id="clearfilter" style="font-size:11px">清除筛选</button>
    </div>
    <div id="filterstate" class="meta" style="margin-top:6px"></div>
    <div class="taglist" id="taglist"></div>
  </aside>
  <section>
    <div class="grid" id="grid"></div>
    <div class="empty-note" id="nonote" style="display:none">没有图片符合当前筛选</div>
  </section>
</main>
<script>
const DATA = __DATA__;
const sel = new Set();
const inc = new Set();
const exc = new Set();

const grid = document.getElementById('grid');
const taglist = document.getElementById('taglist');
const statsEl = document.getElementById('stats');
const fstate = document.getElementById('filterstate');

function cardDom(it, idx){
  const d = document.createElement('div');
  d.className = 'card';
  d.dataset.idx = idx;
  d.dataset.rel = it.rel;
  const thumb = it.thumb
    ? `<img class="thumb" loading="lazy" src="${it.thumb}" alt="">`
    : `<div class="thumb empty">无缩略图</div>`;
  const tags = it.tags.map(t => {
    const safe = t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    return `<span class="tag" data-tag="${safe}">${safe}</span>`;
  }).join('');
  d.innerHTML = `
    <input type="checkbox" class="pick">
    ${thumb}
    <div class="body">
      <div class="name">${it.name}</div>
      ${it.folder ? `<div class="folder">${it.folder}</div>` : ''}
      <div class="tags">${tags}</div>
    </div>`;
  return d;
}

function render(){
  const frag = document.createDocumentFragment();
  DATA.items.forEach((it,i) => frag.appendChild(cardDom(it,i)));
  grid.appendChild(frag);
}

function match(it){
  const q = document.getElementById('q').value.trim().toLowerCase();
  const lower = it.tags.map(t => t.toLowerCase());
  if (inc.size && ![...inc].every(t => lower.includes(t))) return false;
  if (exc.size && [...exc].some(t => lower.includes(t))) return false;
  if (q){
    const hay = (it.name + ' ' + it.folder + ' ' + it.tags.join(' ')).toLowerCase();
    if (!q.split(/\s+/).every(w => hay.includes(w))) return false;
  }
  return true;
}

function apply(){
  let shown = 0;
  for (const card of grid.children){
    const it = DATA.items[+card.dataset.idx];
    const ok = match(it);
    card.classList.toggle('hide', !ok);
    if (ok) shown++;
  }
  document.getElementById('nonote').style.display = shown ? 'none' : 'block';
  const parts = [];
  if (inc.size) parts.push('包含: ' + [...inc].join(', '));
  if (exc.size) parts.push('排除: ' + [...exc].join(', '));
  fstate.textContent = parts.join('  |  ');
  statsEl.textContent = `共 ${DATA.items.length} 张 · 显示 ${shown} · 已选 ${sel.size}`;
}

function renderTags(){
  taglist.innerHTML = '';
  for (const [tag,n] of DATA.tag_counts){
    const s = document.createElement('span');
    s.className = 'chip';
    s.dataset.tag = tag;
    s.textContent = `${tag} (${n})`;
    taglist.appendChild(s);
  }
  syncChips();
}

function syncChips(){
  for (const c of taglist.children){
    c.classList.toggle('inc', inc.has(c.dataset.tag));
    c.classList.toggle('exc', exc.has(c.dataset.tag));
  }
}

function toggleTag(tag, exclude){
  const set = exclude ? exc : inc;
  const other = exclude ? inc : exc;
  if (set.has(tag)) set.delete(tag);
  else { set.add(tag); other.delete(tag); }
  syncChips(); apply();
}

function setSelected(card, on){
  const cb = card.querySelector('.pick');
  cb.checked = on;
  card.classList.toggle('sel', on);
  if (on) sel.add(card.dataset.rel); else sel.delete(card.dataset.rel);
}

grid.addEventListener('change', e => {
  if (!e.target.classList.contains('pick')) return;
  setSelected(e.target.closest('.card'), e.target.checked);
  apply();
});
grid.addEventListener('click', e => {
  const t = e.target.closest('.tag');
  if (t) toggleTag(t.dataset.tag, e.ctrlKey || e.metaKey);
});
taglist.addEventListener('click', e => {
  const c = e.target.closest('.chip');
  if (c) toggleTag(c.dataset.tag, e.ctrlKey || e.metaKey);
});
document.getElementById('q').addEventListener('input', apply);
document.getElementById('clearfilter').onclick = () => { inc.clear(); exc.clear(); syncChips(); apply(); };
document.getElementById('clear').onclick = () => {
  for (const c of [...grid.children]) if (c.classList.contains('sel')) setSelected(c,false);
  apply();
};
document.getElementById('invert').onclick = () => {
  for (const c of grid.children)
    if (!c.classList.contains('hide')) setSelected(c, !c.classList.contains('sel'));
  apply();
};
document.getElementById('selfiltered').onclick = () => {
  for (const c of grid.children){
    if (c.classList.contains('hide')) continue;
    if (!c.classList.contains('sel')) setSelected(c, true);
  }
  apply();
};

function download(name, text){
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], {type:'text/plain;charset=utf-8'}));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

document.getElementById('export').onclick = () => {
  if (!sel.size) { alert('还没有选中任何图片'); return; }
  const ordered = DATA.items.filter(i => sel.has(i.rel)).map(i => i.rel);
  download('selection.txt',
    '# AnimaLoraStudio dataset_tools 选中清单\n' +
    '# root: ' + DATA.root + '\n' + ordered.join('\n') + '\n');
};
document.getElementById('copycmd').onclick = async () => {
  if (!sel.size) { alert('还没有选中任何图片，先勾选或用「选中当前筛选结果」'); return; }
  download('selection.txt',
    '# AnimaLoraStudio dataset_tools 选中清单\n' +
    '# root: ' + DATA.root + '\n' +
    DATA.items.filter(i => sel.has(i.rel)).map(i => i.rel).join('\n') + '\n');
  const cmd = [
    'python studio_data/dataset_tools/cli.py select "' + DATA.root + '"',
    '  --from-file selection.txt --group 分组名',
    '  --apply'
  ].join(' \\\n');
  try { await navigator.clipboard.writeText(cmd); alert('已同时下载 selection.txt。命令已复制：\n\n' + cmd); }
  catch { prompt('已同时下载 selection.txt。复制这条命令：', cmd); }
};

render(); renderTags(); apply();
</script>
</body>
</html>
"""


def _thumb_data_uri(path: Path, size: int) -> str:
    """缩略图 → data URI。走仓库缓存；失败就不放图（有占位样式）。"""
    if size <= 0:
        return ""
    try:
        out = repo_thumb_cache.get_or_make_thumb(path, size)
        raw = out.read_bytes()
    except Exception:
        return ""
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode("ascii")


def build_sheet(
    root: Path,
    rows: list[ImageRow],
    *,
    out: Path | None = None,
    thumb: int = DEFAULT_THUMB,
    top_tags: int = 60,
    title: str | None = None,
    filter_desc: str = "",
) -> Path:
    """生成静态 HTML 图片墙，返回写出的文件路径。"""
    counts: dict[str, int] = {}
    for r in rows:
        for t in r.tags:
            counts[t] = counts.get(t, 0) + 1
    top = sorted(counts.items(), key=lambda kv: (-kv[1], kv[0].lower()))[:top_tags]

    items = []
    for r in rows:
        items.append({
            "rel": r.ref.rel,
            "name": r.ref.name,
            "folder": r.ref.folder,
            "tags": r.tags,
            "thumb": _thumb_data_uri(r.ref.path, thumb),
        })

    stamp = datetime.now().strftime("%Y-%m-%d %H:%M")
    heading = title or f"{root.name} — {len(rows)} 张"
    payload = {
        "root": str(root),
        "generated": stamp,
        "filter": filter_desc,
        "items": items,
        "tag_counts": [[t, n] for t, n in top],
    }

    html = (
        _TEMPLATE
        .replace("__TITLE__", _escape(heading))
        .replace("__TOP__", str(top_tags))
        .replace("__CARD__", str(max(140, thumb)))
        .replace("__DATA__", _embed_json(payload))
    )

    if out is None:
        SHEET_DIR.mkdir(parents=True, exist_ok=True)
        safe = "".join(c if (c.isalnum() or c in "-_") else "_" for c in root.name)
        out = SHEET_DIR / f"{safe}-{datetime.now().strftime('%Y%m%d-%H%M%S')}.html"
    out = Path(out).expanduser()
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, "utf-8")
    return out


def _escape(text: str) -> str:
    return (text.replace("&", "&amp;").replace("<", "&lt;")
            .replace(">", "&gt;").replace('"', "&quot;"))


def _embed_json(payload: dict) -> str:
    """把数据塞进 <script> —— 转义 `<`，避免 caption 里的 `</script>` 提前闭合标签。"""
    return (json.dumps(payload, ensure_ascii=False)
            .replace("<", "\\u003c").replace(">", "\\u003e")
            .replace("\u2028", "\\u2028").replace("\u2029", "\\u2029"))
