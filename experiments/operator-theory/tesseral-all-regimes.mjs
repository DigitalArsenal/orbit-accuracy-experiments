// TESSERAL-ALL-REGIMES.md (with Amendments 1 and 2): propagator/sdn-ap 0.6.3 in every regime against an independent full-force reference
// (propagator/ffm 2.2.1: EGM96 31x31, Sun and Moon from DE440, nothing else), fitted to the reference's arc and flown one day forward,
// sampled 64 times a revolution; the attribution splits the error into tesseral, zonal, secular, lunisolar and mixed shares. Report only.
//   SDN_MODULES_ROOT=<root> node tesseral-all-regimes.mjs --run [--shard k/n] [--phase 1-5] [--only <regime>] [--arm primary|secondary]
//   node tesseral-all-regimes.mjs --table [--out <dir>]      node tesseral-all-regimes.mjs --check
// Every state comes from a module (the fit, the flights and the forward RTN rotation from propagator/sdn-ap; the reference from
// propagator/ffm, both through propagator/sdn-ap/test/lib/heo-model-truth.mjs); this file moves bytes and does the arithmetic of the
// registered statistics (RTN decomposition of a difference vector, least squares, RMS, medians).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(HERE, '../..');
const RESULTS = path.join(REPO, 'results/ap-truth/tesseral-all-regimes');
const REGISTRATION = 'experiments/operator-theory/TESSERAL-ALL-REGIMES.md';
export const PIN = {
  modulesCommit: '93cb5a0584fa728864e4426cc9ceb368936589f9',
  sdnAp: { version: '0.6.3', wasmSha256: 'aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e' },
  ffm: { version: '2.2.1', wasmSha256: 'a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4' },
};
/** The arms (Amendment 2): primary = FFM 31x31 against the module at its shipped caps 31/20; secondary = 20x20 on both sides. */
export const ARMS = { primary: { field: [31, 31], caps: [31, 20], dir: '.' }, secondary: { field: [20, 20], caps: [20, 20], dir: 'secondary-20x20' } };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const RUNNER = sha256(fs.readFileSync(new URL(import.meta.url)));
const RE_KM = 6378.135, DAY = 86400000, EARTH_REV_PER_DAY = 1.00273781, LUNAR_MONTH_DAYS = 27.32;
// The 17 regimes and THEMIS D's one-day orbit (TESSERAL-ALL-REGIMES.md).
export const REGIMES = [
  ['Starlette', 13.82, 49.8], ['Ajisai', 12.44, 50.0], ['LARES', 12.55, 69.5], ['Jason-3', 12.81, 66.0], ['Sentinel-3', 14.27, 98.6], ['CryoSat-2', 14.52, 92.0],
  ['LAGEOS-1', 6.39, 109.8], ['LAGEOS-2', 6.47, 52.6], ['Etalon', 2.13, 64.9], ['GPS', 2.005, 55.0], ['Galileo', 1.70, 56.0], ['GLONASS', 2.13, 64.8],
  ['IGSO', 1.0027, 55.0], ['QZSS', 1.0027, 40.0], ['GEO', 1.0027, 0.1], ['Molniya', 2.006, 63.4, 0, 270], ['GTO', 2.40, 27.0, 0, 180],
].map(([name, n, i, raan = 0, argp = 0]) => ({ name, n, i, raan, argp }));
export const THEMIS_D = { name: 'THEMIS D', n: 1.0499037196959449, i: 8.132697128525981, raan: 47.85625519596603, argp: 68.66350938631257 };
const PERIGEE_FLOOR_KM = 200;
const semimajorKm = (n) => Math.cbrt(398600.4418 / ((n * 2 * Math.PI / 86400) ** 2));
const perigeeKm = (n, e) => semimajorKm(n) * (1 - e) - RE_KM;
/** Amendment 1.3: the fit arc holds at least 10 revolutions. */
export const arcDays = (n) => (n >= 6 ? 3 : n >= 1.5 ? 6 : 10);
/** Amendment 2: the forward grid is a whole number of seconds, 64 a revolution. */
export const gridSeconds = (n) => Math.round(86400 / n / 64);
/** The registered order of flight: phase 1 every regime at e 0.001; 2 the e 0.29 / 0.30 pairs; 3 e 0.01; 4 e 0.1; 5 e 0.05 and 0.2. */
export function cases() {
  const out = [];
  const cell = (r, e, phase, convergence) => out.push({ key: `${r.name}|${e}`, regime: r.name, n: r.n, i: r.i, raan: r.raan, argp: r.argp, e, phase, convergence, perigeeKm: perigeeKm(r.n, e), arcDays: arcDays(r.n) });
  for (const r of REGIMES) cell(r, 0.001, 1, true);
  for (const r of [THEMIS_D, ...REGIMES.filter((x) => x.name === 'Molniya' || x.name === 'GTO')]) for (const e of [0.29, 0.30]) cell(r, e, 2, true);
  for (const r of REGIMES) cell(r, 0.01, 3, false);
  for (const r of REGIMES) cell(r, 0.1, 4, false);
  for (const e of [0.05, 0.2]) for (const r of REGIMES) cell(r, e, 5, false);
  return out;
}
const readRows = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const median = (v) => { const s = [...v].sort((a, b) => a - b); const k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : NaN; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const roughness = (series) => { const d2 = []; for (let k = 1; k + 1 < series.length; k += 1) d2.push(Math.hypot(...[0, 1, 2].map((ax) => series[k + 1][ax] - 2 * series[k][ax] + series[k - 1][ax]))); return median(d2); };
const norms = (series) => series.map((p) => Math.hypot(...p));

/** The orbit-scaled bounds of A (TESSERAL-ALL-REGIMES.md). */
export const bounds = (A) => ({ rms: Math.max(1, 0.02 * A), max: Math.max(5, 0.10 * A), rough: Math.max(0.1, 0.005 * A) });

/** RTN components of a difference vector d (km) at the reference state (r, v in km, km/s): [radial, transverse, normal] in m. */
export function rtnOf(d, r, v) {
  const unit = (x) => { const n = Math.hypot(...x); return x.map((c) => c / n); };
  const R = unit(r), h = unit([r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]]);
  const T = [h[1] * R[2] - h[2] * R[1], h[2] * R[0] - h[0] * R[2], h[0] * R[1] - h[1] * R[0]];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return [dot(d, R) * 1000, dot(d, T) * 1000, dot(d, h) * 1000];
}

/** Least squares by normal equations (Gaussian elimination with partial pivoting). */
function solve(X, y, ridge = 0) {
  const n = X[0].length, N = Array.from({ length: n }, () => new Float64Array(n + 1));
  for (let k = 0; k < X.length; k += 1) for (let a = 0; a < n; a += 1) { const xa = X[k][a]; if (!xa) continue; for (let b = 0; b < n; b += 1) N[a][b] += xa * X[k][b]; N[a][n] += xa * y[k]; }
  for (let a = 0; a < n; a += 1) N[a][a] *= 1 + ridge;
  for (let c = 0; c < n; c += 1) {
    let p = c; for (let r = c + 1; r < n; r += 1) if (Math.abs(N[r][c]) > Math.abs(N[p][c])) p = r;
    [N[c], N[p]] = [N[p], N[c]];
    if (Math.abs(N[c][c]) < 1e-18) continue;
    for (let r = 0; r < n; r += 1) { if (r === c) continue; const m = N[r][c] / N[c][c]; if (!m) continue; for (let b = c; b <= n; b += 1) N[r][b] -= m * N[c][b]; }
  }
  return Array.from({ length: n }, (_, c) => (Math.abs(N[c][c]) < 1e-18 ? 0 : N[c][n] / N[c][c]));
}
/**
 * Attribution (Amendment 2): the RTN error series at times tau (days from the window's start) over a window of `windowDays` against a
 * trend (constant, linear, quadratic), the lunar monthly and semi-monthly lines (windows of 5 days or more), and the (m, j) grid with
 * frequencies merged below 1 / windowDays. Shares: the RMS (and maximum, roughness) of each reconstructed series.
 */
export function attribute(tau, rtn, nRevDay, windowDays) {
  // Conditioning (Amendment 3): lines merged below 1.5 / window (the Rayleigh limit), nothing above 0.9 of the sampling's Nyquist
  // frequency, a quadratic trend only on windows of 5 days or more, and a ridge of 1e-4 on the normal matrix's diagonal.
  const res = 1.5 / windowDays;
  const dt = median(tau.slice(1).map((t, k) => t - tau[k]));
  const nyquist = 0.5 / dt;
  const fams = [];
  for (let j = 0; j <= 16; j += 1) for (let m = 0; m <= 8; m += 1) if (j || m) fams.push({ label: `(${m},${j})`, m, j, f: Math.abs(j * nRevDay - m * EARTH_REV_PER_DAY) });
  fams.sort((a, b) => a.f - b.f);
  const groups = [];
  for (const x of fams) { const g = groups.at(-1); if (g && x.f - g.f < res) { g.labels.push(x.label); g.members.push(x); } else groups.push({ f: x.f, labels: [x.label], members: [x] }); }
  const kept = groups.filter((g) => g.f >= res && g.f < 0.9 * nyquist);
  const dropped = groups.filter((g) => g.f >= 0.9 * nyquist).length;
  const lunar = windowDays >= 5 ? [1 / LUNAR_MONTH_DAYS, 2 / LUNAR_MONTH_DAYS] : [];
  const quadratic = windowDays >= 5;
  const trendCols = quadratic ? 3 : 2;
  const row = (t) => [1, t, ...(quadratic ? [t * t] : []), ...lunar.flatMap((fr) => [Math.cos(2 * Math.PI * fr * t), Math.sin(2 * Math.PI * fr * t)]), ...kept.flatMap((g) => [Math.cos(2 * Math.PI * g.f * t), Math.sin(2 * Math.PI * g.f * t)])];
  const X = tau.map(row);
  const coef = [0, 1, 2].map((ax) => solve(X, rtn.map((p) => p[ax]), 1e-4));
  const series = (cols) => tau.map((t, k) => [0, 1, 2].map((ax) => cols.reduce((s, c) => s + coef[ax][c] * X[k][c], 0)));
  const kindOf = (g) => (g.members.every((x) => x.m === 0) ? 'zonal' : g.members.every((x) => x.m > 0) ? (g.members.every((x) => x.j === 0) ? 'm-daily' : 'tesseral') : 'mixed');
  const base = trendCols + 2 * lunar.length;
  const families = kept.map((g, gi) => ({ labels: g.labels, cyclesPerDay: +g.f.toFixed(3), kind: kindOf(g), cols: [base + 2 * gi, base + 2 * gi + 1],
    amplitudeM: Math.hypot(...[0, 1, 2].flatMap((ax) => [coef[ax][base + 2 * gi], coef[ax][base + 2 * gi + 1]])) })).sort((a, b) => b.amplitudeM - a.amplitudeM);
  const colsOf = (kinds) => families.filter((g) => kinds.includes(g.kind)).flatMap((g) => g.cols);
  const share = (cols) => { if (!cols.length) return { rmsM: 0, maxM: 0, roughM: 0 }; const s = series(cols), n = norms(s); return { rmsM: rms(n), maxM: Math.max(...n), roughM: roughness(s) }; };
  const residual = tau.map((t, k) => [0, 1, 2].map((ax) => rtn[k][ax] - coef[ax].reduce((s, c, ci) => s + c * X[k][ci], 0)));
  const shares = { secular: share(Array.from({ length: trendCols }, (_, c) => c)), lunisolar: share(lunar.flatMap((_, li) => [trendCols + 2 * li, trendCols + 2 * li + 1])), zonal: share(colsOf(['zonal'])), tesseral: share(colsOf(['tesseral', 'm-daily'])), mixed: share(colsOf(['mixed'])), unexplained: { rmsM: rms(norms(residual)) } };
  const total = rms(norms(rtn));
  const quadrature = Math.hypot(...Object.values(shares).map((s) => s.rmsM));
  return {
    basis: { groups: kept.length, droppedAboveNyquist: dropped, nyquistCyclesPerDay: +nyquist.toFixed(2), maxJResolved: Math.floor(0.9 * nyquist / nRevDay), lunar: lunar.length > 0, quadratic, ridge: 1e-4 },
    // the shares in quadrature against the series' own RMS: above 1.5 the fit is ill-conditioned and the shares are not read
    conditioned: quadrature <= 1.5 * total, sharesInQuadratureM: quadrature, totalRmsM: total,
    shares,
    families: families.map(({ cols, ...g }) => g),
  };
}

if (args.run) {
  const ARM = ARMS[args.arm ?? 'primary'];
  if (!ARM) throw new Error(`--arm ${args.arm}: primary or secondary`);
  const MOD = process.env.SDN_MODULES_ROOT;
  if (!MOD) throw new Error('SDN_MODULES_ROOT names the modules root');
  const apWasm = path.join(MOD, 'propagator/sdn-ap/dist/isomorphic/module.wasm'), ffmWasm = path.join(MOD, 'propagator/ffm/dist/isomorphic/module.wasm');
  if (sha256(fs.readFileSync(apWasm)) !== PIN.sdnAp.wasmSha256) throw new Error(`${apWasm} is not sdn-ap ${PIN.sdnAp.version}`);
  if (sha256(fs.readFileSync(ffmWasm)) !== PIN.ffm.wasmSha256) throw new Error(`${ffmWasm} is not ffm ${PIN.ffm.version}`);
  process.env.SDNAP_WASM = apWasm;
  process.env.SDN_AP_HEO_CACHE = process.env.SDN_AP_HEO_CACHE ?? '/Users/tj/software/terrain-work/body-look/allreg/heo-cache';
  const { runModelTruth } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/heo-model-truth.mjs')).href);
  const O = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/ocm.mjs')).href);
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json'));
  const { createStandaloneHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/testing/isomorphic')).href);
  const { pcfOutputFrame } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PCF/pcfOutputFrame.js')).href);
  const { OEM } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OEM/OEM.js')).href);
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
  const outDir = path.join(RESULTS, ARM.dir);
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `rows-${SHARD}.jsonl`);
  const done = new Set(readRows(outDir).map((r) => r.key));
  const list = cases().filter((c, k) => k % SHARDS === SHARD && (!args.phase || String(c.phase) === args.phase) && (!args.only || c.regime === args.only) && !done.has(c.key));
  // A: the fitted set flown with its caps minus the same set with MAXIMUM_TESSERAL_DEGREE 0, by the module, on the forward day's epochs.
  const flyer = await createStandaloneHarness('browser', apWasm, { surface: 'command' });
  const fly = async (set, epochs) => {
    const r = await flyer.invoke({ methodId: 'propagate', inputs: O.flight([set], { output: { EPOCHS: epochs, FRAME: pcfOutputFrame.GCRF } }) });
    if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${r.errorMessage}`);
    return OEM.getRootAsOEM(new fb.ByteBuffer(r.outputs.find((o) => o.portId === 'ephemeris').payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.map((l) => [l.X, l.Y, l.Z]);
  };
  for (const c of list) {
    const row = { ...c, arm: args.arm ?? 'primary', field: ARM.field, caps: ARM.caps, createdUtc: new Date().toISOString(), runner: RUNNER, modulesCommit: PIN.modulesCommit, sdnAp: PIN.sdnAp, ffm: PIN.ffm, shard: SHARD };
    if (c.perigeeKm < PERIGEE_FLOOR_KM) { row.flown = false; row.reason = 'below the perigee floor'; fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`); console.log(c.key, 'below the perigee floor'); continue; }
    const t0 = Date.now();
    try {
      const gridMinutes = gridSeconds(c.n) / 60;
      const fixture = { name: c.key, n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: 0, drag: false, thirdBody: true, field: ARM.field, forces: ARM.caps, fitDays: c.arcDays, hourly: true, gridMinutes, forecastDays: 1, referenceTolerance: 1e-12, referenceMaxStep: 300, modulePath: apWasm };
      const r = await runModelTruth(fixture);
      const set = Buffer.from(r.omm, 'base64');
      // Forward day (the module's RTN): the registered line, A, the attribution.
      const profile = r.profile, tau = profile.map((p) => p.h / 24), rtn = profile.map((p) => [p.r, p.t, p.n]);
      const err3 = profile.map((p) => p.e);
      const epochs = r.referenceStates.map((_, k) => new Date(Date.parse(`${r.epoch}Z`) + Math.round((c.arcDays + (k + 1) * gridMinutes / 1440) * DAY)).toISOString().replace('Z', ''));
      const withCaps = r.flown.map((s) => s.slice(0, 3));
      const zonalOnly = await fly(O.repackOcm(set, (t) => { t.PERTURBATIONS.MAXIMUM_TESSERAL_DEGREE = 0; }), epochs);
      const A = rms(withCaps.map((p, k) => Math.hypot(...p.map((x, ax) => (x - zonalOnly[k][ax]) * 1000))));
      const b = bounds(A);
      const forward = { samples: profile.length, gridSeconds: gridSeconds(c.n), rmsM: rms(err3), maxM: Math.max(...err3), roughM: roughness(rtn), rtnRmsM: [0, 1, 2].map((ax) => rms(rtn.map((p) => p[ax]))), ...attribute(tau, rtn, r.fitted.n, 1) };
      // In-arc (Amendment 1.3, 2): the fitted set on the arc's 30-minute samples against the reference there, RTN at the reference state.
      const arcOem = OEM.getRootAsOEM(new fb.ByteBuffer((await runModelTruth({ ...fixture, fitInput: true })).ephemeris.payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
      const arcFlown = await fly(set, arcOem.map((l) => l.EPOCH));
      const arcRtn = arcOem.map((l, k) => rtnOf([arcFlown[k][0] - l.X, arcFlown[k][1] - l.Y, arcFlown[k][2] - l.Z], [l.X, l.Y, l.Z], [l.X_DOT, l.Y_DOT, l.Z_DOT]));
      const arcTau = arcOem.map((l) => (Date.parse(`${l.EPOCH}Z`) - Date.parse(`${arcOem[0].EPOCH}Z`)) / DAY);
      const arcNorm = norms(arcRtn);
      const inArc = { samples: arcRtn.length, rmsM: rms(arcNorm), maxM: Math.max(...arcNorm), fitRmsKm: r.fitted.wrms, rtnRmsM: [0, 1, 2].map((ax) => rms(arcRtn.map((p) => p[ax]))), ...attribute(arcTau, arcRtn, r.fitted.n, c.arcDays) };
      Object.assign(row, { flown: true, fitted: r.fitted, initialGcrfKm: r.fixture.initialGcrfKm, A_m: A, bounds: b, forward, inArc,
        // the registered raw line and the tesseral verdict (Amendment 2)
        rawPass: forward.rmsM <= b.rms && forward.maxM <= b.max && forward.roughM <= b.rough,
        // Amendment 3: the in-arc leg applies where the arc's 30-minute sampling resolves the grid to j 8 (n <= 2.7 rev/day) and the fit is conditioned
        inArcLeg: inArc.basis.maxJResolved >= 8 && inArc.conditioned,
        tesseralPass: forward.conditioned && forward.shares.tesseral.rmsM <= b.rms && forward.shares.tesseral.maxM <= b.max && forward.shares.tesseral.roughM <= b.rough
          && (!(inArc.basis.maxJResolved >= 8 && inArc.conditioned) || (inArc.shares.tesseral.rmsM <= b.rms && inArc.shares.tesseral.maxM <= b.max)),
        reference: `propagator/ffm ${PIN.ffm.version}: EGM96 ${ARM.field[0]}x${ARM.field[1]}, Sun and Moon point masses (DE440), no drag, SRP, tides, relativity or Earth radiation; RK78 rel 1e-12 abs 1e-9, steps 0.01 to 300 s; zero EOP`,
        referenceIntegrator: r.fixture.referenceIntegrator, kernelSha256: r.kernelSha256 });
      if (c.convergence) {
        const r2 = await runModelTruth({ ...fixture, referenceTolerance: 1e-13, referenceMaxStep: 150 });
        row.convergenceMaxM = Math.max(...r.referenceStates.map((s, k) => Math.hypot(...s.position.map((x, ax) => (x - r2.referenceStates[k].position[ax]) * 1000))));
        row.convergencePass = row.convergenceMaxM < 0.1 * b.rms;
      }
      if (c.e >= 0.3) row.gridExercised = r.fitted.e >= 0.3;
      row.seconds = (Date.now() - t0) / 1000;
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
      const sh = (s) => `${f(s.secular.rmsM)}/${f(s.lunisolar.rmsM)}/${f(s.zonal.rmsM)}/${f(s.tesseral.rmsM)}/${f(s.mixed.rmsM)}`;
      console.log(c.key, row.tesseralPass ? 'TESSERAL-PASS' : 'TESSERAL-FAIL', row.rawPass ? 'raw-pass' : 'raw-fail', `arc ${c.arcDays} d in-arc ${f(inArc.rmsM)}/${f(inArc.maxM)} [${sh(inArc.shares)}${inArc.conditioned ? '' : ' ILL'} j<=${inArc.basis.maxJResolved}] fwd${forward.conditioned ? '' : ' ILL'} ${f(forward.rmsM)}/${f(forward.maxM)}/${f(forward.roughM, 3)} [${sh(forward.shares)}] A ${f(A)} b ${f(b.rms)}/${f(b.max)}/${f(b.rough, 3)}`, row.convergenceMaxM !== undefined ? `conv ${row.convergenceMaxM.toExponential(1)}` : '', `${row.seconds.toFixed(0)} s`);
    } catch (error) {
      row.flown = false; row.error = String(error?.message ?? error).slice(0, 300); row.seconds = (Date.now() - t0) / 1000;
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
      console.log(c.key, 'ERROR', row.error);
    }
  }
  await flyer.close?.();
  process.exit(0);
}

/** The table and README from the rows of both arms. */
export function table(outDir = RESULTS) {
  const all = cases();
  const section = (arm) => {
    const rows = readRows(path.join(RESULTS, ARMS[arm].dir)).filter((r) => (r.arm ?? 'secondary') === arm || arm === 'secondary');
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const cellOf = (c) => { const r = byKey.get(c.key); if (!r) return { key: c.key, state: 'unmeasured' }; if (!r.flown) return { key: c.key, state: r.reason ?? 'error', error: r.error }; return { key: c.key, state: r.tesseralPass ? 'pass' : 'fail', ...r }; };
    const cells = all.map(cellOf);
    const flown = cells.filter((x) => x.state === 'pass' || x.state === 'fail');
    const top = (x) => x.forward.families.filter((g) => g.amplitudeM >= 0.1 * x.forward.rmsM).slice(0, 8).map(({ labels, cyclesPerDay, kind, amplitudeM }) => ({ labels: labels.slice(0, 3), cyclesPerDay, kind, amplitudeM }));
    const regimes = [THEMIS_D, ...REGIMES].map((r) => ({ regime: r.name, arcDays: arcDays(r.n), cells: cells.filter((x) => x.key.startsWith(`${r.name}|`)).map((x) => ({ e: Number(x.key.split('|')[1]), state: x.state, error: x.error, arcDays: x.arcDays, A_m: x.A_m, bounds: x.bounds, fittedE: x.fitted?.e, gridExercised: x.gridExercised, convergenceMaxM: x.convergenceMaxM, convergencePass: x.convergencePass,
      rawPass: x.rawPass, tesseralPass: x.tesseralPass, inArc: x.inArc && { rmsM: x.inArc.rmsM, maxM: x.inArc.maxM, shares: x.inArc.shares }, forward: x.forward && { rmsM: x.forward.rmsM, maxM: x.forward.maxM, roughM: x.forward.roughM, shares: x.forward.shares, families: top(x) } })) }));
    const stepOf = (name) => { const lo = byKey.get(`${name}|0.29`), hi = byKey.get(`${name}|0.3`); if (!lo?.flown || !hi?.flown) return { regime: name, measured: false }; const resolution = (lo.convergenceMaxM ?? 0) + (hi.convergenceMaxM ?? 0); const s = { regime: name, measured: true, e029: { rmsM: lo.forward.rmsM, maxM: lo.forward.maxM, tesseralRmsM: lo.forward.shares.tesseral.rmsM, inArcRmsM: lo.inArc.rmsM, fittedE: lo.fitted.e }, e030: { rmsM: hi.forward.rmsM, maxM: hi.forward.maxM, tesseralRmsM: hi.forward.shares.tesseral.rmsM, inArcRmsM: hi.inArc.rmsM, fittedE: hi.fitted.e, gridExercised: hi.gridExercised }, stepRmsM: hi.forward.rmsM - lo.forward.rmsM, stepMaxM: hi.forward.maxM - lo.forward.maxM, stepTesseralRmsM: hi.forward.shares.tesseral.rmsM - lo.forward.shares.tesseral.rmsM, stepInArcRmsM: hi.inArc.rmsM - lo.inArc.rmsM, resolutionM: resolution }; s.claimed = Math.abs(s.stepRmsM) > resolution && Math.abs(s.stepMaxM) > resolution; return s; };
    const e001 = regimes.filter((r) => r.regime !== 'THEMIS D').map((r) => ({ regime: r.regime, ...r.cells.find((c) => c.e === 0.001) }));
    return { arm, field: ARMS[arm].field, caps: ARMS[arm].caps, rows: rows.length, flown: flown.length, pass: flown.filter((x) => x.state === 'pass').length, fail: flown.filter((x) => x.state === 'fail').length, rawPass: flown.filter((x) => x.rawPass).length, unmeasured: cells.filter((x) => x.state === 'unmeasured').length,
      e001: { pass: e001.filter((x) => x.state === 'pass').map((x) => x.regime), fail: e001.filter((x) => x.state === 'fail').map((x) => x.regime), unmeasured: e001.filter((x) => x.state === 'unmeasured').map((x) => x.regime) }, steps: ['THEMIS D', 'Molniya', 'GTO'].map(stepOf), regimes };
  };
  const out = { registration: REGISTRATION, pins: PIN, primary: section('primary'), secondary: section('secondary') };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(out, null, 1)}\n`);
  const sh = (s) => (s ? `${f(s.secular.rmsM)} / ${f(s.lunisolar.rmsM)} / ${f(s.zonal.rmsM)} / ${f(s.tesseral.rmsM)} / ${f(s.mixed.rmsM)}` : '-');
  const fam = (c) => (c.forward?.families?.length ? c.forward.families.slice(0, 4).map((g) => `${g.labels.slice(0, 2).join('=')} ${g.kind} ${f(g.amplitudeM, 1)}`).join('; ') : '-');
  const line = (r, c) => `| ${r.regime} | ${c.e} | ${c.state} | ${c.rawPass === undefined ? '-' : c.rawPass ? 'pass' : 'fail'} | ${c.arcDays ?? '-'} | ${c.inArc ? `${f(c.inArc.rmsM)} / ${f(c.inArc.maxM)}` : '-'} | ${sh(c.inArc?.shares)} | ${f(c.A_m, 1)} | ${c.forward ? `${f(c.forward.rmsM)} / ${f(c.forward.maxM)} / ${f(c.forward.roughM, 3)}` : '-'} | ${sh(c.forward?.shares)} | ${c.forward ? `${f(c.forward.shares.tesseral.rmsM)} / ${f(c.forward.shares.tesseral.maxM)} / ${f(c.forward.shares.tesseral.roughM, 3)}` : '-'} | ${c.bounds ? `${f(c.bounds.rms)} / ${f(c.bounds.max)} / ${f(c.bounds.rough, 3)}` : '-'} | ${c.convergenceMaxM !== undefined ? `${c.convergenceMaxM.toExponential(1)} ${c.convergencePass ? 'ok' : 'FAIL'}` : '-'} | ${fam(c)} |`;
  const sectionMd = (s, title) => [`## ${title}: FFM EGM96 ${s.field[0]}x${s.field[1]} against the module at caps ${s.caps[0]} / ${s.caps[1]}`, '',
    `Rows ${s.rows}; cells flown ${s.flown}: tesseral verdict pass ${s.pass}, fail ${s.fail}; raw registered line pass ${s.rawPass}; unmeasured ${s.unmeasured}.`, '',
    `### e 0.001, every regime (tesseral verdict)`, `Pass: ${s.e001.pass.join(', ') || 'none'}. Fail: ${s.e001.fail.join(', ') || 'none'}. Unmeasured: ${s.e001.unmeasured.join(', ') || 'none'}.`, '',
    `### The e 0.3 step (forward-day error, e 0.30 flight minus e 0.29 flight; claimed only beyond the sum of the two convergence figures)`,
    `| Orbit | e 0.29 RMS / max (m) | e 0.30 RMS / max (m) | Step RMS / max (m) | Tesseral share 0.29 -> 0.30 (m) | In-arc RMS 0.29 -> 0.30 (m) | Reference resolution (m) | Claimed | Fitted e 0.29 / 0.30 | Grid exercised |`, `| --- | --: | --: | --: | --: | --: | --: | --- | --: | --- |`,
    ...s.steps.map((x) => (x.measured ? `| ${x.regime} | ${f(x.e029.rmsM)} / ${f(x.e029.maxM)} | ${f(x.e030.rmsM)} / ${f(x.e030.maxM)} | ${f(x.stepRmsM)} / ${f(x.stepMaxM)} | ${f(x.e029.tesseralRmsM)} -> ${f(x.e030.tesseralRmsM)} | ${f(x.e029.inArcRmsM)} -> ${f(x.e030.inArcRmsM)} | ${x.resolutionM.toExponential(1)} | ${x.claimed ? 'yes' : 'below the reference resolution'} | ${f(x.e029.fittedE, 4)} / ${f(x.e030.fittedE, 4)} | ${x.e030.gridExercised ? 'yes' : 'NO'} |` : `| ${x.regime} | unmeasured | unmeasured | unmeasured | - | - | - | - | - | - |`)), '',
    `### Every cell (shares: secular / lunisolar / zonal / tesseral / mixed, RMS m)`,
    `| Regime | e | Tesseral verdict | Raw line | Arc (d) | In-arc RMS / max (m) | In-arc shares | A (m) | Forward RMS / max / roughness (m) | Forward shares | Tesseral share RMS / max / roughness (m) | Bounds (m) | Convergence (m) | Largest forward families |`,
    `| --- | --: | --- | --- | --: | --: | --- | --: | --: | --- | --: | --: | --: | --- |`,
    ...s.regimes.flatMap((r) => r.cells.map((c) => line(r, c))), ''];
  const md = [`# propagator/sdn-ap 0.6.3 in every regime against an independent full-force reference`, '',
    `Registration: ${REGISTRATION} (Amendments 1 and 2). Reference: propagator/ffm ${PIN.ffm.version}, EGM96 to the arm's degree and order, Sun and Moon point masses from DE440, no drag, SRP, tides, relativity or Earth radiation; RK78 rel 1e-12, steps to 300 s; convergence: the 1e-13 / 150 s reference, maximum position difference over the forward day. Module: propagator/sdn-ap ${PIN.sdnAp.version} fitted to the reference's arc (3 / 6 / 10 days by regime, 30-minute samples, no atmosphere, BTERM and AGOM held at 0), flown one day forward on a whole-second grid of 64 samples a revolution. In-arc: the fitted set on the arc's samples against the reference there, RTN. A: the model's own tesseral displacement (its caps against tesseral cap 0). Bounds: max(1 m, 0.02 A) RMS, max(5 m, 0.10 A) maximum, max(0.1 m, 0.005 A) roughness. Tesseral verdict: the reconstructed m > 0 periodic share (in-arc RMS and maximum, forward RMS, maximum and roughness) within the bounds; the raw line is the registered full-error reading. Shares are RMS of the reconstructed series: secular (trend), lunisolar (lunar monthly and semi-monthly, arcs of 5 days or more), zonal (m = 0 groups, the J21-J31 tail included on the primary arm), tesseral (m > 0 groups), mixed (groups holding both; the resonant one-cycle group of the one-day orbits). Families: (m, j), j the multiple of the mean anomaly, m the order; the largest four on the forward day with amplitude (m). The four smoke cells of the vacuum frame (smoke-no-third-body.jsonl) enter no table.`, '',
    ...sectionMd(out.primary, 'Primary arm'), ...sectionMd(out.secondary, 'Secondary arm (structural attribution only; stands in for no shipped-field result)')].join('\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), md);
  return out;
}

if (args.table) { const out = table(args.out ?? RESULTS); for (const arm of ['primary', 'secondary']) { const s = out[arm]; console.log(arm, JSON.stringify({ rows: s.rows, flown: s.flown, pass: s.pass, fail: s.fail, rawPass: s.rawPass, unmeasured: s.unmeasured, e001: s.e001, steps: s.steps.map((x) => (x.measured ? { regime: x.regime, stepRmsM: x.stepRmsM, stepMaxM: x.stepMaxM, claimed: x.claimed, gridExercised: x.e030.gridExercised } : x)) })); } process.exit(0); }

if (args.check) {
  let failures = 0;
  const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
  const git = (...a) => execFileSync('git', ['-C', REPO, ...a]).toString('utf8').trim();
  const primary = readRows(RESULTS), secondary = readRows(path.join(RESULTS, ARMS.secondary.dir)), rows = [...primary, ...secondary];
  const regSha = git('log', '--reverse', '--format=%H', '--', REGISTRATION).split('\n')[0];
  const regAt = Date.parse(git('show', '-s', '--format=%cI', regSha));
  const first = rows.map((r) => r.createdUtc).sort()[0];
  check(rows.length > 0 && regAt < Date.parse(first), `registration ${regSha.slice(0, 8)} (${git('show', '-s', '--format=%cI', regSha)}) precedes the first of ${rows.length} rows (${first})`);
  const amendment2 = git('log', '--format=%H %cI', '-S', 'Amendment 2 (2026-11-06', '--', REGISTRATION).split('\n').filter(Boolean).at(-1);
  const firstPrimary = primary.map((r) => r.createdUtc).sort()[0];
  check(Boolean(amendment2) && primary.length > 0 && Date.parse(amendment2.split(' ')[1]) < Date.parse(firstPrimary), `Amendment 2 (${(amendment2 ?? '').slice(0, 8)}) precedes the first of ${primary.length} primary rows (${firstPrimary})`);
  check(rows.every((r) => r.sdnAp?.wasmSha256 === PIN.sdnAp.wasmSha256 && r.ffm?.wasmSha256 === PIN.ffm.wasmSha256), `every row on sdn-ap ${PIN.sdnAp.version} (${PIN.sdnAp.wasmSha256.slice(0, 12)}) and ffm ${PIN.ffm.version} (${PIN.ffm.wasmSha256.slice(0, 12)})`);
  check(primary.every((r) => r.arm === 'primary' && r.field?.[0] === 31 && r.caps?.[0] === 31 && r.caps?.[1] === 20), `every primary row is FFM 31x31 against the module at 31 / 20`);
  const flown = primary.filter((r) => r.flown);
  check(flown.length > 0 && flown.every((r) => r.bounds && Number.isFinite(r.A_m) && typeof r.tesseralPass === 'boolean' && typeof r.rawPass === 'boolean' && r.inArc?.shares && r.forward?.shares), `${flown.length} flown primary cells each scored against its orbit-scaled bounds (A, max(1, 0.02 A) / max(5, 0.10 A) / max(0.1, 0.005 A)) with both shares`);
  check(flown.filter((r) => !r.tesseralPass).every((r) => r.forward.families?.length > 0), `every failing primary cell (${flown.filter((r) => !r.tesseralPass).length}) names its families`);
  check(flown.filter((r) => r.convergence).every((r) => Number.isFinite(r.convergenceMaxM)), `every convergence cell carries its 1e-13 / 150 s figure`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tesseral-all-regimes-'));
  table(tmp);
  check(['table.json', 'README.md'].every((n) => fs.existsSync(path.join(RESULTS, n)) && fs.readFileSync(path.join(tmp, n)).equals(fs.readFileSync(path.join(RESULTS, n)))), `results/ap-truth/tesseral-all-regimes/table.json and README.md reproduce from the rows`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const t = JSON.parse(fs.readFileSync(path.join(RESULTS, 'table.json'), 'utf8')).primary;
  check(t.e001.pass.length + t.e001.fail.length + t.e001.unmeasured.length === 17, `17 regimes at e 0.001 on the primary arm: tesseral pass ${t.e001.pass.length}, fail ${t.e001.fail.length}, unmeasured ${t.e001.unmeasured.length}`);
  console.log(failures ? `FAIL (${failures})` : 'PASS');
  process.exit(failures ? 1 : 0);
}
