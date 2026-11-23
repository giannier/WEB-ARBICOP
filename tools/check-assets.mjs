#!/usr/bin/env node
/**
 * Verifies dist/: every local reference (HTML src/href/srcset/data-settings URLs, CSS url(), root-relative or relative)
 * must exist. Root-relative links under /tienda/ (the WordPress shop, a separate app) and /api/ (reserved for the PHP
 * Libro de Reclamaciones) are allowed to be absent from dist/. Also fails on leftovers of the WordPress origin
 * (localhost, wp-json, admin-ajax, wp-content) and lists every external host referenced.
 * Usage: npm run build && npm run check
 */
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const EXTERNAL_OK = /^\/(tienda|api)(\/|$)/;           // served by other apps on the same domain
const walk = d => fs.readdirSync(d, {withFileTypes: true}).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const files = walk(DIST);
const rel = f => path.relative(DIST, f).replace(/\\/g, '/');
// Referenced by the complaints-book plugin CSS but 404 on the source WordPress too (never rendered): tolerated
const KNOWN_DEAD = /\/ico-(datos|reclamos)\.jpg$/;
const knownDead = new Set();
const missing = new Set(), leftovers = new Set(), hosts = new Map();
let checked = 0, skipped = 0;

function note(from, ref) {
  if (/^(https?:)?\/\//i.test(ref)) {
    try { const h = new URL(ref.startsWith('//') ? 'https:' + ref : ref).host; if (!hosts.has(h)) hosts.set(h, new Set()); hosts.get(h).add(rel(from)); } catch { /* ignore */ }
  }
}

function check(from, ref) {
  ref = ref.replace(/&amp;/g, '&').replace(/&#038;/g, '&').replace(/\\\//g, '/').trim();
  if (!ref) return;
  if (/^(#|data:|mailto:|tel:|javascript:|sms:|whatsapp:)/i.test(ref)) return;
  if (/^(https?:)?\/\//i.test(ref)) { note(from, ref); return; }
  const clean = ref.split(/[?#]/)[0];
  if (!clean) return;
  if (EXTERNAL_OK.test(clean)) { skipped++; return; }
  let target = clean.startsWith('/') ? path.join(DIST, clean) : path.resolve(path.dirname(from), clean);
  checked++;
  if (fs.existsSync(target) && fs.statSync(target).isDirectory()) target = path.join(target, 'index.html');
  if (!fs.existsSync(target) && KNOWN_DEAD.test(clean)) { knownDead.add(`${rel(from)} -> ${ref}`); return; }
  if (!fs.existsSync(target)) missing.add(`${rel(from)} -> ${ref}`);
}

const LEFTOVER = /localhost|wp-json|admin-ajax|(?<!vendor)\/wp-includes\/|\/wp-content\/|\/wp-admin\/|xmlrpc\.php|rrhh\.arbicop\.com|https?:\/\/(www\.)?arbicop\.com\/(wp-|\?)/i;
const OK_LEFTOVER = [/localhost/]; // never allowed; kept explicit for readability

for (const f of files) {
  const ext = path.extname(f).toLowerCase();
  if (!['.css', '.html', '.js'].includes(ext)) continue;
  const t = fs.readFileSync(f, 'utf8');
  if (ext === '.css') {
    for (const m of t.matchAll(/url\(\s*['"]?([^'")]+?)['"]?\s*\)/g)) check(f, m[1]);
    for (const m of t.matchAll(/@import\s+['"]([^'"]+)['"]/g)) check(f, m[1]);
    if (/localhost/i.test(t)) leftovers.add(`${rel(f)} -> localhost`);
  } else if (ext === '.html') {
    for (const m of t.matchAll(/\b(?:src|href|poster|data-src|action)=["']([^"']+)["']/g)) check(f, m[1]);
    for (const m of t.matchAll(/\bsrcset=["']([^"']+)["']/g)) for (const p of m[1].split(',')) check(f, p.trim().split(/\s+/)[0]);
    // URLs inside JSON (data-settings, inline configs): "url":"/assets/..." (also escaped \/ or &quot;)
    for (const m of t.matchAll(/(?:&quot;|")url(?:&quot;|")\s*:\s*(?:&quot;|")([^"&]+?)(?:&quot;|")/g)) check(f, m[1]);
    const m2 = t.match(LEFTOVER);
    if (m2 && !/\/\/ ?\w*\/wp-/.test(m2[0])) leftovers.add(`${rel(f)} -> ${m2[0]}`);
    for (const m of t.matchAll(/https?:(?:\\?\/){2}[\w.-]+/g)) note(f, m[0].replace(/\\/g, ''));
  } else if (/localhost/i.test(t)) {
    // JS: only report real references to the local WordPress origin
    if (/localhost:8082/.test(t)) leftovers.add(`${rel(f)} -> localhost:8082`);
  }
}

console.log(`Checked ${checked} local references in ${files.length} files (${skipped} /tienda|/api links not verified here).`);
console.log(`\nExternal hosts referenced (HTML/CSS; JS libraries excluded):`);
for (const [h, s] of [...hosts].sort()) console.log(`  ${h}  (${s.size} file${s.size > 1 ? 's' : ''})`);
if (knownDead.size) console.log(`
Known dead references (also 404 on the source site, unused): ${knownDead.size}`);
let bad = false;
if (leftovers.size) { bad = true; console.log(`\nWORDPRESS/LOCAL LEFTOVERS (${leftovers.size}):`); [...leftovers].forEach(r => console.log('  ' + r)); }
if (missing.size) { bad = true; console.log(`\nMISSING (${missing.size}):`); [...missing].forEach(r => console.log('  ' + r)); }
if (!bad) console.log('\nNo missing assets, no WordPress leftovers.');
process.exitCode = bad ? 1 : 0;
