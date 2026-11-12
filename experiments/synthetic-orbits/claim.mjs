// The claim set (stack #505): for each box of the bar's table, n independent random orbits drawn inside the box, each flown exactly as
// run.mjs flies a case (run.mjs's own worker: the same starting state, seed.mjs's record flown by the reference build; the same truth;
// the same way of making AP's record; the same D = the largest 3D distance to the truth over 0 to 120 h at the truth's own 300 s
// epochs). Every orbit is made up, and the truth is a model's flight (the numerical propagator's), not any satellite's data. Only this
// set carries a pass rate. The grid and the named cases of cases.mjs stay as they are: they are lists of cases to work on, not a sample.
//
// The draw, per case (independent, from one seed that is recorded with every row; a fresh seed by default, so each release draws anew):
//   perigee height: log-uniform inside the box's range;  eccentricity: uniform inside the box's range;
//   inclination: uniform in angle on 0 to 180 deg (not uniform over the sphere); node, argument of perigee, mean anomaly: uniform;
//   area-to-mass: one of the three classes of cases.mjs (0.001, 0.01, 0.1 m^2/kg), each with the same chance;
//   cutoff: a whole day, uniform over the span where the as-issued space weather is stored (as cases.mjs);
//   an orbit whose apogee lies beyond the Moon's mean distance is drawn again (cases.mjs leaves such cells out as well).
// Mean motion from perigee and eccentricity, two-body, as cases.mjs makes its grid. The boxes (BOXES) are printed by what they draw
// (boxLabelOf); each row stores the bar's band name (cases.mjs BAR_BANDS) it stands for, whose name is not its box's edges. Drawn in no
// box: perigee below 200 km, near-circular orbits with perigee 20,200 to 35,486 km or above 36,086 km, eccentric orbits (e above 0.01)
// with perigee above 35,786 km, and e above 0.9.
//
// The population of a box: its drawn orbits that are above 100 km at the cutoff and whose numerical flight reaches it. The status
// rules are those of report.mjs statusOf (kept the same here): n counts every case that has a truth past the cutoff; k counts those in
// n that are not within the bar, that is D > 100 m over the whole 0 to 120 h, a truth that ends before 120 h (a decay after the
// cutoff or the numerical flight ending early, never within, counted with its span), a refused fit, a failed flight or another
// failure after the truth existed. Outside n, each counted on its own line with its reason: an orbit that decays below 100 km at or
// before the cutoff, which has no forecast to score, whether the numerical flight stopped there (FFM stops at a reentry) or ran
// through it; a case without a truth (it failed before its truth existed, or the numerical flight failed before the cutoff for
// another reason). The bound is the exact one-sided 95 % upper confidence bound on the failure share k / n
// (Clopper-Pearson). It is printed only when every drawn case of the box has a row. The median D is the sorted values' element
// floor(m / 2) (as report.mjs) and the 95th percentile the nearest rank, ceil(0.95 m), over the m scored cases (those with a D over
// the whole 0 to 120 h).
//
//   node experiments/synthetic-orbits/claim.mjs --modules-commit <sha> --modules-root <modules checkout> [--per-band 256] [--seed <s>]
//     [--fit forecast-span] [--jobs 6] [--bands 0,1,...] [--out <dir>] [--scratch]   flies the set; rows to <dir>/rows.jsonl (resumes)
//   node experiments/synthetic-orbits/claim.mjs --report --out <dir>       the per-box table from the draw and its rows
//   node experiments/synthetic-orbits/claim.mjs --check-bound               the bound against the published table
// Without --scratch this repository's working tree (experiments/synthetic-orbits, experiments/headline-loop) must be clean, since the
// rows name its commit. A folder that holds another run's draw (another seed, count, fit, truth start, build or boxes) is refused.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fork, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { random, AM, BAR_BANDS } from './cases.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, 'run.mjs');
const MU = 398600.4418, RE = 6378.137, DAY_S = 86400, MOON_KM = 384400, PASS_M = 100, BAR_H = 120;
const FIRST = Date.parse('2025-11-15T00:00:00Z'), LAST = Date.parse('2026-09-25T00:00:00Z');
const revPerDay = (hpKm, e) => { const a = (RE + hpKm) / (1 - e); return (DAY_S / (2 * Math.PI)) * Math.sqrt(MU / a ** 3); };

/** The nine boxes drawn from (perigee height km, eccentricity), one for each band of the bar's table (cases.mjs BAR_BANDS, the key the
 *  rows store). A box's edges are its own, not its band name's: print a box by boxLabelOf. */
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

const km = (x) => x.toLocaleString('en-US');
/** What box b draws, as a page prints it: its eccentricity and perigee ranges. */
export const boxLabelOf = (b) => { const x = BOXES[b]; return `${x.e[1] <= 0.01 ? 'near-circular, e 0 to 0.01' : `e ${x.e[0]} to ${x.e[1]}`}, perigee ${km(x.hp[0])} to ${km(x.hp[1])} km`; };
export const NOT_DRAWN = 'Drawn in no box: perigee below 200 km; near-circular orbits with perigee 20,200 to 35,486 km or above 36,086 km; eccentric orbits (e above 0.01) with perigee above 35,786 km; e above 0.9.';

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

// the median as report.mjs takes it (the sorted values' element floor(m / 2)), and the 95th percentile by nearest rank
const median = (v) => { if (!v.length) return null; const s = v.slice().sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const p95 = (v) => { if (!v.length) return null; const s = v.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(0.95 * s.length) - 1)]; };
const read = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []);

/**
 * What became of a case, from its row: the rule of report.mjs statusOf, kept the same here. Outside n: not-flown; no-truth (it failed
 * before its truth existed, or the numerical flight failed before the cutoff for another reason than a decay); decayed (the orbit
 * decays below 100 km at or before the cutoff, so there is no forecast to score: the numerical flight stopped there, as FFM stops at
 * a reentry, or ran through it). In n: within or over (D over the whole 0 to 120 h), short (the truth ends before 120 h, a decay
 * after the cutoff among them: never within; spanH the hours it reaches), refused (AP's fit refused), flight-failed, failed.
 */
export function statusOf(r) {
  if (!r) return { status: 'not-flown', reason: 'not flown' };
  const t = r.truth, ap = r.ap ?? null;
  if (!t) return { status: 'no-truth', reason: `failed before its truth existed: ${r.error ?? 'no truth'}` };
  if (t.decayedAtH != null && t.decayedAtH <= 0) return { status: 'decayed', reason: `decays below 100 km at ${t.decayedAtH} h, at or before the cutoff: no forecast to score` };
  if (t.error && t.flownToDay == null) {
    return REENTRY.test(t.error) ? { status: 'decayed', reason: `decays below 100 km before the cutoff, where the numerical flight stops: no forecast to score (${t.error})` }
      : { status: 'no-truth', reason: `the numerical flight failed before the cutoff: ${t.error}` };
  }
  const shortSpan = () => {
    if (t.decayedAtH != null) return { spanH: t.decayedAtH, why: `decays below 100 km at ${t.decayedAtH} h` };
    if (t.flownToDay != null) return { spanH: t.flownToDay * 24, why: `the numerical flight ends at day ${t.flownToDay}${t.error ? ` (${t.error})` : ''}` };
    return null;
  };
  if (!ap) {
    const s = shortSpan();
    if (s) return { status: 'short', spanH: s.spanH, reason: s.why };
    return { status: 'failed', reason: `failed after its truth existed: ${r.error ?? 'no result'}` };
  }
  if (ap.error) return /^fit\b/.test(ap.error) ? { status: 'refused', reason: `AP's fit refused: ${ap.error}` } : { status: 'flight-failed', reason: `AP's fit or flight failed: ${ap.error}` };
  const md = ap.maxDistance;
  if (md.spanH < BAR_H) { const s = shortSpan(); return { status: 'short', spanH: md.spanH, reason: s?.why ?? `the truth ends at ${md.spanH} h` }; }
  // within on the 300 s grid, but the perigee scan (run.mjs --perigee-scan) failed, or finds a state more than 100 m off its curve
  if (md.maxM <= PASS_M && ap.perigeeScan?.error) return { status: 'scan-failed', reason: `within on the 300 s grid (D ${md.maxM} m); the perigee scan failed: ${ap.perigeeScan.error}` };
  if (md.maxM <= PASS_M && ap.perigeeScan?.fails) return { status: 'scan', reason: `within on the 300 s grid (D ${md.maxM} m); the perigee scan finds a state ${ap.perigeeScan.largestM} m off the record's own curve at ${ap.perigeeScan.atH} h` };
  return { status: md.maxM <= PASS_M ? 'within' : 'over' };
}
const IN_N = new Set(['within', 'over', 'scan', 'scan-failed', 'short', 'refused', 'flight-failed', 'failed']);
// FFM's reentry refusal: the trajectory descends below 100 km
const REENTRY = /descends below 100 km/;

/** The per-box table from the draw and the rows: every drawn case by its row (the last one, of this run: build, seed, fit and truth
 *  start), k of n not within the bar (n every case with a truth), the bound on k / n only when no drawn case lacks a row, D over the
 *  scored cases, and the counts of each way a case is not within, of the cases without a truth and of those not flown. */
export function table(draws, rows) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  return draws.map(({ b, cases }) => {
    const box = BOXES[b];
    const rs = cases.map((c) => { const r = byId.get(c.id) ?? null; return { c, r, ...statusOf(r) }; });
    const of = (s) => rs.filter((x) => x.status === s);
    const inN = rs.filter((x) => IN_N.has(x.status)), within = of('within').length, n = inN.length, k = n - within, notFlown = of('not-flown').length;
    const scored = rs.filter((x) => x.status === 'within' || x.status === 'over'), Ds = scored.map((x) => x.r.ap.maxDistance.maxM);
    const worst = scored.slice().sort((a, b) => b.r.ap.maxDistance.maxM - a.r.ap.maxDistance.maxM)[0];
    const short = of('short');
    return { box: b, label: boxLabelOf(b), band: box.band, edges: { perigeeKm: box.hp, eccentricity: box.e }, drawn: rs.length, notFlown, n, k, within, over: of('over').length,
      short: short.length, shortSpansH: short.map((x) => x.spanH).sort((a, b) => a - b), refused: of('refused').length, flightFailed: of('flight-failed').length, failed: of('failed').length,
      decayed: of('decayed').length, noTruth: of('no-truth').length, noTruthReasons: [...new Set(of('no-truth').map((x) => x.reason.replace(/ at \d{4}-\d\d-\d\dT[\d:.]+ UTC.*$/, '')))],
      upper95: n && !notFlown ? upperBound(k, n) : null, boundWithheld: notFlown ? `${notFlown} drawn case${notFlown > 1 ? 's have' : ' has'} no row` : null,
      scored: Ds.length, medianM: median(Ds), p95M: p95(Ds), maxM: Ds.length ? Math.max(...Ds) : null, worst: worst ? worst.r.id : null };
  });
}

/** What a result says of itself (claim.json and the printed lines). */
const STATUS_RULES = 'n counts every drawn case that has a truth past the cutoff; k counts those in n not within the bar: D > 100 m over the whole 0 to 120 h, a truth that ends before 120 h (never within; a decay after the cutoff among them), a refused fit, a failed flight or another failure after the truth existed. Outside n, each with its reason: an orbit that decays below 100 km at or before the cutoff (no forecast to score), whether the numerical flight stopped there or ran through it; a case without a truth (it failed before its truth existed, or the numerical flight failed before the cutoff for another reason).';
const POPULATION = 'The population of a box: its drawn orbits that are above 100 km at the cutoff and whose numerical flight reaches it. A decay after the cutoff is in n as a failure; a decay at or before the cutoff is outside n. A draw whose apogee lies beyond the Moon\'s mean distance is drawn again.';
const BOUND = 'The bound: the exact one-sided 95 % upper confidence bound on the failure share k / n (Clopper-Pearson), printed only when every drawn case of the box has a row.';
const MADE_UP = 'Every orbit is made up, and the truth is a model\'s flight (the numerical propagator\'s), not any satellite\'s data.';
const sameRun = (d, r) => r.wasmSha256 === d.wasmSha256 && r.claimSeed === d.seed && r.fit === d.fit && (r.truthStartH ?? 72) === d.truthStartH;

// run only as the program itself, not when another script imports draw or table
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (!isMain) { /* imported */ } else if (args['check-bound']) {
  // the report's table (stack #505): one-sided 95 % bounds, k of n
  const want = [[0, 100, 2.95], [1, 100, 4.66], [3, 100, 7.57], [0, 128, 2.31], [1, 128, 3.65], [3, 128, 5.95], [0, 256, 1.16], [1, 256, 1.84], [3, 256, 3.0], [0, 512, 0.58], [1, 512, 0.92], [3, 512, 1.51], [0, 1024, 0.29], [1, 1024, 0.46], [3, 1024, 0.76]];
  let bad = 0;
  for (const [k, n, pct] of want) { const got = 100 * upperBound(k, n), ok = Math.abs(got - pct) < 0.006; bad += ok ? 0 : 1; console.log(`${k} of ${n}: ${got.toFixed(3)} % (table ${pct} %)${ok ? '' : '  MISMATCH'}`); }
  process.exit(bad ? 1 : 0);
} else if (args.report) {
  const drawFile = path.join(args.out, 'draw.json');
  if (!fs.existsSync(drawFile)) throw new Error(`${drawFile}: no draw in this folder`);
  const d = JSON.parse(fs.readFileSync(drawFile, 'utf8'));
  d.truthStartH ??= 72;
  const { usePackages } = await import('../headline-loop/lib/env.mjs');
  usePackages();
  const A = await import('../headline-loop/lib/arms.mjs');
  const draws = d.bands.map((b) => ({ b, cases: draw(d.seed, b, d.perBand) })), byId = new Map(draws.flatMap((x) => x.cases).map((c) => [c.id, c]));
  // a row is read only at the degrees the rule of the real low rows gives its case under the build's version (arms.mjs rowAtRuleDegrees)
  const all = read(path.join(args.out, 'rows.jsonl')), rows = all.filter((r) => sameRun(d, r) && byId.has(r.id) && A.rowAtRuleDegrees(r, byId.get(r.id), d.version));
  const t = table(draws, rows);
  const { FITS, ARC72_TEXT } = await import('./fits.mjs');
  const { NO_XP_TEXT } = await import('./fits.mjs');
  // the claim set flies AP alone on a way other than arc72
  const way = d.fit === 'arc72' ? { text: ARC72_TEXT, after: false } : { ...FITS[d.fit], text: `${FITS[d.fit].text} ${NO_XP_TEXT}` };
  const command = `node experiments/synthetic-orbits/claim.mjs --modules-commit ${d.modulesCommit} --modules-root <modules clone> --seed ${d.seed} --per-band ${d.perBand} --fit ${d.fit}${d.bands.length < BOXES.length ? ` --bands ${d.bands.join(',')}` : ''}`;
  const harness = [...new Set(rows.map((r) => r.harness).filter(Boolean))];
  const doc = { seed: d.seed, perBand: d.perBand, fit: d.fit, fitText: way.text, fitAfterCutoff: way.after, truthStartH: d.truthStartH, version: d.version, modulesCommit: d.modulesCommit, wasmSha256: d.wasmSha256,
    command, harness: harness.length ? harness : 'not recorded in these rows', rowsRead: rows.length, rowsOfOtherRuns: all.length - rows.length,
    madeUp: MADE_UP, population: POPULATION, statusRules: STATUS_RULES, bound: BOUND, notDrawn: NOT_DRAWN, boxes: t };
  fs.writeFileSync(path.join(args.out, 'claim.json'), JSON.stringify(doc, null, 1));
  const f = (x) => (x == null ? '-' : x >= 1000 ? `${(x / 1000).toFixed(2)} km` : `${x.toFixed(1)} m`);
  console.log(`seed ${d.seed}, ${d.perBand} per box, fit ${d.fit} (fitted after the cutoff: ${way.after ? 'yes' : 'no'}), truth from ${d.truthStartH} h before the cutoff, sdn-ap ${d.version} (${d.wasmSha256.slice(0, 12)}, modules ${d.modulesCommit.slice(0, 12)}); rows of this run ${rows.length}${all.length > rows.length ? `, of other runs ${all.length - rows.length} (not read)` : ''}; this repository at ${harness.length ? harness.join(', ') : 'a commit these rows do not record'}`);
  console.log(`command: ${command}`);
  for (const s of [MADE_UP, POPULATION, STATUS_RULES, BOUND, `Fit way ${d.fit}: ${way.text}`, NOT_DRAWN]) console.log(s);
  for (const b of t) console.log(`${b.label}: ${b.k} of ${b.n} not within 100 m (drawn ${b.drawn}; over ${b.over}, truth short of 120 h ${b.short}${b.short ? ` [${b.shortSpansH.join(', ')} h]` : ''}, refused fits ${b.refused}, failed flights ${b.flightFailed}, other ${b.failed}; decayed by the cutoff ${b.decayed}; without a truth ${b.noTruth}${b.noTruth ? ` (${b.noTruthReasons.join('; ').slice(0, 160)})` : ''}; not flown ${b.notFlown}), bound ${b.upper95 == null ? `- (${b.boundWithheld ?? 'n is 0'})` : `${(100 * b.upper95).toFixed(2)} %`}; over the ${b.scored} scored: median ${f(b.medianM)}, 95th ${f(b.p95M)}, largest ${f(b.maxM)}`);
} else await fly();

async function fly() {
  const root = args['modules-root'], want = args['modules-commit'];
  if (!root || !want) throw new Error('usage: claim.mjs --modules-commit <sha> --modules-root <modules checkout> [...]');
  process.env.SDN_MODULES_ROOT ??= root;
  const { usePackages } = await import('../headline-loop/lib/env.mjs');
  usePackages();
  const A = await import('../headline-loop/lib/arms.mjs');
  // the rows name this repository's commit: its working tree must be clean (as run.mjs), or the run says --scratch
  const REPO = path.resolve(HERE, '../..');
  const dirty = execFileSync('git', ['-C', REPO, 'status', '--porcelain', '--', 'experiments/synthetic-orbits', 'experiments/headline-loop'], { encoding: 'utf8' }).trim();
  if (dirty && !args.scratch) throw new Error(`refused: this repository's working tree differs from its commit (the rows name the commit):\n${dirty}`);
  const harness = execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim() + (dirty ? '+scratch' : '');
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
  // one run to a folder: a draw already there must be this run's
  const drawFile = path.join(out, 'draw.json'), drawn = { seed, perBand, fit, truthStartH, modulesCommit: commit, version, wasmSha256: wasmSha, boxes: BOXES, bands };
  if (fs.existsSync(drawFile)) {
    const old = JSON.parse(fs.readFileSync(drawFile, 'utf8')), same = ['seed', 'perBand', 'fit', 'wasmSha256'].every((k) => old[k] === drawn[k]) && (old.truthStartH ?? 72) === truthStartH
      && JSON.stringify(old.boxes) === JSON.stringify(BOXES) && JSON.stringify(old.bands) === JSON.stringify(bands);
    if (!same) throw new Error(`refused: ${drawFile} holds another run's draw (seed ${old.seed}, ${old.perBand} per box, fit ${old.fit}, build ${String(old.wasmSha256).slice(0, 12)}); give another --out`);
  }
  // a row counts as done only at the degrees the rule of the real low rows gives its case under this build's version (arms.mjs rowAtRuleDegrees):
  // a run begun before the rule, resumed, flies the cases of the low table's class again
  const all = bands.flatMap((b) => draw(seed, b, perBand)), byId = new Map(all.map((c) => [c.id, c]));
  const rowsFile = path.join(out, 'rows.jsonl'), done = new Set(read(rowsFile).filter((r) => sameRun(drawn, r) && byId.has(r.id) && A.rowAtRuleDegrees(r, byId.get(r.id), version)).map((r) => r.id));
  const todo = all.filter((c) => !done.has(c.id));
  fs.writeFileSync(drawFile, JSON.stringify(drawn, null, 1));
  const jobs = Math.min(Number(args.jobs ?? 6), todo.length);
  console.error(`claim: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; seed ${seed}, ${perBand} per band, fit ${fit}; ${all.length} cases, ${todo.length} to fly on ${jobs} jobs; rows to ${rowsFile}`);
  let next = 0, flown = 0;
  await Promise.all(Array.from({ length: jobs }, () => new Promise((resolve, reject) => {
    const child = fork(RUN, ['--worker', '--wasm', file, '--ap-version', version, '--fit', fit, '--truth-start-h', String(truthStartH)], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => { if (next < todo.length) { const c = todo[next++]; child.send({ c, fits: [fit] }); } else child.send({ stop: true }); };
    child.on('message', (m) => {
      if (m.rows) {
        const row = m.rows[fit], c = m.c;
        fs.appendFileSync(rowsFile, `${JSON.stringify({ ...row, band: c.band, claimSeed: seed, version, modulesCommit: commit, wasmSha256: wasmSha, harness })}\n`);
        flown += 1;
        console.error(`  ${flown}/${todo.length} ${c.id}: D ${row.ap?.maxDistance?.maxM ?? row.ap?.error ?? row.error ?? 'no truth'} m; ${row.wallS} s`);
      }
      give();
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));
  console.error(`claim: ${flown} flown`);
}
