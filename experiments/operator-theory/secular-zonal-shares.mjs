// SECULAR-ZONAL-SHARES.md: the J21-J31 zonal tail against AP's own zonal and secular theory, on the landed all-regimes rows (primary 31x31
// vs 31/20; secondary 20x20 both sides) with the secondary arm flown on the e grid, both e 0.001 arms re-flown for the rate items, a tail
// arm (31x31 vs caps 31/31, a $OCM cap) and the tail's cost per flight. Report only.
//   SDN_MODULES_ROOT=<root> SDN_AP_HEO_CACHE=<scratch> node secular-zonal-shares.mjs --run [--shard k/n] [--phase 1-4]
//   node secular-zonal-shares.mjs --table      node secular-zonal-shares.mjs --check
// Every state comes from a module (propagator/sdn-ap and propagator/ffm through propagator/sdn-ap/test/lib/heo-model-truth.mjs); this file
// moves bytes and does arithmetic (least squares, RMS, medians, the two-body conversion of a state vector to osculating elements).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(HERE, '../..');
const RESULTS = path.join(REPO, 'results/ap-truth/secular-zonal-shares');
const LANDED = path.join(REPO, 'results/ap-truth/tesseral-all-regimes');
const REGISTRATION = 'experiments/operator-theory/SECULAR-ZONAL-SHARES.md';
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const RUNNER = sha256(fs.readFileSync(new URL(import.meta.url)));
// The all-regimes registered code, imported with an empty argument list so none of its own branches runs.
const argvSave = process.argv; process.argv = process.argv.slice(0, 2);
const AR = await import(pathToFileURL(path.join(HERE, 'tesseral-all-regimes.mjs')).href);
process.argv = argvSave;
const { PIN, ARMS, REGIMES, attribute, verdictOf, bounds, rtnOf, gridSeconds, arcDays } = AR;
export { PIN };
const TAIL_ARM = { field: [31, 31], caps: [31, 31], dir: 'tail' };
const EGM = { file: 'propagator/ffm/lib/egm96_data.h', sha256: '4d5c80b3d673696affffe9d2d17df94ecca730b1f61e0483b1bb9d6606e6a6f4' };
const RE_KM = 6378.135, MU = 398600.4418, DAY = 86400000, PERIGEE_FLOOR_KM = 200, COLD_TARGET_MS = 100;
const TERMS = { narrow: 17, wide: 297, bytesNarrow: 17 * 16, bytesWide: 297 * 16, source: 'src/tesseral.inc 533-536 (zonal_count: even l one term, odd l two; wide l + 1), src/xp_theory.inc 1494 (4 floats per term)' };
const E_GRID = [[2, 0.01], [3, 0.1], [4, 0.05], [4, 0.2]];
const semimajorKm = (n) => Math.cbrt(MU / ((n * 2 * Math.PI / 86400) ** 2));
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const median = (v) => { const s = [...v].sort((a, b) => a - b); const k = s.length >> 1; return s.length ? (s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2) : NaN; };
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const roughness = (series) => { const d2 = []; for (let k = 1; k + 1 < series.length; k += 1) d2.push(Math.hypot(...[0, 1, 2].map((ax) => series[k + 1][ax] - 2 * series[k][ax] + series[k - 1][ax]))); return median(d2); };
const readRows = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((x) => /^rows-\d+\.jsonl$/.test(x)).sort().flatMap((x) => fs.readFileSync(path.join(dir, x), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const landedRows = () => [...readRows(LANDED).map((r) => ({ ...r, arm: 'primary' })), ...readRows(path.join(LANDED, ARMS.secondary.dir)).map((r) => ({ ...r, arm: 'secondary' }))].filter((r) => r.flown);

/** A least-squares line y = c0 + c1 t and the delete-one-block jackknife of both coefficients (Amendment 6's form; +-2 SE; no interval below 3 blocks). */
function lineFit(t, y) {
  const fit = (idx) => { let n = 0, st = 0, sy = 0, stt = 0, sty = 0; for (const k of idx) { n += 1; st += t[k]; sy += y[k]; stt += t[k] * t[k]; sty += t[k] * y[k]; } const d = n * stt - st * st; const c1 = (n * sty - st * sy) / d; return [(sy - c1 * st) / n, c1]; };
  return (blockIds) => {
    const all = t.map((_, k) => k), [c0, c1] = fit(all);
    const blocks = [...new Set(blockIds)], K = blocks.length;
    if (K < 3) return { c0, c1, se: null, K };
    const reps = blocks.map((b) => fit(all.filter((k) => blockIds[k] !== b)));
    const se = (j) => { const v = reps.map((r) => r[j]), m = v.reduce((a, b) => a + b, 0) / K; return Math.sqrt(((K - 1) / K) * v.reduce((a, b) => a + (b - m) ** 2, 0)); };
    return { c0, c1, se: [se(0), se(1)], K };
  };
}
const iv = (x, se) => (se == null ? { point: x, lo: null, hi: null, se: null } : { point: x, lo: x - 2 * se, hi: x + 2 * se, se });
/** Osculating elements of a GCRF state (km, km/s): Omega, u = omega + M (rad), i, e, a. Arithmetic on a state; it produces no state. */
function elementsOf(r, v) {
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2], norm = (a) => Math.hypot(...a);
  const h = cross(r, v), hn = norm(h), rn = norm(r), vn = norm(v), rv = dot(r, v);
  const nodeV = [-h[1], h[0], 0], nn = norm(nodeV);
  const ev = [0, 1, 2].map((k) => ((vn * vn - MU / rn) * r[k] - rv * v[k]) / MU), e = norm(ev);
  const inc = Math.acos(h[2] / hn), Omega = Math.atan2(nodeV[1], nodeV[0]);
  // true argument of latitude from the node, then u = omega + M = uTrue - (nu - M)
  let uTrue = Math.acos(Math.max(-1, Math.min(1, dot(nodeV, r) / (nn * rn)))); if (r[2] < 0) uTrue = 2 * Math.PI - uTrue;
  let nu = Math.acos(Math.max(-1, Math.min(1, dot(ev, r) / (e * rn)))); if (rv < 0) nu = 2 * Math.PI - nu;
  const E = 2 * Math.atan(Math.sqrt((1 - e) / (1 + e)) * Math.tan(nu / 2)), M = E - e * Math.sin(E);
  const wrap = (x) => Math.atan2(Math.sin(x), Math.cos(x));
  return { Omega, u: uTrue - wrap(nu - M), i: inc, e, a: 1 / (2 / rn - vn * vn / MU) };
}
/** Item 4 of the registration: the term scales in m/day at the fitted n, e, i (arithmetic; no state). */
function termScales(nRevDay, e, iDeg, J) {
  const nRad = 2 * Math.PI * nRevDay, a = semimajorKm(nRevDay), p = a * (1 - e * e), eta = Math.sqrt(1 - e * e), si = Math.sin(iDeg * Math.PI / 180), ci = Math.cos(iDeg * Math.PI / 180);
  const k2 = 1.5 * J[2] * (RE_KM / p) ** 2, aM = a * 1000;
  const out = { aKm: a, nRadPerDay: nRad, k2, j2: { OmegaDot: -k2 * nRad * ci, omegaDot: k2 * nRad * (2 - 2.5 * si * si), MDotMinusN: k2 * nRad * eta * (1 - 1.5 * si * si) }, j2SquaredScale: nRad * k2 * k2, j4Scale: (15 / 32) * nRad * Math.abs(J[4]) * (RE_KM / p) ** 4 };
  out.j2.lambdaDot = out.j2.OmegaDot + out.j2.omegaDot + out.j2.MDotMinusN;
  let sec = 0, lp = 0; for (let l = 21; l <= 31; l += 1) { if (!Number.isFinite(J[l])) { sec = NaN; lp = NaN; break; } const s = nRad * Math.abs(J[l]) * (RE_KM / a) ** l; if (l % 2 === 0) sec += s; else lp += s * e; }
  out.tailSecularScale = sec; out.tailLongPeriodScale = lp;
  const mPerDay = (x) => x * aM;
  out.mPerDay = { j2LambdaDot: mPerDay(out.j2.lambdaDot), j2SquaredScale: mPerDay(out.j2SquaredScale), j4Scale: mPerDay(out.j4Scale), tailSecularScale: mPerDay(sec), tailLongPeriodScale: mPerDay(lp) };
  return out;
}
function readJ(MOD) {
  const file = path.join(MOD, EGM.file), bytes = fs.readFileSync(file);
  if (sha256(bytes) !== EGM.sha256) throw new Error(`${file} is not the pinned egm96_data.h`);
  const J = {};
  for (const m of bytes.toString('utf8').matchAll(/\{\s*(\d+),\s*(\d+),\s*([-+0-9.eE]+),\s*([-+0-9.eE]+)\s*\}/g)) { const l = Number(m[1]); if (Number(m[2]) === 0 && l >= 2 && l <= 31) J[l] = -Math.sqrt(2 * l + 1) * Number(m[3]); }
  return J;
}
const slim = (x) => ({ rmsM: x.rmsM, maxM: x.maxM, roughM: x.roughM, conditioned: x.conditioned, maxJResolved: x.basis.maxJResolved, jackknife: x.jackknife, shares: x.shares, families: x.families.slice(0, 8) });

if (args.run) {
  const MOD = process.env.SDN_MODULES_ROOT;
  if (!MOD) throw new Error('SDN_MODULES_ROOT names the modules root');
  if (!process.env.SDN_AP_HEO_CACHE) throw new Error('SDN_AP_HEO_CACHE names this lane\'s own cache');
  const apWasm = path.join(MOD, 'propagator/sdn-ap/dist/isomorphic/module.wasm'), ffmWasm = path.join(MOD, 'propagator/ffm/dist/isomorphic/module.wasm');
  if (sha256(fs.readFileSync(apWasm)) !== PIN.sdnAp.wasmSha256) throw new Error(`${apWasm} is not sdn-ap ${PIN.sdnAp.version}`);
  if (sha256(fs.readFileSync(ffmWasm)) !== PIN.ffm.wasmSha256) throw new Error(`${ffmWasm} is not ffm ${PIN.ffm.version}`);
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
  const stamp = () => ({ createdUtc: new Date().toISOString(), runner: RUNNER, modulesCommit: PIN.modulesCommit, sdnAp: PIN.sdnAp, ffm: PIN.ffm, shard: SHARD });
  const emit = (row) => fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  const iso = (ms) => new Date(ms).toISOString().replace('Z', '');
  const flyer = await createStandaloneHarness('browser', apWasm, { surface: 'command' });
  const flyRaw = async (set, epochs) => { const r = await flyer.invoke({ methodId: 'propagate', inputs: O.flight([set], { output: { EPOCHS: epochs, FRAME: pcfOutputFrame.GCRF } }) }); if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${r.errorMessage}`); return Buffer.from(r.outputs.find((o) => o.portId === 'ephemeris').payload); };
  const fly = async (set, epochs) => OEM.getRootAsOEM(new fb.ByteBuffer(await flyRaw(set, epochs))).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.map((l) => [l.X, l.Y, l.Z]);
  const landed = landedRows();
  // One cell in the all-regimes frame and code; `rates` adds the registration's items 1 to 4 on the forward day.
  const flyCell = async (reg, e, arm, rates) => {
    const c = { key: `${reg.name}|${e}`, regime: reg.name, n: reg.n, i: reg.i, raan: reg.raan, argp: reg.argp, e, perigeeKm: semimajorKm(reg.n) * (1 - e) - RE_KM, arcDays: arcDays(reg.n) };
    if (c.perigeeKm < PERIGEE_FLOOR_KM) return { ...c, flown: false, reason: 'below the perigee floor' };
    const gridMinutes = gridSeconds(c.n) / 60;
    const fixture = { name: c.key, n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: 0, drag: false, thirdBody: true, field: arm.field, forces: arm.caps, fitDays: c.arcDays, hourly: true, gridMinutes, forecastDays: 1, referenceTolerance: 1e-12, referenceMaxStep: 300, modulePath: apWasm };
    const r = await runModelTruth(fixture);
    const set = Buffer.from(r.omm, 'base64');
    const profile = r.profile, tau = profile.map((p) => p.h / 24), rtn = profile.map((p) => [p.r, p.t, p.n]), err3 = profile.map((p) => p.e);
    const epochs = r.referenceStates.map((_, k) => iso(Date.parse(`${r.epoch}Z`) + Math.round((c.arcDays + (k + 1) * gridMinutes / 1440) * DAY)));
    const withCaps = r.flown.map((s) => s.slice(0, 3));
    const zonalOnly = await fly(O.repackOcm(set, (t) => { t.PERTURBATIONS.MAXIMUM_TESSERAL_DEGREE = 0; }), epochs);
    const A = rms(withCaps.map((p, k) => Math.hypot(...p.map((x, ax) => (x - zonalOnly[k][ax]) * 1000))));
    const b = bounds(A);
    const forward = { samples: profile.length, gridSeconds: gridSeconds(c.n), rmsM: rms(err3), maxM: Math.max(...err3), roughM: roughness(rtn), ...attribute(tau, rtn, r.fitted.n, 1, 1 / r.fitted.n) };
    const arcOem = OEM.getRootAsOEM(new fb.ByteBuffer((await runModelTruth({ ...fixture, fitInput: true })).ephemeris.payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
    const arcFlown = await fly(set, arcOem.map((l) => l.EPOCH));
    const arcRtn = arcOem.map((l, k) => rtnOf([arcFlown[k][0] - l.X, arcFlown[k][1] - l.Y, arcFlown[k][2] - l.Z], [l.X, l.Y, l.Z], [l.X_DOT, l.Y_DOT, l.Z_DOT]));
    const arcTau = arcOem.map((l) => (Date.parse(`${l.EPOCH}Z`) - Date.parse(`${arcOem[0].EPOCH}Z`)) / DAY);
    const arcNorm = arcRtn.map((p) => Math.hypot(...p));
    const inArc = { samples: arcRtn.length, rmsM: rms(arcNorm), maxM: Math.max(...arcNorm), fitRmsKm: r.fitted.wrms, ...attribute(arcTau, arcRtn, r.fitted.n, c.arcDays, 1) };
    const row = { ...c, arm: arm.name, field: arm.field, caps: arm.caps, flown: true, fitted: r.fitted, A_m: A, bounds: b, forward: slim(forward), inArc: slim(inArc), ...verdictOf(forward, inArc, b), convergenceMaxM: undefined, kernelSha256: r.kernelSha256, set: { sha256: sha256(set), bytes: set.length } };
    if (rates) {
      // 1. the trend line per RTN axis, delete-one-revolution jackknife
      const blockIds = tau.map((t) => Math.floor(t * r.fitted.n));
      const lines = [0, 1, 2].map((ax) => lineFit(tau, rtn.map((q) => q[ax]))(blockIds));
      const K = lines[0].K;
      const trend = { revolutions: K, R0: iv(lines[0].c0, lines[0].se?.[0]), R1: iv(lines[0].c1, lines[0].se?.[1]), T0: iv(lines[1].c0, lines[1].se?.[0]), T1: iv(lines[1].c1, lines[1].se?.[1]), N0: iv(lines[2].c0, lines[2].se?.[0]), N1: iv(lines[2].c1, lines[2].se?.[1]), unit: 'm, m/day' };
      // 2. fit absorption: T_a = -(3/2) n_rad R0; T_r = T1 - T_a
      const nRad = 2 * Math.PI * r.fitted.n, aKm = semimajorKm(r.fitted.n);
      const Ta = -1.5 * nRad * trend.R0.point, Tr = trend.T1.point - Ta;
      const seTr = lines[1].se ? Math.hypot(lines[1].se[1], 1.5 * nRad * lines[0].se[0]) : null;
      const absorption = { Ta_mPerDay: Ta, Tr: iv(Tr, seTr), reading: seTr == null ? 'no interval' : Math.abs(Tr) <= 2 * seTr ? 'fit absorption (semi-major axis)' : `secular rate mismatch of ${f(Tr, 2)} m/day` };
      // 3. element rate differences, module minus reference, over the forward day
      const els = r.referenceStates.map((s, k) => { const R = elementsOf(s.position, s.velocity), Mq = elementsOf(r.flown[k].slice(0, 3), r.flown[k].slice(3)); const w = (x) => Math.atan2(Math.sin(x), Math.cos(x)); return { dO: w(Mq.Omega - R.Omega), du: w(Mq.u - R.u), iRef: R.i, aRef: R.a }; });
      const tauR = r.referenceStates.map((_, k) => (k + 1) * gridMinutes / 1440);
      const bl = tauR.map((t) => Math.floor(t * r.fitted.n));
      const lO = lineFit(tauR, els.map((x) => x.dO))(bl), lu = lineFit(tauR, els.map((x) => x.du))(bl);
      const si = Math.sin(els.reduce((s, x) => s + x.iRef, 0) / els.length), aM = aKm * 1000;
      const seL = lO.se && lu.se ? Math.hypot(lO.se[1], lu.se[1]) : null;
      const ratesOut = { dOmegaDot: { radPerDay: iv(lO.c1, lO.se?.[1]), mPerDay: iv(lO.c1 * aM * si, lO.se ? lO.se[1] * aM * si : null) }, duDot: { radPerDay: iv(lu.c1, lu.se?.[1]), mPerDay: iv(lu.c1 * aM, lu.se ? lu.se[1] * aM : null) }, dLambdaDot: { radPerDay: iv(lO.c1 + lu.c1, seL), mPerDay: iv((lO.c1 + lu.c1) * aM, seL == null ? null : seL * aM) }, fittedNRevDay: r.fitted.n, referenceMeanARefKm: els.reduce((s, x) => s + x.aRef, 0) / els.length };
      const dl = ratesOut.dLambdaDot.mPerDay;
      ratesOut.agreesWithT1 = dl.se == null || trend.T1.se == null ? 'no interval' : Math.abs(dl.point - trend.T1.point) <= 2 * (dl.se + trend.T1.se) ? 'agrees' : `disagrees by ${f(dl.point - trend.T1.point, 2)} m/day`;
      // 4. the scales
      const scales = termScales(r.fitted.n, r.fitted.e, c.i, J);
      Object.assign(row, { trend, absorption, rates: ratesOut, scales });
    }
    const lnd = landed.find((x) => x.key === c.key && x.arm === arm.name);
    if (lnd) row.landed = { createdUtc: lnd.createdUtc, verdict: lnd.verdict, forwardShares: lnd.forward.shares, inArcShares: lnd.inArc.shares, convergenceMaxM: lnd.convergenceMaxM, reproduction: { forwardZonalM: forward.shares.zonal.rmsM - lnd.forward.shares.zonal.rmsM, forwardSecularM: forward.shares.secular.rmsM - lnd.forward.shares.secular.rmsM, inArcZonalM: inArc.shares.zonal.rmsM - lnd.inArc.shares.zonal.rmsM, inArcSecularM: inArc.shares.secular.rmsM - lnd.inArc.shares.secular.rmsM } };
    return { row, set, r, c };
  };
  const mine = REGIMES.filter((_, k) => k % SHARDS === SHARD);
  const phases = args.phase ? [Number(args.phase)] : [1, 2, 3, 4];
  for (const phase of phases) {
    for (const reg of mine) {
      const items = phase === 1
        ? [{ id: `reflight:primary:${reg.name}`, arm: { name: 'primary', ...ARMS.primary }, e: 0.001, rates: true }, { id: `reflight:secondary:${reg.name}`, arm: { name: 'secondary', ...ARMS.secondary }, e: 0.001, rates: true }, { id: `tail:${reg.name}`, arm: { name: 'tail', ...TAIL_ARM }, e: 0.001, rates: true }, { id: `cost:${reg.name}`, cost: true }]
        : E_GRID.filter(([p]) => p === phase).map(([, e]) => ({ id: `grid:secondary:${reg.name}|${e}`, arm: { name: 'secondary', ...ARMS.secondary }, e, rates: false }));
      for (const it of items) {
        if (done.has(it.id)) continue;
        const t0 = Date.now();
        try {
          if (it.cost) {
            // the primary e 0.001 set flown with MAXIMUM_ZONAL_DEGREE 20 (as fitted) and 31 to the forward day's first 65 minutes, five fresh invokes each
            const { set, r, c } = await flyCell(reg, 0.001, { name: 'primary', ...ARMS.primary }, false);
            const t1 = Date.parse(`${r.epoch}Z`) + c.arcDays * DAY + 60000, epochs = Array.from({ length: 65 }, (_, k) => iso(t1 + k * 60000));
            const set31 = O.repackOcm(set, (t) => { t.PERTURBATIONS.MAXIMUM_ZONAL_DEGREE = 31; });
            const caps = (bytes) => { const p = O.ocmOf(bytes).PERTURBATIONS; return { MAXIMUM_TESSERAL_DEGREE: p.MAXIMUM_TESSERAL_DEGREE, MAXIMUM_ZONAL_DEGREE: p.MAXIMUM_ZONAL_DEGREE }; };
            const timeIt = async (bytes) => { const out = []; let payload = null; for (let k = 0; k < 5; k += 1) { const a = performance.now(); payload = await flyRaw(bytes, epochs); out.push(performance.now() - a); } return { all: out, median: median(out), payloadSha256: sha256(payload) }; };
            const ms20 = await timeIt(set), ms31 = await timeIt(set31), ms20b = await timeIt(set);
            const differenceMs = median([...ms31.all]) - median([...ms20.all, ...ms20b.all]);
            emit({ id: it.id, type: 'cost', regime: reg.name, e: 0.001, ...stamp(), flown: true, fittedE: r.fitted.e, wide: r.fitted.e > 0.3, caps20: caps(set), caps31: caps(set31), ms20: { ...ms20, all: [...ms20.all, ...ms20b.all], median: median([...ms20.all, ...ms20b.all]) }, ms31, differenceMs, payloadsDiffer: ms20.payloadSha256 !== ms31.payloadSha256, withinColdTarget: differenceMs <= COLD_TARGET_MS, terms: TERMS, surface: 'command surface, one fresh instance per invoke: each figure is instantiation plus one flight of 65 epochs; the difference is the tail\'s cost', seconds: (Date.now() - t0) / 1000 });
            console.log(it.id, `20: ${f(median([...ms20.all, ...ms20b.all]), 0)} ms 31: ${f(ms31.median, 0)} ms diff ${f(differenceMs, 0)} ms payloads ${ms20.payloadSha256 === ms31.payloadSha256 ? 'EQUAL' : 'differ'}`);
            continue;
          }
          const out = await flyCell(reg, it.e, it.arm, it.rates);
          if (!out.row) { emit({ id: it.id, type: it.rates ? 'reflight' : 'grid', ...out, arm: it.arm.name, ...stamp(), seconds: (Date.now() - t0) / 1000 }); console.log(it.id, out.reason); continue; }
          emit({ id: it.id, type: it.rates ? 'reflight' : 'grid', ...out.row, ...stamp(), seconds: (Date.now() - t0) / 1000 });
          const fw = out.row.forward.shares;
          console.log(it.id, out.row.verdict, `zonal fwd ${f(fw.zonal.rmsM)} sec ${f(fw.secular.rmsM)} tess ${f(fw.tesseral.rmsM)}`, out.row.landed ? `(landed ${f(out.row.landed.forwardShares.zonal.rmsM)} / ${f(out.row.landed.forwardShares.secular.rmsM)})` : '', out.row.trend ? `R0 ${f(out.row.trend.R0.point)} T1 ${f(out.row.trend.T1.point)} Tr ${f(out.row.absorption.Tr.point)} [${out.row.absorption.reading}] dLambda ${f(out.row.rates.dLambdaDot.mPerDay.point)} (${out.row.rates.agreesWithT1}) scales J2^2 ${f(out.row.scales.mPerDay.j2SquaredScale, 1)} J4 ${f(out.row.scales.mPerDay.j4Scale, 1)} tail ${f(out.row.scales.mPerDay.tailSecularScale, 3)}` : '', `${((Date.now() - t0) / 1000).toFixed(0)} s`);
        } catch (error) {
          emit({ id: it.id, type: it.cost ? 'cost' : it.rates ? 'reflight' : 'grid', regime: reg.name, e: it.e ?? 0.001, arm: it.arm?.name, ...stamp(), flown: false, error: String(error?.message ?? error).slice(0, 300), seconds: (Date.now() - t0) / 1000 });
          console.log(it.id, 'ERROR', String(error?.message ?? error).slice(0, 300));
        }
      }
    }
  }
  await flyer.close?.();
  process.exit(0);
}

/** The share comparison of a landed (or flown) pair: primary vs secondary, per window and share, with the arm difference and the zonal reading. */
function compare(P, S, floorM) {
  const win = (w) => {
    const out = {};
    for (const s of ['zonal', 'secular']) {
      const p = P[w].shares[s], q = S[w].shares[s];
      const hasIv = Boolean(p.se && q.se), se = hasIv ? Math.hypot(p.se.rmsM, q.se.rmsM) : null, d = p.rmsM - q.rmsM;
      out[s] = { primary: { rmsM: p.rmsM, lo: p.lo?.rmsM ?? null, hi: p.hi?.rmsM ?? null, se: p.se?.rmsM ?? null }, secondary: { rmsM: q.rmsM, lo: q.lo?.rmsM ?? null, hi: q.hi?.rmsM ?? null, se: q.se?.rmsM ?? null }, difference: { rmsM: d, lo: hasIv ? d - 2 * se : null, hi: hasIv ? d + 2 * se : null, se, interval: hasIv } };
    }
    const conditioned = P[w].conditioned && S[w].conditioned;
    const z = out.zonal, tailPresent = z.difference.interval && z.difference.lo > 0, vanishes = z.secondary.hi != null && z.secondary.hi <= floorM, ownPersists = z.secondary.lo != null && z.secondary.lo > floorM;
    const labels = [];
    if (!conditioned) labels.push('withheld (not conditioned)');
    else { if (tailPresent) labels.push(`tail present (${f(z.difference.rmsM)} m [${f(z.difference.lo)}, ${f(z.difference.hi)}])`); if (vanishes) labels.push('vanishes at 20x20'); if (ownPersists) labels.push(`own theory persists (${f(z.secondary.rmsM)} m [${f(z.secondary.lo)}, ${f(z.secondary.hi)}])`); if (!labels.length) labels.push(z.difference.interval ? 'undecided' : 'undecided (no interval)'); }
    return { ...out, conditioned, floorM, zonalReading: { tailPresent, vanishes, ownPersists, label: labels.join('; ') } };
  };
  return { forward: win('forward'), inArc: win('inArc') };
}
const within3 = (x, s) => Number.isFinite(s) && s > 0 && x >= s / 3 && x <= s * 3;
/** Amendment 2: |T1| < |T_a| / 3: the radial offset is a bias at fixed mean motion, not a semi-major-axis error. */
const radialBias = (a) => Boolean(a?.trend && a.absorption && Math.abs(a.trend.T1.point) < Math.abs(a.absorption.Ta_mPerDay) / 3);
/** Item 4's reading on the three re-flown arms of a regime. */
function termReading(pri, sec, tail) {
  if (!pri?.absorption || !sec?.absorption) return { state: 'unmeasured' };
  const Tp = pri.absorption.Tr, Ts = sec.absorption.Tr, sc = sec.scales.mPerDay;
  const dT = Tp.point - Ts.point, seD = Tp.se != null && Ts.se != null ? Math.hypot(Tp.se, Ts.se) : null;
  const tailSecular = { mPerDay: dT, lo: seD == null ? null : dT - 2 * seD, hi: seD == null ? null : dT + 2 * seD, present: seD != null && Math.abs(dT) > 2 * seD, scale: pri.scales.mPerDay.tailSecularScale, ofTailOrder: within3(Math.abs(dT), pri.scales.mPerDay.tailSecularScale) };
  tailSecular.reading = seD == null ? 'no interval' : tailSecular.present ? `tail secular present: ${f(dT)} m/day [${f(tailSecular.lo)}, ${f(tailSecular.hi)}], ${tailSecular.ofTailOrder ? 'of' : 'not of'} the tail's order (scale ${f(tailSecular.scale, 3)} m/day)` : `no tail secular share beyond the spread (${f(dT)} m/day, SE ${f(seD)})`;
  // Amendment 2: when the along-track slope is small against the drift the radial offset would imply, R0 is a radial bias at fixed mean
  // motion and the term naming is read on T1, not on T_r (both shown).
  const bias = radialBias(sec), X = bias ? sec.trend.T1 : Ts;
  const own = { readOn: bias ? 'T1 (Amendment 2: R0 is a radial bias at fixed mean motion)' : 'T_r', radialBiasM: bias ? sec.trend.R0.point : null, Tr: Ts, mPerDay: X.point, lo: X.lo, hi: X.hi, present: X.se != null && Math.abs(X.point) > 2 * X.se, j2SquaredScale: sc.j2SquaredScale, j4Scale: sc.j4Scale };
  const biasNote = bias ? ` (T_r ${f(Ts.point)} m/day is the drift a semi-major-axis error of R0 ${f(sec.trend.R0.point)} m would give; T1 is ${f(sec.trend.T1.point)}: R0 is a radial bias at fixed mean motion, read on T1)` : '';
  if (X.se == null) own.reading = 'no interval';
  else if (!own.present) own.reading = `no secular rate mismatch beyond the spread at 20x20 (${f(X.point)} m/day, SE ${f(X.se)}): fit absorption${biasNote}`;
  else { const x = Math.abs(X.point), names = []; if (within3(x, sc.j2SquaredScale)) names.push('of J2-squared order'); if (within3(x, sc.j4Scale)) names.push('of J4 order'); const lo = Math.min(sc.j2SquaredScale, sc.j4Scale), hi = Math.max(sc.j2SquaredScale, sc.j4Scale); own.reading = `AP's own secular rate mismatch ${f(X.point)} m/day [${f(X.lo)}, ${f(X.hi)}]: ${names.length ? names.join(' and ') : x < lo / 3 ? 'below both scales' : x > hi * 3 ? 'above both scales' : 'between the J4 and J2-squared scales'} (J2-squared ${f(sc.j2SquaredScale, 1)}, J4 ${f(sc.j4Scale, 1)} m/day)${biasNote}`; }
  let tailArm = { state: 'unmeasured' };
  if (tail?.absorption) {
    const Tt = tail.absorption.Tr, includesSec = Tt.se != null && Ts.point >= Tt.lo && Ts.point <= Tt.hi;
    const moved = Tt.se != null && Tp.se != null && Math.abs(Tt.point - Tp.point) > 2 * (Tt.se + Tp.se) && Math.abs(Tt.point - Ts.point) < Math.abs(Tp.point - Ts.point);
    tailArm = { Tr: Tt, reading: Tt.se == null ? 'no interval' : includesSec ? 'the tail\'s rates close the gap' : moved ? 'the tail\'s rates close the gap partly' : 'the tail\'s rates do not close the gap', forwardZonalM: tail.forward.shares.zonal.rmsM, forwardSecularM: tail.forward.shares.secular.rmsM, primaryForwardZonalM: pri.forward.shares.zonal.rmsM, primaryForwardSecularM: pri.forward.shares.secular.rmsM, zonalMoved: Math.abs(tail.forward.shares.zonal.rmsM - pri.forward.shares.zonal.rmsM) > 2 * ((tail.forward.shares.zonal.se?.rmsM ?? 0) + (pri.forward.shares.zonal.se?.rmsM ?? 0)),
      // Amendment 3: the share-level fact beside the uninformative 4(c) rule
      secularMoved: Math.abs(tail.forward.shares.secular.rmsM - pri.forward.shares.secular.rmsM) > 2 * ((tail.forward.shares.secular.se?.rmsM ?? 0) + (pri.forward.shares.secular.se?.rmsM ?? 0)) };
  }
  return { state: 'read', tailSecular, own, tailArm };
}

export function table(outDir = RESULTS) {
  const rows = readRows(RESULTS), landed = landedRows();
  const byId = new Map(rows.map((r) => [r.id, r]));
  const regimes = REGIMES.map((reg) => {
    const P = landed.find((x) => x.key === `${reg.name}|0.001` && x.arm === 'primary'), S = landed.find((x) => x.key === `${reg.name}|0.001` && x.arm === 'secondary');
    const floorM = Math.max(0.1, P?.convergenceMaxM ?? 0, S?.convergenceMaxM ?? 0);
    const e001 = P && S ? { landed: { primaryCreatedUtc: P.createdUtc, secondaryCreatedUtc: S.createdUtc, primaryVerdict: P.verdict, secondaryVerdict: S.verdict }, ...compare(P, S, floorM) } : { state: 'no landed pair' };
    const grid = E_GRID.map(([, e]) => { const g = byId.get(`grid:secondary:${reg.name}|${e}`), Pe = landed.find((x) => x.key === `${reg.name}|${e}` && x.arm === 'primary'); if (!g) return { e, state: 'unmeasured' }; if (!g.flown) return { e, state: g.reason ?? 'error', error: g.error }; if (!Pe) return { e, state: 'no landed primary row' }; return { e, state: 'read', secondaryVerdict: g.verdict, primaryVerdict: Pe.verdict, fittedE: g.fitted.e, ...compare(Pe, g, Math.max(0.1, Pe.convergenceMaxM ?? 0)) }; });
    const arm = (name) => { const r = byId.get(`${name === 'tail' ? 'tail' : `reflight:${name}`}:${reg.name}`); if (!r) return { state: 'unmeasured' }; if (!r.flown) return { state: r.reason ?? 'error', error: r.error }; return { state: 'flown', verdict: r.verdict, fitted: { n: r.fitted.n, e: r.fitted.e }, forward: { rmsM: r.forward.rmsM, shares: r.forward.shares, conditioned: r.forward.conditioned }, inArc: { rmsM: r.inArc.rmsM, shares: r.inArc.shares, conditioned: r.inArc.conditioned }, landed: r.landed ?? null, trend: r.trend, absorption: r.absorption, rates: r.rates, scales: r.scales }; };
    const arms = { primary: arm('primary'), secondary: arm('secondary'), tail: arm('tail') };
    const terms = termReading(arms.primary.state === 'flown' ? arms.primary : null, arms.secondary.state === 'flown' ? arms.secondary : null, arms.tail.state === 'flown' ? arms.tail : null);
    const c = byId.get(`cost:${reg.name}`);
    const cost = !c ? { state: 'unmeasured' } : !c.flown ? { state: 'error', error: c.error } : { state: 'measured', ms20Median: c.ms20.median, ms31Median: c.ms31.median, differenceMs: c.differenceMs, withinColdTarget: c.withinColdTarget, payloadsDiffer: c.payloadsDiffer, caps20: c.caps20, caps31: c.caps31, wide: c.wide, terms: c.wide ? TERMS.wide : TERMS.narrow, bytes: c.wide ? TERMS.bytesWide : TERMS.bytesNarrow, surface: c.surface };
    return { regime: reg.name, n: reg.n, i: reg.i, arcDays: arcDays(reg.n), e001, grid, arms, terms, cost };
  });
  const flownRows = rows.filter((r) => r.flown);
  const summary = {
    rows: rows.length, flown: flownRows.length, errors: rows.filter((r) => !r.flown && r.error).map((r) => `${r.id}: ${r.error}`),
    e001: { tailPresentForward: regimes.filter((r) => r.e001.forward?.zonalReading.tailPresent).map((r) => r.regime), ownPersistsForward: regimes.filter((r) => r.e001.forward?.zonalReading.ownPersists).map((r) => r.regime), vanishesForward: regimes.filter((r) => r.e001.forward?.zonalReading.vanishes).map((r) => r.regime), undecidedForward: regimes.filter((r) => r.e001.forward && /undecided/.test(r.e001.forward.zonalReading.label)).map((r) => r.regime), tailPresentInArc: regimes.filter((r) => r.e001.inArc?.zonalReading.tailPresent).map((r) => r.regime), ownPersistsInArc: regimes.filter((r) => r.e001.inArc?.zonalReading.ownPersists).map((r) => r.regime) },
    secular: { tailSecularPresent: regimes.filter((r) => r.terms.tailSecular?.present).map((r) => r.regime), ownPresent: regimes.filter((r) => r.terms.own?.present).map((r) => r.regime), fitAbsorption: regimes.filter((r) => r.terms.own && !r.terms.own.present && r.terms.own.reading !== 'no interval').map((r) => r.regime), tailArmCloses: regimes.filter((r) => r.terms.tailArm?.reading === 'the tail\'s rates close the gap').map((r) => r.regime), noInterval: regimes.filter((r) => r.terms.own?.reading === 'no interval').map((r) => r.regime), tailArmZonalMoved: regimes.filter((r) => r.terms.tailArm?.zonalMoved).map((r) => r.regime), tailArmSecularMoved: regimes.filter((r) => r.terms.tailArm?.secularMoved).map((r) => r.regime) },
    grid: { read: regimes.flatMap((r) => r.grid.filter((g) => g.state === 'read').map((g) => `${r.regime}|${g.e}`)).length, tailPresentForward: regimes.flatMap((r) => r.grid.filter((g) => g.forward?.zonalReading.tailPresent).map((g) => `${r.regime}|${g.e}`)), ownPersistsForward: regimes.flatMap((r) => r.grid.filter((g) => g.forward?.zonalReading.ownPersists).map((g) => `${r.regime}|${g.e}`)), unmeasured: regimes.flatMap((r) => r.grid.filter((g) => g.state === 'unmeasured').map((g) => `${r.regime}|${g.e}`)).length },
    cost: { measured: regimes.filter((r) => r.cost.state === 'measured').length, differenceMsMedian: median(regimes.filter((r) => r.cost.state === 'measured').map((r) => r.cost.differenceMs)), overColdTarget: regimes.filter((r) => r.cost.state === 'measured' && !r.cost.withinColdTarget).map((r) => r.regime), payloadsEqual: regimes.filter((r) => r.cost.state === 'measured' && !r.cost.payloadsDiffer).map((r) => r.regime) },
  };
  const out = { registration: REGISTRATION, pins: PIN, egm: EGM, terms: TERMS, coldTargetMs: COLD_TARGET_MS, summary, regimes };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(out, null, 1)}\n`);
  const ivs = (x) => (x ? (x.lo != null ? `${f(x.rmsM ?? x.point)} [${f(x.lo)}, ${f(x.hi)}]` : `${f(x.rmsM ?? x.point)} [no interval]`) : '-');
  const cmpLine = (name, e, c, verdicts) => (c.forward ? `| ${name} | ${e} | ${ivs(c.forward.zonal.primary)} | ${ivs(c.forward.zonal.secondary)} | ${ivs(c.forward.zonal.difference)} | ${c.forward.zonalReading.label} | ${ivs(c.forward.secular.primary)} | ${ivs(c.forward.secular.secondary)} | ${ivs(c.forward.secular.difference)} | ${ivs(c.inArc.zonal.primary)} | ${ivs(c.inArc.zonal.secondary)} | ${c.inArc.zonalReading.label} | ${ivs(c.inArc.secular.primary)} | ${ivs(c.inArc.secular.secondary)} | ${f(c.forward.floorM, 3)} | ${verdicts} |` : `| ${name} | ${e} | ${c.state} | | | | | | | | | | | | | |`);
  const cmpHead = ['| Regime | e | Zonal fwd primary (m) | Zonal fwd secondary | Difference P - S | Zonal reading (forward) | Secular fwd primary | Secular fwd secondary | Difference | Zonal in-arc primary | Zonal in-arc secondary | Zonal reading (in-arc) | Secular in-arc primary | Secular in-arc secondary | Floor (m) | Verdicts P / S |', '| --- | --: | --: | --: | --: | --- | --: | --: | --: | --: | --: | --- | --: | --: | --: | --- |'];
  const armLine = (r, name) => { const a = r.arms[name]; if (a.state !== 'flown') return `| ${r.regime} | ${name} | ${a.state}${a.error ? `: ${a.error}` : ''} | | | | | | | | | | |`; const sc = a.scales.mPerDay; return `| ${r.regime} | ${name} | ${f(a.forward.shares.zonal.rmsM)} / ${f(a.forward.shares.secular.rmsM)}${a.landed ? ` (landed ${f(a.landed.forwardShares.zonal.rmsM)} / ${f(a.landed.forwardShares.secular.rmsM)})` : ''} | ${ivs(a.trend.R0)} | ${ivs(a.trend.T1)} | ${ivs(a.trend.N1)} | ${f(a.absorption.Ta_mPerDay)} | ${ivs(a.absorption.Tr)} | ${a.absorption.reading}${radialBias(a) ? `; radial bias ${f(a.trend.R0.point)} m at fixed mean motion (Amendment 2)` : ''} | ${ivs(a.rates.dOmegaDot.mPerDay)} | ${ivs(a.rates.duDot.mPerDay)} | ${ivs(a.rates.dLambdaDot.mPerDay)} (${a.rates.agreesWithT1}) | J2 ${f(sc.j2LambdaDot, 0)}; J2^2 ${f(sc.j2SquaredScale, 1)}; J4 ${f(sc.j4Scale, 1)}; tail secular ${f(sc.tailSecularScale, 3)}; tail long-period ${f(sc.tailLongPeriodScale, 4)} |`; };
  const md = [`# The secular and zonal shares: the J21-J31 zonal tail against AP's own zonal and secular theory`, '',
    `Registration: ${REGISTRATION}. Ground: the landed all-regimes rows (primary FFM EGM96 31x31 against propagator/sdn-ap ${PIN.sdnAp.version} at caps 31 / 20; secondary 20x20 both sides), their attribution and jackknife intervals unchanged; the secondary arm flown here on the e grid; both e 0.001 arms re-flown and a tail arm (31x31 against caps 31 / 31, a $OCM cap) for the rate items; the tail's cost per flight. Pins: modules ${PIN.modulesCommit.slice(0, 9)}; sdn-ap ${PIN.sdnAp.version} ${PIN.sdnAp.wasmSha256.slice(0, 12)}; ffm ${PIN.ffm.version} ${PIN.ffm.wasmSha256.slice(0, 12)}; EGM96 zonals from ${EGM.file} ${EGM.sha256.slice(0, 12)}. Shares are RMS over the window (m) with [lower, upper] by the all-regimes jackknife; the arm difference's interval is +-2 sqrt(SE_P^2 + SE_S^2). Floor: max(0.1 m, the cell's convergence figure). Rows ${summary.rows}, flown ${summary.flown}${summary.errors.length ? `; errors: ${summary.errors.join('; ')}` : ''}.`, '',
    `## Summary`,
    `- Zonal, e 0.001, forward day: tail present in ${summary.e001.tailPresentForward.join(', ') || 'none'}; own theory persists in ${summary.e001.ownPersistsForward.join(', ') || 'none'}; vanishes at 20x20 in ${summary.e001.vanishesForward.join(', ') || 'none'}; undecided: ${summary.e001.undecidedForward.join(', ') || 'none'}. In-arc: tail present in ${summary.e001.tailPresentInArc.join(', ') || 'none'}; own theory persists in ${summary.e001.ownPersistsInArc.join(', ') || 'none'}.`,
    `- Secular, e 0.001: tail secular share present (primary minus secondary beyond the spread) in ${summary.secular.tailSecularPresent.join(', ') || 'none'}; AP's own secular rate mismatch at 20x20 in ${summary.secular.ownPresent.join(', ') || 'none'}; fit absorption (no mismatch beyond the spread) in ${summary.secular.fitAbsorption.join(', ') || 'none'}; no interval (one or two revolutions a day): ${summary.secular.noInterval.join(', ') || 'none'}; the tail arm's rates close the primary-secondary gap (item 4(c), uninformative by Amendment 3) in ${summary.secular.tailArmCloses.join(', ') || 'none'}. The tail arm (caps 31 / 31) moved the primary's forward zonal share beyond the spread in ${summary.secular.tailArmZonalMoved.join(', ') || 'none'} and its secular share in ${summary.secular.tailArmSecularMoved.join(', ') || 'none'} (Amendment 3: the module's J21-J31 rates do not represent the reference's J21-J31 content).`,
    `- The e grid (secondary flown here against the landed primary): ${summary.grid.read} cells read, ${summary.grid.unmeasured} unmeasured; tail present (forward) in ${summary.grid.tailPresentForward.join(', ') || 'none'}; own theory persists in ${summary.grid.ownPersistsForward.join(', ') || 'none'}.`,
    `- Cost of the tail per object: ${TERMS.narrow} terms, ${TERMS.bytesNarrow} bytes at e 0.3 and below (${TERMS.wide} terms, ${TERMS.bytesWide.toLocaleString('en-US')} bytes above); time per flight (MAXIMUM_ZONAL_DEGREE 31 minus 20, 65 epochs, command surface, median of fresh invokes): median over ${summary.cost.measured} regimes ${f(summary.cost.differenceMsMedian, 1)} ms; over the 100 ms cold target: ${summary.cost.overColdTarget.join(', ') || 'none'}; payloads equal at 20 and 31 (the tail moved nothing): ${summary.cost.payloadsEqual.join(', ') || 'none'}.`, '',
    `## The share comparison at e 0.001 (landed rows; primary 31x31 vs 31/20 against secondary 20x20 both sides)`, ...cmpHead,
    ...regimes.map((r) => cmpLine(r.regime, 0.001, r.e001, r.e001.landed ? `${r.e001.landed.primaryVerdict} / ${r.e001.landed.secondaryVerdict}` : '-')), '',
    `## The e grid (secondary arm flown here against the landed primary row)`, ...cmpHead,
    ...regimes.flatMap((r) => r.grid.map((g) => cmpLine(r.regime, g.e, g, g.state === 'read' ? `${g.primaryVerdict} / ${g.secondaryVerdict}` : '-'))), '',
    `## Secular attribution by term (forward day of the re-flown e 0.001 cells; m and m/day; R0 radial offset, T1 along-track slope, N1 cross-track slope; T_a = -(3/2) n R0; T_r = T1 - T_a)`,
    `| Regime | Arm | Forward zonal / secular share (m) | R0 (m) | T1 (m/day) | N1 (m/day) | T_a (m/day) | T_r (m/day) | Absorption reading | a sin i dOmega-dot (m/day) | a du-dot (m/day) | a dlambda-dot (m/day) | Scales (m/day) |`, `| --- | --- | --- | --: | --: | --: | --: | --: | --- | --: | --: | --: | --- |`,
    ...regimes.flatMap((r) => ['primary', 'secondary', 'tail'].map((n) => armLine(r, n))), '',
    `## The term reading per regime`,
    `| Regime | Tail secular share (primary minus secondary, m/day) | AP's own secular theory (secondary T_r) | Tail arm (caps 31 / 31) | Tail arm zonal share moved? |`, `| --- | --- | --- | --- | --- |`,
    ...regimes.map((r) => (r.terms.state === 'read' ? `| ${r.regime} | ${r.terms.tailSecular.reading} | ${r.terms.own.reading} | ${r.terms.tailArm.reading ?? r.terms.tailArm.state} | ${r.terms.tailArm.state === 'unmeasured' ? '-' : `${r.terms.tailArm.zonalMoved ? 'yes' : 'no'} (${f(r.terms.tailArm.primaryForwardZonalM)} -> ${f(r.terms.tailArm.forwardZonalM)} m; secular ${f(r.terms.tailArm.primaryForwardSecularM)} -> ${f(r.terms.tailArm.forwardSecularM)} m)`} |` : `| ${r.regime} | ${r.terms.state} | | | |`)), '',
    `## The cost line (per regime: the primary e 0.001 fitted set flown to 65 epochs with MAXIMUM_ZONAL_DEGREE 20 as fitted and repacked to 31; medians of fresh invokes on the command surface, instantiation included)`,
    `| Regime | 20 (ms) | 31 (ms) | Difference (ms) | Within the 100 ms cold target | Payloads differ | Terms added | Bytes added |`, `| --- | --: | --: | --: | --- | --- | --: | --: |`,
    ...regimes.map((r) => (r.cost.state === 'measured' ? `| ${r.regime} | ${f(r.cost.ms20Median, 0)} | ${f(r.cost.ms31Median, 0)} | ${f(r.cost.differenceMs, 0)} | ${r.cost.withinColdTarget ? 'within' : 'OVER'} | ${r.cost.payloadsDiffer ? 'yes' : 'NO (equal bytes)'} | ${r.cost.terms} | ${r.cost.bytes} |` : `| ${r.regime} | ${r.cost.state}${r.cost.error ? `: ${r.cost.error}` : ''} | | | | | | |`)), ''].join('\n');
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
  check(rows.every((r) => r.sdnAp?.wasmSha256 === PIN.sdnAp.wasmSha256 && r.ffm?.wasmSha256 === PIN.ffm.wasmSha256 && r.modulesCommit === PIN.modulesCommit), `every row on sdn-ap ${PIN.sdnAp.version} (${PIN.sdnAp.wasmSha256.slice(0, 12)}), ffm ${PIN.ffm.version} (${PIN.ffm.wasmSha256.slice(0, 12)}), modules ${PIN.modulesCommit.slice(0, 9)}`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'secular-zonal-shares-'));
  const t = table(tmp);
  check(['table.json', 'README.md'].every((n) => fs.existsSync(path.join(RESULTS, n)) && fs.readFileSync(path.join(tmp, n)).equals(fs.readFileSync(path.join(RESULTS, n)))), `results/ap-truth/secular-zonal-shares/table.json and README.md reproduce from the rows`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const pairs = t.regimes.filter((r) => r.e001.forward);
  check(pairs.length === 17 && pairs.every((r) => ['forward', 'inArc'].every((w) => ['zonal', 'secular'].every((s) => Number.isFinite(r.e001[w][s].difference.rmsM) && 'lo' in r.e001[w][s].primary && 'lo' in r.e001[w][s].secondary)) && r.e001.forward.zonalReading.label && r.e001.inArc.zonalReading.label), `every landed e 0.001 pair (${pairs.length} of 17) carries its share comparison (zonal and secular, forward and in-arc) with intervals and its zonal reading: forward tail present ${t.summary.e001.tailPresentForward.length}, own theory persists ${t.summary.e001.ownPersistsForward.length}, vanishes ${t.summary.e001.vanishesForward.length}, undecided ${t.summary.e001.undecidedForward.length}`);
  const flownArms = t.regimes.flatMap((r) => ['primary', 'secondary', 'tail'].map((n) => ({ regime: r.regime, arm: n, ...r.arms[n] })));
  const attempted = flownArms.filter((a) => a.state !== 'unmeasured'), flown = flownArms.filter((a) => a.state === 'flown');
  check(attempted.length === 51 && flown.every((a) => a.trend && a.absorption?.reading && a.rates?.agreesWithT1 && a.scales && Number.isFinite(a.scales.mPerDay.j2SquaredScale)), `every re-flown cell (${flown.length} flown of ${attempted.length} attempted, 51 registered) carries the trend line, the absorption reading, the element rates and the term scales; errors ${attempted.length - flown.length}`);
  check(t.regimes.every((r) => r.terms.state === 'read'), `every regime carries its term reading (tail secular present ${t.summary.secular.tailSecularPresent.length}, own present ${t.summary.secular.ownPresent.length}, fit absorption ${t.summary.secular.fitAbsorption.length}, no interval ${t.summary.secular.noInterval.length})`);
  check(t.regimes.every((r) => r.cost.state === 'measured' && Number.isFinite(r.cost.differenceMs)), `every regime carries its cost line (median difference ${f(t.summary.cost.differenceMsMedian, 1)} ms; over the cold target: ${t.summary.cost.overColdTarget.length}; ${TERMS.narrow} terms / ${TERMS.bytesNarrow} bytes narrow)`);
  console.log(`e grid: ${t.summary.grid.read} cells read, ${t.summary.grid.unmeasured} unmeasured (stated, not required)`);
  console.log(failures ? `FAIL (${failures})` : 'PASS');
  process.exit(failures ? 1 : 0);
}
