// CDP 验证：对 23456 正式页面测主题切换/强调色/风格主题/瀑布流/导航
import { spawn } from 'node:child_process';
import http from 'node:http';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9223;
const TARGET = 'http://127.0.0.1:23456/ui/';

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=' + process.env.TEMP + '\\edge-cdp-profile2',
  'about:blank',
], { stdio: 'ignore' });

const get = (path) => new Promise((res, rej) => {
  http.get({ host: '127.0.0.1', port: PORT, path }, (r) => {
    let d = ''; r.on('data', (c) => d += c); r.on('end', () => res(JSON.parse(d)));
  }).on('error', rej);
});
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

let ws, msgId = 0;
const pending = new Map();
const errors = [];

async function connect() {
  for (let i = 0; i < 30; i++) {
    try {
      const targets = await get('/json');
      const page = targets.find(t => t.type === 'page');
      if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); return; }
    } catch { }
    await sleep(500);
  }
  throw new Error('CDP connect failed');
}
function send(method, params = {}) {
  return new Promise((resolve) => {
    const id = ++msgId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  await connect();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push('EXC: ' + (d.exception?.description || d.text || '').split('\n').slice(0, 3).join(' | '));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: TARGET });
  await sleep(6000);
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

  console.log('content-area:', await ev('!!document.querySelector(".content-area")'));
  console.log('app html len:', await ev('document.querySelector(".content-area")?.innerHTML.length || 0'));

  // 1. 导航往返：config → settings → training → config
  for (const mod of ['settings', 'training', 'config']) {
    await ev(`renderView('${mod}')`);
    await sleep(1500);
    const info = await ev(`(() => { const c = document.querySelector('.content-area'); return getComputedStyle(c).opacity + '/' + c.innerHTML.length; })()`);
    console.log(`导航 ${mod}: opacity/len = ${info}`);
  }

  // 2. 设置页：强调色
  await ev(`renderView('settings')`);
  await sleep(1500);
  await ev(`(() => { const el = document.querySelector('.accent-swatch[data-accent=purple]'); if (el) { el.click(); return 1; } return 0; })()`);
  await sleep(600);
  console.log('强调色 data-lx-accent =', await ev(`document.documentElement.getAttribute('data-lx-accent')`));
  console.log('强调色 --accent =', await ev(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`));

  // 3. 主题切换（顶栏/侧栏按钮）
  const before = await ev('document.documentElement.className');
  await ev(`(() => { const el = document.querySelector('#theme-toggle'); if (el) { el.click(); return 1; } return 0; })()`);
  await sleep(1200);
  const after = await ev('document.documentElement.className');
  console.log('主题切换:', before, '=>', after);

  // 4. 风格主题按钮
  const t0 = await ev(`document.documentElement.getAttribute('data-lx-theme')`);
  await ev(`(() => { const el = document.querySelector('#style-toggle'); if (el) { el.click(); return 1; } return 0; })()`);
  await sleep(1200);
  const t1 = await ev(`document.documentElement.getAttribute('data-lx-theme')`);
  console.log('风格主题:', t0, '=>', t1);

  // 5. 瀑布流 + 迷你导航
  await ev(`(() => { const el = document.querySelector('#config-waterfall-toggle'); if (el && !el.checked) { el.checked = true; el.dispatchEvent(new Event('change')); } return 1; })()`);
  await sleep(500);
  await ev(`renderView('config')`);
  await sleep(1500);
  console.log('瀑布流容器:', await ev(`!!document.querySelector('.form-container-waterfall')`));
  console.log('迷你导航:', await ev(`!!document.querySelector('.waterfall-mini-nav')`));
  console.log('迷你导航分段数:', await ev(`document.querySelectorAll('.waterfall-mini-nav-child').length`));

  console.log('\n== JS 异常 ==');
  errors.forEach(e => console.log(e));
  console.log('异常数:', errors.length);
  edge.kill();
  process.exit(0);
}
main().catch(e => { console.error(e); edge.kill(); process.exit(1); });
