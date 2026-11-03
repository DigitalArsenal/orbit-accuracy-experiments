// node devs2.mjs <part1 frozen-constants.json>: S2 on Part 1's dev rows, 8 workers. Writes results/.../dev-s2.json (stratum-level counts and states only).
import fs from 'node:fs'; import path from 'node:path'; import { spawn } from 'node:child_process'; import { fileURLToPath } from 'node:url';
import { OUT } from './lib/archive.mjs'; import { evalS21, s21Null, s21Power, evalS22, evalS23 } from './lib/s2.mjs';
const here = path.dirname(fileURLToPath(import.meta.url)), res = path.join(here, '../../results/covariance-every-object'), tmp = path.join(OUT, 'dev-s2'); fs.mkdirSync(tmp, { recursive: true });
const N = 8, p1 = process.argv[2];
await Promise.all(Array.from({ length: N }, (_, k) => new Promise((ok, no) => { const p = spawn('nice', ['-n', '10', process.execPath, path.join(here, 'devs2-worker.mjs'), String(k), String(N), p1, path.join(tmp, `part-${k}.json`)], { stdio: 'inherit' }); p.on('exit', (c) => (c === 0 ? ok() : no(new Error(`worker ${k} ${c}`)))); })));
const cells = new Map(), stat = { sets: 0, base: 0, flagged: 0, noCreation: 0 };
for (let k = 0; k < N; k++) { const j = JSON.parse(fs.readFileSync(path.join(tmp, `part-${k}.json`))); for (const x of Object.keys(stat)) stat[x] += j.stat[x]; for (const c of j.cells) { const key = [c.regime, c.bin, c.cluster, c.block, c.flagged, c.half].join('|'); const m = cells.get(key); if (m) for (const f of ['n', 'cb', 'co', 'cb4', 'co99']) m[f] += c[f]; else cells.set(key, c); } }
const rows = [...cells.values()];
const ms = new Date(); const B = Number(process.env.S2_B ?? 10000), perms = Number(process.env.S2_PERMS ?? 1000), reps = Number(process.env.S2_REPS ?? 2000), inner = Number(process.env.S2_INNER ?? 200);
const cf = path.join(tmp, 'cells.json'); fs.writeFileSync(cf, JSON.stringify(rows));
const shards = [...Array(4)].map((_, i) => ['null', 1000 + i, perms / 4]).concat([...Array(8)].map((_, i) => ['power', 2000 + i, reps / 8]));
await Promise.all(shards.map(([kind, seed, count], i) => new Promise((ok, no) => { const p = spawn('nice', ['-n', '10', process.execPath, path.join(here, 's2-shard.mjs'), kind, String(seed), String(count), String(inner), cf, path.join(tmp, `shard-${i}.json`)], { stdio: 'inherit' }); p.on('exit', (c) => (c === 0 ? ok() : no(new Error(`shard ${i} ${c}`)))); })));
const sh = shards.map((_, i) => JSON.parse(fs.readFileSync(path.join(tmp, `shard-${i}.json`)))), avg = (kind) => { const a = sh.filter((x) => x.kind === kind); return a.reduce((t, x) => t + x.share * x.count, 0) / a.reduce((t, x) => t + x.count, 0); };
const nullFP = avg('null'), power = avg('power');
const out = { note: 'Part 1 dev rows (not the test): S2 evaluators on dev coverage cells; n0 is report-only if n0-rows.json has none', sets: stat, rows: rows.reduce((a, r) => a + r.n, 0), flaggedRows: rows.filter((r) => r.flagged).reduce((a, r) => a + r.n, 0), flaggedClusters: new Set(rows.filter((r) => r.flagged).map((r) => r.cluster)).size,
  params: { B, perms, reps, inner }, s21Null: nullFP, s21Power: power,
  s21: evalS21(rows, { B, nullPower: { falsePositive: nullFP, power } }), s22: evalS22(rows, { B }), s23: evalS23([]),
  coverageDev: Object.fromEntries(['LEO-L', 'LEO-M', 'LEO-H', 'MEO', 'GEO', 'HEO'].map((g) => { const r = rows.filter((x) => x.regime === g), n = r.reduce((a, x) => a + x.n, 0); return [g, n ? { n, cov95Base: r.reduce((a, x) => a + x.cb, 0) / n, cov95O: r.reduce((a, x) => a + x.co, 0) / n } : null]; })) };
fs.writeFileSync(path.join(res, 'dev-s2.json'), JSON.stringify(out, null, 1) + '\n'); console.log(JSON.stringify(out, null, 1));
