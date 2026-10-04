// 验证「外壳已接原生 app-shell 契约」并且各窗格自己会滚。
//
// 用法：先另起 headless chrome（--remote-debugging-port=9333 about:blank），
//      再 node ui_shell.mjs [url] [port] [height]
// 产物：同目录 shell.png（整页截图，用于目视核对）
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const URL_ = process.argv[2] ?? 'http://127.0.0.1:8765/'
const PORT = Number(process.argv[3] ?? 9333)
const HEIGHT = Number(process.argv[4] ?? 1050)
const WIDTH = Number(process.argv[5] ?? 1680)
const HERE = dirname(fileURLToPath(import.meta.url))

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find((t) => t.type === 'page')
if (!page) throw new Error('no page target')

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()
const console_ = []
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
  if (msg.method === 'Runtime.consoleAPICalled') {
    const text = (msg.params.args ?? []).map((a) => a.value ?? a.description ?? a.type).join(' ')
    console_.push({ level: msg.params.type, text })
    if (msg.params.type === 'error') errors.push(`console.error: ${text}`)
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    const d = msg.params.exceptionDetails
    errors.push(`exception: ${d.exception?.description ?? d.text}`)
  }
  if (msg.method === 'Log.entryAdded') {
    const e = msg.params.entry
    console_.push({ level: e.level, text: `${e.source}: ${e.text}` })
    if (e.level === 'error') errors.push(`log.${e.source}: ${e.text}`)
  }
})

await new Promise((r) => ws.addEventListener('open', r, { once: true }))
await send('Runtime.enable')
await send('Log.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
})
await send('Page.navigate', { url: URL_ })
await new Promise((r) => setTimeout(r, 9000))

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) return `<<evalError: ${r.exceptionDetails.exception?.description}>>`
  return r.result.value
}

// 点一个按文本找得到的按钮（React 的 onClick 走原生 click 就够）
const clickByText = (label) => evalJs(`(() => {
  const b = Array.from(document.querySelectorAll('button')).find(x => (x.textContent||'').trim() === ${JSON.stringify(label)})
  if (!b) return 'not-found'
  b.click(); return 'clicked'
})()`)

const editorInfo = () => evalJs(`(() => {
  const h3 = Array.from(document.querySelectorAll('h3')).find((h) => h.textContent.includes('单图编辑'))
  const sec = h3 ? h3.closest('section') : null
  return JSON.stringify({
    heading: h3 ? h3.textContent.trim() : null,
    text: sec ? sec.innerText.replace(/\\n+/g, ' | ').slice(0, 260) : null,
  })
})()`)

console.log('=== 编辑器（点图之前）===')
console.log(await editorInfo())

// 未选中任何图时单击网格 = 进入单图编辑（仓库 ImageGrid 的 clickMode 约定）
console.log('点第一张：', await evalJs(`(() => {
  const cell = document.querySelector('[role="gridcell"]')
  if (!cell) return 'no-cell'
  cell.click(); return cell.getAttribute('title') || 'clicked'
})()`))
await new Promise((r) => setTimeout(r, 1000))
console.log('=== 编辑器（点图之后）===')
console.log(await editorInfo())

console.log('全选：', await clickByText('全选'))
await new Promise((r) => setTimeout(r, 1200))

const report = await evalJs(`(() => {
  const el = (s) => document.querySelector(s)
  const info = (n) => n ? {
    cls: String(n.className).slice(0, 90),
    ch: n.clientHeight, sh: n.scrollHeight,
    oy: getComputedStyle(n).overflowY,
  } : null
  const main = el('main#dskit-main')
  const shell = el('.ui-app-shell')
  const cards = Array.from(document.querySelectorAll('.card'))
  const scrollables = Array.from(document.querySelectorAll('*')).filter((n) => {
    const s = getComputedStyle(n)
    return (s.overflowY === 'auto' || s.overflowY === 'scroll') && n.scrollHeight > n.clientHeight + 2
  }).map((n) => ({ tag: n.tagName, cls: String(n.className).slice(0, 70), ch: n.clientHeight, sh: n.scrollHeight }))
  return JSON.stringify({
    hasShell: !!shell,
    hasWorkspace: !!el('.ui-app-shell-workspace'),
    hasSidebar: !!el('.ui-app-shell-sidebar'),
    hasBreadcrumbs: !!el('.ui-app-shell-breadcrumbs'),
    hasTopbarStats: !!el('.ui-app-shell-topbar-stats'),
    hasPageHeader: !!el('.ui-page-header'),
    mainIdOk: !!main,
    mainOverflowY: main ? getComputedStyle(main).overflowY : null,
    containedIsMainFirstChild:
      !!main && main.firstElementChild?.getAttribute('data-app-shell-scroll') === 'contained',
    shellGridCols: shell ? getComputedStyle(shell).gridTemplateColumns : null,
    shellHeight: shell ? shell.clientHeight : null,
    bodyOverflow: getComputedStyle(document.body).overflow,
    sidebar: info(el('.ui-app-shell-sidebar')),
    sidebarNav: info(el('.ui-app-shell-sidebar-nav')),
    cardCount: cards.length,
    rightCard: info(cards[cards.length - 1]),
    gridCard: info(cards[0]),
    badges: Array.from(document.querySelectorAll('.badge')).map((b) => b.textContent.trim()),
    selectedText: (Array.from(document.querySelectorAll('h3')).find(h => h.textContent.includes('已选')) || {}).textContent || null,
    statsTitle: (Array.from(document.querySelectorAll('*')).find(n => /个 tag|tag 分布|no tag/i.test(n.textContent||'') && n.children.length === 0) || {}).textContent || null,
    scrollables,
    imgs: document.images.length,
    imgLoaded: Array.from(document.images).filter(i => i.complete && i.naturalWidth > 0).length,
    htmlLen: document.documentElement.outerHTML.length,
    // 被裁掉(横向装不下)的元素：用来判断 232px 侧栏是不是把表单挤没了
    clipped: ['sidebarNav', 'gridCard', 'rightCard'].map((key) => {
      const host = key === 'sidebarNav' ? el('.ui-app-shell-sidebar-nav') : cards[key === 'gridCard' ? 0 : cards.length - 1]
      if (!host) return { key, items: [] }
      const bad = Array.from(host.querySelectorAll('*')).filter((n) => {
        const s = getComputedStyle(n)
        return n.scrollWidth > n.clientWidth + 2 && s.overflowX !== 'auto' && s.overflowX !== 'scroll' && n.clientWidth > 0
      }).slice(0, 8).map((n) => ({ tag: n.tagName, cls: String(n.className).slice(0, 55), cw: n.clientWidth, sw: n.scrollWidth }))
      return { key, cw: host.clientWidth, sw: host.scrollWidth, items: bad }
    }),
  })
})()`)

console.log('=== errors ===')
console.log(errors.length ? errors.join('\n') : '(none)')
console.log('=== console ===')
console.log(console_.slice(-15).map((c) => `[${c.level}] ${c.text}`).join('\n') || '(none)')
console.log('=== report ===')
console.log(report)

console.log('=== 覆盖滚动实测（人为把右栏内容撑高，看它是否真的能滚）===')
console.log(await evalJs(`(() => {
  const cards = Array.from(document.querySelectorAll('.card'))
  const right = cards[cards.length - 1]
  if (!right) return 'no right card'
  const roots = Array.from(right.children)
  const statsRoot = roots.find((n) => n.querySelector('*') && getComputedStyle(n).flexGrow === '1')
  if (!statsRoot) return 'no stats root: ' + roots.map(n => n.tagName + '.' + String(n.className).slice(0,40)).join(' | ')
  const inner = Array.from(statsRoot.querySelectorAll('*')).find((n) => {
    const s = getComputedStyle(n)
    return (s.overflowY === 'auto' || s.overflowY === 'scroll')
  })
  if (!inner) return 'stats root has no overflow-y scroller'
  const before = { rootClient: statsRoot.clientHeight, rootScroll: statsRoot.scrollHeight, innerClient: inner.clientHeight, innerScroll: inner.scrollHeight }
  const probe = document.createElement('div'); probe.style.height = '3000px'
  inner.appendChild(probe)
  const grown = { rootClient: statsRoot.clientHeight, rootScroll: statsRoot.scrollHeight, innerClient: inner.clientHeight, innerScroll: inner.scrollHeight }
  inner.scrollTop = 900
  const scrolled = inner.scrollTop
  probe.remove()
  return JSON.stringify({ before, grown, scrolled })
})()`))

const shot = await send('Page.captureScreenshot', { format: 'png' })
const out = join(HERE, 'shell.png')
writeFileSync(out, Buffer.from(shot.data, 'base64'))
console.log('截图：', out)
ws.close()
process.exit(0)
