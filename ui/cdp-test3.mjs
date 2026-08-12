import { spawn } from 'node:child_process';
import http from 'node:http';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9225;
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, '--user-data-dir=' + process.env.TEMP + '\\edge-cdp-t3', 'about:blank'], { stdio: 'ignore' });
const get = (p) => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, msgId = 0; const pending = new Map(); const errors = [];
function send(m, p = {}) { return new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method: m, params: p })); }); }
async function main() {
  let page;
  for (let i = 0; i < 30; i++) { try { const t = await get('/json'); page = t.find(x => x.type === 'page'); if (page) break; } catch { } await sleep(500); }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') { const d = m.params.exceptionDetails; errors.push((d.exception?.description || d.text || '').split('\n').slice(0, 3).join(' | ')); }
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push('console.error: ' + m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200));
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:23456/ui/' });
  await sleep(7000);
  const ev = async (e) => { const r = await send('Runtime.evaluate', { expression: e, returnByValue: true }); return r.exceptionDetails ? 'EVAL-ERR: ' + (r.exceptionDetails.exception?.description || '').split('\n')[0] : r.result?.value; };

  console.log('bundle:', await ev('[...document.scripts].map(s=>s.src.split("/").pop()).join(",")'));
  console.log('h2:', await ev('document.querySelector(".content-area h2")?.textContent'));
  console.log('nav items:', await ev('[...document.querySelectorAll("[data-module],.nav-item")].slice(0,14).map(e=>e.dataset.module||e.textContent.trim()).join("|")'));
  // 逐模块点导航（用真实点击）
  for (const mod of ['settings', 'training', 'config']) {
    console.log(`-- 点击 ${mod}:`, await ev(`(() => {
      const el = [...document.querySelectorAll('[data-module]')].find(e => e.dataset.module === '${mod}');
      if (!el) return 'no-nav-el';
      el.click(); return 'clicked';
    })()`));
    await sleep(1600);
    console.log('   h2:', await ev('document.querySelector(".content-area h2")?.textContent'), '| opacity:', await ev('getComputedStyle(document.querySelector(".content-area")).opacity'));
  }
  // 设置页元素存在性
  await ev(`[...document.querySelectorAll('[data-module]')].find(e => e.dataset.module === 'settings')?.click()`);
  await sleep(1600);
  console.log('主题下拉存在:', await ev('!!document.querySelector("#theme-select")'));
  console.log('强调色板数量:', await ev(`document.querySelectorAll('.accent-swatch').length`));
  console.log('风格主题下拉存在:', await ev('!!document.querySelector("#ui-theme-select")'));
  console.log('瀑布流开关存在:', await ev('!!document.querySelector("#config-waterfall-toggle")'));
  // 点强调色
  console.log('点紫强调色:', await ev(`(() => { const el = document.querySelector('.accent-swatch[data-accent=purple]'); if(!el) return 'no-el'; el.click(); return 'clicked'; })()`));
  await sleep(600);
  console.log('data-lx-accent =', await ev(`document.documentElement.getAttribute('data-lx-accent')`));
  console.log('--accent =', await ev(`getComputedStyle(document.documentElement).getPropertyValue('--accent').trim()`));
  // 风格主题下拉
  console.log('切风格主题 joy:', await ev(`(() => { const el = document.querySelector('#ui-theme-select'); if(!el) return 'no-el'; el.value='joy'; el.dispatchEvent(new Event('change')); return 'done'; })()`));
  await sleep(600);
  console.log('data-lx-theme =', await ev(`document.documentElement.getAttribute('data-lx-theme')`));
  console.log('== 异常 =='); errors.slice(0, 8).forEach(e => console.log(e)); console.log('异常数:', errors.length);
  edge.kill(); process.exit(0);
}
main().catch(e => { console.error(e); edge.kill(); process.exit(1); });
