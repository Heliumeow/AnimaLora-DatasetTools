// 驱动真实浏览器把 dskit UI 的主要交互走一遍（选择 / tag 分布 / 筛选 / dry-run 编辑），
// 每步都把可见文本取回来，作为「复用的仓库组件确实工作」的证据。
//
// 用法：先起 headless chrome（--remote-debugging-port=9333 about:blank），
// 再 node ui_interact.mjs [url] [port]
const URL_ = process.argv[2] ?? 'http://127.0.0.1:8765/'
const PORT = Number(process.argv[3] ?? 9333)

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find((t) => t.type === 'page')
if (!page) throw new Error('no page target')

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
await send('Page.navigate', { url: URL_ })
await new Promise((r) => setTimeout(r, 9000))

const ev = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression: `(() => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails) return `<<evalError: ${r.exceptionDetails.exception?.description}>>`
  return r.result.value
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// 页面内复用的小工具（每次注入）：按文本点按钮、按 React 的方式写 input。
const HELPERS = `
  const byText = (txt, sel = 'button') =>
    Array.from(document.querySelectorAll(sel)).find(e => e.textContent.trim() === txt);
  const setVal = (el, v) => {
    const d = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
    d.set.call(el, v);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const inputByPlaceholder = (p) =>
    Array.from(document.querySelectorAll('input')).find(i => i.placeholder === p);
  const CARDS = () => Array.from(document.querySelectorAll('.card'));
  const LEFT = document.querySelector('.ui-app-shell-sidebar');
  const RIGHT = CARDS()[CARDS().length - 1];
  const COUNT = () => (document.body.innerText.match(/选择（已选 (\\d+)）/) ?? [])[1];
  const GRID = () => {
    const h2 = CARDS()[0] ? CARDS()[0].querySelector('h2') : null;
    return h2 ? h2.textContent.trim() : null;
  };
  const FILTERDESC = () => {
    const p = LEFT ? LEFT.querySelector('p.font-mono') : null;
    return p ? p.textContent.trim() : null;
  };
  const LOG = () => {
    const heads = Array.from(document.querySelectorAll('pre'));
    return heads.length ? heads[0].innerText : '(无)';
  };
  const STATS = () => RIGHT.innerText.replace(/\\n+/g, ' | ').slice(0, 700);
`

const steps = {}
const run = async (name, expr) => {
  const out = await ev(`${HELPERS}${expr}`)
  steps[name] = out
  console.log(`--- ${name} ---`)
  console.log(typeof out === 'string' ? out : JSON.stringify(out))
}

await run('0_initial', `return { count: COUNT(), grid: GRID(), cards: document.images.length }`)

await run('1_select_all', `
  byText('全选').click();
  return { clicked: true };
`)
await wait(600)
await run('1_b_result', `return { count: COUNT(), stats: STATS() }`)

await run('2_pick_tag', `
  const rows = Array.from(document.querySelectorAll('button')).filter(b => b.textContent.trim());
  ${''}
  return { note: '下一条点第一个 tag 文字按钮' };
`)

await run('3_click_tag_row', `
  // tag 行里那个「点 tag 文字」按钮：在统计面板里、文本非空、不是 × / ✎
  const btns = Array.from(RIGHT.querySelectorAll('button'))
    .filter(b => { const t = b.textContent.trim(); return t && t !== '×' && t !== '✎' && t !== '↑' && t !== '↓'; });
  const target = btns[btns.length - 1];
  const label = target ? target.innerText.trim() : null;
  if (target) target.click();
  return { label };
`)
await wait(800)
await run('3_b_result', `return { count: COUNT(), stats: STATS() }`)

await run('4_filter', `
  setVal(inputByPlaceholder('1girl, solo'), '1girl');
  byText('应用筛选').click();
  return { set: true };
`)
await wait(1500)
await run('4_b_result', `return { grid: GRID(), count: COUNT(), filterDesc: FILTERDESC() }`)

await run('5_select_and_remove', `
  byText('全选').click();
  return { ok: true };
`)
await wait(500)
await run('5_b_pick_x', `
  const x = Array.from(RIGHT.querySelectorAll('button')).find(b => b.textContent.trim() === '×');
  const row = x ? x.closest('div').innerText.trim() : null;
  if (x) x.click();
  return { row };
`)
await wait(2000)
await run('5_c_log', `return { count: COUNT(), log: LOG() }`)

await run('6_live_toggle', `
  const b = byText('开启写入'); if (b) b.click(); return { clicked: !!b };
`)
await wait(400)
await run('6_b_badge', `return { header: document.body.innerText.split('\\n').slice(0, 6).join(' | ') }`)

console.log('=== errors ===')
console.log(errors.length ? errors.join('\n') : '(none)')
ws.close()
process.exit(0)
