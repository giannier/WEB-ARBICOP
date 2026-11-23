// Minimal Chrome DevTools Protocol client (Node >= 22: global WebSocket/fetch). Dev tooling only, not part of the build.
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);

export const sleep = ms => new Promise(r => setTimeout(r, ms));

export async function launchChrome(port = 9444) {
  const bin = CHROME_CANDIDATES.find(p => fs.existsSync(p));
  if (!bin) throw new Error('Chrome not found (set CHROME_PATH)');
  const profile = path.join(os.tmpdir(), `arbicop-cdp-${port}-${Date.now()}`);
  const proc = spawn(bin, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--mute-audio', '--no-first-run',
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, 'about:blank'], {stdio: 'ignore'});
  let list;
  for (let i = 0; i < 60; i++) {
    try { list = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (list.length) break; } catch {}
    await sleep(250);
  }
  if (!list) throw new Error('Chrome did not start');
  return {port, proc, close: () => proc.kill()};
}

/** Opens a new tab and returns a session object. */
export async function newTab(port) {
  const t = await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, {method: 'PUT'})).json();
  const ws = new WebSocket(t.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0;
  const pending = new Map();
  const listeners = new Map();
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { const {res} = pending.get(m.id); pending.delete(m.id); res(m.error ? {error: m.error} : m.result); }
    else if (m.method && listeners.has(m.method)) for (const fn of listeners.get(m.method)) fn(m.params);
  };
  const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, {res}); ws.send(JSON.stringify({id: i, method, params})); });
  const on = (method, fn) => { if (!listeners.has(method)) listeners.set(method, []); listeners.get(method).push(fn); };
  const evaluate = async (expression, awaitPromise = false) => {
    const r = await send('Runtime.evaluate', {expression, returnByValue: true, awaitPromise});
    if (r.exceptionDetails) throw new Error('eval: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result?.value;
  };
  const close = async () => { try { await fetch(`http://127.0.0.1:${port}/json/close/${t.id}`); } catch {} ws.close(); };
  await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable'); await send('Log.enable');
  return {send, on, evaluate, close, id: t.id};
}

export async function setViewport(tab, width, height = 900) {
  const mobile = width < 600;
  await tab.send('Emulation.setDeviceMetricsOverride', {width, height, deviceScaleFactor: 1, mobile});
  if (mobile) await tab.send('Emulation.setTouchEmulationEnabled', {enabled: true});
}

/** Navigates and waits for the load event (with a safety timeout). */
export async function goto(tab, url, timeout = 30000) {
  let done;
  const p = new Promise(r => { done = r; });
  tab.on('Page.loadEventFired', () => done());
  await tab.send('Page.navigate', {url});
  await Promise.race([p, sleep(timeout)]);
}

/** Scrolls through the page so lazy images/backgrounds and scroll animations trigger, then returns to the top. */
export async function settle(tab, {step = 350, wait = 120, final = 2500} = {}) {
  await tab.evaluate(`(async () => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    let y = 0;
    while (y < document.documentElement.scrollHeight) { window.scrollTo(0, y); y += ${step}; await sleep(${wait}); }
    window.scrollTo(0, document.documentElement.scrollHeight); await sleep(${wait * 3});
    return true; })()`, true);
  await sleep(final);
  await tab.evaluate('window.scrollTo(0,0)');
  await sleep(700);
}

export async function fullShot(tab, width) {
  const h = await tab.evaluate('Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)');
  const r = await tab.send('Page.captureScreenshot', {format: 'png', captureBeyondViewport: true, clip: {x: 0, y: 0, width, height: Math.min(h, 16000), scale: 1}});
  return {png: Buffer.from(r.data, 'base64'), height: h};
}
