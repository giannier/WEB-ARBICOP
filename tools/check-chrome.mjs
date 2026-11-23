#!/usr/bin/env node
/**
 * Static guard for the shop mu-plugins (runs in `npm run check`).
 *
 *  1. Namespace typos: the mu-plugins are NOT namespaced, so a reference to a namespaced WordPress/Elementor class needs
 *     a leading backslash. `class_exists('ElementorPlugin')` or `ElementorPlugin::$instance` silently never runs
 *     (this exact typo disabled the Elementor boot of the chrome once). Also an unqualified `catch (Throwable` is flagged
 *     because it hides this class of error inconsistently with the rest of the code.
 *  2. `php -l` on every mu-plugin file, through Docker (wordpress:cli-php8.1, the shop's PHP line) or, if Docker is not
 *     available, the local php. Neither available = FAIL (a syntax error in a mu-plugin takes the whole shop down).
 *  3. The generated arbicop-chrome/ checksums match manifest.json (stale build output = FAIL, run `npm run build`).
 *
 * The runtime counterpart (real local WordPress shop, real mouse events) is tools/check-chrome-live.mjs.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MU = process.env.CHROME_MU_DIR || path.join(ROOT, 'tienda', 'wp-content', 'mu-plugins');   // CHROME_MU_DIR: test the guard on another copy
let fails = 0;
const check = (ok, msg) => { if (!ok) fails++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${msg}`); };

const files = fs.readdirSync(MU).filter(f => f.endsWith('.php')).sort();
check(files.includes('arbicop-chrome.php'), `mu-plugin files found: ${files.join(', ')}`);

// 1) namespace typos (comments and strings are stripped first so documentation cannot trigger a false positive)
const BAD = [
  [/class_exists\(\s*['"](?:Elementor|ElementorPro|WooCommerce|Automattic|WP_?)[A-Z]\w*['"]/, "class_exists() of a namespaced class without a leading backslash, e.g. 'ElementorPlugin' (use '\\Elementor\\Plugin')"],
  [/(?<![\\\w$>:'"])Elementor[A-Z]\w*::/, 'static call on a namespace-less Elementor class name (missing \\Elementor\\...)'],
  [/catch\s*\(\s*(?<!\\)Throwable\b/, 'unqualified catch (Throwable ...): write catch (\\Throwable ...)'],
];
const stripComments = src => src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' ')).replace(/^\s*\/\/.*$/gm, '');
for (const f of files) {
  const lines = stripComments(fs.readFileSync(path.join(MU, f), 'utf8')).split('\n');
  const hits = [];
  lines.forEach((l, i) => { for (const [re, why] of BAD) if (re.test(l)) hits.push(`${f}:${i + 1} ${why}`); });
  check(hits.length === 0, `${f}: no namespace typos`);
  hits.forEach(h => console.log('      ' + h));
}

// 2) php -l
const lint = (f) => {
  const d = spawnSync('docker', ['run', '--rm', '--entrypoint', 'php', '-v', `${MU}:/mu:ro`, 'wordpress:cli-php8.1', '-l', `/mu/${f}`], {encoding: 'utf8', env: {...process.env, MSYS_NO_PATHCONV: '1'}});
  if (d.status === 0) return {ok: true, via: 'docker php 8.1'};
  if (d.error || /Cannot connect|docker: |not recognized/i.test(d.stderr || '')) {
    const l = spawnSync('php', ['-l', path.join(MU, f)], {encoding: 'utf8'});
    if (!l.error) return {ok: l.status === 0, via: 'local php', out: l.stdout + l.stderr};
    return {ok: false, via: 'none', out: 'neither docker nor php available'};
  }
  return {ok: false, via: 'docker php 8.1', out: (d.stdout || '') + (d.stderr || '')};
};
for (const f of files) { const r = lint(f); check(r.ok, `php -l ${f} (${r.via})`); if (!r.ok && r.out) console.log('      ' + r.out.trim()); }

// 3) generated chrome vs manifest
const dir = path.join(MU, 'arbicop-chrome');
try {
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  for (const [name, sha] of Object.entries(m.files)) {
    check(crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, name))).digest('hex') === sha, `arbicop-chrome/${name} matches manifest.json (else: npm run build)`);
  }
} catch (e) { check(false, 'arbicop-chrome/manifest.json readable: ' + e.message); }

console.log(fails ? `\n${fails} check(s) FAILED` : '\nshop chrome static checks passed');
process.exit(fails ? 1 : 0);
