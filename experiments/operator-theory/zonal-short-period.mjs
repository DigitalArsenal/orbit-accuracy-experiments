// ZONAL-SHORT-PERIOD.md: first-order zonal short-period terms J6 to J_L (m = 0, j >= 2, small-e form, analytic in the argument of
// latitude) prototyped in the harness as a correction to propagator/sdn-ap 0.6.4's output states (the module unchanged), read as the
// m = 0 share before and after against the all-regimes reference, with the reference-side validation V1 and the cost. Report only.
//   SDN_MODULES_ROOT=<pinned root> SDNAP_064_WASM=<signed 0.6.4 dist> SDN_AP_HEO_CACHE=<scratch> node zonal-short-period.mjs --run [--shard k/n]
//   node zonal-short-period.mjs --table      node zonal-short-period.mjs --check      node zonal-short-period.mjs --selftest
// Every state comes from a module (propagator/sdn-ap and propagator/ffm through propagator/sdn-ap/test/lib/heo-model-truth.mjs); this
// file moves bytes and does arithmetic (Legendre polynomials, a discrete Fourier transform, the Hill response per harmonic, least squares).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(HERE, '../..');
const RESULTS = path.join(REPO, 'results/ap-truth/zonal-short-period');
const LANDED = path.join(REPO, 'results/ap-truth/tesseral-all-regimes');
const REGISTRATION = 'experiments/operator-theory/ZONAL-SHORT-PERIOD.md';
const AMENDMENT1 = '31302171e58a2d8a159254e801bd8a95d4f6ebee';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const RUNNER = sha256(fs.readFileSync(new URL(import.meta.url)));
const argvSave = process.argv; process.argv = process.argv.slice(0, 2);
const AR = await import(pathToFileURL(path.join(HERE, 'tesseral-all-regimes.mjs')).href);
process.argv = argvSave;
const { PIN: ARPIN, ARMS, REGIMES, attribute, threeWay, bounds, rtnOf, gridSeconds, arcDays } = AR;
export const PIN = {
  modulesCommit: ARPIN.modulesCommit,
  sdnAp: { version: '0.6.4', bundleSha256: 'e98b63558d84cfd3b8509f4c4c640502e38f81cc05a0e0277fcffa7da97cf51d', canonicalSha256: 'fd1ef4682edc68836d27fdb1f606a45b22bb3605354c55312287f87771a804b5' },
  ffm: ARPIN.ffm,
};
const EGM = { file: 'propagator/ffm/lib/egm96_data.h', sha256: '4d5c80b3d673696affffe9d2d17df94ecca730b1f61e0483b1bb9d6606e6a6f4' };
const LOW = ['Starlette', 'Ajisai', 'LARES', 'Jason-3', 'Sentinel-3', 'CryoSat-2'];
const E_GRID = [0.01, 0.05, 0.1];
const FLOORS = { rms: 1, max: 5, rough: 0.1 };
const RE_KM = 6378.135, MU = 398600.4418, DAY = 86400000, PERIGEE_FLOOR_KM = 200, NDFT = 128, COLD_TARGET_MS = 100, WITHIN_MS = 10, MODULE_TAIL_BYTES = 272;
const semimajorKm = (n) => Math.cbrt(MU / ((n * 2 * Math.PI / 86400) ** 2));
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const median = (v) => { const s = [...v].sort((a, b) => a - b); const k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : NaN; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const readRows = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /^rows-\d+\.jsonl$/.test(x)).sort().flatMap((x) => fs.readFileSync(path.join(dir, x), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const landedRows = () => [...readRows(LANDED).map((r) => ({ ...r, arm: 'primary' })), ...readRows(path.join(LANDED, ARMS.secondary.dir)).map((r) => ({ ...r, arm: 'secondary' }))].filter((r) => r.flown);
const termCount = (L) => { let c = 0; for (let l = 6; l <= L; l += 1) for (let p = 0; p <= Math.floor(l / 2); p += 1) if (l - 2 * p >= 2) c += 1; return c; };

// ---- the terms (ZONAL-SHORT-PERIOD.md items 1 to 3) ----
/** P_l(s) and P_l'(s), l = 0..L (Bonnet's recurrence; dP_l = dP_(l-2) + (2 l - 1) P_(l-1)). */
function legendre(L, s) {
  const P = new Float64Array(L + 1), dP = new Float64Array(L + 1);
  P[0] = 1; if (L >= 1) { P[1] = s; dP[1] = 1; }
  for (let l = 2; l <= L; l += 1) { P[l] = ((2 * l - 1) * s * P[l - 1] - (l - 1) * P[l - 2]) / l; dP[l] = dP[l - 2] + (2 * l - 1) * P[l - 1]; }
  return { P, dP };
}
/**
 * The force harmonics of the zonal degrees lo..L on the circular orbit (a km, i rad): per component X in {R, T, N} the cosine and sine
 * coefficients a_Xj, b_Xj, j = 0..L (km/s^2), by the exact discrete Fourier transform on NDFT points of the trigonometric polynomials of item 1.
 */
export function forceHarmonics(J, lo, L, aKm, iRad) {
  const si = Math.sin(iRad), ci = Math.cos(iRad);
  const K = new Float64Array(L + 1);
  for (let l = lo; l <= L; l += 1) K[l] = MU * J[l] * RE_KM ** l / aKm ** (l + 2);
  const fR = new Float64Array(NDFT), fT = new Float64Array(NDFT), fN = new Float64Array(NDFT);
  for (let k = 0; k < NDFT; k += 1) {
    const u = 2 * Math.PI * k / NDFT, su = Math.sin(u), cu = Math.cos(u), s = si * su;
    const { P, dP } = legendre(L, s);
    let r = 0, t = 0, nn = 0;
    for (let l = lo; l <= L; l += 1) { r += (l + 1) * K[l] * P[l]; t -= K[l] * dP[l] * si * cu; nn -= K[l] * dP[l] * ci; }
    fR[k] = r; fT[k] = t; fN[k] = nn;
  }
  const dft = (v) => { const a = new Float64Array(L + 1), b = new Float64Array(L + 1); for (let j = 0; j <= L; j += 1) { let ca = 0, sb = 0; for (let k = 0; k < NDFT; k += 1) { const w = 2 * Math.PI * j * k / NDFT; ca += v[k] * Math.cos(w); sb += v[k] * Math.sin(w); } a[j] = (j ? 2 : 1) * ca / NDFT; b[j] = (j ? 2 : 1) * sb / NDFT; } return { a, b }; };
  return { R: dft(fR), T: dft(fT), N: dft(fN), L, lo };
}
/** Item 2: the forced solution per harmonic j >= 2 (meters): x = cx cos ju + sx sin ju, likewise y, z; item 3: the constant members. */
export function responseTable(h, nRadPerSec) {
  const n2 = nRadPerSec * nRadPerSec, L = h.L;
  const cx = new Float64Array(L + 1), sx = new Float64Array(L + 1), cy = new Float64Array(L + 1), sy = new Float64Array(L + 1), cz = new Float64Array(L + 1), sz = new Float64Array(L + 1);
  for (let j = 2; j <= L; j += 1) {
    const d = n2 * (1 - j * j), aR = h.R.a[j], bR = h.R.b[j], aT = h.T.a[j], bT = h.T.b[j], aN = h.N.a[j], bN = h.N.b[j];
    const Xr = (aR - 2 * bT / j) / d, Xi = (-bR - 2 * aT / j) / d;
    const Yr = -2 * Xi / j - aT / (j * j * n2), Yi = 2 * Xr / j + bT / (j * j * n2);
    const Zr = aN / d, Zi = -bN / d;
    cx[j] = Xr * 1000; sx[j] = -Xi * 1000; cy[j] = Yr * 1000; sy[j] = -Yi * 1000; cz[j] = Zr * 1000; sz[j] = -Zi * 1000;
  }
  return { L, cx, sx, cy, sy, cz, sz, R0predM: 1000 * h.R.a[0] / (3 * n2), N0predM: -1000 * h.N.a[0] / n2, j1: { R: Math.hypot(h.R.a[1], h.R.b[1]), T: Math.hypot(h.T.a[1], h.T.b[1]), N: Math.hypot(h.N.a[1], h.N.b[1]) } };
}
/** The displacement (m, RTN) at the true argument of latitude u (rad). */
function displacement(tab, u) {
  let x = 0, y = 0, z = 0;
  const c1 = Math.cos(u), s1 = Math.sin(u);
  let cj = Math.cos(2 * u), sj = Math.sin(2 * u);
  for (let j = 2; j <= tab.L; j += 1) {
    x += tab.cx[j] * cj + tab.sx[j] * sj; y += tab.cy[j] * cj + tab.sy[j] * sj; z += tab.cz[j] * cj + tab.sz[j] * sj;
    const c = cj * c1 - sj * s1, s = sj * c1 + cj * s1; cj = c; sj = s;
  }
  return [x, y, z];
}
/** Inclination and true argument of latitude of a GCRF state (km, km/s): arithmetic on a state; it produces no state. */
function orbitAngles(r, v) {
  const h = [r[1] * v[2] - r[2] * v[1], r[2] * v[0] - r[0] * v[2], r[0] * v[1] - r[1] * v[0]], hn = Math.hypot(...h);
  const node = [-h[1], h[0], 0], nn = Math.hypot(...node) || 1e-300;
  const nHat = node.map((x) => x / nn), hHat = h.map((x) => x / hn);
  const tHat = [hHat[1] * nHat[2] - hHat[2] * nHat[1], hHat[2] * nHat[0] - hHat[0] * nHat[2], hHat[0] * nHat[1] - hHat[1] * nHat[0]];
  const dot = (p, q) => p[0] * q[0] + p[1] * q[1] + p[2] * q[2];
  return { i: Math.acos(hHat[2]), u: Math.atan2(dot(r, tHat), dot(r, nHat)) };
}
function readJ(MOD) {
  const file = path.join(MOD, EGM.file), bytes = fs.readFileSync(file);
  if (sha256(bytes) !== EGM.sha256) throw new Error(`${file} is not the pinned egm96_data.h`);
  const J = {};
  for (const m of bytes.toString('utf8').matchAll(/\{\s*(\d+),\s*(\d+),\s*([-+0-9.eE]+),\s*([-+0-9.eE]+)\s*\}/g)) { const l = Number(m[1]); if (Number(m[2]) === 0 && l >= 2 && l <= 31) J[l] = -Math.sqrt(2 * l + 1) * Number(m[3]); }
  return J;
}
/** A least-squares line and the delete-one-block jackknife of both coefficients (the secular record's item 1). */
function lineFit(t, y, blockIds) {
  const fit = (idx) => { let n = 0, st = 0, sy = 0, stt = 0, sty = 0; for (const k of idx) { n += 1; st += t[k]; sy += y[k]; stt += t[k] * t[k]; sty += t[k] * y[k]; } const d = n * stt - st * st; const c1 = (n * sty - st * sy) / d; return [(sy - c1 * st) / n, c1]; };
  const all = t.map((_, k) => k), [c0, c1] = fit(all), blocks = [...new Set(blockIds)], K = blocks.length;
  if (K < 3) return { c0: { point: c0, lo: null, hi: null, se: null }, c1: { point: c1, lo: null, hi: null, se: null }, K };
  const reps = blocks.map((b) => fit(all.filter((k) => blockIds[k] !== b)));
  const se = (j) => { const v = reps.map((r) => r[j]), m = v.reduce((a, b) => a + b, 0) / K; return Math.sqrt(((K - 1) / K) * v.reduce((a, b) => a + (b - m) ** 2, 0)); };
  const iv = (x, s) => ({ point: x, lo: x - 2 * s, hi: x + 2 * s, se: s });
  return { c0: iv(c0, se(0)), c1: iv(c1, se(1)), K };
}
const slim = (x) => ({ rmsM: x.rmsM, maxM: x.maxM, roughM: x.roughM, conditioned: x.conditioned, jackknife: x.jackknife, shares: x.shares, families: x.families.slice(0, 10), zonalFamilies: x.families.filter((q) => q.kind === 'zonal').slice(0, 8) });

/** Self-test of item 2: the Hill equations integrated (RK4) from the analytic solution's initial state stay on it over one revolution. */
export function selfTest() {
  const n = 2 * Math.PI / 6000, L = 6, J = { 6: -5.4e-7 };
  const h = forceHarmonics(J, 6, L, 7000, 50 * Math.PI / 180), tab = responseTable(h, n);
  const force = (u) => { const g = (c) => { let v = c.a[0]; for (let j = 1; j <= L; j += 1) v += c.a[j] * Math.cos(j * u) + c.b[j] * Math.sin(j * u); return v; }; return [g(h.R), g(h.T), g(h.N)]; };
  // only the j >= 2 harmonics drive the test (the j = 0 and 1 members are not part of the forced solution)
  const force2 = (u) => { const g = (c) => { let v = 0; for (let j = 2; j <= L; j += 1) v += c.a[j] * Math.cos(j * u) + c.b[j] * Math.sin(j * u); return v; }; return [g(h.R), g(h.T), g(h.N)]; };
  const pos = (u) => displacement(tab, u).map((x) => x / 1000), eps = 1e-6;
  const vel = (u) => { const p = pos(u + eps), m = pos(u - eps); return p.map((x, k) => (x - m[k]) / (2 * eps) * n); };
  let y = [...pos(0), ...vel(0)];
  const deriv = (t, s) => { const [x, yy, z, vx, vy, vz] = s, [fr, ft, fn] = force2(n * t); return [vx, vy, vz, fr + 2 * n * vy + 3 * n * n * x, ft - 2 * n * vx, fn - n * n * z]; };
  const steps = 8192, dt = 2 * Math.PI / n / steps; let maxErr = 0, amp = 0;
  for (let k = 0; k < steps; k += 1) {
    const t = k * dt, k1 = deriv(t, y), k2 = deriv(t + dt / 2, y.map((v, q) => v + dt / 2 * k1[q])), k3 = deriv(t + dt / 2, y.map((v, q) => v + dt / 2 * k2[q])), k4 = deriv(t + dt, y.map((v, q) => v + dt * k3[q]));
    y = y.map((v, q) => v + dt / 6 * (k1[q] + 2 * k2[q] + 2 * k3[q] + k4[q]));
    const p = pos(n * (t + dt)); maxErr = Math.max(maxErr, Math.hypot(...p.map((x, q) => x - y[q]))); amp = Math.max(amp, Math.hypot(...p));
  }
  void force;
  return { maxErrorM: maxErr * 1000, amplitudeM: amp * 1000, ratio: maxErr / amp, pass: maxErr / amp < 1e-6 };
}
if (args.selftest) { console.log(JSON.stringify(selfTest())); process.exit(0); }

/** The registered cells in order of flight: (1) e 0.001 secondary (with V1), (2) e 0.001 primary, (3) the e grid, secondary. */
function cells() {
  const regs = LOW.map((name) => REGIMES.find((r) => r.name === name));
  const out = [];
  for (const reg of regs) out.push({ id: `cell:secondary:${reg.name}|0.001`, reg, e: 0.001, arm: 'secondary', v1: true });
  for (const reg of regs) out.push({ id: `cell:primary:${reg.name}|0.001`, reg, e: 0.001, arm: 'primary', v1: false });
  for (const e of E_GRID) for (const reg of regs) out.push({ id: `cell:secondary:${reg.name}|${e}`, reg, e, arm: 'secondary', v1: false });
  return out;
}

if (args.run) {
  const MOD = process.env.SDN_MODULES_ROOT, apWasm = process.env.SDNAP_064_WASM;
  if (!MOD) throw new Error('SDN_MODULES_ROOT names the pinned modules root');
  if (!apWasm) throw new Error('SDNAP_064_WASM names this lane\'s copy of the signed 0.6.4 dist');
  if (!process.env.SDN_AP_HEO_CACHE) throw new Error('SDN_AP_HEO_CACHE names this lane\'s own cache');
  const ffmWasm = path.join(MOD, 'propagator/ffm/dist/isomorphic/module.wasm');
  const apBytes = fs.readFileSync(apWasm);
  if (sha256(apBytes) !== PIN.sdnAp.bundleSha256) throw new Error(`${apWasm} is not the signed sdn-ap 0.6.4 bundle`);
  const { computeCanonicalModuleHash } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/node_modules/space-data-module-sdk/src/bundle/wasm.js')).href);
  const canonical = (await computeCanonicalModuleHash(apBytes)).hashHex;
  if (canonical !== PIN.sdnAp.canonicalSha256) throw new Error(`${apWasm}: canonical hash ${canonical} is not ${PIN.sdnAp.canonicalSha256}`);
  if (sha256(fs.readFileSync(ffmWasm)) !== PIN.ffm.wasmSha256) throw new Error(`${ffmWasm} is not ffm ${PIN.ffm.version}`);
  if (execFileSync('git', ['-C', MOD, 'rev-parse', 'HEAD']).toString().trim() !== PIN.modulesCommit) throw new Error(`${MOD} is not at ${PIN.modulesCommit}`);
  process.env.SDNAP_WASM = apWasm;
  const J = readJ(MOD);
  const { runModelTruth } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/heo-model-truth.mjs')).href);
  const O = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/ocm.mjs')).href);
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json'));
  const { createStandaloneHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/testing/isomorphic')).href);
  const { pcfOutputFrame } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PCF/pcfOutputFrame.js')).href);
  const { OEM } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OEM/OEM.js')).href);
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
  if (SHARDS > 4) throw new Error('at most 4 shards');
  fs.mkdirSync(RESULTS, { recursive: true });
  const outFile = path.join(RESULTS, `rows-${SHARD}.jsonl`);
  const done = new Set(readRows(RESULTS).map((r) => r.id));
  const stamp = () => ({ createdUtc: new Date().toISOString(), runner: RUNNER, modulesCommit: PIN.modulesCommit, sdnAp: PIN.sdnAp, ffm: PIN.ffm, apSha256: PIN.sdnAp.bundleSha256, shard: SHARD });
  const emit = (row) => fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
  const flyer = await createStandaloneHarness('browser', apWasm, { surface: 'command' });
  const fly = async (set, epochs) => { const r = await flyer.invoke({ methodId: 'propagate', inputs: O.flight([set], { output: { EPOCHS: epochs, FRAME: pcfOutputFrame.GCRF } }) }); if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${r.errorMessage}`); return OEM.getRootAsOEM(new fb.ByteBuffer(Buffer.from(r.outputs.find((o) => o.portId === 'ephemeris').payload))).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.map((l) => [l.X, l.Y, l.Z, l.X_DOT, l.Y_DOT, l.Z_DOT]); };
  const landed = landedRows();
  const selfTestResult = selfTest();
  const mine = cells().filter((_, k) => k % SHARDS === SHARD).filter((c) => !args.only || c.id === args.only);
  /** The correction of a module state series (km, km/s) with the table: the RTN displacement at each epoch's true argument of latitude. */
  const corrections = (tab, states) => states.map((s) => displacement(tab, orbitAngles(s.slice(0, 3), s.slice(3)).u));
  const pairLeg = (tau, rtn, corr, nRevDay, windowDays, blockDays) => {
    const b = attribute(tau, rtn, nRevDay, windowDays, blockDays);
    const after = attribute(tau, rtn.map((p, k) => [p[0] + corr[k][0], p[1] + corr[k][1], p[2] + corr[k][2]]), nRevDay, windowDays, blockDays);
    const zb = b.shares.zonal, za = after.shares.zonal;
    const seD = zb.se && za.se ? Math.hypot(zb.se.rmsM, za.se.rmsM) : null, dM = zb.rmsM - za.rmsM;
    const leak = (name) => { const p = b.shares[name], q = after.shares[name]; return p.se && q.se ? { beforeM: p.rmsM, afterM: q.rmsM, moved: Math.abs(p.rmsM - q.rmsM) > 2 * (p.se.rmsM + q.se.rmsM) } : { beforeM: p.rmsM, afterM: q.rmsM, moved: null }; };
    const resid = after.families.filter((q) => q.kind === 'zonal').sort((p, q) => q.amplitudeM - p.amplitudeM)[0] ?? null;
    const j1 = (x) => x.families.find((q) => q.kind === 'zonal' && q.labels.includes('(0,1)'))?.amplitudeM ?? 0;
    return { before: slim(b), after: slim(after), rawRmsBeforeM: rms(rtn.map((p) => Math.hypot(...p))), rawRmsAfterM: rms(rtn.map((p, k) => Math.hypot(p[0] + corr[k][0], p[1] + corr[k][1], p[2] + corr[k][2]))), correctionRmsM: rms(corr.map((p) => Math.hypot(...p))),
      difference: { rmsM: dM, lo: seD == null ? null : dM - 2 * seD, hi: seD == null ? null : dM + 2 * seD, se: seD },
      conditioned: b.conditioned && after.conditioned, aScaledAfter: null, floorAfter: threeWay(za, FLOORS, ['rms', 'max']), floorBefore: threeWay(zb, FLOORS, ['rms', 'max']),
      leakage: { tesseral: leak('tesseral'), secular: leak('secular') }, residual: resid ? { label: resid.labels.join('/'), amplitudeM: resid.amplitudeM, j1Member: resid.labels.includes('(0,1)') } : null, j1AmplitudeM: { before: j1(b), after: j1(after) } };
  };
  for (const it of mine) {
    if (done.has(it.id)) continue;
    const t0 = Date.now();
    const reg = it.reg, arm = { name: it.arm, ...ARMS[it.arm] };
    const c = { key: `${reg.name}|${it.e}`, regime: reg.name, n: reg.n, i: reg.i, raan: reg.raan, argp: reg.argp, e: it.e, arm: it.arm, field: arm.field, caps: arm.caps, perigeeKm: semimajorKm(reg.n) * (1 - it.e) - RE_KM, arcDays: arcDays(reg.n), L: arm.field[0] };
    try {
      if (c.perigeeKm < PERIGEE_FLOOR_KM) { emit({ id: it.id, type: 'cell', ...c, ...stamp(), flown: false, reason: 'below the perigee floor', seconds: (Date.now() - t0) / 1000 }); console.log(it.id, 'below the perigee floor'); continue; }
      const gridMinutes = gridSeconds(c.n) / 60;
      const fixture = { name: c.key, n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: 0, drag: false, thirdBody: true, field: arm.field, forces: arm.caps, fitDays: c.arcDays, hourly: true, gridMinutes, forecastDays: 1, referenceTolerance: 1e-12, referenceMaxStep: 300, modulePath: apWasm };
      const r = await runModelTruth(fixture);
      const set = Buffer.from(r.omm, 'base64');
      const nRad = r.fitted.n * 2 * Math.PI / 86400, aKm = semimajorKm(r.fitted.n);
      const iFit = orbitAngles(r.flown[0].slice(0, 3), r.flown[0].slice(3)).i;
      const tb = performance.now();
      const harm = forceHarmonics(J, 6, c.L, aKm, iFit), tab = responseTable(harm, nRad);
      const buildMs = performance.now() - tb;
      // forward leg
      const profile = r.profile, tau = profile.map((p) => p.h / 24), rtn = profile.map((p) => [p.r, p.t, p.n]);
      const corrFwd = corrections(tab, r.flown);
      const forward = pairLeg(tau, rtn, corrFwd, r.fitted.n, 1, 1 / r.fitted.n);
      // in-arc leg
      const arcOem = OEM.getRootAsOEM(new fb.ByteBuffer((await runModelTruth({ ...fixture, fitInput: true })).ephemeris.payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
      const arcFlown = await fly(set, arcOem.map((l) => l.EPOCH));
      const arcRtn = arcOem.map((l, k) => rtnOf([arcFlown[k][0] - l.X, arcFlown[k][1] - l.Y, arcFlown[k][2] - l.Z], [l.X, l.Y, l.Z], [l.X_DOT, l.Y_DOT, l.Z_DOT]));
      const arcTau = arcOem.map((l) => (Date.parse(`${l.EPOCH}Z`) - Date.parse(`${arcOem[0].EPOCH}Z`)) / DAY);
      const inArc = pairLeg(arcTau, arcRtn, corrections(tab, arcFlown), r.fitted.n, c.arcDays, 1);
      // item 3: the constant members against the trend constants (forward day, delete-one-revolution jackknife)
      const blockIds = tau.map((t) => Math.floor(t * r.fitted.n));
      const lR = lineFit(tau, rtn.map((q) => q[0]), blockIds), lN = lineFit(tau, rtn.map((q) => q[2]), blockIds), lT = lineFit(tau, rtn.map((q) => q[1]), blockIds);
      const inside = (pred, iv) => (iv.lo == null ? null : pred >= iv.lo && pred <= iv.hi);
      const constants = { R0predM: tab.R0predM, R0: lR.c0, R0insideInterval: inside(tab.R0predM, lR.c0), N0predM: tab.N0predM, N0: lN.c0, N0insideInterval: inside(tab.N0predM, lN.c0), T1: lT.c1, revolutions: lR.K, j1ForceKmS2: tab.j1 };
      // the bounds and the A-scaled reading, as the all-regimes record defines A
      const epochs = r.referenceStates.map((_, k) => iso(Date.parse(`${r.epoch}Z`) + Math.round((c.arcDays + (k + 1) * gridMinutes / 1440) * DAY)));
      const zonalOnly = await fly(O.repackOcm(set, (t) => { t.PERTURBATIONS.MAXIMUM_TESSERAL_DEGREE = 0; }), epochs);
      const A = rms(r.flown.map((p, k) => Math.hypot(...[0, 1, 2].map((ax) => (p[ax] - zonalOnly[k][ax]) * 1000))));
      const b = bounds(A);
      forward.aScaledAfter = threeWay(forward.after.shares.zonal, b, ['rms', 'max']); forward.aScaledBefore = threeWay(forward.before.shares.zonal, b, ['rms', 'max']);
      inArc.aScaledAfter = threeWay(inArc.after.shares.zonal, b, ['rms', 'max']); inArc.aScaledBefore = threeWay(inArc.before.shares.zonal, b, ['rms', 'max']);
      // V1: the reference's own J6-J20 content, Ref[20, 0] - Ref[5, 0], before and after the prototype at the reference's own angles
      let v1 = null;
      if (it.v1) {
        // Amendment 1: two fitted zonal-only arms, Z5 (reference degree 5 order 0, caps 0 / 5) and Z20 (degree 20 order 0, caps 0 / 20)
        const armRow = async (name, deg) => {
          const ta = Date.now();
          const ra = await runModelTruth({ ...fixture, name: `${c.key}|${name}`, field: [deg, 0], forces: [0, deg] });
          const rtnA = ra.profile.map((p) => [p.r, p.t, p.n]), tauA = ra.profile.map((p) => p.h / 24);
          const att = attribute(tauA, rtnA, ra.fitted.n, 1, 1 / ra.fitted.n);
          emit({ id: `arm:${name}:${reg.name}`, type: 'arm', regime: reg.name, e: c.e, arm: name, field: [deg, 0], caps: [0, deg], ...stamp(), flown: true, fitted: ra.fitted, forward: slim({ ...att, rmsM: rms(rtnA.map((p) => Math.hypot(...p))), maxM: Math.max(...rtnA.map((p) => Math.hypot(...p))), roughM: NaN }), set: { sha256: sha256(Buffer.from(ra.omm, 'base64')) }, seconds: (Date.now() - ta) / 1000 });
          return { r: ra, rtn: rtnA, tau: tauA, att };
        };
        const z5 = await armRow('Z5', 5), z20 = await armRow('Z20', 20);
        if (z5.rtn.length !== z20.rtn.length) throw new Error('V1: the two arms differ in length');
        const S = z20.rtn.map((p, k) => [p[0] - z5.rtn[k][0], p[1] - z5.rtn[k][1], p[2] - z5.rtn[k][2]]);
        const n20 = z20.r.fitted.n * 2 * Math.PI / 86400, a20 = semimajorKm(z20.r.fitted.n), i20 = orbitAngles(z20.r.flown[0].slice(0, 3), z20.r.flown[0].slice(3)).i;
        const tab20 = responseTable(forceHarmonics(J, 6, 20, a20, i20), n20);
        const corrS = corrections(tab20, z20.r.flown);
        const bS = attribute(z20.tau, S, z20.r.fitted.n, 1, 1 / z20.r.fitted.n);
        const plus = attribute(z20.tau, S.map((p, k) => [p[0] + corrS[k][0], p[1] + corrS[k][1], p[2] + corrS[k][2]]), z20.r.fitted.n, 1, 1 / z20.r.fitted.n);
        const minus = attribute(z20.tau, S.map((p, k) => [p[0] - corrS[k][0], p[1] - corrS[k][1], p[2] - corrS[k][2]]), z20.r.fitted.n, 1, 1 / z20.r.fitted.n);
        const famJ2 = (x) => x.families.filter((q) => q.kind === 'zonal' && !q.labels.includes('(0,1)')), ampJ2 = (x) => Math.hypot(...famJ2(x).map((q) => q.amplitudeM));
        const ratioPlus = ampJ2(bS) / Math.max(1e-9, ampJ2(plus)), ratioMinus = ampJ2(bS) / Math.max(1e-9, ampJ2(minus));
        const e5 = z5.att.shares.zonal, cell = forward.before.shares.zonal;
        const agree = e5.se && cell.se ? Math.abs(e5.rmsM - cell.rmsM) <= 2 * (e5.se.rmsM + cell.se.rmsM) : null;
        v1 = { construction: 'Amendment 1: S = E20 - E5 of the fitted zonal-only arms', sRmsM: rms(S.map((p) => Math.hypot(...p))), before: slim(bS), after: slim(plus), afterMinus: slim(minus), j2PlusAmplitudeBeforeM: ampJ2(bS), j2PlusAmplitudeAfterM: ampJ2(plus), j2PlusAmplitudeAfterMinusM: ampJ2(minus), ratio: ratioPlus, ratioMinus, correctionRmsM: rms(corrS.map((p) => Math.hypot(...p))), z5: { fitted: { n: z5.r.fitted.n, e: z5.r.fitted.e }, m0: e5, zonalFamilies: z5.att.families.filter((q) => q.kind === 'zonal').slice(0, 6), forwardRmsM: rms(z5.rtn.map((p) => Math.hypot(...p))) }, z20: { fitted: { n: z20.r.fitted.n, e: z20.r.fitted.e }, m0: z20.att.shares.zonal, zonalFamilies: z20.att.families.filter((q) => q.kind === 'zonal').slice(0, 6), forwardRmsM: rms(z20.rtn.map((p) => Math.hypot(...p))) }, e5AgreesWithCell: agree, m0AfterBelowModuleM0: plus.shares.zonal.rmsM < cell.rmsM, validated: ratioPlus >= 3 && ratioMinus < 1 && bS.conditioned && plus.conditioned, conditioned: bS.conditioned && plus.conditioned && minus.conditioned };
      }
      // the cost, on the secondary e 0.001 cell of each regime (the table build and the application)
      let cost = null;
      if (it.arm === 'secondary' && it.e === 0.001) {
        const builds = []; for (let k = 0; k < 50; k += 1) { const t1 = performance.now(); responseTable(forceHarmonics(J, 6, c.L, aKm, iFit), nRad); builds.push(performance.now() - t1); }
        const builds31 = []; for (let k = 0; k < 50; k += 1) { const t1 = performance.now(); responseTable(forceHarmonics(J, 6, 31, aKm, iFit), nRad); builds31.push(performance.now() - t1); }
        const us = r.flown.map((s) => orbitAngles(s.slice(0, 3), s.slice(3)).u);
        const apply = (t, reps) => { const per = []; for (let q = 0; q < reps; q += 1) { const t1 = performance.now(); for (const u of us) displacement(t, u); per.push((performance.now() - t1) / us.length); } return median(per); };
        const tab31 = responseTable(forceHarmonics(J, 6, 31, aKm, iFit), nRad);
        const perEpochMs = apply(tab, 20), perEpochMs31 = apply(tab31, 20);
        const flight = (bm, pe) => bm + 65 * pe;
        cost = { L: c.L, terms: { L20: termCount(20), L31: termCount(31) }, storedFloats: { L20: 3 * 19, L31: 3 * 30 }, bytes: { L20: 4 * 3 * 19, L31: 4 * 3 * 30 }, buildMsMedian: median(builds), buildMs31Median: median(builds31), firstBuildMs: buildMs, perEpochMs, perEpochMs31, flight65Ms: flight(median(builds), perEpochMs), flight65Ms31: flight(median(builds31), perEpochMs31), epochsTimed: us.length, coldTargetMs: COLD_TARGET_MS, withinMs: WITHIN_MS, moduleTailBytes: MODULE_TAIL_BYTES };
        cost.within = cost.flight65Ms31 < WITHIN_MS && cost.bytes.L20 < MODULE_TAIL_BYTES;
      }
      const lnd = landed.find((x) => x.key === c.key && x.arm === it.arm);
      const row = { id: it.id, type: 'cell', ...c, ...stamp(), flown: true, fitted: r.fitted, A_m: A, bounds: b, iFitDeg: iFit * 180 / Math.PI, aFitKm: aKm, forward, inArc, constants, v1, cost, selfTest: selfTestResult, landed: lnd ? { createdUtc: lnd.createdUtc, sdnAp: lnd.sdnAp?.version ?? '0.6.3', forwardZonal: lnd.forward.shares.zonal, inArcZonal: lnd.inArc.shares.zonal, reproduction: { forwardZonalM: forward.before.shares.zonal.rmsM - lnd.forward.shares.zonal.rmsM, inArcZonalM: inArc.before.shares.zonal.rmsM - lnd.inArc.shares.zonal.rmsM } } : null, kernelSha256: r.kernelSha256, set: { sha256: sha256(set), bytes: set.length }, seconds: (Date.now() - t0) / 1000 };
      emit(row);
      const z = (x) => `${f(x.shares.zonal.rmsM)} [${f(x.shares.zonal.lo?.rmsM)}, ${f(x.shares.zonal.hi?.rmsM)}]`;
      console.log(it.id, `fwd zonal ${z(forward.before)} -> ${z(forward.after)} D ${f(forward.difference.rmsM)} [${f(forward.difference.lo)}, ${f(forward.difference.hi)}] floor ${forward.floorAfter}; in-arc ${z(inArc.before)} -> ${z(inArc.after)}; R0 ${f(constants.R0.point)} pred ${f(constants.R0predM)}; N0 ${f(constants.N0.point)} pred ${f(constants.N0predM)}`, v1 ? `V1 j>=2 ${f(v1.j2PlusAmplitudeBeforeM)} -> ${f(v1.j2PlusAmplitudeAfterM)} (x${f(v1.ratio, 1)}) ${v1.validated ? 'validated' : 'NOT validated'}` : '', cost ? `cost build ${f(cost.buildMs31Median, 3)} ms, ${f(cost.perEpochMs31 * 1000, 1)} us/epoch` : '', `${row.seconds.toFixed(0)} s`);
    } catch (error) {
      emit({ id: it.id, type: 'cell', ...c, ...stamp(), flown: false, error: String(error?.stack ?? error).slice(0, 600), seconds: (Date.now() - t0) / 1000 });
      console.log(it.id, 'ERROR', String(error?.message ?? error).slice(0, 300));
    }
  }
  await flyer.close?.();
  process.exit(0);
}

const readingOf = (leg) => {
  if (!leg) return 'unmeasured';
  if (!leg.conditioned) return 'withheld (estimator)';
  const d = leg.difference;
  if (d.lo == null) return 'no interval';
  const reduced = d.lo > 0, inside = leg.floorAfter === 'pass';
  return reduced ? (inside ? 'reduced; inside (floor)' : 'reduced; not inside') : d.hi < 0 ? 'worsened' : 'not reduced';
};
export function table(outDir = RESULTS) {
  const rows = readRows(RESULTS), byId = new Map(rows.map((r) => [r.id, r]));
  const regs = LOW.map((name) => REGIMES.find((r) => r.name === name));
  const cellOf = (id) => { const r = byId.get(id); if (!r) return { id, state: 'unmeasured' }; if (!r.flown) return { id, state: r.reason ?? 'error', error: r.error }; const fw = r.forward, ia = r.inArc; return { id, state: 'flown', regime: r.regime, e: r.e, arm: r.arm, L: r.L, fitted: { n: r.fitted.n, e: r.fitted.e }, A_m: r.A_m, bounds: r.bounds, reading: readingOf(fw), inArcReading: readingOf(ia), forward: { before: fw.before.shares.zonal, after: fw.after.shares.zonal, difference: fw.difference, floorBefore: fw.floorBefore, floorAfter: fw.floorAfter, aScaledBefore: fw.aScaledBefore, aScaledAfter: fw.aScaledAfter, residual: fw.residual, j1AmplitudeM: fw.j1AmplitudeM, leakage: fw.leakage, zonalFamiliesBefore: fw.before.zonalFamilies, zonalFamiliesAfter: fw.after.zonalFamilies, correctionRmsM: fw.correctionRmsM, rawRmsBeforeM: fw.rawRmsBeforeM, rawRmsAfterM: fw.rawRmsAfterM, conditioned: fw.conditioned }, inArc: { before: ia.before.shares.zonal, after: ia.after.shares.zonal, difference: ia.difference, floorAfter: ia.floorAfter, leakage: ia.leakage, residual: ia.residual, conditioned: ia.conditioned }, constants: r.constants, v1: r.v1 ? { validated: r.v1.validated, sRmsM: r.v1.sRmsM, j2PlusBeforeM: r.v1.j2PlusAmplitudeBeforeM, j2PlusAfterM: r.v1.j2PlusAmplitudeAfterM, j2PlusAfterMinusM: r.v1.j2PlusAmplitudeAfterMinusM, ratio: r.v1.ratio, ratioMinus: r.v1.ratioMinus, correctionRmsM: r.v1.correctionRmsM, m0BeforeM: r.v1.before.shares.zonal.rmsM, m0AfterM: r.v1.after.shares.zonal.rmsM, e5: r.v1.z5.m0, e20: r.v1.z20.m0, e5Families: r.v1.z5.zonalFamilies, e5AgreesWithCell: r.v1.e5AgreesWithCell, z5Fitted: r.v1.z5.fitted, z20Fitted: r.v1.z20.fitted, conditioned: r.v1.conditioned } : null, landed: r.landed, selfTest: r.selfTest, seconds: r.seconds }; };
  const regimes = regs.map((reg) => {
    const sec = cellOf(`cell:secondary:${reg.name}|0.001`), pri = cellOf(`cell:primary:${reg.name}|0.001`), grid = E_GRID.map((e) => cellOf(`cell:secondary:${reg.name}|${e}`));
    const cr = byId.get(`cell:secondary:${reg.name}|0.001`)?.cost ?? null;
    return { regime: reg.name, n: reg.n, i: reg.i, secondary: sec, primary: pri, grid, cost: cr ? { state: 'measured', ...cr } : { state: 'unmeasured' } };
  });
  const counted = regimes.filter((r) => r.secondary.state === 'flown' && r.secondary.v1?.validated && r.secondary.reading !== 'withheld (estimator)');
  const notCounted = regimes.filter((r) => !counted.includes(r)).map((r) => `${r.regime}: ${r.secondary.state !== 'flown' ? r.secondary.state : r.secondary.v1 ? (r.secondary.v1.validated ? r.secondary.reading : 'V1 not validated') : 'no V1'}`);
  const reduced = counted.filter((r) => /^reduced/.test(r.secondary.reading)).map((r) => r.regime);
  const inside = counted.filter((r) => r.secondary.reading === 'reduced; inside (floor)').map((r) => r.regime);
  const costs = regimes.filter((r) => r.cost.state === 'measured'), costWithin = costs.length === regimes.length && costs.every((r) => r.cost.within);
  let verdict;
  if (!counted.length) verdict = 'undecided (no counted cell)';
  else if (reduced.length === counted.length && inside.length === counted.length && costWithin) verdict = 'a module record is warranted';
  else if (reduced.length * 2 >= counted.length) verdict = 'the finding stands, residual named';
  else verdict = 'the gap is not first-order zonal short-period';
  const residuals = counted.filter((r) => /^reduced; not inside/.test(r.secondary.reading)).map((r) => `${r.regime}: ${r.secondary.forward.residual ? `${r.secondary.forward.residual.label} ${f(r.secondary.forward.residual.amplitudeM)} m (${r.secondary.forward.residual.j1Member ? 'the j = 1 member, outside this record\'s terms' : 'a j >= 2 member'})` : '-'}; after ${f(r.secondary.forward.after.rmsM)} m [${f(r.secondary.forward.after.lo?.rmsM)}, ${f(r.secondary.forward.after.hi?.rmsM)}]`);
  const moduleRecord = {
    title: 'propagator/sdn-ap: first-order zonal short-period terms J6 to J_MAXIMUM_DEGREE (m = 0, j >= 2) at the output step, small-e form in the argument of latitude',
    terms: 'ZONAL-SHORT-PERIOD.md items 1 and 2: per object one table of 3 (L - 1) floats (the forced Hill response per harmonic j = 2..L of the summed J6..J_L force harmonics at the mean a, i, n), rebuilt when the mean i or a moves; applied to the osculating output position in RTN; the j = 0 and j = 1 members stay in the rates as today',
    eGte005Questions: ['the q = +-1 and +-2 sidebands (Kaula G_lpq, |q| <= 2) at e >= 0.05: the (0, j) members at j n +- q n and their identity with the narrow set\'s q in {-1, 0, 1} selection of the tesseral table (double counting at m = 0 must be excluded by construction)', 'the e-linearization of G about the epoch e (as the module\'s sp_g does for the tesseral table) against the exact Hansen coefficient for the zonal members at e 0.05 to 0.3', 'the j = 1 member at e >= 0.05: the once-per-revolution odd-l term is no longer the small-eccentricity-vector response; whether the odd-l long-period rates (w = +-1) still carry it or a short-period (l, 0, p, q = 0, j = 1) output term is needed', 'the wide-e class above kWideE 0.3: whether the zonal members enter the existing grid (every (l, 0, p, q) term) or stay in this table', 'the radial bias at fixed mean motion (item 3, R0_pred against the measured R0): whether the mean-to-osculating semi-major axis should carry the even-l constant term when the output table is added'],
  };
  const summary = { rows: rows.length, flown: rows.filter((r) => r.flown).length, errors: rows.filter((r) => !r.flown && r.error).map((r) => `${r.id}: ${r.error.split('\n')[0]}`), unmeasured: cells().filter((c) => !byId.has(c.id)).map((c) => c.id), counted: counted.map((r) => r.regime), notCounted, reduced, inside, residuals, costWithin, verdict, v1: regimes.map((r) => `${r.regime}: ${r.secondary.v1 ? `${r.secondary.v1.validated ? 'validated' : 'NOT validated'} (S j >= 2 amplitude ${f(r.secondary.v1.j2PlusBeforeM)} -> ${f(r.secondary.v1.j2PlusAfterM)} m with +Delta, x${f(r.secondary.v1.ratio, 1)}; -Delta x${f(r.secondary.v1.ratioMinus, 2)}; E5 m = 0 ${f(r.secondary.v1.e5.rmsM)} m [${f(r.secondary.v1.e5.lo?.rmsM)}, ${f(r.secondary.v1.e5.hi?.rmsM)}] against the cell's ${f(r.secondary.forward.before.rmsM)}: ${r.secondary.v1.e5AgreesWithCell == null ? 'no interval' : r.secondary.v1.e5AgreesWithCell ? 'agree' : 'differ'})` : '-'}`), e5BelowJ6: regimes.filter((r) => r.secondary.v1?.e5AgreesWithCell).map((r) => r.regime), selfTest: rows.find((r) => r.selfTest)?.selfTest ?? null, moduleRecord: verdict === 'a module record is warranted' ? moduleRecord : { stated: 'not warranted on this verdict; the title, terms and e >= 0.05 questions are listed for the coordinator in case the finding is reconsidered', ...moduleRecord } };
  const out = { registration: REGISTRATION, pins: PIN, egm: EGM, floors: FLOORS, summary, regimes };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(out, null, 1)}\n`);
  const ivs = (x) => (x ? (x.lo != null ? `${f(x.rmsM ?? x.point)} [${f(x.lo?.rmsM ?? x.lo)}, ${f(x.hi?.rmsM ?? x.hi)}]` : `${f(x.rmsM ?? x.point)} [no interval]`) : '-');
  const line = (c) => (c.state !== 'flown' ? `| ${c.id} | ${c.state}${c.error ? `: ${c.error.split('\n')[0].slice(0, 120)}` : ''} | | | | | | | | | | |` : `| ${c.regime} ${c.arm} e ${c.e} (L ${c.L}) | ${ivs(c.forward.before)} | ${ivs(c.forward.after)} | ${ivs(c.forward.difference)} | ${c.reading} | ${c.forward.floorBefore} -> ${c.forward.floorAfter} (A-scaled ${c.forward.aScaledBefore} -> ${c.forward.aScaledAfter}; b_rms ${f(c.bounds.rms)}) | ${c.forward.residual ? `${c.forward.residual.label} ${f(c.forward.residual.amplitudeM)}` : '-'} | ${f(c.forward.j1AmplitudeM.before)} / ${f(c.forward.j1AmplitudeM.after)} | ${ivs(c.inArc.before)} -> ${ivs(c.inArc.after)} (${c.inArcReading}) | tess ${f(c.forward.leakage.tesseral.beforeM)} -> ${f(c.forward.leakage.tesseral.afterM)}${c.forward.leakage.tesseral.moved ? ' MOVED' : ''}; sec ${f(c.forward.leakage.secular.beforeM)} -> ${f(c.forward.leakage.secular.afterM)}${c.forward.leakage.secular.moved ? ' MOVED' : ''} | ${c.landed ? `${f(c.landed.forwardZonal.rmsM)} (${f(c.landed.reproduction.forwardZonalM)})` : '-'} | ${f(c.forward.correctionRmsM)} |`);
  const head = ['| Cell | m = 0 forward before (m) | after | before - after | Reading | Floor three-way before -> after | Residual family after | (0,1) before / after | In-arc before -> after | Leakage (tesseral; secular) | Landed 0.6.3 (reproduction) | Correction RMS (m) |', '| --- | --: | --: | --: | --- | --- | --- | --: | --- | --- | --: | --: |'];
  const md = [`# AP zonal short-period terms above J5: the harness prototype against the independent reference`, '',
    `Registration: ${REGISTRATION}. Pins: modules ${PIN.modulesCommit.slice(0, 9)}; sdn-ap ${PIN.sdnAp.version} signed bundle ${PIN.sdnAp.bundleSha256.slice(0, 12)}, canonical ${PIN.sdnAp.canonicalSha256.slice(0, 12)}; ffm ${PIN.ffm.version} ${PIN.ffm.wasmSha256.slice(0, 12)}; EGM96 zonals from ${EGM.file} ${EGM.sha256.slice(0, 12)}. Shares are the all-regimes m = 0 share (RMS over the window, m) with [lower, upper] by the delete-one-block jackknife; the difference's interval is +-2 sqrt(SE_before^2 + SE_after^2). Floors: RMS ${FLOORS.rms} m, maximum ${FLOORS.max} m. Rows ${summary.rows}, flown ${summary.flown}${summary.errors.length ? `; errors: ${summary.errors.join('; ')}` : ''}${summary.unmeasured.length ? `; unmeasured: ${summary.unmeasured.join(', ')}` : ''}. Self-test of the Hill response (item 2): ${summary.selfTest ? `${summary.selfTest.pass ? 'pass' : 'FAIL'} (${summary.selfTest.maxErrorM.toExponential(2)} m against an amplitude of ${f(summary.selfTest.amplitudeM)} m)` : '-'}.`, '',
    `## Verdict`, `- ${summary.verdict}.`, `- Counted cells (e 0.001 secondary, V1 validated): ${summary.counted.join(', ') || 'none'}${summary.notCounted.length ? `; not counted: ${summary.notCounted.join('; ')}` : ''}.`, `- Reduced: ${summary.reduced.join(', ') || 'none'}. Inside the floors after the prototype: ${summary.inside.join(', ') || 'none'}. Cost within: ${summary.costWithin ? 'yes' : 'no'}.`, `- Residuals named: ${summary.residuals.join('; ') || 'none'}.`, `- V1 (S = E20 - E5, the J6-J20 zonal short-period content the module lacks, before and after the prototype; E5 the module's m = 0 error with nothing above J5): ${summary.v1.join('; ')}.`, `- E5 agrees with the cell's m = 0 share (the gap is below J6) in: ${summary.e5BelowJ6.join(', ') || 'none'}.`, '',
    `## The cells`, ...head, ...regimes.flatMap((r) => [line(r.secondary), line(r.primary), ...r.grid.map(line)]), '',
    `## The constant members (item 3; forward day; module minus reference; m)`, `| Cell | R0 predicted | R0 measured | inside interval | N0 predicted | N0 measured | inside interval | T1 (m/day) |`, `| --- | --: | --: | --- | --: | --: | --- | --: |`,
    ...regimes.flatMap((r) => [r.secondary, r.primary, ...r.grid].filter((c) => c.state === 'flown').map((c) => `| ${c.regime} ${c.arm} e ${c.e} | ${f(c.constants.R0predM)} | ${ivs(c.constants.R0)} | ${c.constants.R0insideInterval == null ? 'no interval' : c.constants.R0insideInterval ? 'yes' : 'no'} | ${f(c.constants.N0predM)} | ${ivs(c.constants.N0)} | ${c.constants.N0insideInterval == null ? 'no interval' : c.constants.N0insideInterval ? 'yes' : 'no'} | ${ivs(c.constants.T1)} |`)), '',
    `## V1 per regime (Amendment 1: S = E20 - E5 of the fitted zonal-only arms, forward day; E5 is the module's m = 0 error with nothing above J5 in play)`, `| Regime | S RMS (m) | S j >= 2 zonal amplitude: before -> +Delta / -Delta (m) | ratio +Delta / -Delta | Prototype RMS (m) | E5 m = 0 share | E20 m = 0 share | Cell m = 0 share | E5 agrees with the cell | E5 zonal families | validated |`, `| --- | --: | --- | --- | --: | --: | --: | --: | --- | --- | --- |`,
    ...regimes.map((r) => (r.secondary.v1 ? `| ${r.regime} | ${f(r.secondary.v1.sRmsM)} | ${f(r.secondary.v1.j2PlusBeforeM)} -> ${f(r.secondary.v1.j2PlusAfterM)} / ${f(r.secondary.v1.j2PlusAfterMinusM)} | ${f(r.secondary.v1.ratio, 2)} / ${f(r.secondary.v1.ratioMinus, 2)} | ${f(r.secondary.v1.correctionRmsM)} | ${ivs(r.secondary.v1.e5)} | ${ivs(r.secondary.v1.e20)} | ${ivs(r.secondary.forward.before)} | ${r.secondary.v1.e5AgreesWithCell == null ? 'no interval' : r.secondary.v1.e5AgreesWithCell ? 'yes' : 'no'} | ${r.secondary.v1.e5Families.map((q) => `${q.labels.join('/')} ${f(q.amplitudeM)}`).join('; ')} | ${r.secondary.v1.validated ? 'yes' : 'NO'} |` : `| ${r.regime} | ${r.secondary.state} | | | | | | | | | |`)), '',
    `## The cost (per object, measured in this harness; upper bounds for a compiled implementation)`, `| Regime | Terms summed (L 20 / 31) | Stored floats (L 20 / 31) | Bytes (L 20 / 31) | Table build L 20 / 31 (ms, median of 50) | Per epoch L 20 / 31 (us) | Flight of 65 epochs L 31 (ms) | Within (below ${WITHIN_MS} ms and ${MODULE_TAIL_BYTES} bytes at L 20) |`, `| --- | --: | --: | --: | --: | --: | --: | --- |`,
    ...regimes.map((r) => (r.cost.state === 'measured' ? `| ${r.regime} | ${r.cost.terms.L20} / ${r.cost.terms.L31} | ${r.cost.storedFloats.L20} / ${r.cost.storedFloats.L31} | ${r.cost.bytes.L20} / ${r.cost.bytes.L31} | ${f(r.cost.buildMsMedian, 3)} / ${f(r.cost.buildMs31Median, 3)} | ${f(r.cost.perEpochMs * 1000, 2)} / ${f(r.cost.perEpochMs31 * 1000, 2)} | ${f(r.cost.flight65Ms31, 3)} | ${r.cost.within ? 'within' : 'OVER'} |` : `| ${r.regime} | ${r.cost.state} | | | | | | |`)), '',
    `## For the coordinator: the module record${summary.verdict === 'a module record is warranted' ? '' : ' (not warranted on this verdict; stated in case the finding is reconsidered)'}`, `- Title: ${moduleRecord.title}`, `- Terms: ${moduleRecord.terms}`, `- The e >= 0.05 non-resonant identity questions:`, ...moduleRecord.eGte005Questions.map((q) => `  - ${q}`), ''].join('\n');
  fs.writeFileSync(path.join(outDir, 'README.md'), md);
  return out;
}
if (args.table) { const t = table(args.out ?? RESULTS); console.log(JSON.stringify(t.summary, null, 1)); process.exit(0); }

if (args.check) {
  let failures = 0;
  const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
  const git = (...a) => execFileSync('git', ['-C', REPO, ...a]).toString('utf8').trim();
  const rows = readRows(RESULTS);
  const regSha = git('log', '--reverse', '--format=%H', '--', REGISTRATION).split('\n')[0];
  const regAt = Date.parse(git('show', '-s', '--format=%cI', regSha));
  const first = rows.map((r) => r.createdUtc).sort()[0];
  check(rows.length > 0 && regAt < Date.parse(first), `registration ${regSha.slice(0, 8)} (${git('show', '-s', '--format=%cI', regSha)}) precedes the first of ${rows.length} rows (${first})`);
  const am1At = Date.parse(git('show', '-s', '--format=%cI', AMENDMENT1));
  check(rows.length > 0 && am1At < Date.parse(first) && fs.existsSync(path.join(RESULTS, 'first-pass/rows-0.jsonl')), `Amendment 1 ${AMENDMENT1.slice(0, 8)} (${git('show', '-s', '--format=%cI', AMENDMENT1)}) precedes the first row of the table; the first-pass row stays in first-pass/`);
  check(rows.every((r) => r.sdnAp?.bundleSha256 === PIN.sdnAp.bundleSha256 && r.sdnAp?.canonicalSha256 === PIN.sdnAp.canonicalSha256 && r.ffm?.wasmSha256 === PIN.ffm.wasmSha256 && r.modulesCommit === PIN.modulesCommit), `every row on sdn-ap ${PIN.sdnAp.version} (bundle ${PIN.sdnAp.bundleSha256.slice(0, 12)}, canonical ${PIN.sdnAp.canonicalSha256.slice(0, 12)}), ffm ${PIN.ffm.version} (${PIN.ffm.wasmSha256.slice(0, 12)}), modules ${PIN.modulesCommit.slice(0, 9)}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zonal-short-period-'));
  const t = table(tmp);
  check(['table.json', 'README.md'].every((n) => fs.existsSync(path.join(RESULTS, n)) && fs.readFileSync(path.join(tmp, n)).equals(fs.readFileSync(path.join(RESULTS, n)))), `results/ap-truth/zonal-short-period/table.json and README.md reproduce from the rows`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const all = t.regimes.flatMap((r) => [r.secondary, r.primary, ...r.grid]);
  const flown = all.filter((c) => c.state === 'flown'), legOk = (l) => l && 'rmsM' in l.before && 'rmsM' in l.after && ('lo' in l.before) && l.difference && 'rmsM' in l.difference;
  check(all.every((c) => c.state !== 'unmeasured') && flown.every((c) => legOk(c.forward) && legOk(c.inArc) && c.reading && c.constants), `every registered cell (${all.length}; ${flown.length} flown, ${all.filter((c) => c.state === 'below the perigee floor').length} below the perigee floor, ${all.filter((c) => c.state === 'error').length} errors) carries a row with both legs' m = 0 share before and after, intervals or no interval, a reading and the constant members`);
  check(t.regimes.every((r) => r.secondary.state !== 'flown' || r.secondary.v1), `every flown e 0.001 secondary cell carries V1 (${t.summary.v1.filter((x) => /validated \(/.test(x)).length} validated of ${t.regimes.filter((r) => r.secondary.state === 'flown').length})`);
  check(t.regimes.every((r) => r.cost.state === 'measured' && Number.isFinite(r.cost.flight65Ms31)), `every regime carries its cost line (within: ${t.summary.costWithin})`);
  check(['a module record is warranted', 'the finding stands, residual named', 'the gap is not first-order zonal short-period'].includes(t.summary.verdict), `verdict: ${t.summary.verdict} (reduced ${t.summary.reduced.length}, inside ${t.summary.inside.length} of ${t.summary.counted.length} counted)`);
  check(t.summary.selfTest?.pass === true, `the Hill-response self-test passes (${t.summary.selfTest ? t.summary.selfTest.maxErrorM.toExponential(2) : '-'} m against ${f(t.summary.selfTest?.amplitudeM)} m)`);
  console.log(failures ? `FAIL (${failures})` : 'PASS');
  process.exit(failures ? 1 : 0);
}
