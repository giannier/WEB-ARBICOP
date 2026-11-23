#!/usr/bin/env node
/**
 * Generates src/assets/img/og-default.jpg (1200x630) from the logo on the brand background, using headless Chrome.
 * Needs the preview server (docker compose -f docker-compose.static.yml up -d) only for fonts/logo; it reads files from src/.
 *   node tools/make-og.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {launchChrome, newTab, setViewport, sleep} from './lib/cdp.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logo = fs.readFileSync(path.join(ROOT, 'src/assets/images/uploads/2026/06/cropped-LOGO-ARBICOP.png')).toString('base64');
const fontsCss = fs.readFileSync(path.join(ROOT, 'src/assets/css/fonts.css'), 'utf8')
  .replace(/url\(\/assets\/fonts\//g, `url(${pathToFileURL(path.join(ROOT, 'src/assets/fonts')).href}/`);

const html = `<!doctype html><meta charset="utf-8"><style>${fontsCss}
*{box-sizing:border-box;margin:0}
body{width:1200px;height:630px;background:linear-gradient(135deg,#062250 0%,#10387E 100%);font-family:'DM Sans',sans-serif;color:#fff;position:relative;overflow:hidden}
.dots{position:absolute;right:-80px;bottom:-80px;width:520px;height:520px;border-radius:50%;background:#1D82EA;opacity:.18}
.dots2{position:absolute;right:120px;bottom:-200px;width:360px;height:360px;border-radius:50%;background:#fff;opacity:.06}
.card{position:absolute;left:80px;top:80px;background:#fff;border-radius:28px;padding:34px 48px;box-shadow:0 18px 50px rgba(0,0,0,.28)}
.card img{display:block;height:130px}
h1{position:absolute;left:80px;top:300px;width:860px;font:700 58px/1.12 'Inter',sans-serif}
p{position:absolute;left:80px;top:480px;font:500 30px/1.3 'DM Sans',sans-serif;color:#E7F0FF}
.bar{position:absolute;left:80px;top:540px;width:140px;height:6px;border-radius:3px;background:#1D82EA}
.url{position:absolute;left:80px;top:560px;font:600 26px 'DM Sans',sans-serif;color:#fff;opacity:.9}</style>
<div class="dots"></div><div class="dots2"></div>
<div class="card"><img src="data:image/png;base64,${logo}"></div>
<h1>Instituto de Formación Especializado</h1>
<p>Peritaje · Arbitraje · Conciliación · Tasación · Corretaje</p>
<div class="bar"></div><div class="url">arbicop.com</div>`;

const tmp = path.join(ROOT, 'docker', 'og-source.html');
fs.mkdirSync(path.dirname(tmp), {recursive: true});
fs.writeFileSync(tmp, html);

const chrome = await launchChrome(9477);
const tab = await newTab(chrome.port);
await setViewport(tab, 1200, 630);
await tab.send('Page.navigate', {url: pathToFileURL(tmp).href});
await sleep(2500);
const shot = await tab.send('Page.captureScreenshot', {format: 'jpeg', quality: 88, clip: {x: 0, y: 0, width: 1200, height: 630, scale: 1}});
const out = path.join(ROOT, 'src/assets/img/og-default.jpg');
fs.mkdirSync(path.dirname(out), {recursive: true});
fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log('written', out, fs.statSync(out).size, 'bytes');
chrome.close();
process.exit(0);
