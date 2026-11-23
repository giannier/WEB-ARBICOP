// Full-page screenshots through Chrome DevTools Protocol (Node >= 22). Usage: node shot.mjs <width> <outDir> <name=url>...
import { spawn } from 'node:child_process'; import fs from 'node:fs';
const PORT = process.env.PORT || 9333;
const [width, outDir, ...pairs] = process.argv.slice(2); const W = +width, mobile = W < 600;
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--remote-debugging-port=' + PORT, '--user-data-dir=' + process.env.TEMP + '/cdp-prof' + PORT, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); if (list.length) break; } catch {} await sleep(300); }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) pend[m.id](m.result ?? m.error); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: W, height: mobile ? 800 : 1000, deviceScaleFactor: 1, mobile });
for (const p of pairs) {
  const [name, url] = [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)];
  await send('Page.navigate', { url }); await sleep(6000);
  const h = (await send('Runtime.evaluate', { expression: 'window.scrollTo(0,document.body.scrollHeight);Math.max(document.body.scrollHeight,document.documentElement.scrollHeight)', returnByValue: true })).result.value;
  await sleep(1200); await send('Runtime.evaluate', { expression: 'window.scrollTo(0,0)' }); await sleep(500);
  const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: Math.min(h, 12000), scale: 1 } });
  fs.writeFileSync(`${outDir}/${name}.png`, Buffer.from(r.data, 'base64')); console.log(name, h);
}
ws.close(); chrome.kill();
