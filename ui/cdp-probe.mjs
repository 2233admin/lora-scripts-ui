import { spawn } from 'node:child_process';
import http from 'node:http';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9224;
const edge = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, '--user-data-dir=' + process.env.TEMP + '\\edge-cdp-probe', 'about:blank'], { stdio: 'ignore' });
const get = (p) => new Promise((res, rej) => { http.get({ host: '127.0.0.1', port: PORT, path: p }, (r) => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(JSON.parse(d))); }).on('error', rej); });
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
let ws, msgId = 0; const pending = new Map(); const events = [];
function send(method, params = {}) { return new Promise((res) => { const id = ++msgId; pending.set(id, res); ws.send(JSON.stringify({ id, method, params })); }); }
async function main() {
  let page;
  for (let i = 0; i < 30; i++) { try { const t = await get('/json'); page = t.find(x => x.type === 'page'); if (page) break; } catch { } await sleep(500); }
  ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise(r => { ws.onopen = r; });
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m.error); pending.delete(m.id); }
    if (m.method && (m.method.startsWith('Runtime.') || m.method.startsWith('Log.') || m.method === 'Network.loadingFailed')) events.push(JSON.stringify(m).slice(0, 400));
  };
  await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable'); await send('Network.enable');
  await send('Page.navigate', { url: 'http://127.0.0.1:23456/ui/' });
  await sleep(8000);
  const ev = async (e) => (await send('Runtime.evaluate', { expression: e, returnByValue: true })).result?.value;
  console.log('href:', await ev('location.href'));
  console.log('title:', await ev('document.title'));
  console.log('body len:', await ev('document.body?.innerHTML.length'));
  console.log('scripts:', await ev('[...document.scripts].map(s=>s.src).join(",")'));
  console.log('#app:', await ev('!!document.querySelector("#app")'));
  console.log('readyState:', await ev('document.readyState'));
  console.log('== 事件 =='); events.slice(0, 15).forEach(e => console.log(e));
  edge.kill(); process.exit(0);
}
main().catch(e => { console.error(e); edge.kill(); process.exit(1); });
