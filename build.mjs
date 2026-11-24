#!/usr/bin/env node
/**
 * Zero-dependency static site builder.
 *
 *   node build.mjs            build once into dist/
 *   node build.mjs --watch    rebuild on every change under src/
 *   node build.mjs --serve    build + watch + local dev server with live reload
 *                             (optional: --port 3000)
 *
 * Source layout (see README.md):
 *   src/layouts/base.html     document shell (head, scripts)  -> {{header}} {{content}} {{footer}}
 *   src/layouts/*.html        reusable partials (header, footer, ...)
 *   src/pages/*.html          one file per page: front matter + main content + optional slots
 *   src/assets/**             copied as-is to dist/assets/
 *   src/site.json             global values, available as {{site.*}}
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(ROOT, 'src');
const DIST = path.join(ROOT, 'dist');
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const option = (n, d) => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };

// ---------------------------------------------------------------- helpers
const read = p => fs.readFileSync(p, 'utf8');
const exists = p => fs.existsSync(p);

function listFiles(dir) {
  const out = [];
  if (!exists(dir)) return out;
  for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
    const p = path.join(dir, e.name);
    e.isDirectory() ? out.push(...listFiles(p)) : out.push(p);
  }
  return out;
}

/** Copies src -> dest only when missing, or when size/mtime differ. Returns the number of files copied. */
function copyDir(src, dest) {
  let copied = 0;
  for (const file of listFiles(src)) {
    const target = path.join(dest, path.relative(src, file));
    const a = fs.statSync(file);
    const b = exists(target) ? fs.statSync(target) : null;
    if (b && a.size === b.size && Math.floor(a.mtimeMs) <= Math.floor(b.mtimeMs)) continue;
    fs.mkdirSync(path.dirname(target), {recursive: true});
    fs.copyFileSync(file, target);
    copied++;
  }
  return copied;
}

/** Removes files in dest that no longer exist in src (keeps dist/ in sync). */
function pruneDir(src, dest) {
  for (const file of listFiles(dest)) {
    if (!exists(path.join(src, path.relative(dest, file)))) fs.rmSync(file);
  }
}

function parseFrontMatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!m) return {data: {}, body: text};
  const data = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([\w.-]+):\s*(.*)$/);
    if (kv) data[kv[1]] = kv[2].trim();
  }
  return {data, body: text.slice(m[0].length)};
}

/** Splits a page body into slots. Text before the first marker is the "content" slot. */
function parseSlots(body) {
  const slots = {content: ''};
  const re = /<!--\s*@slot\s+([\w-]+)\s*-->/g;
  let name = 'content', last = 0, m;
  while ((m = re.exec(body))) {
    slots[name] = (slots[name] || '') + body.slice(last, m.index);
    name = m[1]; last = re.lastIndex;
  }
  slots[name] = (slots[name] || '') + body.slice(last);
  for (const k of Object.keys(slots)) slots[k] = slots[k].trim();
  return slots;
}

function flatten(obj, prefix = '', out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, `${prefix}${k}.`, out);
    else out[`${prefix}${k}`] = String(v ?? '');
  }
  return out;
}

const truthy = v => v !== undefined && v !== '' && v !== 'false' && v !== '0';
const escAttr = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Template engine: {{include name}}, {{#if k}}..{{/if}}, {{#unless k}}..{{/unless}}, {{var}}. Unknown {{x}} are left untouched. */
function render(tpl, vars, layouts) {
  let out = tpl;
  for (let i = 0; i < 5 && /\{\{include\s/.test(out); i++) {
    out = out.replace(/\{\{include\s+([\w-]+)\s*\}\}/g, (_, n) => {
      if (!(n in layouts)) throw new Error(`Missing layout partial: src/layouts/${n}.html`);
      return layouts[n];
    });
  }
  for (let i = 0; i < 5 && /\{\{#(if|unless)\s/.test(out); i++) {
    out = out.replace(/\{\{#(if|unless)\s+([\w.-]+)\s*\}\}([\s\S]*?)\{\{\/\1\}\}/g, (_, kind, key, inner) =>
      (kind === 'if') === truthy(vars[key]) ? inner : '');
  }
  return out.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (all, key) => (key in vars ? vars[key] : all));
}

/**
 * Adds the Elementor nav-menu "active" markup to the menu entry matching this page (both the desktop and the
 * hamburger copy of the menu). Sub-menu pages also mark their parent as current-menu-ancestor/parent.
 */
function markActive(html, pagePath) {
  const href = '/' + pagePath;
  let sub = false;
  html = html.replace(/<li class="([^"]*)">(<a (?:target="_blank" )?href="([^"]*)" class="elementor-(item|sub-item)[^"]*")/g, (all, liClass, a, h, kind) => {
    if (h !== href) return all;
    if (kind === 'sub-item') sub = true;
    const extra = ' current-menu-item' + (pagePath === '' ? ' current_page_item' : '');
    return `<li class="${liClass}${extra}">${a.replace(/(href="[^"]*")/, '$1 aria-current="page"').replace(/class="([^"]*)"/, 'class="$1 elementor-item-active"')}`;
  });
  if (sub) html = html.replace(/<li class="([^"]*menu-item-has-children[^"]*)">/g, '<li class="$1 current-menu-ancestor current-menu-parent">');
  return html;
}


// ---------------------------------------------------------------- shop chrome
/**
 * Shop chrome as code: emits the header/footer partials used by the WordPress shop (/tienda) from the SAME
 * src/layouts files as the static pages. The mu-plugin tienda/wp-content/mu-plugins/arbicop-chrome.php renders them.
 * Output (tracked in git, deployed by cp): arbicop-chrome/{header.html,footer.html,chrome.css,manifest.json}.
 * The header gets the cart slot ({{shop:cart}}, replaced by [arbicop_cart] in PHP) and the Tienda item marked active.
 */
const CHROME_OUT = path.join(ROOT, 'tienda', 'wp-content', 'mu-plugins', 'arbicop-chrome');

/** Re-scopes the root Elementor kit CSS (.elementor-kit-N + its global rules) under [data-arbicop-chrome] so it cannot leak into the shop. */
function scopeKitCss(css, resetVars = []) {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const scope = '[data-arbicop-chrome][data-arbicop-chrome]';   // doubled attribute = (0,2,0): beats the shop's widget-level kit rules
  const fixSel = sel => sel.split(',').map(p => p.trim()).filter(Boolean).map(p =>
    /^\.elementor-kit-\d+/.test(p) ? p.replace(/^\.elementor-kit-\d+/, scope) : scope + ' ' + p).join(',');
  const rule = (sel, body) => {
    body = body.trim();
    if (!body || /entry-title|\.site-(header|footer)/.test(sel)) return '';
    return fixSel(sel.trim()) + '{' + body + '}';
  };
  const out = [];
  const re = /([^{}]+)\{((?:[^{}]*\{[^{}]*\})+[^{}]*|[^{}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    const head = m[1].trim();
    if (head.startsWith('@media')) {
      const inner = [];
      for (const r of m[2].matchAll(/([^{}]+)\{([^{}]*)\}/g)) { const x = rule(r[1], r[2]); if (x) inner.push(x); }
      if (inner.length) out.push(head + '{' + inner.join('') + '}');
    } else {
      const x = rule(head, m[2]);
      if (x) out.push(x);
    }
  }
  if (resetVars.length) out.push(scope + '{' + resetVars.map(v => v + ':initial').join(';') + '}');
  return out.join('\n') + '\n';
}

function buildShopChrome(layouts, siteVars) {
  const cfgFile = path.join(SRC, 'layouts', 'shop-chrome.json');
  if (!exists(cfgFile) || !layouts['header-located'] || !layouts['footer-located'] || !layouts['whatsapp']) return;
  const cfg = JSON.parse(read(cfgFile));
  let header = render(layouts['header-located'], {...siteVars, shop_cart: '1'}, layouts);
  header = markActive(header, 'tienda/').replace(/^<header /, '<header data-arbicop-chrome="header" ');
  // The floating WhatsApp button is appended after </footer> here (not in footer-located, which a static page also uses and base.html already adds the button there).
  const footer = render(layouts['footer-located'], siteVars, layouts).replace(/^<footer /, '<footer data-arbicop-chrome="footer" ')
    + '\n' + render(layouts['whatsapp'], siteVars, layouts) + '\n';
  for (const [n, h] of [['header', header], ['footer', footer]]) {
    const left = h.match(/\{\{\s*(?!shop:cart)[\w.:-]+\s*\}\}/g);
    if (left) throw new Error(`shop chrome: unresolved placeholders in ${n}: ${[...new Set(left)].join(', ')}`);
  }
  if ((footer.match(/class="arbicop-wa"/g) || []).length !== 1) throw new Error('shop chrome: expected exactly one WhatsApp button in the footer');
  if (!header.includes('data-arbicop-chrome="header"') || !footer.includes('data-arbicop-chrome="footer"')) throw new Error('shop chrome: unexpected header/footer wrapper');
  if (!header.includes('{{shop:cart}}')) throw new Error('shop chrome: cart slot missing in header');
  const kit = scopeKitCss(read(path.join(SRC, cfg.kit)), cfg.reset_vars || []);
  const sha = s => crypto.createHash('sha256').update(s).digest('hex');
  const required = new Set();
  for (const m of (header + footer).matchAll(/\/assets\/[^\s"',)]+/g)) required.add(m[0].replace(/&amp;/g, '&').split(/[?#]/)[0]);
  for (const c of cfg.css) required.add(c.src);
  const missing = [...required].filter(p => !exists(path.join(SRC, p)));
  if (missing.length) throw new Error('shop chrome: assets not found in src/: ' + missing.join(', '));
  const assetHash = [...required].sort().map(p => sha(fs.readFileSync(path.join(SRC, p)))).join('');
  const hash = sha(header + footer + kit + JSON.stringify(cfg) + assetHash).slice(0, 12);
  const manifest = {
    version: 1, hash,
    generated_by: 'build.mjs (src/layouts/header.html, footer.html, shop-chrome.json)',
    files: {'header.html': sha(header), 'footer.html': sha(footer), 'chrome.css': sha(kit)},
    css: cfg.css, js: cfg.js, requires: [...required].sort(),
  };
  const files = {'header.html': header, 'footer.html': footer, 'chrome.css': kit, 'manifest.json': JSON.stringify(manifest, null, 2) + '\n'};
  fs.mkdirSync(CHROME_OUT, {recursive: true});
  for (const [name, text] of Object.entries(files)) {
    const f = path.join(CHROME_OUT, name);
    if (!exists(f) || read(f) !== text) fs.writeFileSync(f, text);
  }
  console.log(`[build] shop chrome: hash ${hash}, ${required.size} required assets`);
}

// ---------------------------------------------------------------- build
function build() {
  const t0 = Date.now();
  const site = exists(path.join(SRC, 'site.json')) ? JSON.parse(read(path.join(SRC, 'site.json'))) : {};
  const siteVars = flatten(site, 'site.');

  const layouts = {};
  for (const f of listFiles(path.join(SRC, 'layouts'))) {
    if (f.endsWith('.html')) layouts[path.basename(f, '.html')] = read(f);
  }

  fs.mkdirSync(DIST, {recursive: true});
  const written = new Set();
  const pagesDir = path.join(SRC, 'pages');
  let pageCount = 0;

  for (const file of listFiles(pagesDir).filter(f => f.endsWith('.html'))) {
    const rel = path.relative(pagesDir, file).replace(/\\/g, '/');
    const {data, body} = parseFrontMatter(read(file));
    const slots = parseSlots(body);

    // Output path: front matter "path" wins ("" = home, "nosotros/" = dist/nosotros/index.html)
    let pagePath = 'path' in data ? data.path : (rel === 'index.html' ? '' : rel.replace(/\.html$/, '/'));
    pagePath = pagePath.replace(/^\/+/, '');
    if (pagePath && !pagePath.endsWith('/')) pagePath += '/';
    const depth = pagePath ? pagePath.split('/').filter(Boolean).length : 0;
    const root = depth === 0 ? './' : '../'.repeat(depth);

    const layoutName = data.layout || 'base';
    if (!layouts[layoutName]) throw new Error(`${rel}: missing layout "${layoutName}"`);
    const headerName = data.header || 'header', footerName = data.footer || 'footer';
    if (!layouts[headerName]) throw new Error(`${rel}: missing layout "${headerName}"`);
    if (!layouts[footerName]) throw new Error(`${rel}: missing layout "${footerName}"`);

    const elementorId = data.no_wrap ? '' : (data.elementor_id || '');
    const title = data.title || site.name || '';
    const vars = {
      ...siteVars,
      ...data,
      root,
      path: pagePath,
      title,
      title_uri: encodeURIComponent(title),
      description: escAttr(data.description || ''),
      canonical: site.url ? site.url.replace(/\/+$/, '') + '/' + pagePath : '',
      elementor_id: elementorId,
      wrap_open: elementorId ? `<div data-elementor-type="wp-page" data-elementor-id="${elementorId}" class="elementor elementor-${elementorId}" data-elementor-post-type="page">` : '',
      wrap_close: elementorId ? '</div>' : '',
      og_image_url: site.url && site.og_image ? site.url.replace(/\/+$/, '') + '/' + site.og_image : '',
      robots: data.robots || 'index,follow,max-image-preview:large',
      og_type: data.og_type || 'website',
      year: String(new Date().getFullYear()),
      header: markActive(render(layouts[headerName], {}, layouts), data.out ? '\0' : pagePath),
      footer: render(layouts[footerName], {}, layouts),
      content: slots.content || '',
      head: slots.head || '',
      scripts: slots.scripts || '',
      before_header: slots.before_header || '',
      after_footer: slots.after_footer || '',
    };

    // Render twice: the first pass inlines header/footer/slots into the layout, the second resolves their placeholders.
    let html = render(layouts[layoutName], vars, layouts);
    html = render(html, vars, layouts);

    const outFile = data.out ? path.join(DIST, data.out) : path.join(DIST, pagePath, 'index.html');
    fs.mkdirSync(path.dirname(outFile), {recursive: true});
    fs.writeFileSync(outFile, html);
    written.add(path.resolve(outFile));
    pageCount++;
  }

  // Remove stale pages from dist (html only), then sync assets
  for (const f of listFiles(DIST)) {
    if (f.endsWith('.html') && !written.has(path.resolve(f))) fs.rmSync(f);
  }
  const assetsSrc = path.join(SRC, 'assets');
  const copied = copyDir(assetsSrc, path.join(DIST, 'assets'));
  pruneDir(assetsSrc, path.join(DIST, 'assets'));
  // src/public/** goes to the root of dist/ (.htaccess, robots.txt, ...)
  copyDir(path.join(SRC, 'public'), DIST);

  buildShopChrome(layouts, siteVars);
  console.log(`[build] ${pageCount} pages, ${copied} assets copied, ${Date.now() - t0} ms`);
}

function safeBuild() {
  try { build(); return true; } catch (e) { console.error('[build] ERROR:', e.message); return false; }
}

// ---------------------------------------------------------------- dev server
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.eot': 'application/vnd.ms-fontobject', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml',
};
const RELOAD_SNIPPET = '<script>new EventSource("/__reload").onmessage=()=>location.reload()</script>';

function serve(port) {
  const clients = new Set();
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    if (url === '/__reload') {
      res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'});
      res.write('\n'); clients.add(res); req.on('close', () => clients.delete(res)); return;
    }
    let file = path.join(DIST, path.normalize(url));
    if (!file.startsWith(DIST)) { res.writeHead(403); return res.end('Forbidden'); }
    if (exists(file) && fs.statSync(file).isDirectory()) {
      if (!url.endsWith('/')) { res.writeHead(301, {location: url + '/'}); return res.end(); }
      file = path.join(file, 'index.html');
    }
    if (!exists(file)) { res.writeHead(404, {'content-type': 'text/plain'}); return res.end('404 Not found: ' + url); }
    const type = MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
    res.writeHead(200, {'content-type': type, 'cache-control': 'no-store'});
    if (type.startsWith('text/html')) return res.end(read(file).replace('</body>', RELOAD_SNIPPET + '</body>'));
    fs.createReadStream(file).pipe(res);
  });
  const listen = p => {
    server.once('error', e => { if (e.code === 'EADDRINUSE') listen(p + 1); else throw e; });
    server.listen(p, () => console.log(`[serve] http://localhost:${p}/`));
  };
  listen(port);
  return () => { for (const c of clients) c.write('data: reload\n\n'); };
}

// ---------------------------------------------------------------- main
safeBuild();

if (flag('--watch') || flag('--serve')) {
  const notify = flag('--serve') ? serve(Number(option('--port', 3000))) : () => {};
  let timer = null;
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { if (safeBuild()) notify(); }, 120);
  };
  try {
    fs.watch(SRC, {recursive: true}, schedule);
  } catch {
    // Fallback for platforms without recursive watch: watch every directory.
    const dirs = [SRC, ...listFiles(SRC).map(f => path.dirname(f))];
    for (const d of new Set(dirs)) fs.watch(d, schedule);
  }
  fs.watch(path.join(ROOT, 'build.mjs'), schedule);
  console.log('[watch] watching src/ (Ctrl+C to stop)');
}
