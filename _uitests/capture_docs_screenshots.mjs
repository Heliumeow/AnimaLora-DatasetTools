import { writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const URL_ = process.argv[2] ?? 'http://127.0.0.1:8765/'
const PORT = Number(process.argv[3] ?? 9333)
const HEIGHT = 950
const WIDTH = 1600
const HERE = dirname(fileURLToPath(import.meta.url))
const DOCS_IMG_DIR = join(HERE, '..', 'docs', 'images')
mkdirSync(DOCS_IMG_DIR, { recursive: true })

const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
const page = list.find((t) => t.type === 'page')
if (!page) throw new Error('No page target found on CDP port ' + PORT)

const ws = new WebSocket(page.webSocketDebuggerUrl)
let id = 0
const pending = new Map()

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
  }
})

await new Promise((r) => ws.addEventListener('open', r, { once: true }))
await send('Runtime.enable')
await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', {
  width: WIDTH,
  height: HEIGHT,
  deviceScaleFactor: 1,
  mobile: false,
})

const evalJs = async (expression) => {
  const r = await send('Runtime.evaluate', {
    expression: `(() => { ${expression} })()`,
    returnByValue: true,
    awaitPromise: true,
  })
  if (r.exceptionDetails) {
    console.error('Eval error:', r.exceptionDetails.exception?.description)
  }
  return r.result?.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

console.log('Navigating to', URL_)
await send('Page.navigate', { url: URL_ })
await sleep(3000)

// 注入 demo 素材库路径到 localStorage 并触发扫描
const demoPath = 'D:/AnimaLoraStudio/studio_data/dataset_tools/_demo/素材库'.replace(/\\/g, '/')
await evalJs(`
  localStorage.setItem('dskit:last_root', '${demoPath}');
`)
await send('Page.navigate', { url: URL_ })
await sleep(3500)

// 1. 确保选中第一张图片展示单图编辑器
console.log('Selecting first image...')
await evalJs(`
  const cell = document.querySelector('[role="gridcell"]');
  if (cell) cell.click();
`)
await sleep(1500)

// 截图 1: 主模式全景 (01_main_workbench.png + _uitests/shell.png)
console.log('Capturing Screenshot 1: Main Mode Workbench...')
const shot1 = await send('Page.captureScreenshot', { format: 'png' })
const shot1Buf = Buffer.from(shot1.data, 'base64')
writeFileSync(join(DOCS_IMG_DIR, '01_main_workbench.png'), shot1Buf)
writeFileSync(join(HERE, 'shell.png'), shot1Buf)
console.log('Saved 01_main_workbench.png & shell.png')

// 截图 2: 单图编辑右侧面板局部特写 (02_single_editor.png)
console.log('Capturing Screenshot 2: Single Editor Box...')
const editorRect = await evalJs(`
  const editor = document.querySelector('.card:last-child');
  if (!editor) return null;
  const r = editor.getBoundingClientRect();
  return { x: Math.max(0, r.x), y: Math.max(0, r.y), width: r.width, height: r.height };
`)

if (editorRect) {
  const shot2 = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...editorRect, scale: 1 },
  })
  writeFileSync(join(DOCS_IMG_DIR, '02_single_editor.png'), Buffer.from(shot2.data, 'base64'))
  console.log('Saved 02_single_editor.png')
}

// 截图 3: 批量编辑面板特写 (03_batch_editor.png)
console.log('Switching to Batch Editor Tab...')
await evalJs(`
  const btns = Array.from(document.querySelectorAll('button'));
  const batchTab = btns.find(b => b.textContent.includes('批量编辑'));
  if (batchTab) batchTab.click();
  const selectAll = btns.find(b => b.textContent.includes('全选'));
  if (selectAll) selectAll.click();
`)
await sleep(1000)

// 展开高级切分选项
await evalJs(`
  const btns = Array.from(document.querySelectorAll('button'));
  const splitBtn = btns.find(b => b.textContent.includes('自然语言切分选项'));
  if (splitBtn) splitBtn.click();
`)
await sleep(800)

if (editorRect) {
  const shot3 = await send('Page.captureScreenshot', {
    format: 'png',
    clip: { ...editorRect, scale: 1 },
  })
  writeFileSync(join(DOCS_IMG_DIR, '03_batch_editor.png'), Buffer.from(shot3.data, 'base64'))
  console.log('Saved 03_batch_editor.png')
}

// 截图 4: 沉浸式禅模式全屏视图 (04_zen_mode_full.png)
console.log('Entering Zen Mode...')
await evalJs(`
  const btns = Array.from(document.querySelectorAll('button'));
  const zenBtn = btns.find(b => b.textContent.includes('禅模式') || b.textContent.includes('Z'));
  if (zenBtn) zenBtn.click();
`)
await sleep(2500)

console.log('Capturing Screenshot 4: Full Zen Mode HUD...')
const shot4 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(join(DOCS_IMG_DIR, '04_zen_mode_full.png'), Buffer.from(shot4.data, 'base64'))
console.log('Saved 04_zen_mode_full.png')

// 截图 5: 禅模式淘汰切换与目录树聚焦 (05_zen_mode_reject.png)
console.log('Toggling reject in Zen Mode...')
await evalJs(`
  const btns = Array.from(document.querySelectorAll('button'));
  const rejectBtn = btns.find(b => b.textContent.includes('训练集') || b.textContent.includes('淘汰目录'));
  if (rejectBtn) rejectBtn.click();
`)
await sleep(1500)

console.log('Capturing Screenshot 5: Zen Mode Rejected State...')
const shot5 = await send('Page.captureScreenshot', { format: 'png' })
writeFileSync(join(DOCS_IMG_DIR, '05_zen_mode_reject.png'), Buffer.from(shot5.data, 'base64'))
console.log('Saved 05_zen_mode_reject.png')

// 退出禅模式
await evalJs(`
  const btns = Array.from(document.querySelectorAll('button'));
  const exitBtn = btns.find(b => b.textContent.includes('退出'));
  if (exitBtn) exitBtn.click();
`)
await sleep(1000)

console.log('All screenshots captured successfully!')
ws.close()
process.exit(0)
