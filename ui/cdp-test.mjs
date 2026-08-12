// CDP 端到端：打开 dev UI，收集控制台错误，模拟模块切换与设置项点击
import { spawn } from 'node:child_process';
import http from 'node:http';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9222;
const TARGET = 'http://localhost:3006/';

const edge = spawn(EDGE, [
  '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
  `--remote-debugging-port=${PORT}`, '--user-data-dir=' + process.env.TEMP + '\\edge-cdp-profile',
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
const logs = [];

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
  return new Promise((resolve, reject) => {
    const id = ++msgId;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params }));
  });
}

async function main() {
  await connect();
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result || m.error); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      errors.push('EXC: ' + (d.exception?.description || d.text || '').split('\n').slice(0, 4).join(' | '));
    }
    if (m.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(m.params.type)) {
      logs.push(m.params.type.toUpperCase() + ': ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300));
    }
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Page.navigate', { url: TARGET });
  await sleep(4000);

  const evalJs = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;

  console.log('== 页面标题:', await evalJs('document.title'));
  console.log('== content-area 存在:', await evalJs('!!document.querySelector(".content-area")'));

  // 模块切换测试：config → settings → config → training → config
  for (const mod of ['settings', 'config', 'training', 'config']) {
    await evalJs(`window.renderView ? (renderView('${mod}'), 'ok') : 'no-renderView'`);
    await sleep(1200);
    const info = await evalJs(`(() => { const c = document.querySelector('.content-area'); return { opacity: getComputedStyle(c).opacity, len: c.innerHTML.length }; })()`);
    console.log(`切换到 ${mod}:`, JSON.stringify(info));
  }

  // 设置页点击测试
  await evalJs(`renderView('settings')`);
  await sleep(1000);
  console.log('== 设置页开关数量:', await evalJs(`document.querySelectorAll('.content-area input[type=checkbox]').length`));
  // 点瀑布流开关
  await evalJs(`(() => { const el = document.querySelector('#config-waterfall-toggle'); if (el) { el.checked = true; el.dispatchEvent(new Event('change')); return 'clicked'; } return 'not-found'; })()`).then(r => console.log('瀑布流开关点击:', r));
  await sleep(800);
  console.log('瀑布流状态:', await evalJs(`localStorage.getItem('sd-rescripts:config-waterfall')`));
  // 主题切换
  await evalJs(`(() => { const el = document.querySelector('#theme-select'); if (el) { el.value = 'light'; el.dispatchEvent(new Event('change')); return 'clicked'; } return 'not-found'; })()`).then(r => console.log('主题下拉切换:', r));
  await sleep(800);
  console.log('html class:', await evalJs('document.documentElement.className'));
  // 强调色
  await evalJs(`(() => { const el = document.querySelector('.accent-swatch[data-accent=purple]'); if (el) { el.click(); return 'clicked'; } return 'not-found'; })()`).then(r => console.log('强调色点击:', r));
  await sleep(500);
  console.log('data-lx-accent:', await evalJs(`document.documentElement.getAttribute('data-lx-accent')`));

  console.log('\n== 控制台错误 ==');
  errors.forEach(e => console.log(e));
  logs.slice(0, 10).forEach(l => console.log(l));
  console.log('错误数:', errors.length);

  edge.kill();
  process.exit(0);
}

main().catch(e => { console.error(e); edge.kill(); process.exit(1); });
