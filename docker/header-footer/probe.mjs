// Evaluates a JS expression in a page through CDP. Usage: node probe.mjs <url> "<js>"
import { spawn } from 'node:child_process';
const PORT = process.env.PORT || 9351; const [url, js] = process.argv.slice(2);
const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--remote-debugging-port=' + PORT, '--user-data-dir=' + process.env.TEMP + '/cdp-prof' + PORT, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list; for (let i = 0; i < 40; i++) { try { list = await (await fetch('http://127.0.0.1:' + PORT + '/json')).json(); if (list.length) break; } catch {} await sleep(300); }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise(r => ws.onopen = r);
let id = 0; const pend = {}; ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && pend[m.id]) pend[m.id](m.result ?? m.error); };
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Page.navigate', { url }); await sleep(5000);
console.log(JSON.stringify((await send('Runtime.evaluate', { expression: js, returnByValue: true })).result.value));
ws.close(); chrome.kill();
