// 用 CDP（Chrome DevTools Protocol）在真实浏览器里跑一遍 dskit 的 React UI，
// 抓控制台报错 + 首屏可见文本。目的是拿到「确实渲染出来了」的证据，
// 而不是只信 vite build 的退出码。
//
// 用法：先另起一个 headless chrome（--remote-debugging-port=9333 about:blank），
// 再 node ui_probe.mjs [url]
import { writeFileSync } from 'node:fs'

const URL_ = process.argv[2] ?? 'http://127.0.0.1:8765/'
const PORT = Number(process.argv[3] ?? 9333)

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
    const text = (msg.params.args ?? [])
      .map((a) => a.value ?? a.description ?? a.type).join(' ')
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
await send('Page.navigate', { url: URL_ })

// 等 load + 一轮数据请求（/api/info、/api/scan、/api/images）
await new Promise((r) => setTimeout(r, 9000))

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) return `<<evalError: ${r.exceptionDetails.exception?.description}>>`
  return r.result.value
}

const text = await evalJs(
  `(document.querySelector('#root')?.innerText ?? '').slice(0, 4000)`,
)
const stats = await evalJs(`JSON.stringify({
  rootChildren: document.querySelector('#root')?.childElementCount ?? -1,
  htmlLen: document.documentElement.outerHTML.length,
  imgs: document.images.length,
  imgLoaded: Array.from(document.images).filter(i => i.complete && i.naturalWidth > 0).length,
  buttons: document.querySelectorAll('button').length,
  cssVars: getComputedStyle(document.body).getPropertyValue('--color-canvas').trim() || null,
  bodyBg: getComputedStyle(document.body).backgroundColor,
  lang: document.documentElement.lang,
})`)

console.log('=== errors ===')
console.log(errors.length ? errors.join('\n') : '(none)')
console.log('=== console (last 25) ===')
console.log(console_.slice(-25).map((c) => `[${c.level}] ${c.text}`).join('\n') || '(none)')
console.log('=== stats ===')
console.log(stats)
console.log('=== visible text ===')
console.log(text)

writeFileSync('ui_probe_out.json', JSON.stringify({ errors, console_, stats, text }, null, 2), 'utf8')
ws.close()
process.exit(0)
