// Denominators a_{s,b,k}: pooled unclipped second moment of rho (position R,T,N, m^2) per (regime, age bin) over the dev pair files.
// Public output: stratum-level only. Cluster moments (leave-one-cluster-out) stay under AR with their SHA-256.
import fs from 'node:fs'; import path from 'node:path'; import crypto from 'node:crypto'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs'; import { TRUTH } from './lib/hold.mjs'; import { BINS } from './lib/pairs.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), repo = path.resolve(here, '../..'), dir = path.join(OUT, 'dev-pairs');
const cells = {}, tops = {}; // tops: key -> axis -> [[rho2, cluster]] (ten largest) // regime|bin -> { n, s2:[3], byCluster: { cluster: { n, s2:[3], objects:Set } } }
for (const o of TRUTH.objects) {
  const f = path.join(dir, `${o.norad}.jsonl`);
  for (const l of fs.readFileSync(f, 'utf8').split('\n')) {
    if (!l) continue; const [, bin, reg, rho] = JSON.parse(l), key = `${reg}|${bin}`;
    const c = cells[key] ??= { n: 0, s2: [0, 0, 0], byCluster: {} }, cc = c.byCluster[o.cluster] ??= { n: 0, s2: [0, 0, 0], objects: new Set() };
    const T = tops[key] ??= [[], [], []]; for (let a = 0; a < 3; a++) { T[a].push([rho[a] ** 2, o.cluster]); if (T[a].length > 40) { T[a].sort((x, y) => y[0] - x[0]); T[a].length = 10; } }
    c.n++; cc.n++; cc.objects.add(o.norad); for (let a = 0; a < 3; a++) { c.s2[a] += rho[a] ** 2; cc.s2[a] += rho[a] ** 2; }
  }
}
const pub = {}, priv = {};
for (const [key, c] of Object.entries(cells)) {
  const [reg, b] = key.split('|');
  pub[key] = { regime: reg, bin: Number(b), ageDays: BINS[b], pairs: c.n, clusters: Object.keys(c.byCluster).length, objects: new Set(Object.values(c.byCluster).flatMap((x) => [...x.objects])).size, a_RTN_m2: c.s2.map((s) => Number((s / c.n).toPrecision(8))),
    top10: tops[key].map((T, a) => { T.sort((x, y) => y[0] - x[0]); const top = T.slice(0, 10), cl = {}; top.forEach((x) => (cl[x[1]] = (cl[x[1]] ?? 0) + 1)); return { share: Number((top.reduce((u, x) => u + x[0], 0) / c.s2[a]).toPrecision(4)), clusters: cl }; }) };
  priv[key] = Object.fromEntries(Object.entries(c.byCluster).map(([k, x]) => [k, { n: x.n, s2: x.s2 }]));
}
const privFile = path.join(OUT, 'dev-cluster-moments.json'), privBytes = JSON.stringify(priv);
fs.writeFileSync(privFile, privBytes);
const res = path.join(repo, 'results/covariance-every-object'); fs.mkdirSync(res, { recursive: true });
fs.writeFileSync(path.join(res, 'denominators.json'), JSON.stringify({ note: 'a_{s,b,k}: pooled unclipped second moment of rho in j RTN, position, m^2, over dev truth objects on lawful spans (PLAN.md reading 4)', clusterMomentsSha256: crypto.createHash('sha256').update(privBytes).digest('hex'), strata: pub }, null, 1) + '\n');
console.log(Object.keys(pub).length, 'strata');
