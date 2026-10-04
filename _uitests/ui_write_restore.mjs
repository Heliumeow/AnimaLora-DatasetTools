// 端到端验证「真写盘 → 还原点 → 回滚」这条安全链，全程走网页 UI（不是直接打 API）。
// 1) 筛 1girl → 全选 → 开写入 → 点 tag 行的 × 删除 1girl
// 2) 用 /api/images 复查确实删掉了
// 3) 点还原点的「回滚…」→ 复查确实回来了
//
// 用法：先起 headless chrome（--remote-debugging-port=9333 about:blank），
// 再 node ui_write_restore.mjs [url] [port]
const URL_ = process.argv[2] ?? 'http://127.0.0.1:8765/'
const PORT = Number(process.argv[3] ?? 9333)

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find((t) => t.type === 'page')
const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const errors = []

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const msgId = ++id
    pending.set(msgId, { resolve, reject })
    ws.send(JSON.stringify({ id: msgId, method, params }))
  })

ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data)
  if (msg.id && pending.has(msg.id)) {
    const { resolve, reject } = pending.get(msg.id)
    pending.delete(msg.id)
    msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result)
    return
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(`exception: ${msg.params.exceptionDetails.exception?.description}`)
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push(`log: ${msg.params.entry.text}`)
  }
})

await new Promise((r) => ws.addEventListener('open', r, { once: true }))
await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
// headless 里没人点 confirm：直接放行
await send('Page.addScriptToEvaluateOnNewDocument', { source: 'window.confirm = () => true' })
await send('Page.navigate', { url: URL_ })
await new Promise((r) => setTimeout(r, 9000))

const ev = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression: `(async () => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails) return `<<evalError: ${r.exceptionDetails.exception?.description}>>`
  return r.result.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const HELPERS = `
  const byText = (txt, sel = 'button') =>
    Array.from(document.querySelectorAll(sel)).find(e => e.textContent.trim() === txt);
  const setVal = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    d.set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const inputByPlaceholder = (p) =>
    Array.from(document.querySelectorAll('input')).find(i => i.placeholder === p);
  const CARDS = Array.from(document.querySelectorAll('.card'));
  const RIGHT = CARDS[CARDS.length - 1];
  const LOG = () => { const p = document.querySelectorAll('pre'); return p.length ? p[0].innerText : '(无)'; };
  const ROOT = (await (await fetch('/api/info')).json()).default_root;
  const GIRL = async () => (await (await fetch('/api/images?root=' + encodeURIComponent(ROOT)
      + '&f=' + encodeURIComponent('{"any_tags":["1girl"]}'))).json()).rows.map(r => r.rel);
`

const run = async (name, expr) => {
  const out = await ev(`${HELPERS}${expr}`)
  console.log(`--- ${name} ---`)
  console.log(typeof out === 'string' ? out : JSON.stringify(out))
}

await run('0_开始前 1girl 命中', `return await GIRL()`)

await run('1_筛选并全选', `
  setVal(inputByPlaceholder('1girl, solo'), '1girl');
  byText('应用筛选').click();
  return { ok: true };
`)
await wait(1500)

await run('2_全选并开写入', `
  byText('全选').click();
  await new Promise(r => setTimeout(r, 300));
  const live = byText('开启写入'); if (live) live.click();
  return { badge: document.body.innerText.includes('真写盘已开启') };
`)
await wait(500)

await run('3_点 x 删除 1girl（真写）', `
  const x = Array.from(RIGHT.querySelectorAll('button')).find(b => b.textContent.trim() === '×');
  const row = x ? x.closest('div').innerText.trim().split('\\n')[0] : null;
  if (x) x.click();
  return { row };
`)
await wait(2500)
await run('3_b 日志与复查', `return { log: LOG(), girl: await GIRL() }`)

await run('4_回滚最新还原点', `
  // 还原点列表在真写成功后会自己刷新；这里只找侧栏「还原点」那节的刷新按钮
  // （PageHeader 里也有一个「刷新」，语义不同，别点错）。
  const sidebar = document.querySelector('.ui-app-shell-sidebar');
  const refresh = Array.from(sidebar.querySelectorAll('button')).find(b => b.textContent.trim() === '刷新');
  if (refresh) refresh.click();
  await new Promise(r => setTimeout(r, 1200));
  const undo = Array.from(sidebar.querySelectorAll('button')).find(b => b.textContent.trim().startsWith('回滚'));
  const label = undo ? undo.closest('div').innerText.replace(/\\n+/g, ' ') : null;
  if (undo) undo.click();
  return { clicked: !!undo, label };
`)
await wait(3000)
await run('4_b 复查', `return { log: LOG(), girl: await GIRL() }`)

console.log('=== errors ===')
console.log(errors.length ? errors.join('\n') : '(none)')
ws.close()
process.exit(0)
