#!/usr/bin/env node
/**
 * Pixel comparison of the static clone against the local WordPress render (headless Chrome via CDP).
 *   node tools/visual-compare.mjs [--static http://localhost:8084] [--wp http://localhost:8082]
 *        [--out docker/screenshots] [--widths 1440,390] [--pages home,nosotros] [--prefix static]
 * Also records console errors, failed requests (>=400 / net errors) and every external host requested by the static pages.
 * Writes <out>/static-diff.md (summary) and <out>/<prefix>-<page>-<width>-{wp,static,diff}.png
 */
import fs from 'node:fs';
import path from 'node:path';
import {launchChrome, newTab, setViewport, goto, settle, fullShot, sleep} from './lib/cdp.mjs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const STATIC = opt('--static', 'http://localhost:8084').replace(/\/+$/, '');
const WP = opt('--wp', 'http://localhost:8082').replace(/\/+$/, '');
const OUT = path.resolve(opt('--out', 'docker/screenshots'));
const WIDTHS = opt('--widths', '1440,390').split(',').map(Number);
const PREFIX = opt('--prefix', 'static');
const ALL = [
  ['home', '/', '/'], ['nosotros', '/nosotros/', '/nosotros/'], ['peritaje', '/peritaje/', '/peritaje/'],
  ['arbitraje', '/arbitraje/', '/arbitraje/'], ['conciliacion', '/conciliacion/', '/conciliacion/'],
  ['tasacion', '/tasacion/', '/tasacion/'], ['corretaje', '/corretaje/', '/corretaje/'],
  ['beneficios', '/beneficios/', '/beneficios/'], ['contacto', '/contacto/', '/contacto/'],
  ['libro', '/libro-de-reclamaciones/', '/libro-de-reclamaciones-2/'],
];
const only = opt('--pages', '').split(',').filter(Boolean);
const PAGES = ALL.filter(p => !only.length || only.includes(p[0]));
fs.mkdirSync(OUT, {recursive: true});

const chrome = await launchChrome(9455);
const main = await newTab(chrome.port);
const differ = await newTab(chrome.port);

const DIFF_JS = (a, b) => `(async () => {
  const load = b64 => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = 'data:image/png;base64,' + b64; });
  const [A, B] = await Promise.all([load(${JSON.stringify(a)}), load(${JSON.stringify(b)})]);
  const W = Math.max(A.width, B.width), H = Math.max(A.height, B.height);
  const mk = img => { const c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d', {willReadFrequently: true}); x.fillStyle = '#ff00ff'; x.fillRect(0, 0, W, H); x.drawImage(img, 0, 0); return x.getImageData(0, 0, W, H); };
  const da = mk(A), db = mk(B), out = document.createElement('canvas'); out.width = W; out.height = H;
  const ox = out.getContext('2d'), od = ox.createImageData(W, H);
  let strict = 0, tol = 0; const bands = new Array(Math.ceil(H / 100)).fill(0);
  for (let i = 0; i < da.data.length; i += 4) {
    const d = Math.max(Math.abs(da.data[i] - db.data[i]), Math.abs(da.data[i+1] - db.data[i+1]), Math.abs(da.data[i+2] - db.data[i+2]));
    const p = i / 4, y = Math.floor(p / W);
    if (d > 0) strict++;
    if (d > 24) { tol++; bands[Math.floor(y / 100)]++; od.data[i] = 255; od.data[i+1] = 0; od.data[i+2] = 0; od.data[i+3] = 255; }
    else { const g = (da.data[i] + da.data[i+1] + da.data[i+2]) / 3; od.data[i] = od.data[i+1] = od.data[i+2] = 255 - (255 - g) * 0.25; od.data[i+3] = 255; }
  }
  ox.putImageData(od, 0, 0);
  const worst = bands.map((n, k) => ({y: k * 100, pct: +(100 * n / (W * 100)).toFixed(2)})).sort((x, y) => y.pct - x.pct).slice(0, 3);
  return {W, H, hA: A.height, hB: B.height, strictPct: +(100 * strict / (W * H)).toFixed(3), tolPct: +(100 * tol / (W * H)).toFixed(3), worst, png: out.toDataURL('image/png').split(',')[1]};
})()`;

async function load(tab, url, width) {
  await tab.send('Page.bringToFront'); // a background tab throttles image decoding/painting
  await tab.send('Emulation.setFocusEmulationEnabled', {enabled: true});
  await setViewport(tab, width, 900);
  await goto(tab, url);
  await sleep(800);
  await settle(tab);
  return fullShot(tab, width);
}

const rows = [], consoleLog = [], failedLog = [], hosts = new Map();
let cur = null; // collectors for the static load in progress
main.on('Runtime.exceptionThrown', e => cur?.errs.push('exception: ' + (e.exceptionDetails.exception?.description || e.exceptionDetails.text).split('\n')[0]));
main.on('Runtime.consoleAPICalled', e => { if (e.type === 'error') cur?.errs.push('console.error: ' + e.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 200)); });
main.on('Log.entryAdded', e => { if (e.entry.level === 'error') cur?.errs.push(`log: ${e.entry.text} ${e.entry.url || ''}`.slice(0, 220)); });
main.on('Network.responseReceived', e => { if (e.response.status >= 400) cur?.fails.push(`${e.response.status} ${e.response.url}`); });
main.on('Network.loadingFailed', e => { if (!e.canceled) cur?.fails.push(`failed ${e.errorText} ${e.requestId}`); });
main.on('Network.requestWillBeSent', e => cur?.reqs.push(e.request.url));

for (const [name, sp, wpPath] of PAGES) {
  for (const w of WIDTHS) {
    cur = {errs: [], fails: [], reqs: []};
    const s = await load(main, STATIC + sp, w);
    const got = cur; cur = null;
    for (const u of got.reqs) {
      try {
        const h = new URL(u);
        if (!/^(data|blob|about|chrome)/.test(h.protocol) && h.origin !== STATIC) {
          if (!hosts.has(h.host)) hosts.set(h.host, new Set());
          hosts.get(h.host).add(`${name}:${h.pathname}`.slice(0, 80));
        }
      } catch { /* ignore */ }
    }
    const r = await load(main, WP + wpPath, w);
    fs.writeFileSync(path.join(OUT, `${PREFIX}-${name}-${w}-static.png`), s.png);
    fs.writeFileSync(path.join(OUT, `${PREFIX}-${name}-${w}-wp.png`), r.png);
    const d = await differ.evaluate(DIFF_JS(r.png.toString('base64'), s.png.toString('base64')), true);
    fs.writeFileSync(path.join(OUT, `${PREFIX}-${name}-${w}-diff.png`), Buffer.from(d.png, 'base64'));
    rows.push({name, w, hWp: d.hA, hSt: d.hB, strict: d.strictPct, tol: d.tolPct, worst: d.worst});
    consoleLog.push(...got.errs.map(e => `${name}@${w}: ${e}`));
    failedLog.push(...got.fails.map(e => `${name}@${w}: ${e}`));
    console.log(`${name}@${w}: height wp=${d.hA} static=${d.hB} diff(any)=${d.strictPct}% diff(>24)=${d.tolPct}% worst=${d.worst.map(x => x.y + 'px:' + x.pct + '%').join(' ')}`);
  }
}
chrome.close();

function writeReport() {
const md = [
  '# Static clone vs local WordPress: pixel diff', '',
  `Generated ${new Date().toISOString()} | static ${STATIC} vs WP ${WP}`, '',
  'Full-page Chrome screenshots after scrolling the page to trigger lazy loading/animations. "any" = pixels with any channel delta > 0; "tol" = delta > 24/255 on any channel (visible difference). Worst = 100px bands with the most differing pixels.', '',
  '| page | width | height WP | height static | diff any % | diff tol % | worst bands (y px: % of band) |',
  '|---|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.name} | ${r.w} | ${r.hWp} | ${r.hSt} | ${r.strict} | ${r.tol} | ${r.worst.map(x => `${x.y}: ${x.pct}`).join(', ')} |`), '',
  '## Console errors (static)', consoleLog.length ? consoleLog.map(x => '- ' + x).join('\n') : 'none', '',
  '## Failed requests (static)', failedLog.length ? [...new Set(failedLog)].map(x => '- ' + x).join('\n') : 'none', '',
  '## External hosts requested by the static pages', hosts.size ? [...hosts].map(([h, s]) => `- ${h} (${[...s].slice(0, 3).join(', ')})`).join('\n') : 'none', '',
].join('\n');
fs.writeFileSync(path.join(OUT, 'static-diff.md'), md);
}
writeReport();
console.log('written', path.join(OUT, 'static-diff.md'));
process.exit(0);
