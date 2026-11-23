#!/usr/bin/env node
/**
 * End-to-end test of the Libro de Reclamaciones api against the Docker setup of docker-compose.libro-test.yml.
 *
 *   docker compose -f docker-compose.libro-test.yml -p arbicop-libro up -d --build
 *   node tools/libro-e2e.mjs [--fresh]
 *
 * --only=php84,php81,strict,fail (comma list) selects suites. --fresh recreates the storage volumes first (numbering starts at 0001). Needs: Node >= 18, docker, pdftotext.
 * Results: stdout table + docker/libro-test/results.md. Mail is dry-run only: real SMTP delivery is NOT covered.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const PROJECT = 'arbicop-libro';
const TARGETS = {
  php84: { url: 'http://localhost:8085', container: `${PROJECT}-libro-php84-1`, service: 'libro-php84' },
  php81: { url: 'http://localhost:8086', container: `${PROJECT}-libro-php81-1`, service: 'libro-php81' },
  strict: { url: 'http://localhost:8087', container: `${PROJECT}-libro-strict-1`, service: 'libro-strict' },
  fail: { url: 'http://localhost:8088', container: `${PROJECT}-libro-fail-1`, service: 'libro-fail' },
};
const YEAR = String(new Date().getFullYear());
const results = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const sh = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
const dx = (t, script) => sh('docker', ['exec', t.container, 'sh', '-c', script]);

function record(group, name, ok, detail = '') {
  results.push({ group, name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}${ok ? '' : '  -> ' + detail}`);
}
const check = (g, n, cond, detail) => record(g, n, !!cond, detail === undefined ? '' : String(detail));

// ---- HTTP helpers (manual cookie jar: one jar = one visitor) -------------------------------------------------
class Visitor {
  constructor(t) { this.t = t; this.cookies = new Map(); }
  header(extra = {}) {
    const c = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    return { Origin: this.t.url, Referer: this.t.url + '/libro-de-reclamaciones/', ...(c ? { Cookie: c } : {}), ...extra };
  }
  async req(p, opts = {}) {
    const go = () => fetch(this.t.url + p, { redirect: 'manual', ...opts, headers: { ...this.header(), ...(opts.headers || {}) } });
    // One retry only for a connection that Apache closed while idle (keep-alive timeout) before the request was sent.
    const res = await go().catch((e) => (e?.cause?.code === 'UND_ERR_SOCKET' || e?.cause?.code === 'ECONNRESET') ? go() : Promise.reject(e));
    for (const sc of res.headers.getSetCookie?.() ?? []) {
      const [pair] = sc.split(';');
      const i = pair.indexOf('=');
      this.cookies.set(pair.slice(0, i), pair.slice(i + 1));
    }
    return res;
  }
  async token() { return (await (await this.req('/api/token.php')).json()).token; }
  async submit(fields, { origin = true } = {}) {
    const body = new URLSearchParams(fields);
    const headers = { 'Content-Type': 'application/x-www-form-urlencoded' };
    if (!origin) { headers.Origin = ''; headers.Referer = ''; }
    const res = await this.req('/api/reclamo.php', { method: 'POST', body, headers });
    let json = null;
    try { json = await res.clone().json(); } catch { /* not json */ }
    return { status: res.status, json };
  }
}

const payload = (token, over = {}) => ({
  token, website_alt: '',
  nombres: 'María José', paterno: 'Quispe', materno: 'Ñahui',
  tipo_doc: 'DNI', nro_doc: '12345678', cel: '943 704 298',
  dep: 'AMAZONAS', prov: 'CHACHAPOYAS', dist: 'CHACHAPOYAS',
  direccion: 'Jr. Amazonas 123', referencia: 'Frente al parque', correo: 'maria.quispe@example.com',
  flag_menor: '0', tipo_reclamo: 'Reclamo', tipo_consumo: 'Servicio', nro_pedido: 'P-0001',
  monto_reclamado: '150.50', descripcion: 'Curso de arbitraje, módulo I',
  fch_compra: '2026-10-01', fch_consumo: '2026-10-05', fch_vencimiento: '',
  detalle_reclamo: 'No recibí el acceso al aula virtual pese a haber pagado el curso completo. ÁÉÍÓÚ ñ ¿?',
  pedido_cliente: 'Solicito el acceso inmediato o la devolución.',
  acepto: '1', politica: '1', ...over,
});

async function fresh(t, over = {}) {            // new visitor + token + waits the minimum fill time
  const v = new Visitor(t);
  const token = await v.token();
  await sleep(2600);
  return { v, token, fields: payload(token, over) };
}

function readStorage(t, rel) { return dx(t, `cat /var/www/html/api/storage/${rel}`); }
function pdfOf(t, claim) {
  const dir = mkdtempSync(path.join(tmpdir(), 'lr-'));
  const out = path.join(dir, `${claim}.pdf`);
  sh('docker', ['cp', `${t.container}:/var/www/html/api/storage/hojas/${YEAR}/${claim}.pdf`, out]);
  return out;
}
const pdfText = (f) => sh('pdftotext', ['-layout', '-enc', 'UTF-8', f, '-']);
// pdftotext separates pages with a form feed (pdfinfo is not always installed)
const pdfPages = (f) => (pdfText(f).match(/\f/g) || []).length;

// ---------------------------------------------------------------------------------------------------------------
async function suiteMain(t, label) {
  const g = label;
  const v0 = new Visitor(t);

  // Page + static data
  const page = await v0.req('/libro-de-reclamaciones/');
  const html = await page.text();
  check(g, 'GET /libro-de-reclamaciones/ is 200 HTML', page.status === 200 && html.includes('id="rt_form_libro"'), page.status);
  check(g, 'form posts to /api/reclamo.php, token field empty (issued by api, not static)',
    html.includes('action="/api/reclamo.php"') && /id="lr-token" name="token" value=""/.test(html));
  check(g, 'page has honeypot + no WordPress admin-ajax', html.includes('name="website_alt"') && !html.includes('admin-ajax'));
  const ub = await v0.req('/assets/data/ubigeo.json');
  const ubj = ub.status === 200 ? await ub.json() : [];
  check(g, 'ubigeo.json served (25 departments incl. SAN MIGUEL/CAJAMARCA)',
    ubj.length === 25 && ubj.find((d) => d.n === 'CAJAMARCA')?.p.some((p) => p.n === 'SAN MIGUEL'), ub.status);
  const js = await v0.req('/assets/js/libro.js');
  check(g, 'libro.js served', js.status === 200);

  // Token
  const tk = await v0.req('/api/token.php');
  const tj = await tk.json();
  check(g, 'token.php issues a 64-hex token + no-store', /^[0-9a-f]{64}$/.test(tj.token) && /no-store/.test(tk.headers.get('cache-control') || ''));

  // Valid submission #1
  const a = await fresh(t);
  const r1 = await a.v.submit(a.fields);
  check(g, 'valid submit -> 200 ok, first number is LR-' + YEAR + '-0001', r1.status === 200 && r1.json?.ok && r1.json.claim_number === `LR-${YEAR}-0001`, JSON.stringify(r1));
  const c1 = r1.json?.claim_number;
  check(g, 'response has download_url', /^\/api\/hoja\.php\?n=LR-\d{4}-0001&k=[0-9a-f]{32}$/.test(r1.json?.download_url || ''), r1.json?.download_url);

  // PDF content
  const pdf1 = pdfOf(t, c1);
  const txt = pdfText(pdf1);
  const must = [
    ['claim number', c1], ['hoja title', 'HOJA DE RECLAMACI'], ['RUC', '20614105829'], ['trade name', 'ARBICOP'],
    ['legal name', 'INSTITUTO DE FORMACION DE PERITOS'], ['fiscal address', 'JR. AYACUCHO NRO. 1326'],
    ['consumer name (accents)', 'María José Quispe Ñahui'], ['document', 'DNI 12345678'], ['phone', '943 704 298'],
    ['ubigeo', 'CHACHAPOYAS, CHACHAPOYAS, AMAZONAS'], ['address+reference', 'Jr. Amazonas 123 (Ref.: Frente al parque)'],
    ['email', 'maria.quispe@example.com'], ['bien contratado', 'Servicio'], ['order', 'P-0001'], ['amount', 'S/ 150.50'],
    ['dates', 'Compra: 01/10/2026'], ['item description', 'Curso de arbitraje'], ['type', 'RECLAMO'],
    ['detail', 'acceso al aula virtual'], ['request', 'devolución'], ['conformity', 'reemplaza la firma'],
    ['acciones adoptadas', 'acciones adoptadas por el proveedor'], ['15 dias habiles', '15 días hábiles'],
    ['verification code', 'digo de verificaci'],
  ];
  for (const [n, s] of must) check(g, `PDF text contains ${n}`, txt.toLowerCase().includes(s.toLowerCase()) || txt.replace(/\s+/g, ' ').toLowerCase().includes(s.toLowerCase()), s);
  check(g, 'PDF is exactly 1 page', pdfPages(pdf1) === 1, pdfPages(pdf1));

  // Archive + mail (dry run)
  const meta = JSON.parse(readStorage(t, `hojas/${YEAR}/${c1}.json`));
  check(g, 'archive JSON: company + consumer notification state=dry_run (separate)',
    meta.notifications?.company?.state === 'dry_run' && meta.notifications?.consumer?.state === 'dry_run');
  check(g, 'archive JSON holds a hashed IP, not the raw IP', /^[0-9a-f]{64}$/.test(meta.ip_hash) && !JSON.stringify(meta).match(/\b172\.\d+\.\d+\.\d+\b/));
  const emp = readStorage(t, `correo/${c1}-empresa.eml`);
  const con = readStorage(t, `correo/${c1}-consumidor.eml`);
  check(g, 'company .eml: To reclamaciones@arbicop.com, Reply-To consumer, PDF attached',
    /^To: .*reclamaciones@arbicop\.com/mi.test(emp) && /^Reply-To: .*maria\.quispe@example\.com/mi.test(emp) && /application\/pdf/.test(emp), emp.slice(0, 200));
  check(g, 'consumer .eml: To consumer, Reply-To company, PDF attached',
    /^To: .*maria\.quispe@example\.com/mi.test(con) && /^Reply-To: .*reclamaciones@arbicop\.com/mi.test(con) && /application\/pdf/.test(con));
  check(g, 'company mail is NOT addressed to the consumer (separate messages)', !/^To: .*maria\.quispe/mi.test(emp));
  check(g, 'no pendientes marker when company mail is ok', dx(t, 'ls /var/www/html/api/storage/pendientes 2>/dev/null | wc -l').trim() === '0');

  // PDF download
  const dl = await a.v.req(r1.json.download_url);
  const buf = Buffer.from(await dl.arrayBuffer());
  check(g, 'download_url returns the PDF', dl.status === 200 && dl.headers.get('content-type') === 'application/pdf' && buf.subarray(0, 5).toString() === '%PDF-', dl.status);
  check(g, 'downloaded bytes equal the archived PDF', buf.equals(readFileSync(pdf1)));

  // Numbering increments (+ minor with guardian)
  const b = await fresh(t, { nro_doc: '87654321', correo: 'otro@example.com', detalle_reclamo: 'Segundo reclamo distinto con texto suficiente.' });
  const r2 = await b.v.submit(b.fields);
  check(g, 'second claim -> 0002', r2.json?.claim_number === `LR-${YEAR}-0002`, JSON.stringify(r2));
  const m = await fresh(t, {
    nro_doc: '11223344', correo: 'menor@example.com', flag_menor: '1', nombre_tutor: 'Rosa Tutor', correo_tutor: 'tutor@example.com',
    tipo_doc_tutor: 'CE', nro_doc_tutor: '001234567', tipo_reclamo: 'Queja', detalle_reclamo: 'Queja por el trato recibido en la atención.',
  });
  const r3 = await m.v.submit(m.fields);
  check(g, 'minor claim -> 0003', r3.json?.claim_number === `LR-${YEAR}-0003`, JSON.stringify(r3));
  const t3 = pdfText(pdfOf(t, r3.json.claim_number)).replace(/\s+/g, ' ');
  check(g, 'minor PDF has guardian block + QUEJA', t3.includes('Rosa Tutor') && t3.includes('CE 001234567') && t3.includes('QUEJA'));
  const longText = 'Texto largo de prueba con acentos áéíóú y ñ. '.repeat(40).slice(0, 1780) + ' FINALDETALLE';
  const lg = await fresh(t, { nro_doc: '55667788', correo: 'largo@example.com', detalle_reclamo: longText, pedido_cliente: 'Pedido largo. '.repeat(50).slice(0, 680) + ' FINALPEDIDO' });
  const r4 = await lg.v.submit(lg.fields);
  const f4 = pdfOf(t, r4.json?.claim_number);
  const t4 = pdfText(f4).replace(/\s+/g, ' ');
  check(g, 'max-length text: nothing trimmed (FINALDETALLE + FINALPEDIDO in PDF, no "recortado")', r4.json?.claim_number === `LR-${YEAR}-0004` && t4.includes('FINALDETALLE') && t4.includes('FINALPEDIDO') && !t4.includes('recortado'), t4.slice(-200));
  check(g, 'max-length text flows to <= 2 pages', pdfPages(f4) <= 2, pdfPages(f4));
  check(g, 'counter file holds 4', JSON.parse(readStorage(t, 'counter.dat')).number === 4);

  // Rejections ------------------------------------------------------------------------------------------------
  const before = Number(dx(t, `ls /var/www/html/api/storage/hojas/${YEAR}/*.pdf | wc -l`).trim());
  const hp = await fresh(t, { website_alt: 'http://spam.example', correo: 'bot1@example.com', detalle_reclamo: 'Bot honeypot text long enough here.' });
  const rh = await hp.v.submit(hp.fields);
  check(g, 'honeypot filled -> fake success (LR-0000-0000), nothing archived',
    rh.status === 200 && rh.json?.claim_number === 'LR-0000-0000' && !rh.json?.download_url
    && Number(dx(t, `ls /var/www/html/api/storage/hojas/${YEAR}/*.pdf | wc -l`).trim()) === before);

  const fast = new Visitor(t);
  const ft = await fast.token();
  const rf = await fast.submit(payload(ft, { correo: 'fast@example.com', detalle_reclamo: 'Too fast submission text long enough.' }));
  check(g, 'too fast (< min fill) -> 403', rf.status === 403 && !rf.json?.ok, JSON.stringify(rf));

  const nt = new Visitor(t);
  await nt.token(); await sleep(2600);
  const rn = await nt.submit(payload('', { correo: 'notoken@example.com' }));
  check(g, 'missing token -> 403', rn.status === 403, JSON.stringify(rn));
  const rb = await nt.submit(payload('0'.repeat(64), { correo: 'badtoken@example.com' }));
  check(g, 'wrong token -> 403', rb.status === 403, JSON.stringify(rb));
  const direct = new Visitor(t);                                   // never asked for a token (bot POSTing directly)
  const rd = await direct.submit(payload('a'.repeat(64)));
  check(g, 'direct POST without a session -> 403', rd.status === 403, JSON.stringify(rd));

  const ro = await fresh(t, { correo: 'noorigin@example.com' });
  const rno = await ro.v.submit(ro.fields, { origin: false });
  check(g, 'no Origin/Referer -> 403', rno.status === 403, JSON.stringify(rno));
  const rx = await ro.v.req('/api/reclamo.php', { method: 'POST', body: new URLSearchParams(ro.fields), headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example', Referer: 'https://evil.example/' } });
  check(g, 'cross-origin POST -> 403', rx.status === 403, rx.status);
  const rget = await v0.req('/api/reclamo.php');
  check(g, 'GET reclamo.php -> 405', rget.status === 405, rget.status);
  const rbig = await v0.req('/api/reclamo.php', { method: 'POST', body: 'x=' + 'a'.repeat(70000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  check(g, 'oversized body -> 413', rbig.status === 413, rbig.status);

  const bad = await fresh(t, { nro_doc: '123', correo: 'no-es-correo', dep: 'AMAZONAS', prov: 'LIMA', dist: 'X', tipo_reclamo: 'Otro', acepto: '', politica: '', detalle_reclamo: 'corto', monto_reclamado: 'abc', fch_compra: '2026-02-31' });
  const rbad = await bad.v.submit(bad.fields);
  const errs = Object.keys(rbad.json?.errors || {});
  check(g, 'invalid payload -> 422 with per-field errors',
    rbad.status === 422 && ['nro_doc', 'correo', 'prov', 'tipo_reclamo', 'acepto', 'politica', 'detalle_reclamo', 'monto_reclamado', 'fch_compra'].every((k) => errs.includes(k)), JSON.stringify(rbad));
  const arr = await fresh(t, {});
  const rarr = await arr.v.submit({ ...arr.fields, 'nombres[]': 'x' });
  delete arr.fields.nombres;
  const rarr2 = await arr.v.submit({ ...arr.fields, 'nombres[]': 'x' });
  check(g, 'array-typed field is rejected (422, no PHP error)', rarr.status !== 500 && rarr2.status === 422, `${rarr.status}/${rarr2.status}`);
  const inj = await fresh(t, { correo: 'victim@example.com%0aBcc: spam@example.com' });
  const rinj = await inj.v.submit(inj.fields);
  check(g, 'e-mail header injection attempt rejected', rinj.status === 422 && rinj.json?.errors?.correo, JSON.stringify(rinj));
  const inj2 = await fresh(t, { correo: 'victim@example.com\r\nBcc: spam@example.com' });
  const rinj2 = await inj2.v.submit(inj2.fields);
  check(g, 'e-mail CRLF injection attempt does not create a Bcc (422 or sanitized)',
    rinj2.status === 422 || !/^Bcc:/mi.test(readStorage(t, `correo/${rinj2.json?.claim_number}-consumidor.eml`)), JSON.stringify(rinj2));

  const dup = await fresh(t);                                      // same email+name+detail+request as claim #1
  const rdup = await dup.v.submit(dup.fields);
  check(g, 'repeated identical content within 24 h -> 429', rdup.status === 429, JSON.stringify(rdup));

  const counterNow = JSON.parse(readStorage(t, 'counter.dat')).number;
  check(g, 'rejections never consumed a number (counter has no gaps)', counterNow === Number(dx(t, `ls /var/www/html/api/storage/hojas/${YEAR}/*.pdf | wc -l`).trim()), counterNow);

  // Download hardening ------------------------------------------------------------------------------------------
  const good = r1.json.download_url;
  const k = good.split('&k=')[1];
  const probe = async (n, url, status = [404]) => {
    const r = await v0.req(url);
    check(g, `download: ${n} -> ${status.join('/')}`, status.includes(r.status) && !(r.headers.get('content-type') || '').includes('pdf'), r.status);
  };
  await probe('wrong key', `/api/hoja.php?n=${c1}&k=${'0'.repeat(32)}`);
  await probe('no key', `/api/hoja.php?n=${c1}`);
  await probe('guessing sibling number with key of #1', `/api/hoja.php?n=LR-${YEAR}-0002&k=${k}`);
  await probe('traversal ../../config', `/api/hoja.php?n=../../config&k=${k}`);
  await probe('traversal with valid prefix', `/api/hoja.php?n=${c1}/../../../config.php&k=${k}`);
  await probe('traversal encoded %2e%2e', `/api/hoja.php?n=%2e%2e%2f%2e%2e%2fconfig&k=${k}`);
  await probe('traversal absolute /etc/passwd', `/api/hoja.php?n=/etc/passwd&k=${k}`);
  await probe('NUL byte', `/api/hoja.php?n=${c1}%00.pdf&k=${k}`);
  await probe('array param', `/api/hoja.php?n[]=${c1}&k=${k}`);
  await probe('year manipulation', `/api/hoja.php?n=LR-1999-0001&k=${k}`);
  const head = await v0.req(good, { method: 'HEAD' });
  check(g, 'download: HEAD with valid key is 200 without body', head.status === 200);
  const post = await v0.req(good, { method: 'POST' });
  check(g, 'download: POST -> 405', post.status === 405, post.status);

  // Denied internals --------------------------------------------------------------------------------------------
  for (const p of ['/api/config.php', '/api/config.secret.php', '/api/config.secret.example.php', '/api/storage/', '/api/storage/counter.dat',
    `/api/storage/hojas/${YEAR}/${c1}.pdf`, `/api/storage/hojas/${YEAR}/${c1}.json`, `/api/storage/correo/${c1}-empresa.eml`, '/api/storage/ratelimit/.salt',
    '/api/storage/log/claims.log', '/api/lib/fpdf/fpdf.php', '/api/lib/PHPMailer/PHPMailer.php', '/api/src/Validator.php', '/api/src/Security.php',
    '/api/fonts/OpenSans-Regular.ttf', '/api/tools/makefont/cp1252.map', '/api/assets/logo.png', '/api/README.md', '/api/storage/hojas/%2e%2e/counter.dat']) {
    const r = await v0.req(p);
    const body = await r.text();
    check(g, `403/404 for ${p}`, [403, 404].includes(r.status) && !body.includes('<?php') && !body.includes('%PDF'), r.status);
  }
  const idx = await v0.req('/api/');
  check(g, '/api/ is not listable', [403, 404].includes(idx.status), idx.status);

  // Logs
  const log = dx(t, 'cat /var/www/html/api/storage/log/php-error.log 2>/dev/null; true');
  check(g, 'php-error.log has no deprecations/warnings/fatals', !/Deprecated|Warning|Fatal|Notice/i.test(log), log.slice(0, 400));
  check(g, 'PHP version ' + dx(t, 'php -r "echo PHP_VERSION;"').trim(), true);
  const secrets = dx(t, 'rg -l smtp_password /var/www/html/api/storage 2>/dev/null; grep -rl "smtp_password" /var/www/html/api/storage 2>/dev/null; true');
  check(g, 'no secrets written to storage', secrets.trim() === '');
}

async function suiteStrict(t, label) {
  const g = label;
  const a = await fresh(t, { correo: 'uno@example.com' });
  await sleep(4000);                                              // min_fill_seconds = 6 in production limits
  const r1 = await a.v.submit(a.fields);
  check(g, 'with production limits a submit after 6 s works', r1.status === 200 && r1.json?.ok, JSON.stringify(r1));
  const early = new Visitor(t);
  const et = await early.token();
  await sleep(3000);
  const re = await early.submit(payload(et, { correo: 'early@example.com' }));
  check(g, 'production min fill (6 s): 3 s is too fast -> 403', re.status === 403, JSON.stringify(re));
  const b = new Visitor(t);
  const bt = await b.token();
  await sleep(6500);
  const r2 = await b.submit(payload(bt, { correo: 'dos@example.com', detalle_reclamo: 'Otro texto distinto, suficientemente largo.' }));
  check(g, 'second claim from same IP within 30 min -> 429 (rate limit)', r2.status === 429, JSON.stringify(r2));
  check(g, '429 message points to reclamaciones@arbicop.com', (r2.json?.message || '').includes('reclamaciones@arbicop.com'));
}

// ---- failure injection + review-fix round (REL-001, REL-002, RES-002) ---------------------------------------------
const STORE = '/var/www/html/api/storage';
const setFail = (t, v) => dx(t, v ? `echo ${v} > ${STORE}/.test-fail` : `rm -f ${STORE}/.test-fail`);   // honoured only in dry-run + LR_TEST_LIMITS
const counterOf = (t) => { try { return JSON.parse(readStorage(t, 'counter.dat')).number; } catch { return 0; } };   // no counter yet = nothing issued
const numOf = (n) => `LR-${YEAR}-${String(n).padStart(4, '0')}`;
const archivedNumbers = (t) => dx(t, `ls ${STORE}/hojas/${YEAR}/`).split('\n').filter((f) => f.endsWith('.pdf')).map((f) => Number(f.replace(/^.*-/, '').replace('.pdf', ''))).sort((a, b) => a - b);
const noGaps = (list) => list.every((n, i) => n === i + 1);
const lsCount = (t, dir, needle) => dx(t, `ls ${STORE}/${dir}/ 2>/dev/null`).split('\n').filter((f) => f.includes(needle)).length;
let uniq = 0;
const unique = (tag) => ({ correo: `${tag}${Date.now()}${uniq++}@example.com`, detalle_reclamo: `Reclamo de prueba ${tag} ${Date.now()} ${uniq} con texto suficiente.` });
const cli = (t, args) => {                       // php api/tools/pendientes.php as the PHP user; returns {code, out}
  try { return { code: 0, out: sh('docker', ['exec', '-u', 'www-data', '-w', '/var/www/html', t.container, 'php', 'api/tools/pendientes.php', ...args]) }; }
  catch (e) { return { code: e.status, out: String(e.stdout || '') + String(e.stderr || '') }; }
};

async function suiteFailures(t, label) {
  const g = `${label} failure injection`;
  setFail(t, '');
  // REL-001 (identical content): archive failure -> 500, retry with the SAME content succeeds (no 429) with the SAME number
  const n0 = counterOf(t);
  const a = await fresh(t, unique('rel1'));
  setFail(t, 'archive');
  const f1 = await a.v.submit(a.fields);
  check(g, 'REL-001: injected archive failure -> 500, nothing archived, counter unchanged', f1.status === 500 && !f1.json?.ok && counterOf(t) === n0, JSON.stringify(f1));
  setFail(t, '');
  const f2 = await a.v.submit(a.fields);
  check(g, 'REL-001: immediate retry with identical content succeeds (no 429) and gets the SAME number the failed try had',
    f2.status === 200 && f2.json?.claim_number === numOf(n0 + 1), JSON.stringify(f2));
  const dupAgain = await fresh(t, { correo: a.fields.correo, detalle_reclamo: a.fields.detalle_reclamo });
  const f3 = await dupAgain.v.submit(dupAgain.fields);
  check(g, 'REL-001: after the successful retry the content fingerprint is kept (a third identical submit -> 429)', f3.status === 429, JSON.stringify(f3));
  check(g, 'REL-001: failure line in claims.log carries the claim number and "returned to the pool"',
    readStorage(t, 'log/claims.log').includes(`${numOf(n0 + 1)} NOT archived (injected archive failure (test mode)); number returned to the pool`));

  // REL-002: PDF failure and archive failure each leave the number for the next successful claim (no gap)
  let n1 = counterOf(t);
  const p = await fresh(t, unique('pdf'));
  setFail(t, 'pdf');
  const fp = await p.v.submit(p.fields);
  setFail(t, '');
  check(g, 'REL-002: injected PDF failure -> 500, counter did not move', fp.status === 500 && counterOf(t) === n1, JSON.stringify(fp));
  const s1 = await fresh(t, unique('after-pdf'));
  const rs1 = await s1.v.submit(s1.fields);
  check(g, 'REL-002: next successful claim receives the number the PDF failure did not archive (no gap)', rs1.json?.claim_number === numOf(n1 + 1), JSON.stringify(rs1));
  n1 = counterOf(t);
  const q = await fresh(t, unique('arch'));
  setFail(t, 'archive');
  const fa = await q.v.submit(q.fields);
  setFail(t, '');
  check(g, 'REL-002: injected archive failure -> 500, counter did not move', fa.status === 500 && counterOf(t) === n1, JSON.stringify(fa));
  const s2 = await fresh(t, unique('after-arch'));
  const rs2 = await s2.v.submit(s2.fields);
  check(g, 'REL-002: next successful claim receives the number the archive failure did not archive (no gap)', rs2.json?.claim_number === numOf(n1 + 1), JSON.stringify(rs2));
  check(g, 'REL-002: archived sheets are exactly 1..counter (no gap, no duplicate)', noGaps(archivedNumbers(t)) && archivedNumbers(t).length === counterOf(t), archivedNumbers(t).join(','));

  // REL-002: 5 parallel submissions -> 5 distinct, consecutive numbers
  n1 = counterOf(t);
  const five = await Promise.all([0, 1, 2, 3, 4].map((i) => fresh(t, unique('par' + i))));
  const outs = await Promise.all(five.map((x) => x.v.submit(x.fields)));
  const nums = outs.map((o) => o.json?.claim_number).filter(Boolean);
  check(g, 'REL-002: 5 parallel submissions all succeed with 5 distinct numbers', outs.every((o) => o.status === 200) && new Set(nums).size === 5, JSON.stringify(outs.map((o) => o.status + ':' + o.json?.claim_number)));
  check(g, 'REL-002: the 5 parallel numbers are consecutive, counter == last, still no gaps',
    [...nums].sort().join() === [1, 2, 3, 4, 5].map((i) => numOf(n1 + i)).join() && counterOf(t) === n1 + 5 && noGaps(archivedNumbers(t)), nums.join());

  // RES-002: company-send failure -> archived, marker, message with the alternative contact
  const c = await fresh(t, unique('smtpco'));
  setFail(t, 'smtp-company');
  const rc = await c.v.submit(c.fields);
  setFail(t, '');
  const cn = rc.json?.claim_number;
  check(g, 'RES-002: company e-mail failure -> 200, claim archived', rc.status === 200 && rc.json?.ok && !!cn && lsCount(t, `hojas/${YEAR}`, `${cn}.pdf`) === 1, JSON.stringify(rc));
  check(g, 'RES-002: user message reassures and gives comercial@arbicop.com + WhatsApp +51 943 704 298',
    /registrad/.test(rc.json?.message || '') && rc.json.message.includes('comercial@arbicop.com') && rc.json.message.includes('+51 943 704 298') && rc.json.message.includes(cn), rc.json?.message);
  check(g, 'RES-002: message exposes no internals (no SMTP/injected/exception text)', !/smtp|inject|exception|PHPMailer/i.test(rc.json?.message || ''));
  const mc = JSON.parse(readStorage(t, `hojas/${YEAR}/${cn}.json`));
  check(g, 'RES-002: archive JSON: company=failed, consumer=dry_run', mc.notifications?.company?.state === 'failed' && mc.notifications?.consumer?.state === 'dry_run', JSON.stringify(mc.notifications));
  const mk = JSON.parse(readStorage(t, `pendientes/${cn}.json`));
  check(g, 'RES-002: marker written with pending=["company"]', JSON.stringify(mk.pending) === '["company"]', JSON.stringify(mk));
  check(g, 'RES-002: consumer .eml exists, company .eml does not', lsCount(t, 'correo', `${cn}-consumidor.eml`) === 1 && lsCount(t, 'correo', `${cn}-empresa.eml`) === 0);

  // RES-002: consumer-only failure also leaves a marker
  const d = await fresh(t, unique('smtpcons'));
  setFail(t, 'smtp-consumer');
  const rd = await d.v.submit(d.fields);
  setFail(t, '');
  const dn = rd.json?.claim_number;
  const md = dn ? JSON.parse(readStorage(t, `pendientes/${dn}.json`)) : {};
  check(g, 'RES-002: consumer-only failure -> 200 + marker with pending=["consumer"]', rd.status === 200 && JSON.stringify(md.pending) === '["consumer"]', JSON.stringify(rd) + JSON.stringify(md));

  // RES-002: CLI list + resend, web request denied
  const list = cli(t, []);
  check(g, 'RES-002: CLI list shows both pending claims (number, date, missing, state)',
    list.code === 0 && list.out.includes(cn) && list.out.includes(dn) && /missing: company\s+company=failed/.test(list.out) && /missing: consumer/.test(list.out), list.out);
  const bad = cli(t, ['--resend', '../../etc/passwd']);
  check(g, 'RES-002: CLI rejects a malformed claim number (exit 2)', bad.code === 2, bad.out);
  const rs = cli(t, ['--resend', cn]);
  const after = JSON.parse(readStorage(t, `hojas/${YEAR}/${cn}.json`));
  const emp = lsCount(t, 'correo', `${cn}-empresa.eml`) === 1 ? readStorage(t, `correo/${cn}-empresa.eml`) : '';
  check(g, 'RES-002: --resend (dry-run) exits 0, clears the marker, writes the company .eml, state updated',
    rs.code === 0 && /marker cleared/.test(rs.out) && lsCount(t, 'pendientes', cn) === 0
    && after.notifications.company.state === 'dry_run' && after.notifications.company.resent === true && after.notifications.consumer.state === 'dry_run'
    && /^To: .*reclamaciones@arbicop\.com/mi.test(emp) && /application\/pdf/.test(emp), rs.out);
  const rsCons = cli(t, ['--resend', dn]);
  check(g, 'RES-002: --resend of the consumer-only marker clears it and writes the consumer .eml',
    rsCons.code === 0 && lsCount(t, 'pendientes', dn) === 0 && lsCount(t, 'correo', `${dn}-consumidor.eml`) === 1, rsCons.out);
  const again = cli(t, ['--resend', cn]);
  check(g, 'RES-002: resending a claim with nothing pending is a no-op (exit 0)', again.code === 0 && /nothing pending/.test(again.out), again.out);
  const gone = cli(t, ['--resend', numOf(999999)]);
  check(g, 'RES-002: resending an unknown claim fails cleanly (exit 1, nothing sent)', gone.code === 1, gone.out);
  const listAfter = cli(t, []);
  check(g, 'RES-002: CLI list no longer shows the resent claims', !listAfter.out.includes(cn) && !listAfter.out.includes(dn), listAfter.out);
  const web = await new Visitor(t).req('/api/tools/pendientes.php');
  const webBody = await web.text();
  check(g, 'RES-002: web request to /api/tools/pendientes.php -> 403, no output', web.status === 403 && !webBody.includes('Pending deliveries') && !webBody.includes('<?php'), web.status);

  // Injection is inert without the flag: a normal claim afterwards is fully delivered, no marker
  const z = await fresh(t, unique('clean'));
  const rz = await z.v.submit(z.fields);
  check(g, 'failure injection off again: normal claim succeeds with no marker', rz.status === 200 && lsCount(t, 'pendientes', rz.json?.claim_number) === 0, JSON.stringify(rz));
  const log = dx(t, `cat ${STORE}/log/php-error.log 2>/dev/null; true`);
  check(g, 'php-error.log still has no deprecations/warnings/fatals after the failure paths', !/Deprecated|Warning|Fatal|Notice/i.test(log), log.slice(0, 400));
}

// Real per-IP slot (interval 30 min, 1/day): a failed attempt must NOT burn the slot; a successful one must.
async function suiteSlot(t, label) {
  const g = `${label} slot release`;
  setFail(t, '');
  dx(t, `rm -f ${STORE}/ratelimit/state.json`);               // fresh limiter for this run (test storage only)
  const n0 = counterOf(t);
  const a = await fresh(t, unique('slot'));
  setFail(t, 'archive');
  const f1 = await a.v.submit(a.fields);
  const st = dx(t, `cat ${STORE}/ratelimit/state.json`);
  setFail(t, '');
  check(g, 'REL-001: archive failure -> 500 and the limiter holds NO reservation (ips/global/dups empty)',
    f1.status === 500 && /"ips":(\[\]|\{\})/.test(st) && /"global":\[\]/.test(st) && /"dups":(\[\]|\{\})/.test(st), st);
  const f2 = await a.v.submit(a.fields);
  check(g, 'REL-001: retry right away succeeds with interval=30 min and per_day=1 (no 429), same number', f2.status === 200 && f2.json?.claim_number === numOf(n0 + 1), JSON.stringify(f2));
  const b = await fresh(t, unique('slot2'));
  const f3 = await b.v.submit(b.fields);
  check(g, 'REL-001: after a SUCCESS the slot stays reserved (another claim from the same IP -> 429)', f3.status === 429, JSON.stringify(f3));
  dx(t, `rm -f ${STORE}/ratelimit/state.json`);
  const c = await fresh(t, unique('slot3'));
  setFail(t, 'pdf');
  const f4 = await c.v.submit(c.fields);
  setFail(t, '');
  const f5 = await c.v.submit(c.fields);
  check(g, 'REL-001: PDF failure also releases the slot; retry succeeds and takes the next number', f4.status === 500 && f5.status === 200 && f5.json?.claim_number === numOf(n0 + 2), JSON.stringify([f4, f5]));
}

// RES-001: tools/post-deploy-check.sh against the Apache preview services (no shop here: --skip-tienda)
function suitePostDeploy(t, label) {
  const g = label + ' post-deploy-check';
  let out = '', code = 0;
  try { out = execFileSync('sh', ['tools/post-deploy-check.sh', t.url, '--skip-tienda'], { encoding: 'utf8' }); }
  catch (e) { code = e.status; out = String(e.stdout || ''); }
  check(g, 'RES-001: tools/post-deploy-check.sh exits 0 and every check PASSes', code === 0 && !/^FAIL/m.test(out) && /RESULT: all checks passed/.test(out), out);
  check(g, 'RES-001: script prints the PHP version header and the MultiPHP hint', /X-Powered-By: PHP\/8\.\d/.test(out) && /MultiPHP check needed/.test(out), out);
}

// ---------------------------------------------------------------------------------------------------------------
if (process.argv.includes('--fresh')) {
  sh('docker', ['compose', '-f', 'docker-compose.libro-test.yml', '-p', PROJECT, 'down', '-v']);
  sh('docker', ['compose', '-f', 'docker-compose.libro-test.yml', '-p', PROJECT, 'up', '-d', '--build']);
  await sleep(4000);
}
const only = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7);
for (const [name, fn, label] of [
  ['php84', suiteMain, 'PHP 8.4'], ['php84', suiteFailures, 'PHP 8.4'], ['php84', suitePostDeploy, 'PHP 8.4'],
  ['php81', suiteMain, 'PHP 8.1'], ['php81', suiteFailures, 'PHP 8.1'], ['php81', suitePostDeploy, 'PHP 8.1'],
  ['strict', suiteStrict, 'Rate limit'], ['strict', suitePostDeploy, 'Rate limit'], ['fail', suiteSlot, 'Rate limit (30 min slot)'], ['fail', suitePostDeploy, 'Rate limit (30 min slot)']]) {
  if (only && !only.split(',').includes(name)) continue;
  try { await fn(TARGETS[name], label); } catch (e) { record(label, 'suite crashed', false, (e.stack || e) + (e.cause ? ' cause: ' + (e.cause.code || e.cause.message) : '')); }
}

const failed = results.filter((r) => !r.ok);
const md = ['# Libro de Reclamaciones - e2e results', '', `Run: ${new Date().toISOString()}  -  ${results.length - failed.length}/${results.length} PASS`, '',
  '| Result | Group | Test | Detail |', '|---|---|---|---|',
  ...results.map((r) => `| ${r.ok ? 'PASS' : 'FAIL'} | ${r.group} | ${r.name} | ${r.ok ? '' : String(r.detail).replace(/\|/g, '/').slice(0, 160)} |`), ''].join('\n');
writeFileSync(path.join('docker', 'libro-test', 'results.md'), md);
console.log(`\n${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
