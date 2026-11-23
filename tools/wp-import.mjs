#!/usr/bin/env node
/**
 * One-shot importer: clones the rendered Elementor pages of the LOCAL WordPress (the approved source of truth)
 * into src/ (layouts, pages, assets). It is NOT part of the normal build; re-running it overwrites the generated
 * layouts/pages/vendor assets, so hand edits to those files must be redone (or moved into this script).
 *
 *   docker compose -p web-arbicop up -d db wordpress
 *   node tools/wp-import.mjs            (WP_BASE=http://localhost:8082 by default)
 *
 * What it does: fetch each page, drop WordPress-only noise, split header/footer (single source in src/layouts),
 * split <head>/<scripts> into common (layouts) + page-specific (slots), download every referenced asset into
 * src/assets (css, js, images, fonts incl. localized Google Fonts) and rewrite all URLs to root-relative paths.
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const BASE = (process.env.WP_BASE || 'http://localhost:8082').replace(/\/+$/, '');
const META = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools', 'import-meta.json'), 'utf8'));
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const PAGES = [
  {wp: '', path: '', file: 'index.html'},
  {wp: 'nosotros/', path: 'nosotros/', file: 'nosotros.html'},
  {wp: 'peritaje/', path: 'peritaje/', file: 'peritaje.html'},
  {wp: 'arbitraje/', path: 'arbitraje/', file: 'arbitraje.html'},
  {wp: 'conciliacion/', path: 'conciliacion/', file: 'conciliacion.html'},
  {wp: 'tasacion/', path: 'tasacion/', file: 'tasacion.html'},
  {wp: 'corretaje/', path: 'corretaje/', file: 'corretaje.html'},
  {wp: 'beneficios/', path: 'beneficios/', file: 'beneficios.html'},
  {wp: 'contacto/', path: 'contacto/', file: 'contacto.html'},
  {wp: 'libro-de-reclamaciones-2/', path: 'libro-de-reclamaciones/', file: 'libro-de-reclamaciones.html', located: true},
];

// ------------------------------------------------------------------ url mapping
const hostRe = '(?:localhost:8082|(?:www\\.)?arbicop\\.com)';
const URL_RE = new RegExp(`https?:(\\\\?\\/\\\\?\\/)${hostRe}((?:\\\\?\\/[^"'\\s)<>,;&\\\\]*)*)`, 'g');

/** WP path (/wp-content/...) -> path below src/assets (or null when it is not an asset). */
function assetDest(p) {
  let m;
  if ((m = p.match(/^\/wp-content\/uploads\/elementor\/css\/(.+)$/))) return `css/elementor/${m[1]}`;
  if ((m = p.match(/^\/wp-content\/uploads\/(.+)$/))) return `images/uploads/${m[1]}`;
  if ((m = p.match(/^\/wp-content\/plugins\/(.+)$/))) return `vendor/${m[1]}`;
  if ((m = p.match(/^\/wp-content\/themes\/(.+)$/))) return `vendor/${m[1]}`;
  if ((m = p.match(/^\/wp-includes\/(.+)$/))) return `vendor/wp-includes/${m[1]}`;
  if (p === '/wp-content/uploads') return 'images/uploads';
  if (p === '/wp-content/plugins/elementor/assets' ) return 'vendor/elementor/assets';
  return null;
}

let active = 0; const waiters = [];
async function getRetry(url) {
  while (active >= 6) await new Promise(r => waiters.push(r));
  active++;
  try {
    for (let i = 0; ; i++) {
      try { return await fetch(url, {headers: {'user-agent': UA}}); }
      catch (e) { if (i >= 3) throw e; await new Promise(r => setTimeout(r, 500 * (i + 1))); }
    }
  } finally { active--; waiters.shift()?.(); }
}

const downloaded = new Map();      // local dest -> promise
const failed = [];

async function download(wpPath) {
  const dest = assetDest(wpPath);
  if (!dest || !path.extname(dest)) return;
  if (downloaded.has(dest)) return downloaded.get(dest);
  const job = (async () => {
    const target = path.join(SRC, 'assets', dest);
    const res = await getRetry(BASE + encodeURI(decodeURI(wpPath)));
    if (!res.ok) { failed.push(`${res.status} ${wpPath}`); return; }
    fs.mkdirSync(path.dirname(target), {recursive: true});
    if (/\.css$/i.test(dest)) {
      let css = await res.text();
      css = rewriteText(css, {css: true, from: wpPath});
      fs.writeFileSync(target, css);
      // relative url()/@import inside the stylesheet
      const base = new URL(BASE + wpPath);
      const deps = [];
      for (const m of css.matchAll(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g)) deps.push(m[1]);
      for (const m of css.matchAll(/@import\s+['"]([^'"]+)['"]/g)) deps.push(m[1]);
      for (const d of deps) {
        if (/^(data:|https?:|\/\/|#|\/assets\/)/i.test(d)) continue;
        const u = new URL(d, base);
        await download(decodeURI(u.pathname));
      }
    } else {
      fs.writeFileSync(target, Buffer.from(await res.arrayBuffer()));
    }
  })().catch(e => { failed.push(`ERR ${wpPath}: ${e.message}`); });
  downloaded.set(dest, job);
  return job;
}

const pending = [];
/** Rewrites every absolute WP/prod URL in text. Asset URLs are queued for download. */
function rewriteText(text, opts = {}) {
  return text.replace(URL_RE, (all, slashes, pth) => {
    const esc = slashes.includes('\\');
    let p = (pth || '').replace(/\\\//g, '/');
    p = p.split(/[?#]/)[0];
    let out;
    if (/^\/(wp-admin|wp-json|xmlrpc\.php|feed|comments\/feed)/.test(p)) out = '#';
    else if (assetDest(p)) { out = '/assets/' + assetDest(p).replace(/%20/g, '%20'); pending.push(download(p)); }
    else out = p === '' ? '/' : p;
    return esc ? out.replace(/\//g, '\\/') : out;
  });
}

// ------------------------------------------------------------------ html helpers
const fetchPage = async u => { const r = await fetch(BASE + '/' + u, {headers: {'user-agent': UA}, redirect: 'follow'}); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.text(); };

/** Finds the end index of the element starting at `start` (a `<tag ...>`), counting nested same-name tags. */
function elementEnd(html, start, tag = 'div') {
  const re = new RegExp(`<(/?)${tag}\\b[^>]*>`, 'g');
  re.lastIndex = start;
  let depth = 0, m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return re.lastIndex;
  }
  throw new Error('unbalanced ' + tag);
}

/** Direct child divs of the element at [start,end). */
function childDivs(html, start, end) {
  const open = html.indexOf('>', start) + 1;
  const kids = [];
  const re = /<div\b[^>]*>/g;
  re.lastIndex = open;
  let m;
  while ((m = re.exec(html)) && m.index < end) {
    const e = elementEnd(html, m.index);
    kids.push({start: m.index, end: e});
    re.lastIndex = e;
  }
  return kids;
}

const HIDDEN_ALL = 'elementor-hidden-desktop elementor-hidden-tablet elementor-hidden-mobile';
/** Removes every element hidden on all devices (old header buttons, hidden bottom-bar Libro container). Returns [html, count]. */
function removeHiddenAll(html) {
  let count = 0;
  for (;;) {
    const i = html.indexOf(HIDDEN_ALL);
    if (i < 0) break;
    const s = html.lastIndexOf('<div', i);
    const e = elementEnd(html, s);
    // swallow the whitespace left behind
    html = html.slice(0, s).replace(/[ \t]*\n?[ \t]*$/, '') + html.slice(e);
    count++;
  }
  return [html, count];
}

function normalizeHead(headHtml) {
  const items = [];
  const re = /<(link|meta)\b[^>]*>|<style\b[\s\S]*?<\/style>|<script\b[\s\S]*?<\/script>|<title>[\s\S]*?<\/title>/g;
  let m;
  while ((m = re.exec(headHtml))) items.push(m[0]);
  return items;
}

const attr = (tag, name) => (tag.match(new RegExp(`\\b${name}=(?:"([^"]*)"|'([^']*)')`)) || []).slice(1).find(v => v !== undefined);

// ------------------------------------------------------------------ head / tail classification
const DROP_HEAD = [
  /<title>/, /<meta name=['"]robots/, /<meta name=['"]generator/, /rel=['"]alternate['"]/, /rel=['"]https:\/\/api\.w\.org\/['"]/,
  /rel=["']EditURI/, /rel=['"]shortlink/, /rel=["']canonical/, /<meta charset/i, /<meta name=["']viewport/,
  /id=["']wp-emoji-styles-inline-css/, /<meta name=['"]msapplication-TileImage/, /rel=["'](icon|apple-touch-icon)["']/,
  /^<script type="text\/javascript">var ajaxurl/, /wlwmanifest/, /rel=["']profile["']/,
];
const DROP_TAIL = [/speculationrules/, /wp-emoji-settings/, /wp-emoji-loader/, /id="wp-emoji/];

let fontCssUrls = [];

function cleanHeadItem(it) {
  if (DROP_HEAD.some(r => r.test(it))) return null;
  if (/^<link\b/.test(it) && /fonts\.googleapis\.com/.test(it)) {
    fontCssUrls.push(attr(it, 'href').replace(/&#038;|&amp;/g, '&'));
    return '@@FONTS@@';
  }
  let out = it.replace(/\s*\/>$/, '>').replace(/'/g, '"');
  out = out.replace(/"\s+>/g, '">');
  return rewriteText(out).replace(/(\/assets\/[^"'\s)]*?)\?ver=[^"'\s)]*/g, '$1');
}

function cleanTail(text) {
  let out = rewriteText(text).replace(/\?ver=[\w.-]+/g, '');
  out = out.replace(/"nonce":"[^"]*"/g, '"nonce":""');
  return out;
}

function tailItems(tailHtml) {
  const items = [];
  const re = /<script\b[\s\S]*?<\/script>/g;
  let m;
  while ((m = re.exec(tailHtml))) if (!DROP_TAIL.some(r => r.test(m[0]))) items.push(cleanTail(m[0].replace(/\n\/\/# sourceURL=[^\n]*\n?/g, '\n')));
  return items;
}

// ------------------------------------------------------------------ menu normalisation (active marks are re-added at build time)
function stripActive(html) {
  return html
    .replace(/ current-menu-item| current_page_item| current-menu-ancestor| current-menu-parent/g, '')
    .replace(/ aria-current="page"/g, '')
    .replace(/ elementor-item-active/g, '')
    .replace(/ tabindex="-1"/g, ' tabindex="-1"');
}

// ------------------------------------------------------------------ main
async function importPage(p) {
  const raw = await fetchPage(p.wp);
  const head = raw.match(/<head>([\s\S]*?)<\/head>/)[1];
  const bodyTag = raw.match(/<body[^>]*>/);
  const bodyClass = attr(bodyTag[0], 'class');
  const bodyStart = bodyTag.index + bodyTag[0].length;
  const bodyHtml = raw.slice(bodyStart);

  let seenFonts = false;
  const out = {p, bodyClass, headItems: normalizeHead(head).map(cleanHeadItem).filter(Boolean).filter(i => i !== '@@FONTS@@' || (!seenFonts && (seenFonts = true)))};
  const title = (head.match(/<title>([\s\S]*?)<\/title>/) || [])[1];
  out.wpTitle = title;

  let wrapStart = bodyHtml.indexOf('<div data-elementor-type="wp-page"');
  if (wrapStart >= 0) {
    const wrapEnd = elementEnd(bodyHtml, wrapStart);
    const wrapOpen = bodyHtml.slice(wrapStart, bodyHtml.indexOf('>', wrapStart) + 1);
    out.elementorId = attr(wrapOpen, 'data-elementor-id');
    out.before = bodyHtml.slice(0, wrapStart).trim();
    out.tail = bodyHtml.slice(wrapEnd);
    const kids = childDivs(bodyHtml, wrapStart, wrapEnd);
    const hasFooter = k => /Enlaces/.test(bodyHtml.slice(k.start, k.end));
    const fi = kids.findIndex(hasFooter);
    if (fi < 0) throw new Error('footer not found ' + p.wp);
    out.header = bodyHtml.slice(kids[0].start, kids[1].end);
    out.footer = bodyHtml.slice(kids[fi].start, kids[fi].end);
    out.content = bodyHtml.slice(kids[2].start, kids[fi].start).trim();
    out.afterFooter = bodyHtml.slice(kids[fi].end, wrapEnd - '</div>'.length).trim();
  } else if (p.located) {
    const hs = bodyHtml.indexOf('<header data-elementor-type="header"');
    const he = elementEnd(bodyHtml, hs, 'header');
    const fs_ = bodyHtml.indexOf('<footer data-elementor-type="footer"');
    const fe = elementEnd(bodyHtml, fs_, 'footer');
    const inner = (s, e, t) => bodyHtml.slice(bodyHtml.indexOf('>', s) + 1, e - `</${t}>`.length);
    out.headerWrap = bodyHtml.slice(hs, bodyHtml.indexOf('>', hs) + 1);
    out.footerWrap = bodyHtml.slice(fs_, bodyHtml.indexOf('>', fs_) + 1);
    out.header = inner(hs, he, 'header').trim();
    out.footer = inner(fs_, fe, 'footer').trim();
    out.before = bodyHtml.slice(0, hs).trim();
    out.content = bodyHtml.slice(he, fs_).trim();
    out.tail = bodyHtml.slice(fe);
    out.elementorId = attr(out.headerWrap, 'data-elementor-id');
    out.pageId = (bodyClass.match(/page-id-(\d+)/) || [])[1];
  } else throw new Error('unknown structure ' + p.wp);
  // stylesheets printed late (wp_footer) by plugins, e.g. the complaints book: keep them after the footer
  const tailLinks = (out.tail.match(/<link\b[^>]*rel=['"]stylesheet['"][^>]*>/g) || []).join('\n');
  if (tailLinks) out.afterFooter = ((out.afterFooter || '') + '\n' + tailLinks).trim();
  return out;
}

// Alt text (SEO/a11y) by file name; decorative icons keep alt="". Below-the-fold images get native lazy loading.
const ALT = {
  'LOGO-ARBICOP': 'ARBICOP Instituto de Formación',
  'LOGO-COLOR-BLANCO': 'ARBICOP Instituto de Formación',
  'AvisoVirtual_page1': 'Libro de Reclamaciones',
  '7TGLLJF.jpg': 'Profesionales analizando un caso en una tableta',
  '33GGVVa.jpg': 'Profesional revisando documentos durante una reunión de trabajo',
  'peritaje-2.jpg': 'Formación en peritaje',
  'asesor_arbicop.png': 'Asesor de ARBICOP',
};
function improveImages(html, lazy) {
  return html.replace(/<img[^>]*>/g, tag => {
    const src = (tag.match(/src="([^"]*)"/) || [])[1] || '';
    const hit = Object.keys(ALT).find(k => src.includes(k));
    if (hit) tag = /alt="[^"]*"/.test(tag) ? tag.replace(/alt="[^"]*"/, `alt="${ALT[hit]}"`) : tag.replace('<img', `<img alt="${ALT[hit]}"`);
    if (lazy && !/loading=/.test(tag) && !/fetchpriority=/.test(tag)) tag = tag.replace('<img', '<img loading="lazy"');
    return tag;
  });
}

const norm = s => stripActive(s).replace(/\s+/g, ' ').replace(/ loading="lazy"| decoding="async"/g, '').trim();

function diffAt(a, b) { let i = 0; while (i < a.length && a[i] === b[i]) i++; return `@${i}: [${a.slice(Math.max(0, i - 40), i + 80)}] vs [${b.slice(Math.max(0, i - 40), i + 80)}]`; }

function commonPrefix(lists) {
  let n = 0;
  while (lists.every(l => n < l.length && l[n] === lists[0][n])) n++;
  return n;
}
function commonSuffix(lists, skip) {
  let n = 0;
  while (lists.every(l => l.length - 1 - n >= skip && l[l.length - 1 - n] === lists[0][lists[0].length - 1 - n])) n++;
  return n;
}

async function main() {
  const pages = [];
  for (const p of PAGES) { pages.push(await importPage(p)); process.stdout.write('.'); }
  console.log(' fetched', pages.length);

  // -- cleanup of hidden leftovers + url rewrite on header/footer/content
  let removed = 0;
  for (const pg of pages) {
    for (const k of ['header', 'footer', 'content', 'afterFooter', 'before']) {
      if (pg[k] == null) continue;
      const [h, c] = removeHiddenAll(pg[k]); removed += c;
      pg[k] = improveImages(rewriteText(h), k !== 'header');
    }
  }
  console.log('hidden-on-all-devices elements removed:', removed);

  // -- header/footer single source: home is canonical, every other page must match after normalisation
  const home = pages[0];
  const canonHeader = stripActive(home.header);
  const canonFooter = home.footer;
  const notes = [];
  for (const pg of pages.slice(1)) {
    if (norm(pg.header) !== norm(home.header)) notes.push(`header differs: ${pg.p.wp} ${diffAt(norm(pg.header), norm(home.header))}`);
    if (norm(pg.footer) !== norm(home.footer)) notes.push(`footer differs: ${pg.p.wp} ${diffAt(norm(pg.footer), norm(home.footer))}`);
  }
  console.log(notes.length ? 'NOTES ' + notes.join('; ') : 'header/footer identical on all pages (modulo active item / lazy attr)');

  fs.mkdirSync(path.join(SRC, 'layouts'), {recursive: true});
  const libroFix = s => s.replace(/\/libro-de-reclamaciones-2\//g, '/libro-de-reclamaciones/');
  fs.writeFileSync(path.join(SRC, 'layouts', 'header.html'), libroFix(canonHeader.trim()) + '\n');
  fs.writeFileSync(path.join(SRC, 'layouts', 'footer.html'), libroFix(canonFooter.trim()) + '\n');

  // -- head / scripts: common prefix+suffix go to layouts, the middle stays in each page
  const headLists = pages.map(pg => pg.headItems);
  const hp = commonPrefix(headLists);
  const hs = commonSuffix(headLists, hp);
  const tailLists = pages.map(pg => tailItems(pg.tail));
  const tp = commonPrefix(tailLists);
  const ts = commonSuffix(tailLists, tp);
  console.log(`head: prefix ${hp}, suffix ${hs}, page-specific ${headLists.map(l => l.length - hp - hs).join(',')}`);
  console.log(`tail: prefix ${tp}, suffix ${ts}, page-specific ${tailLists.map(l => l.length - tp - ts).join(',')}`);

  const fontsMarker = '@@FONTS@@';
  const joinItems = items => items.map(i => '\t' + i.replace(/\n/g, '\n\t')).join('\n');
  const headCommonPre = headLists[0].slice(0, hp);
  const headCommonPost = headLists[0].slice(headLists[0].length - hs);
  const tailPre = tailLists[0].slice(0, tp);
  const tailPost = tailLists[0].slice(tailLists[0].length - ts);
  const fontsLink = '<link rel="stylesheet" id="arbicop-fonts-css" href="/assets/css/fonts.css" media="all">';
  const fixFonts = s => s.replace(fontsMarker, fontsLink);
  fs.writeFileSync(path.join(SRC, 'layouts', 'head-pre.html'), fixFonts(joinItems(headCommonPre)) + '\n');
  fs.writeFileSync(path.join(SRC, 'layouts', 'head-post.html'), fixFonts(joinItems(headCommonPost)) + '\n');
  fs.writeFileSync(path.join(SRC, 'layouts', 'scripts-pre.html'), tailPre.join('\n') + '\n');
  fs.writeFileSync(path.join(SRC, 'layouts', 'scripts-post.html'), tailPost.join('\n') + '\n');

  // -- pages
  fs.mkdirSync(path.join(SRC, 'pages'), {recursive: true});
  for (const pg of pages) {
    const hi = pg.headItems.slice(hp, pg.headItems.length - hs);
    const tl = tailItems(pg.tail).slice(tp, tailItems(pg.tail).length - ts);
    const meta = META[pg.p.path || 'home'];
    if (!meta) throw new Error('missing import-meta for ' + pg.p.path);
    const fm = [
      '---',
      `title: ${meta.title}`,
      `description: ${meta.description}`,
      `path: ${pg.p.path}`,
      ...(pg.p.located ? ['no_wrap: true'] : [`elementor_id: ${pg.elementorId}`]),
      `body_class: ${pg.bodyClass}`,
      ...(pg.p.located ? ['layout: base', 'header: header-located', 'footer: footer-located', `page_id: ${pg.pageId}`] : []),
      ...(pg.p.path === '' ? ['og_type: website'] : []),
      '---',
    ].join('\n');
    // One <h1> per page: the first heading widget with the page title text (h2 -> h1, same classes, same look)
    if (meta.h1) {
      const re = /<h2(\s[^>]*elementor-heading-title[^>]*>\s*)([^<]*)(\s*)<\/h2>/g;
      let done = false;
      pg.content = pg.content.replace(re, (all, a, text, b) => {
        if (done || text.trim() !== meta.h1) return all;
        done = true;
        return `<h1${a.replace('elementor-heading-title', 'elementor-heading-title h1-as-h2')}${text}${b}</h1>`;
      });
      if (!done) throw new Error('h1 text not found on ' + pg.p.path);
    }
    // Elementor forms become WhatsApp forms (assets/js/forms.js): number from site.json, WP hidden fields dropped
    if (!pg.p.located) {
      pg.content = pg.content
        .replace(/<form class="elementor-form"[^>]*>/g, '<form class="elementor-form" method="post" name="Contacto" aria-label="Contacto" data-whatsapp="{{site.whatsapp}}" data-form-title="Consulta de contacto">')
        .replace(/\s*<input type="hidden" name="(post_id|form_id|referer_title|queried_id)"[^>]*>/g, '');
    }
    let body = libroFix(pg.content) + '\n';
    if (pg.before) body = `<!-- @slot before_header -->\n${pg.before}\n<!-- @slot content -->\n` + body;
    if (pg.afterFooter) body += `\n<!-- @slot after_footer -->\n${libroFix(pg.afterFooter)}\n`;
    body += `\n<!-- @slot head -->\n${joinItems(hi.map(fixFonts))}\n`;
    body += `\n<!-- @slot scripts -->\n${tl.join('\n')}\n`;
    const pageFile = path.join(SRC, 'pages', pg.p.file);
    // The libro page is hand-maintained (live form + api/); never overwrite it with the visual clone.
    if (pg.p.file === 'libro-de-reclamaciones.html' && fs.existsSync(pageFile) && fs.readFileSync(pageFile, 'utf8').includes('id="lr-token"')) {
      console.log('kept hand-maintained', pg.p.file);
    } else {
      fs.writeFileSync(pageFile, fm + '\n' + body);
    }
    if (pg.p.path === '') {
      // 404 page: same Elementor shell/CSS as the home (header + footer), custom content (tools/404-content.html)
      const fm404 = ['---', 'title: Página no encontrada – ARBICOP', 'description: La página que buscas no existe o fue movida. Vuelve al inicio de ARBICOP Instituto de Formación.',
        'path:', 'out: 404.html', 'robots: noindex,follow', `elementor_id: ${pg.elementorId}`, `body_class: ${pg.bodyClass.replace(/\bhome\b/, 'error404')}`, '---'].join('\n');
      const c404 = fs.readFileSync(path.join(ROOT, 'tools', '404-content.html'), 'utf8');
      fs.writeFileSync(path.join(SRC, 'pages', '404.html'), `${fm404}\n${c404}\n<!-- @slot head -->\n${joinItems(hi.map(fixFonts))}\n\n<!-- @slot scripts -->\n${tl.join('\n')}\n`);
    }
  }
  const located = pages.find(p => p.p.located);
  fs.writeFileSync(path.join(SRC, 'layouts', 'header-located.html'), `${rewriteText(located.headerWrap)}\n{{include header}}\n</header>\n`);
  fs.writeFileSync(path.join(SRC, 'layouts', 'footer-located.html'), `${rewriteText(located.footerWrap)}\n{{include footer}}\n</footer>\n`);

  // -- Google Fonts, localized
  await localizeFonts([...new Set(fontCssUrls)]);

  // -- site icon set (head links are generated in base.html)
  pending.push(download('/wp-content/uploads/2026/06/cropped-LOGO-ARBICOP.png'));
  for (const s of ['32x32', '192x192', '180x180', '270x270']) pending.push(download(`/wp-content/uploads/2026/06/cropped-LOGO-ARBICOP-${s}.png`));
  await Promise.all(pending);
  await Promise.all([...downloaded.values()]);
  console.log('assets downloaded:', downloaded.size, 'failed:', failed.length);
  // srcset candidates that 404 on the source site too (Elementor on-demand thumbs): drop them
  const dead = failed.filter(f => f.startsWith('404 ')).map(f => assetDest(f.slice(4)));
  for (const dir of ['layouts', 'pages']) for (const f of fs.readdirSync(path.join(SRC, dir))) {
    const fp = path.join(SRC, dir, f); let t = fs.readFileSync(fp, 'utf8'), o = t;
    for (const d of dead) t = t.split(`/assets/${d}`).join('@@DEAD@@').replace(/,?\s*@@DEAD@@\s+\d+w/g, '');
    if (t !== o) { fs.writeFileSync(fp, t); console.log('pruned dead srcset entries in', f); }
  }
  failed.forEach(f => console.log('  FAILED (pruned)', f));
}

async function localizeFonts(urls) {
  const outDir = path.join(SRC, 'assets', 'fonts');
  fs.mkdirSync(outDir, {recursive: true});
  const blocks = [];
  const files = new Map();
  for (const u of urls) {
    const css = await (await fetch(u, {headers: {'user-agent': UA}})).text();
    for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)) {
      if (!['latin', 'latin-ext'].includes(m[1])) continue;
      let block = m[2];
      const url = block.match(/url\((https:[^)]+)\)/)[1];
      const family = block.match(/font-family:\s*'([^']+)'/)[1].replace(/\s+/g, '-').toLowerCase();
      const name = `${family}/${url.split('/').pop()}`;
      files.set(name, url);
      block = block.replace(url, `/assets/fonts/${name}`);
      blocks.push(`/* ${m[1]} */\n${block}`);
    }
  }
  for (const [name, url] of files) {
    const t = path.join(outDir, name);
    fs.mkdirSync(path.dirname(t), {recursive: true});
    fs.writeFileSync(t, Buffer.from(await (await fetch(url, {headers: {'user-agent': UA}})).arrayBuffer()));
  }
  fs.mkdirSync(path.join(SRC, 'assets', 'css'), {recursive: true});
  fs.writeFileSync(path.join(SRC, 'assets', 'css', 'fonts.css'), `/* Google Fonts localized (latin, latin-ext) */\n${blocks.join('\n')}\n`);
  console.log('fonts:', files.size, 'files,', blocks.length, 'faces');
}

main().catch(e => { console.error(e); process.exit(1); });
