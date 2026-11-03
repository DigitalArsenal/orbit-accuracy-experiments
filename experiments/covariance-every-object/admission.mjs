// Admission (PLAN.md 2.3, amendment 16): per (regime, bin, axis), SD over clusters of ln(pair moment / truth moment) <= 0.35, at least 3 clusters.
// node admission.mjs <part1 frozen-constants.json>. Truth moments from Part 1's dev rows (AR). Writes results/.../admission.json (cell-level) and AR cluster ratios.
import fs from 'node:fs'; import zlib from 'node:zlib'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs'; import { TRUTH } from './lib/hold.mjs';
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..'), res = path.join(repo, 'results/covariance-every-object');
export const DEV_ROWS = '/opt/data/sdn-archive/gp-covariance-strata/dev-rows';
const truthM = {}, pairM = {}, K = (c, r, b) => `${r}|${b}|${c}`;
for (const o of TRUTH.objects) {
  for (const l of zlib.gunzipSync(fs.readFileSync(path.join(DEV_ROWS, `${o.norad}.jsonl.gz`))).toString().split('\n')) {
    if (!l) continue; const r = JSON.parse(l), m = truthM[K(r.cluster, r.regime, r.bin)] ??= { n: 0, s: [0, 0, 0] };
    m.n++; for (let a = 0; a < 3; a++) m.s[a] += (r.e[a] * 1000) ** 2; // km -> m
  }
  for (const l of fs.readFileSync(path.join(OUT, 'dev-pairs', `${o.norad}.jsonl`), 'utf8').split('\n')) {
    if (!l) continue; const [, bin, reg, rho] = JSON.parse(l), m = pairM[K(o.cluster, reg, bin)] ??= { n: 0, s: [0, 0, 0] };
    m.n++; for (let a = 0; a < 3; a++) m.s[a] += rho[a] ** 2;
  }
}
const cells = {}, AX = ['R', 'T', 'N'];
for (const key of Object.keys(pairM)) {
  const [reg, bin] = key.split('|'), cell = `${reg}|${bin}`; (cells[cell] ??= new Set()).add(key.split('|')[2]);
}
const out = {}, priv = {};
for (const [cell, cl] of Object.entries(cells)) {
  const [reg, bin] = cell.split('|');
  out[cell] = AX.map((ax, a) => {
    const ln = [];
    for (const c of cl) { const p = pairM[K(c, reg, bin)], t = truthM[K(c, reg, bin)]; if (p && t && p.n >= 10 && t.n >= 10 && p.s[a] > 0 && t.s[a] > 0) { ln.push(Math.log((p.s[a] / p.n) / (t.s[a] / t.n))); (priv[cell] ??= {})[`${c}|${ax}`] = ln[ln.length - 1]; } }
    if (ln.length < 3) return { axis: ax, clusters: ln.length, sd: null, admittedBySD: false, why: 'fewer than 3 clusters with pair and truth rows' };
    const mu = ln.reduce((x, y) => x + y, 0) / ln.length, sd = Math.sqrt(ln.reduce((x, y) => x + (y - mu) ** 2, 0) / (ln.length - 1));
    return { axis: ax, clusters: ln.length, sd: Number(sd.toPrecision(4)), meanLn: Number(mu.toPrecision(4)), admittedBySD: sd <= 0.35 };
  });
}
fs.writeFileSync(path.join(res, 'admission.json'), JSON.stringify({ rule: 'SD over clusters of ln(pair moment / truth moment) <= 0.35, >= 3 clusters; the S2.1 null condition is applied in the freeze', cells: out }, null, 1) + '\n');
fs.writeFileSync(path.join(OUT, 'dev-admission-cluster-ln.json'), JSON.stringify(priv));
const adm = Object.entries(out).flatMap(([c, v]) => v.filter((x) => x.admittedBySD).map((x) => `${c}|${x.axis}`));
console.log(adm.length, 'axis-cells admitted by SD of', Object.keys(out).length * 3, adm.join(' '));
