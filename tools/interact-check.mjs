#!/usr/bin/env node
/**
 * Interactive checks on the static site (real mouse events through CDP): dropdown hover (desktop), hamburger (mobile),
 * menu link navigation, counters, form validation + WhatsApp URL. Prints PASS/FAIL lines.
 *   node tools/interact-check.mjs [--static http://localhost:8084]
 */
import {launchChrome, newTab, setViewport, goto, settle, sleep} from './lib/cdp.mjs';

const args = process.argv.slice(2);
const i = args.indexOf('--static');
const BASE = (i >= 0 ? args[i + 1] : 'http://localhost:8084').replace(/\/+$/, '');
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`); };

const chrome = await launchChrome(9488);
const tab = await newTab(chrome.port);
await tab.send('Page.bringToFront');
await tab.send('Emulation.setFocusEmulationEnabled', {enabled: true});
const errors = [];
tab.on('Runtime.exceptionThrown', e => errors.push((e.exceptionDetails.exception?.description || e.exceptionDetails.text).split('\n')[0]));
tab.on('Runtime.consoleAPICalled', e => { if (e.type === 'error') errors.push('console.error ' + e.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 160)); });

const center = sel => tab.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return null; const r = e.getBoundingClientRect(); return {x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height}; })()`);
const move = (x, y) => tab.send('Input.dispatchMouseEvent', {type: 'mouseMoved', x, y});
const click = async (x, y) => {
  await move(x, y);
  await tab.send('Input.dispatchMouseEvent', {type: 'mousePressed', x, y, button: 'left', clickCount: 1});
  await tab.send('Input.dispatchMouseEvent', {type: 'mouseReleased', x, y, button: 'left', clickCount: 1});
};
const visible = sel => tab.evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(), s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none' && +s.opacity > 0.5; })()`);

// ---------------------------------------------------------------- desktop 1440
await setViewport(tab, 1440, 900);
await goto(tab, BASE + '/');
await sleep(2500);
const main = '.elementor-nav-menu--main';
const parent = `${main} li.menu-item-has-children > a`;
const sub = `${main} .sub-menu`;
check('desktop: sub-menu hidden before hover', !(await visible(sub)));
const p = await center(parent);
await move(5, 5); await sleep(200); await move(p.x - 4, p.y); await move(p.x, p.y); await sleep(900);
check('desktop: hover on "Formaciones" opens the dropdown', await visible(sub));
const items = await tab.evaluate(`[...document.querySelectorAll('${sub} a')].map(a => a.textContent.trim()).join('|')`);
check('desktop: dropdown items', items === 'Peritaje|Arbitraje|Conciliación|Tasación|Corretaje', items);
const peri = await center(`${sub} a[href="/peritaje/"]`);
await click(peri.x, peri.y); await sleep(1500);
check('desktop: clicking "Peritaje" navigates to /peritaje/', (await tab.evaluate('location.pathname')) === '/peritaje/', await tab.evaluate('location.pathname'));
const active = await tab.evaluate(`document.querySelector('${main} a.elementor-item-active')?.textContent.trim() + '|' + document.querySelector('${main} .sub-menu a.elementor-item-active')?.textContent.trim()`);
check('desktop: active state on /peritaje/ (parent + child)', /Peritaje/.test(active), active);

// menu links resolve (HEAD via fetch, same origin)
const hrefs = await tab.evaluate(`[...new Set([...document.querySelectorAll('${main} a')].map(a => a.getAttribute('href')).filter(h => h.startsWith('/')))]`);
const codes = [];
for (const h of hrefs) codes.push(`${h}=${await tab.evaluate(`fetch(${JSON.stringify(h)}, {method: 'HEAD', redirect: 'manual'}).then(r => r.status)`, true)}`);
console.log('      menu link statuses:', codes.join(' '));

// ---------------------------------------------------------------- home counters + sliders
await goto(tab, BASE + '/');
await settle(tab, {final: 3000});
const counters = await tab.evaluate(`[...document.querySelectorAll('.elementor-counter-number')].map(e => e.textContent.trim() + '/' + e.getAttribute('data-to-value'))`);
console.log('      counters:', JSON.stringify(counters));
const swipers = await tab.evaluate(`document.querySelectorAll('.swiper, .swiper-container').length`);
const swInit = await tab.evaluate(`[...document.querySelectorAll('.swiper')].filter(e => e.classList.contains('swiper-initialized')).length`);
check('home: swiper carousels initialized', swipers > 0 && swInit === swipers, `${swInit}/${swipers}`);

// ---------------------------------------------------------------- mobile 390
await setViewport(tab, 390, 800);
await goto(tab, BASE + '/nosotros/');
await sleep(2500);
const toggle = '.elementor-menu-toggle';
const dd = '.elementor-nav-menu--dropdown.elementor-nav-menu__container';
check('mobile: hamburger visible', await visible(toggle));
check('mobile: dropdown hidden before click', !(await visible(dd)));
const t = await center(toggle);
await click(t.x, t.y); await sleep(900);
check('mobile: click on hamburger opens the menu', (await visible(dd)) && (await tab.evaluate(`document.querySelector('${toggle}').getAttribute('aria-expanded')`)) === 'true');
const link = await center(`${dd} a[href="/contacto/"]`);
await click(link.x, link.y); await sleep(1500);
check('mobile: tapping "Contacto" navigates to /contacto/', (await tab.evaluate('location.pathname')) === '/contacto/', await tab.evaluate('location.pathname'));

// ---------------------------------------------------------------- contact form -> WhatsApp
await setViewport(tab, 1440, 900);
await goto(tab, BASE + '/contacto/');
await sleep(2000);
await tab.evaluate(`window.__opened = []; window.open = (u) => { window.__opened.push(u); return {}; };`);
await tab.evaluate(`document.querySelector('form.elementor-form button[type=submit]').click()`);
await sleep(400);
const msg1 = await tab.evaluate(`document.querySelector('.site-form-message')?.textContent || ''`);
const invalid = await tab.evaluate("!document.querySelector('form.elementor-form').checkValidity()");
check('form: empty submit is blocked (native required validation) and nothing is opened', invalid && (await tab.evaluate('window.__opened.length')) === 0, msg1 || 'native validation');
await tab.evaluate(`(() => {
  const set = (id, v) => { const e = document.getElementById(id); e.value = v; };
  set('form-field-name', 'Ana Prueba'); set('form-field-email', 'ana@example.com'); set('form-field-field_b73e352', '987654321');
  set('form-field-field_2a70010', 'Lima'); set('form-field-field_3dbbff7', 'Lima'); set('form-field-message', 'Quiero información');
})()`);
await tab.evaluate(`document.querySelector('form.elementor-form button[type=submit]').click()`);
await sleep(500);
const opened = await tab.evaluate('window.__opened');
check('form: valid submit opens wa.me/51943704298 with the fields', opened.length === 1 && opened[0].startsWith('https://wa.me/51943704298?text=') && decodeURIComponent(opened[0]).includes('Ana Prueba'), opened[0] ? decodeURIComponent(opened[0]).replace(/\n/g, ' / ').slice(0, 260) : 'no window.open');

console.log(`\nJS errors during checks: ${errors.length ? '\n  ' + errors.join('\n  ') : 'none'}`);
console.log(`${results.filter(Boolean).length}/${results.length} checks passed`);
chrome.close();
process.exit(results.every(Boolean) ? 0 : 1);
