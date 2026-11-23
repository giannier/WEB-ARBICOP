#!/usr/bin/env node
/**
 * Live check of the shop chrome against the REAL local WordPress shop (Docker stack `web-arbicop`, shop at /tienda).
 * Needs Node >= 22, Chrome and the stack running with the mu-plugin installed. Not part of `npm run check`.
 *
 *   node tools/check-chrome-live.mjs [--base http://localhost:8082] [--product 107] [--dump]
 *
 * On pages WITHOUT Elementor content (cart, checkout, my-account, empty search) the chrome must boot Elementor's
 * frontend itself. For each page this asserts: chrome markers present, Elementor frontend script loaded and
 * `elementorFrontend` defined, no JS errors, desktop hover opens the "Formaciones" dropdown and the 390px hamburger
 * opens on a real click (CDP mouse events). The cart gets one item via the wc-ajax endpoint (NO payment, nothing is
 * submitted) and is emptied again at the end. --dump prints the loaded Elementor/smartmenus script URLs per page.
 */
import {spawn} from 'node:child_process';

const arg = (n, d) => { const i = process.argv.indexOf(n); return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const BASE = arg('--base', 'http://localhost:8082');
const PRODUCT = arg('--product', '107');
const DUMP = process.argv.includes('--dump');
const PORT = 9800 + Math.floor(Math.random() * 150);
const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--disable-gpu', '--hide-scrollbars', `--remote-debugging-port=${PORT}`, `--user-data-dir=${process.env.TEMP || '/tmp'}/cdp-live${PORT}`, 'about:blank'], {stdio: 'ignore'});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let list;
for (let i = 0; i < 40; i++) { try { list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (list.length) break; } catch { /* retry */ } await sleep(300); }
if (!list) { console.error('Chrome did not start'); process.exit(2); }
const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl);
await new Promise(r => { ws.onopen = r; });
let id = 0, logs = [];
const pend = {};
ws.onmessage = e => {
  const m = JSON.parse(e.data);
  if (m.id && pend[m.id]) pend[m.id](m.result ?? m.error);
  else if (m.method === 'Runtime.exceptionThrown') logs.push('exception: ' + (m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text).split('\n')[0].slice(0, 160));
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') logs.push('console.error: ' + m.params.args.map(a => a.value || a.description).join(' ').slice(0, 160));
  else if (m.method === 'Network.responseReceived' && m.params.response.status >= 400) logs.push(`http${m.params.response.status}: ${m.params.response.url}`);
};
const send = (method, params = {}) => new Promise(r => { const i = ++id; pend[i] = r; ws.send(JSON.stringify({id: i, method, params})); });
const ev = async x => (await send('Runtime.evaluate', {expression: x, returnByValue: true, awaitPromise: true})).result?.value;
await send('Page.enable'); await send('Runtime.enable'); await send('Network.enable');
await send('Page.bringToFront'); await send('Emulation.setFocusEmulationEnabled', {enabled: true});

let fails = 0;
const check = (name, cond, detail = '') => { if (!cond) fails++; console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${detail ? '  -> ' + detail : ''}`); };
const go = async (u, w) => { logs = []; await send('Emulation.setDeviceMetricsOverride', {width: w, height: 900, deviceScaleFactor: 1, mobile: w < 600}); await send('Page.navigate', {url: BASE + u}); await sleep(4500); };
const center = async sel => JSON.parse(await ev(`(()=>{const e=document.querySelector(${JSON.stringify(sel)});if(!e)return 'null';const r=e.getBoundingClientRect();return JSON.stringify([r.x+r.width/2,r.y+r.height/2])})()`));
const mouse = (t, x, y) => send('Input.dispatchMouseEvent', {type: t, x, y, button: t === 'mouseMoved' ? 'none' : 'left', clickCount: t === 'mouseMoved' ? 0 : 1});
const subOpen = () => ev(`(()=>{const s=document.querySelector('.elementor-nav-menu--main .sub-menu');if(!s)return false;const c=getComputedStyle(s),r=s.getBoundingClientRect();return c.display!=='none'&&c.visibility!=='hidden'&&r.height>10&&+c.opacity>0.5})()`);

// one cart item through the real wc-ajax endpoint (no checkout submit, no payment)
await go('/tienda/', 1440);
await ev(`fetch('/tienda/?wc-ajax=add_to_cart',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:'product_id=${PRODUCT}&quantity=1'}).then(r=>r.status)`);

const pages = [['cart', '/tienda/cart/'], ['checkout', '/tienda/checkout/'], ['my-account', '/tienda/my-account/'], ['search-no-result', '/tienda/?s=zzqqxx&post_type=product']];
for (const [name, url] of pages) {
  await go(url, 1440);
  const info = JSON.parse(await ev(`JSON.stringify({chrome:!!document.querySelector('[data-arbicop-chrome=header]')&&!!document.querySelector('[data-arbicop-chrome=footer]'),
    efe:typeof elementorFrontend!=='undefined', cfg:typeof elementorFrontendConfig!=='undefined',
    efjs:[...document.scripts].some(s=>/elementor\\/assets\\/js\\/frontend\\.min\\.js/.test(s.src)),
    sm:[...document.scripts].some(s=>/smartmenus/.test(s.src)),
    scripts:[...document.scripts].map(s=>s.src).filter(s=>/elementor|pro-elements|smartmenus/.test(s)).map(s=>s.replace(location.origin,'').replace(/\\?ver=.*/,'')),
    styles:[...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.id).filter(i=>/elementor|widget|arbicop|swiper|e-animation/.test(i))})`));
  if (DUMP) console.log(`DUMP ${name} (${url})\n  scripts: ${info.scripts.join(', ')}\n  styles: ${info.styles.join(', ')}`);
  check(`${name}: chrome header+footer rendered`, info.chrome);
  check(`${name}: Elementor frontend script loaded and elementorFrontend defined`, info.efjs && info.efe && info.cfg, JSON.stringify({efjs: info.efjs, efe: info.efe, cfg: info.cfg}));
  check(`${name}: smartmenus loaded`, info.sm);
  const p = await center('.elementor-nav-menu--main .menu-item-has-children > a');
  check(`${name}: desktop dropdown closed before hover`, !(await subOpen()));
  if (p) { await mouse('mouseMoved', 5, 5); await sleep(200); await mouse('mouseMoved', p[0] - 4, p[1]); await mouse('mouseMoved', p[0], p[1]); await sleep(900); }
  check(`${name}: desktop Formaciones dropdown opens on real hover`, !!p && await subOpen());
  const errs1 = [...new Set(logs)];
  await go(url, 390);
  const t = await center('[data-arbicop-chrome=header] .elementor-menu-toggle');
  const state = () => ev(`(()=>{const n=document.querySelector('[data-arbicop-chrome=header] nav.elementor-nav-menu--dropdown');return [document.querySelector('.elementor-menu-toggle').getAttribute('aria-expanded'),Math.round(n.getBoundingClientRect().height)]})()`);
  if (t) { await mouse('mouseMoved', t[0], t[1]); await mouse('mousePressed', t[0], t[1]); await mouse('mouseReleased', t[0], t[1]); await sleep(1000); }
  const st = t ? await state() : null;
  check(`${name}: 390px hamburger opens on real click`, !!st && st[0] === 'true' && st[1] > 50, JSON.stringify(st));
  const errs = [...new Set([...errs1, ...logs])];
  check(`${name}: no JS errors / failed requests`, errs.length === 0, errs.join(' | '));
}

// cleanup: empty the cart again
await go('/tienda/cart/', 1440);
for (let i = 0; i < 4; i++) { await ev(`(()=>{const a=document.querySelector('a.remove');if(a)a.click();return !!a})()`); await sleep(3000); await go('/tienda/cart/', 1440); }
check('cart emptied after the test', (await ev(`document.querySelectorAll('a.remove').length`)) === 0);
ws.close(); chrome.kill();
console.log(fails ? `\n${fails} check(s) FAILED` : '\nall live checks passed');
process.exit(fails ? 1 : 0);
