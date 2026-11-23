import fs from 'node:fs';
const [,, dir, out] = process.argv;
const rd = f => fs.readFileSync(`${dir}/${f}`, 'utf8').split(/\r?\n/).filter(Boolean).map(l => l.split('\t').map(s => s.trim()));
const deps = rd('dep.tsv'), provs = rd('prov.tsv'), dists = rd('dist.tsv');
const data = deps.map(([id, n]) => ({
  n,
  p: provs.filter(p => p[2] === id).map(([pid, pn]) => ({
    n: pn,
    d: dists.filter(d => d[2] === pid).map(d => d[1]),
  })),
}));
const caj = data.find(d => d.n === 'CAJAMARCA');
// Source table lacks province 194 (SAN MIGUEL, Cajamarca): its districts are orphans; BOLIVAR was missing too (added by hand).
caj.p.push({ n: 'SAN MIGUEL', d: [...dists.filter(d => d[2] === '194').map(d => d[1]), 'BOLIVAR'].sort() });
fs.writeFileSync(out, JSON.stringify(data));
const c = data.reduce((a, d) => a + d.p.length, 0), x = data.reduce((a, d) => a + d.p.reduce((b, p) => b + p.d.length, 0), 0);
console.log(data.length, 'dep', c, 'prov', x, 'dist');
