// The claim set (stack #505, Tier 1): for each band of the bar's table, n independent random orbits drawn inside the band's box, each
// flown exactly as run.mjs flies a case (run.mjs's own worker: the same module-made state, the same truth, the same way of making AP's
// record, the same D = the largest 3D distance to the truth over 0 to 120 h on the 300 s grid). Only this set carries a pass rate.
// The grid and the named cases of cases.mjs stay as they are: they are lists of cases to work on, not a sample.
//
// The draw, per case (independent, from one seed that is recorded with every row; a fresh seed by default, so each release draws anew):
//   perigee height: log-uniform inside the band's range;  eccentricity: uniform inside the band's range;
//   inclination, right ascension of the node, argument of perigee, mean anomaly: uniform (inclination on 0 to 180 deg);
//   area-to-mass: one of the three classes of cases.mjs (0.001, 0.01, 0.1 m^2/kg: log-uniform over the decade pair), equally likely;
//   cutoff: a whole day, uniform over the span where the as-issued space weather is stored (as cases.mjs);
//   an orbit whose apogee lies beyond the Moon's mean distance is drawn again (cases.mjs leaves such cells out as well).
// Mean motion from perigee and eccentricity, two-body, as cases.mjs makes its grid.
//
// Per band: k failures in n, where a failure is D > 100 m or a record that could not be made (a refused fit); the exact one-sided 95 %
// upper bound on the failure share (Clopper-Pearson); the largest D and the 95th percentile of D. An orbit that decays below 100 km
// inside the truth's flight, and a case with no truth, are counted on their own lines and are not in n.
//
//   node experiments/synthetic-orbits/claim.mjs --modules-commit <sha> --modules-root <modules checkout> [--per-band 256] [--seed <s>]
//     [--fit forecast-span] [--jobs 6] [--bands 0,1,...] [--out <dir>]      flies the set; rows to <dir>/rows.jsonl (resumes)
//   node experiments/synthetic-orbits/claim.mjs --report --out <dir>       the per-band table from the rows
//   node experiments/synthetic-orbits/claim.mjs --check-bound               the bound against the published table
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { random, AM, BAR_BANDS } from './cases.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, 'run.mjs');
const MU = 398600.4418, RE = 6378.137, DAY_S = 86400, MOON_KM = 384400, PASS_M = 100;
const FIRST = Date.parse('2025-11-15T00:00:00Z'), LAST = Date.parse('2026-09-25T00:00:00Z');
const revPerDay = (hpKm, e) => { const a = (RE + hpKm) / (1 - e); return (DAY_S / (2 * Math.PI)) * Math.sqrt(MU / a ** 3); };

/** The nine bands of the bar's table as boxes (perigee height km, eccentricity), on the same edges as cases.mjs barBandOf. */
export const BOXES = [
  { band: BAR_BANDS[0], hp: [200, 400], e: [0, 0.01] },
  { band: BAR_BANDS[1], hp: [400, 600], e: [0, 0.01] },
  { band: BAR_BANDS[2], hp: [600, 2000], e: [0, 0.01] },
  { band: BAR_BANDS[3], hp: [2000, 20200], e: [0, 0.01] },
  { band: BAR_BANDS[4], hp: [35486, 36086], e: [0, 0.01] },
  { band: BAR_BANDS[5], hp: [200, 35786], e: [0.01, 0.1] },
  { band: BAR_BANDS[6], hp: [200, 35786], e: [0.1, 0.3] },
  { band: BAR_BANDS[7], hp: [200, 2500], e: [0.3, 0.9] },
  { band: BAR_BANDS[8], hp: [2500, 35786], e: [0.3, 0.9] },
];

/** The cases of band b: n independent draws from seed s (the band's own stream, so a band's cases do not depend on the others). */
export function draw(seed, b, n) {
  const box = BOXES[b], rnd = random((seed ^ Math.imul(b + 1, 0x9e3779b1)) >>> 0), out = [];
  const classes = Object.keys(AM);
  while (out.length < n) {
    const hpKm = box.hp[0] * (box.hp[1] / box.hp[0]) ** rnd(), e = box.e[0] + (box.e[1] - box.e[0]) * rnd();
    const i = 180 * rnd(), raan = 360 * rnd(), argp = 360 * rnd(), ma = 360 * rnd();
    const am = classes[Math.floor(rnd() * classes.length)];
    const cutoff = new Date(FIRST + Math.floor(rnd() * ((LAST - FIRST) / 864e5 + 1)) * 864e5).toISOString().slice(0, 10);
    const a = (RE + hpKm) / (1 - e), haKm = a * (1 + e) - RE;
    if (haKm + RE > MOON_KM) continue;
    const k = out.length;
    out.push({ id: `claim-${seed}-b${b}-${k}`, kind: 'claim', band: box.band, am, n: Math.round(revPerDay(hpKm, e) * 1e10) / 1e10, e: +e.toFixed(8), i: +i.toFixed(6),
      raan: +raan.toFixed(6), argp: +argp.toFixed(6), ma: +ma.toFixed(6), hpKm: Math.round(hpKm * 1000) / 1000, haKm: Math.round(haKm), cutoff });
  }
  return out;
}

// --- the exact binomial bound
const logGamma = (z) => { // Lanczos (g 7, n 9), double precision for z > 0.5
  const g = 7, c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1; let x = c[0]; for (let i = 1; i < g + 2; i += 1) x += c[i] / (z + i);
  const t = z + g + 0.5; return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
};
const logChoose = (n, k) => logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
/** P(X <= k) for X ~ Binomial(n, p). */
const cdf = (k, n, p) => { if (p <= 0) return 1; if (p >= 1) return k >= n ? 1 : 0; let s = 0; for (let j = 0; j <= k; j += 1) s += Math.exp(logChoose(n, j) + j * Math.log(p) + (n - j) * Math.log1p(-p)); return Math.min(1, s); };
/** The exact one-sided upper confidence bound on the failure share with k failures in n (Clopper-Pearson): p with P(X <= k | p) = 1 - level. */
export function upperBound(k, n, level = 0.95) {
  if (k >= n) return 1;
  let lo = 0, hi = 1;
  for (let it = 0; it < 200; it += 1) { const mid = (lo + hi) / 2; if (cdf(k, n, mid) > 1 - level) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}

const percentile = (v, q) => { if (!v.length) return null; const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(q * s.length) - 1)]; };
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

/** The per-band table from the rows. */
export function table(rows) {
  return BOXES.map((box) => {
    const rs = rows.filter((r) => r.band === box.band);
    const noTruth = rs.filter((r) => !r.ap && !r.error), decayed = rs.filter((r) => r.truth?.decayedAtH != null), errors = rs.filter((r) => r.error && !r.ap);
    const scored = rs.filter((r) => r.ap && r.truth?.decayedAtH == null);
    const refused = scored.filter((r) => r.ap.error), Ds = scored.filter((r) => r.ap.maxDistance).map((r) => r.ap.maxDistance.maxM);
    const k = refused.length + Ds.filter((d) => d > PASS_M).length, n = scored.length;
    const worst = scored.filter((r) => r.ap.maxDistance).sort((a, b) => b.ap.maxDistance.maxM - a.ap.maxDistance.maxM)[0];
    return { band: box.band, box: { perigeeKm: box.hp, eccentricity: box.e }, drawn: rs.length, n, k, refused: refused.length, upper95: n ? upperBound(k, n) : null,
      medianM: percentile(Ds, 0.5), p95M: percentile(Ds, 0.95), maxM: Ds.length ? Math.max(...Ds) : null, worst: worst ? worst.id : null,
      decayed: decayed.length, noTruth: noTruth.length, otherErrors: errors.length };
  });
}

// run only as the program itself, not when another script imports draw or table
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isMain) { /* imported */ } else if (args['check-bound']) {
  // the report's table (stack #505): one-sided 95 % bounds, k of n
  const want = [[0, 100, 2.95], [1, 100, 4.66], [3, 100, 7.57], [0, 128, 2.31], [1, 128, 3.65], [3, 128, 5.95], [0, 256, 1.16], [1, 256, 1.84], [3, 256, 3.0], [0, 512, 0.58], [1, 512, 0.92], [3, 512, 1.51], [0, 1024, 0.29], [1, 1024, 0.46], [3, 1024, 0.76]];
  let bad = 0;
  for (const [k, n, pct] of want) { const got = 100 * upperBound(k, n), ok = Math.abs(got - pct) < 0.006; bad += ok ? 0 : 1; console.log(`${k} of ${n}: ${got.toFixed(3)} % (table ${pct} %)${ok ? '' : '  MISMATCH'}`); }
  process.exit(bad ? 1 : 0);
} else if (args.report) {
  const rows = read(path.join(args.out, 'rows.jsonl'));
  const t = table(rows), meta = rows[0] ? { seed: rows[0].claimSeed, fit: rows[0].fit, version: rows[0].version, wasmSha256: rows[0].wasmSha256, modulesCommit: rows[0].modulesCommit } : {};
  fs.writeFileSync(path.join(args.out, 'claim.json'), JSON.stringify({ ...meta, bands: t }, null, 1));
  const f = (x) => (x == null ? '-' : x >= 1000 ? `${(x / 1000).toFixed(2)} km` : `${x.toFixed(1)} m`);
  console.log(`seed ${meta.seed}, fit ${meta.fit}, sdn-ap ${meta.version} (${(meta.wasmSha256 ?? '').slice(0, 12)})`);
  for (const b of t) console.log(`${b.band} (perigee ${b.box.perigeeKm.join(' to ')} km, e ${b.box.eccentricity.join(' to ')}): ${b.k} of ${b.n} fail (${b.refused} refused fits), bound ${b.upper95 == null ? '-' : (100 * b.upper95).toFixed(2)} %; median ${f(b.medianM)}, 95th ${f(b.p95M)}, largest ${f(b.maxM)}; decayed ${b.decayed}, no truth ${b.noTruth}, other errors ${b.otherErrors}`);
} else await fly();

async function fly() {
  const root = args['modules-root'], want = args['modules-commit'];
  if (!root || !want) throw new Error('usage: claim.mjs --modules-commit <sha> --modules-root <modules checkout> [...]');
  process.env.SDN_MODULES_ROOT ??= root;
  const { usePackages } = await import('../headline-loop/lib/env.mjs');
  usePackages();
  const A = await import('../headline-loop/lib/arms.mjs');
  const git = (...a) => execFileSync('git', ['-C', root, ...a], { maxBuffer: 1 << 28 });
  const commit = git('rev-parse', '--verify', `${want}^{commit}`).toString().trim();
  const wasm = git('show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`), version = JSON.parse(git('show', `${commit}:propagator/sdn-ap/package.json`).toString()).version;
  const wasmSha = crypto.createHash('sha256').update(wasm).digest('hex'), dir = path.join(A.STORE_ROOT, 'synthetic', wasmSha.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'module.wasm');
  if (!fs.existsSync(file) || crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== wasmSha) fs.writeFileSync(file, wasm);
  const seed = Number(args.seed ?? crypto.randomInt(1, 2 ** 31 - 1)), perBand = Number(args['per-band'] ?? 256), fit = args.fit ?? 'forecast-span';
  const FITS = fit === 'arc72' ? null : (await import('./fits.mjs')).FITS;
  if (FITS && !FITS[fit]) throw new Error(`--fit ${fit}: not a way fits.mjs names`);
  const truthStartH = Math.max(72, FITS?.[fit]?.truthStartH ?? 72);
  const bands = args.bands ? args.bands.split(',').map(Number) : BOXES.map((_, b) => b);
  const out = args.out ?? path.join(dir, `claim-${seed}-${fit}`);
  fs.mkdirSync(out, { recursive: true });
  const rowsFile = path.join(out, 'rows.jsonl'), done = new Set(read(rowsFile).map((r) => r.id));
  const all = bands.flatMap((b) => draw(seed, b, perBand)), todo = all.filter((c) => !done.has(c.id));
  fs.writeFileSync(path.join(out, 'draw.json'), JSON.stringify({ seed, perBand, fit, truthStartH, modulesCommit: commit, version, wasmSha256: wasmSha, boxes: BOXES, bands }, null, 1));
  const jobs = Math.min(Number(args.jobs ?? 6), todo.length);
  console.error(`claim: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; seed ${seed}, ${perBand} per band, fit ${fit}; ${all.length} cases, ${todo.length} to fly on ${jobs} jobs; rows to ${rowsFile}`);
  let next = 0, flown = 0;
  await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
    const child = fork(RUN, ['--worker', '--wasm', file, '--fit', fit, '--truth-start-h', String(truthStartH)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => { if (next < todo.length) { const c = todo[next++]; child.send({ c, fits: [fit] }); } else child.send({ stop: true }); };
    child.on('message', (m) => {
      if (m.rows) {
        const row = m.rows[fit], c = m.c;
        fs.appendFileSync(rowsFile, `${JSON.stringify({ ...row, band: c.band, claimSeed: seed, version, modulesCommit: commit, wasmSha256: wasmSha })}\n`);
        flown += 1;
        console.error(`  ${flown}/${todo.length} ${c.id}: D ${row.ap?.maxDistance?.maxM ?? row.ap?.error ?? row.error ?? 'no truth'} m; ${row.wallS} s`);
      }
      give();
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));
  console.error(`claim: ${flown} flown`);
}
