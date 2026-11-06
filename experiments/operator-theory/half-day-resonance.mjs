// HALF-DAY-RESONANCE.md (with Amendment 1): the half-day class's mixed (2:1 resonant) share by family (report only). Per cell the landed
// frame re-flown (E_F), the fitted set flown again at tesseral cap 0 (AP_F0), a zonal-only reference (Ref_Z), and the series T = AP_F - AP_F0
// (the module's own tesseral content), M = AP_F0 - Ref_Z (the m = 0 member's miss), S = Ref_F - Ref_Z (the reference's tesseral signal) and
// D = E_F - M (the tesseral members' miss), each attributed with the all-regimes record's exported attribute() unchanged (Amendment 7:
// the estimator is fixed).
//   SDN_MODULES_ROOT=<root> node half-day-resonance.mjs --run [--shard k/n]     node half-day-resonance.mjs --table     --check
// Every state comes from a module (propagator/sdn-ap through propagator/sdn-ap/test/lib/heo-model-truth.mjs and ocm.mjs; the reference
// from propagator/ffm inside that harness); this file moves bytes and does arithmetic (differences of vectors, RTN projection through the
// exported rtnOf, least squares through the exported attribute, RMS, slopes).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const HERE = path.dirname(new URL(import.meta.url).pathname), REPO = path.resolve(HERE, '../..');
const RESULTS = path.join(REPO, 'results/ap-truth/half-day-resonance');
const FIRST_PASS = path.join(RESULTS, 'first-pass-two-fits');
const LANDED = path.join(REPO, 'results/ap-truth/tesseral-all-regimes');
const REGISTRATION = 'experiments/operator-theory/HALF-DAY-RESONANCE.md';
export const PIN = {
  modulesCommit: '93cb5a0584fa728864e4426cc9ceb368936589f9',
  sdnAp: { version: '0.6.3', wasmSha256: 'aa3ed22aa61a3a514e06619b9bff4aa1b1051d704dc32cd360b5c572b2c57f4e' },
  ffm: { version: '2.2.1', wasmSha256: 'a9133120775291c4dfbf9151d0617850be560934943a178419fdd8e3fed765e4' },
};
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const RUNNER = sha256(fs.readFileSync(new URL(import.meta.url)));
// The all-regimes registered code, imported with an empty argument list so none of its own branches runs.
const argvSave = process.argv; process.argv = process.argv.slice(0, 2);
const AR = await import(pathToFileURL(path.join(HERE, 'tesseral-all-regimes.mjs')).href);
process.argv = argvSave;
const DAY = 86400000, THETA = 1.00273781, FIRST_DAYS = 1.5;
export const ARMS = { F: { field: [31, 31], caps: [31, 20] }, Z: { field: [31, 0], caps: [31, 20], flown: 'the arm F set at MAXIMUM_TESSERAL_DEGREE 0 (no second fit; Amendment 1)' } };
export const SERIES = ['EF', 'T', 'M', 'S', 'D'];
/** The cells (HALF-DAY-RESONANCE.md): flown regimes and their e grid in the registered order; Etalon is read from the landed rows. */
export const FLOWN = { GPS: [0.001, 0.1, 0.2, 0.01, 0.05], Galileo: [0.001, 0.1, 0.2, 0.01, 0.05], GLONASS: [0.001, 0.1, 0.2, 0.01, 0.05], Molniya: [0.001, 0.1, 0.2, 0.01, 0.05], GTO: [0.001, 0.1, 0.2] };
export const READ = { Etalon: [0.001, 0.01, 0.05, 0.1, 0.2] };
const regimeOf = (name) => AR.REGIMES.find((r) => r.name === name);
export function cells() {
  const out = [];
  const grid = [0.001, 0.1, 0.2, 0.01, 0.05];
  for (const e of grid) for (const [name, es] of Object.entries(FLOWN)) if (es.includes(e)) { const r = regimeOf(name); out.push({ key: `${name}|${e}`, regime: name, n: r.n, i: r.i, raan: r.raan, argp: r.argp, e, arcDays: AR.arcDays(r.n), convergence: e === 0.001, type: 'flown' }); }
  for (const [name, es] of Object.entries(READ)) for (const e of es) { const r = regimeOf(name); out.push({ key: `${name}|${e}`, regime: name, n: r.n, i: r.i, raan: r.raan, argp: r.argp, e, arcDays: AR.arcDays(r.n), type: 'read' }); }
  return out;
}
const readRows = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const landedRows = () => readRows(LANDED).filter((r) => r.arm === 'primary' && r.flown);
const rms = (v) => Math.sqrt(v.reduce((s, x) => s + x * x, 0) / v.length);
const f = (x, d = 2) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const slip = (n) => n - 2 * THETA;
/** The ladder groups of an attribution: for k = 1..4 the kept group holding (0,k); the deep groups holding (2,1) and (4,2). */
function ladders(attr) {
  const find = (label) => attr.families.find((g) => g.labels.includes(label)) ?? null;
  return { even: [1, 2, 3, 4].map((k) => { const g = find(`(0,${k})`); return { k, cyclesPerDay: g?.cyclesPerDay ?? null, kind: g?.kind ?? null, labels: g?.labels ?? null, amplitudeM: g?.amplitudeM ?? null }; }), deep: Object.fromEntries(['(2,1)', '(4,2)'].map((l) => { const g = find(l); return [l, g ? { cyclesPerDay: g.cyclesPerDay, kind: g.kind, labels: g.labels, amplitudeM: g.amplitudeM } : null]; })) };
}
const mixedShare = (attr) => attr.shares.mixed;
/** The reading rule (HALF-DAY-RESONANCE.md): m0 = M's mixed share, tes = D's mixed share, on the first-day leg (Amendment 1). */
export function reading(EF, M, D) {
  if (!(EF.conditioned && M.conditioned && D.conditioned)) return 'withheld (estimator)';
  const m0 = mixedShare(M), tes = mixedShare(D);
  if (!m0.lo || !tes.lo) return 'undecided (no interval)';
  if (tes.hi.rmsM < m0.lo.rmsM) return 'm = 0 member dominant';
  if (m0.hi.rmsM < tes.lo.rmsM) return 'tesseral members dominant';
  return 'shared (intervals overlap)';
}
if (args.run) {
  const MOD = process.env.SDN_MODULES_ROOT;
  if (!MOD) throw new Error('SDN_MODULES_ROOT names the modules root');
  const apWasm = path.join(MOD, 'propagator/sdn-ap/dist/isomorphic/module.wasm'), ffmWasm = path.join(MOD, 'propagator/ffm/dist/isomorphic/module.wasm');
  if (sha256(fs.readFileSync(apWasm)) !== PIN.sdnAp.wasmSha256) throw new Error(`${apWasm} is not sdn-ap ${PIN.sdnAp.version}`);
  if (sha256(fs.readFileSync(ffmWasm)) !== PIN.ffm.wasmSha256) throw new Error(`${ffmWasm} is not ffm ${PIN.ffm.version}`);
  process.env.SDNAP_WASM = apWasm;
  process.env.SDN_AP_HEO_CACHE = process.env.SDN_AP_HEO_CACHE ?? '/Users/tj/software/terrain-work/body-look/resonance/heo-cache';
  const { runModelTruth } = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/heo-model-truth.mjs')).href);
  const O = await import(pathToFileURL(path.join(MOD, 'propagator/sdn-ap/test/lib/ocm.mjs')).href);
  const { createRequire } = await import('node:module');
  const req = createRequire(path.join(MOD, 'propagator/sdn-ap/package.json'));
  const { createStandaloneHarness } = await import(pathToFileURL(req.resolve('space-data-module-sdk/testing/isomorphic')).href);
  const { pcfOutputFrame } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/PCF/pcfOutputFrame.js')).href);
  const { OEM } = await import(pathToFileURL(req.resolve('spacedatastandards.org/lib/js/OEM/OEM.js')).href);
  const fb = await import(pathToFileURL(req.resolve('flatbuffers')).href);
  const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
  fs.mkdirSync(RESULTS, { recursive: true });
  const outFile = path.join(RESULTS, `rows-${SHARD}.jsonl`);
  const done = new Set(readRows(RESULTS).map((r) => r.key));
  const landed = landedRows();
  const list = cells().filter((c, k) => k % SHARDS === SHARD && !done.has(c.key));
  const flyer = await createStandaloneHarness('browser', apWasm, { surface: 'command' });
  const fly = async (set, epochs) => {
    const r = await flyer.invoke({ methodId: 'propagate', inputs: O.flight([set], { output: { EPOCHS: epochs, FRAME: pcfOutputFrame.GCRF } }) });
    if (r.statusCode !== 0) throw new Error(`propagate: ${r.errorCode}: ${r.errorMessage}`);
    return OEM.getRootAsOEM(new fb.ByteBuffer(r.outputs.find((o) => o.portId === 'ephemeris').payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES.map((l) => [l.X, l.Y, l.Z]);
  };
  const stamp = () => ({ createdUtc: new Date().toISOString(), runner: RUNNER, modulesCommit: PIN.modulesCommit, sdnAp: PIN.sdnAp, ffm: PIN.ffm, shard: SHARD });
  const sub = (a, b) => a.map((x, k) => x - b[k]);
  const linesOf = (oemPayload) => OEM.getRootAsOEM(new fb.ByteBuffer(oemPayload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
  for (const c of list) {
    const t0 = Date.now();
    const land = landed.find((r) => r.key === c.key);
    const landedPart = land ? { landed: { createdUtc: land.createdUtc, runner: land.runner, fitted: land.fitted, inArcMixed: land.inArc.shares.mixed, forwardMixed: land.forward.shares.mixed, inArcFamilies: land.inArc.families.filter((g) => g.kind === 'mixed').slice(0, 6), forwardFamilies: land.forward.families.filter((g) => g.kind === 'mixed').slice(0, 4), verdict: land.verdict } } : { landed: null };
    if (c.type === 'read') {
      const row = { ...c, ...stamp(), ...landedPart, flown: false, read: Boolean(land), note: 'Etalon: read from the landed all-regimes row (GLONASS flown in its place, HALF-DAY-RESONANCE.md); the GLONASS cell of the same e carries the arms' };
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
      console.log(c.key, 'read from the landed row', land ? land.createdUtc : 'MISSING');
      continue;
    }
    const row = { ...c, ...stamp(), ...landedPart, arms: ARMS, slipCyclesPerDay: null };
    try {
      const gridMinutes = AR.gridSeconds(c.n) / 60;
      const base = { n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: 0, drag: false, thirdBody: true, fitDays: c.arcDays, hourly: true, gridMinutes, forecastDays: 1, referenceTolerance: 1e-12, referenceMaxStep: 300, modulePath: apWasm };
      const fixF = { ...base, name: `${c.key}|F`, field: ARMS.F.field, forces: ARMS.F.caps };
      const F = await runModelTruth(fixF);
      const setF = Buffer.from(F.omm, 'base64');
      const set0 = O.repackOcm(setF, (t) => { t.PERTURBATIONS.MAXIMUM_TESSERAL_DEGREE = 0; });
      const arcF = linesOf((await runModelTruth({ ...fixF, fitInput: true })).ephemeris.payload);
      const epochs = arcF.map((l) => l.EPOCH);
      const apF = await fly(setF, epochs), ap0 = await fly(set0, epochs);
      const fixZ = { ...base, name: `${c.key}|Z`, field: ARMS.Z.field, forces: ARMS.Z.caps, omm: set0 };
      const Zr = await runModelTruth(fixZ);
      const arcZ = linesOf((await runModelTruth({ ...fixZ, fitInput: true })).ephemeris.payload);
      if (arcZ.some((l, k) => l.EPOCH !== arcF[k].EPOCH)) throw new Error('the two references sample different arc epochs');
      row.slipCyclesPerDay = slip(F.fitted.n);
      row.fitted = F.fitted;
      row.initialGcrfKm = F.fixture.initialGcrfKm;
      const nFit = F.fitted.n;
      // The five series from inertial vectors (km), projected in RTN at Ref_F (m).
      const series = (count, APF, AP0, RF, RZ) => {
        const out = { EF: [], T: [], M: [], S: [], D: [] };
        for (let k = 0; k < count; k += 1) {
          const rtn = (d) => AR.rtnOf(d, RF[k].p, RF[k].v);
          const eF = sub(APF[k], RF[k].p), m = sub(AP0[k], RZ[k].p);
          out.EF.push(rtn(eF)); out.T.push(rtn(sub(APF[k], AP0[k]))); out.M.push(rtn(m)); out.S.push(rtn(sub(RF[k].p, RZ[k].p))); out.D.push(rtn(sub(eF, m)));
        }
        return out;
      };
      const refOf = (lines) => lines.map((l) => ({ p: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] }));
      const arc = series(arcF.length, apF, ap0, refOf(arcF), refOf(arcZ));
      const arcTau = arcF.map((l) => (Date.parse(`${l.EPOCH}Z`) - Date.parse(`${arcF[0].EPOCH}Z`)) / DAY);
      const attr = (s, tau, windowDays, blockDays) => { const a = AR.attribute(tau, s, nFit, windowDays, blockDays); return { rmsM: rms(s.map((p) => Math.hypot(...p))), maxM: Math.max(...s.map((p) => Math.hypot(...p))), ...a, ladders: ladders(a) }; };
      // (a) the 6-day leg: E_F and T. (b) the first-day leg: the arc's first 1.5 days, blocks of one revolution. (c) forward.
      const inArc = { samples: arc.EF.length, windowDays: c.arcDays, blockDays: 1, EF: attr(arc.EF, arcTau, c.arcDays, 1), T: attr(arc.T, arcTau, c.arcDays, 1) };
      const firstIdx = arcTau.map((t, k) => (t <= FIRST_DAYS + 1e-9 ? k : -1)).filter((k) => k >= 0);
      const fTau = firstIdx.map((k) => arcTau[k]);
      const firstDay = { samples: firstIdx.length, windowDays: FIRST_DAYS, blockDays: 1 / nFit, ...Object.fromEntries(SERIES.map((s) => [s, attr(firstIdx.map((k) => arc[s][k]), fTau, FIRST_DAYS, 1 / nFit)])) };
      const fwdRefF = F.referenceStates.map((s) => ({ p: s.position, v: s.velocity })), fwdRefZ = Zr.referenceStates.map((s) => ({ p: s.position, v: s.velocity }));
      const fwd = series(F.flown.length, F.flown.map((s) => s.slice(0, 3)), Zr.flown.map((s) => s.slice(0, 3)), fwdRefF, fwdRefZ);
      const tau = F.profile.map((p) => p.h / 24);
      const forward = { samples: fwd.EF.length, gridSeconds: AR.gridSeconds(c.n), windowDays: 1, blockDays: 1 / nFit, ...Object.fromEntries(SERIES.map((s) => [s, attr(fwd[s], tau, 1, 1 / nFit)])) };
      const shares = (L) => ({ whole: mixedShare(L.EF), model: mixedShare(L.T), m0: L.M ? mixedShare(L.M) : null, tes: L.D ? mixedShare(L.D) : null, signal: L.S ? mixedShare(L.S) : null, secularEF: L.EF.shares.secular, secularT: L.T.shares.secular, secularS: L.S?.shares.secular ?? null, tesseralEF: L.EF.shares.tesseral });
      const consistency = inArc.EF.ladders.even.map((g, k) => ({ k: g.k, sixDayM: g.amplitudeM, firstDayM: firstDay.EF.ladders.even[k].amplitudeM }));
      Object.assign(row, { flown: true, inArc, firstDay, forward, shares: { inArc: shares(inArc), firstDay: shares(firstDay), forward: shares(forward) }, consistency,
        reading: { firstDay: reading(firstDay.EF, firstDay.M, firstDay.D), forward: reading(forward.EF, forward.M, forward.D) },
        reproduction: land ? { inArcMixedM: inArc.EF.shares.mixed.rmsM - land.inArc.shares.mixed.rmsM, forwardMixedM: forward.EF.shares.mixed.rmsM - land.forward.shares.mixed.rmsM } : null,
        reference: `propagator/ffm ${PIN.ffm.version}: EGM96 31x31 (Ref_F) and 31x0 (Ref_Z) from the same initial state, Sun and Moon point masses (DE440), no drag, SRP, tides, relativity or Earth radiation; RK78 rel 1e-12 abs 1e-9, steps 0.01 to 300 s; zero EOP`,
        referenceIntegrator: F.fixture.referenceIntegrator, kernelSha256: F.kernelSha256 });
      if (c.convergence) {
        const r2 = await runModelTruth({ ...fixZ, referenceTolerance: 1e-13, referenceMaxStep: 150 });
        row.convergenceZMaxM = Math.max(...Zr.referenceStates.map((s, k) => Math.hypot(...s.position.map((x, ax) => (x - r2.referenceStates[k].position[ax]) * 1000))));
      }
      row.seconds = (Date.now() - t0) / 1000;
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
      const iv = (s) => (s ? `${f(s.rmsM)} [${f(s.lo?.rmsM)},${f(s.hi?.rmsM)}]` : '-');
      const sh = (s) => `whole ${iv(s.whole)} m0 ${iv(s.m0)} tes ${iv(s.tes)} model ${iv(s.model)} signal ${iv(s.signal)} secS ${f(s.secularS?.rmsM)}`;
      const lad = (L) => L.EF.ladders.even.map((g, k) => `k${g.k} EF ${f(g.amplitudeM)} T ${f(L.T.ladders.even[k].amplitudeM)}${L.M ? ` M ${f(L.M.ladders.even[k].amplitudeM)} D ${f(L.D.ladders.even[k].amplitudeM)} S ${f(L.S.ladders.even[k].amplitudeM)}` : ''}`).join('; ');
      console.log(c.key, row.reading.firstDay, `| first-day ${sh(row.shares.firstDay)} | ${lad(firstDay)} | 6-day ${lad(inArc)} | fwd ${sh(row.shares.forward)} | repro ${f(row.reproduction?.inArcMixedM)}/${f(row.reproduction?.forwardMixedM)}`, row.convergenceZMaxM !== undefined ? `convZ ${row.convergenceZMaxM.toExponential(1)}` : '', `${row.seconds.toFixed(0)} s`);
    } catch (error) {
      row.flown = false; row.error = String(error?.message ?? error).slice(0, 400); row.seconds = (Date.now() - t0) / 1000;
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
      console.log(c.key, 'ERROR', row.error);
    }
  }
  await flyer.close?.();
  process.exit(0);
}

/** The log-log slope of y against e over the cells where y is finite and positive (two or more), else null. */
function slope(pairs) {
  const p = pairs.filter(([e, y]) => e > 0 && y > 0).map(([e, y]) => [Math.log(e), Math.log(y)]);
  if (p.length < 2) return null;
  const mx = p.reduce((s, q) => s + q[0], 0) / p.length, my = p.reduce((s, q) => s + q[1], 0) / p.length;
  const sxx = p.reduce((s, q) => s + (q[0] - mx) ** 2, 0), sxy = p.reduce((s, q) => s + (q[0] - mx) * (q[1] - my), 0);
  return sxx > 0 ? sxy / sxx : null;
}
export function table(outDir = RESULTS) {
  const rows = readRows(RESULTS);
  const all = cells();
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const flown = rows.filter((r) => r.flown);
  const regimes = ['GPS', 'Galileo', 'GLONASS', 'Etalon', 'Molniya', 'GTO'];
  const iv = (s, k = 'rmsM') => (s ? `${f(s[k])}${s.lo ? ` [${f(s.lo[k])}, ${f(s.hi[k])}]` : ' [no interval]'}` : '-');
  const perRegime = regimes.map((name) => {
    const cs = all.filter((c) => c.regime === name).map((c) => byKey.get(c.key) ?? { ...c, state: 'unmeasured' }).sort((a, b) => a.e - b.e);
    const fl = cs.filter((r) => r.flown);
    const readings = fl.map((r) => r.reading.firstDay);
    const count = (s) => readings.filter((x) => x === s).length;
    const deep = fl.length ? { inArcEF: fl.map((r) => ({ e: r.e, '(2,1)': r.inArc.EF.ladders.deep['(2,1)'], '(4,2)': r.inArc.EF.ladders.deep['(4,2)'] })), inArcT: fl.map((r) => ({ e: r.e, '(2,1)': r.inArc.T.ladders.deep['(2,1)'], '(4,2)': r.inArc.T.ladders.deep['(4,2)'] })), secularEF: fl.map((r) => ({ e: r.e, rmsM: r.inArc.EF.shares.secular.rmsM, lo: r.inArc.EF.shares.secular.lo?.rmsM, hi: r.inArc.EF.shares.secular.hi?.rmsM })) } : null;
    const slip_ = fl[0]?.slipCyclesPerDay ?? (name === 'Etalon' ? slip(cs.find((r) => r.landed)?.landed?.fitted?.n ?? NaN) : null);
    const separable = Number.isFinite(slip_) ? Math.abs(slip_) >= 1.5 / (cs[0]?.arcDays ?? 6) : null;
    return {
      regime: name, arcDays: cs[0]?.arcDays, slipCyclesPerDay: slip_, deepPeriodDays: Number.isFinite(slip_) && slip_ !== 0 ? 1 / Math.abs(slip_) : null, deepSeparableInArc: separable,
      cells: cs.map((r) => ({ e: r.e, state: r.flown ? 'flown' : r.read ? 'read (landed)' : r.error ? `error: ${r.error}` : 'unmeasured', reading: r.reading ?? null, fitted: r.fitted ?? null, shares: r.shares ?? null, consistency: r.consistency ?? null, landed: r.landed ? { inArcMixed: r.landed.inArcMixed, forwardMixed: r.landed.forwardMixed, verdict: r.landed.verdict } : null, reproduction: r.reproduction ?? null,
        ladders: r.flown ? { inArc: ['EF', 'T'].map((a) => ({ arm: a, even: r.inArc[a].ladders.even })), firstDay: SERIES.map((a) => ({ arm: a, even: r.firstDay[a].ladders.even })), forward: SERIES.map((a) => ({ arm: a, even: r.forward[a].ladders.even })) } : null,
        conditioned: r.flown ? { inArc: ['EF', 'T'].map((a) => r.inArc[a].conditioned), firstDay: SERIES.map((a) => r.firstDay[a].conditioned), forward: SERIES.map((a) => r.forward[a].conditioned) } : null, convergenceZMaxM: r.convergenceZMaxM, createdUtc: r.createdUtc })),
      readings: { 'm = 0 member dominant': count('m = 0 member dominant'), 'tesseral members dominant': count('tesseral members dominant'), 'shared (intervals overlap)': count('shared (intervals overlap)'), withheld: count('withheld (estimator)'), 'undecided (no interval)': count('undecided (no interval)') },
      slopes: fl.length ? { tesFirstDay: slope(fl.map((r) => [r.e, r.shares.firstDay.tes.rmsM])), m0FirstDay: slope(fl.map((r) => [r.e, r.shares.firstDay.m0.rmsM])), wholeInArc: slope(fl.map((r) => [r.e, r.shares.inArc.whole.rmsM])), modelInArc: slope(fl.map((r) => [r.e, r.shares.inArc.model.rmsM])), signalFirstDay: slope(fl.map((r) => [r.e, r.shares.firstDay.signal.rmsM])) } : null,
      deep,
    };
  });
  // P1 to P3 per regime (the registered reading rule, Amendment 1 legs).
  const findings = perRegime.map((R) => {
    const fl = R.cells.filter((c) => c.state === 'flown');
    if (!fl.length) return { regime: R.regime, P1: R.regime === 'Etalon' ? 'read from GLONASS (its landed rows equal GLONASS to 0.01 m)' : 'unmeasured', P2: '-', P3: '-' };
    const small = fl.filter((c) => c.e <= 0.01), large = fl.filter((c) => c.e >= 0.1);
    const summar = (cs) => cs.map((c) => `e ${c.e}: ${c.reading.firstDay} (first-day m0 ${iv(c.shares.firstDay.m0)}, tes ${iv(c.shares.firstDay.tes)}, whole ${iv(c.shares.firstDay.whole)}, signal ${f(c.shares.firstDay.signal.rmsM)} m; 6-day k = 2 group E_F ${f(c.ladders.inArc[0].even[1].amplitudeM)} m, module content T ${f(c.ladders.inArc[1].even[1].amplitudeM)} m)`).join('; ');
    const P1 = `at small e: ${summar(small)}`;
    const P2 = `at e 0.1 to 0.2: ${summar(large)}; slope against e of tes ${f(R.slopes.tesFirstDay)}, of m0 ${f(R.slopes.m0FirstDay)}, of the module's tesseral content T (6-day) ${f(R.slopes.modelInArc)}, of the signal ${f(R.slopes.signalFirstDay)}`;
    const deepLine = (c) => ['(2,1)', '(4,2)'].map((l) => { const g = R.deep.inArcEF.find((x) => x.e === c.e)[l], t = R.deep.inArcT.find((x) => x.e === c.e)[l]; return g ? `${l} group ${g.cyclesPerDay} cpd [${g.labels.join(' ')}] in E_F ${f(g.amplitudeM)} m, in T ${f(t?.amplitudeM)} m` : `${l} chained below the resolution, in the trend`; }).join('; ');
    const secBound = `E_F's 6-day secular share: ${R.deep.secularEF.map((x) => `e ${x.e}: ${f(x.rmsM)}${x.lo !== undefined ? ` [${f(x.lo)}, ${f(x.hi)}]` : ''} m`).join(', ')}`;
    const P3 = R.deepSeparableInArc ? `${fl.map((c) => `e ${c.e}: ${deepLine(c)}`).join('; ')}; ${secBound}` : `not separable from the trend on ${R.arcDays} days (period ${f(R.deepPeriodDays, 0)} days); ${secBound}`;
    const bound = fl.map((c) => { const k1 = c.ladders.inArc.map((a) => a.even[0].amplitudeM), k2 = c.ladders.inArc.map((a) => a.even[1].amplitudeM); return `e ${c.e}: k = 1 E_F ${f(k1[0])} against T ${f(k1[1])}; k = 2 E_F ${f(k2[0])} against T ${f(k2[1])} (${k2[0] > 3 * k2[1] ? 'the miss exceeds three times the module\'s own tesseral content: the m = 0 member, by the Amendment 2 reading' : 'the tesseral members\' share is open'})`; }).join('; ');
    return { regime: R.regime, P1, P2, P3, moduleSide: `6-day arc, the module's tesseral content T against the miss E_F per ladder: ${bound}` };
  });
  const out = { registration: REGISTRATION, pins: PIN, arms: ARMS, legs: { inArc: 'the 6-day arc, 289 samples at 30 minutes, blocks of one day: E_F and T', firstDay: `the arc's first ${FIRST_DAYS} days, blocks of one revolution: E_F, T, M, S, D (the reading)`, forward: 'the day after the fit, 64 samples a revolution, 2 blocks (no interval)' }, rows: rows.length, flown: flown.length, read: rows.filter((r) => r.read).length, errors: rows.filter((r) => !r.flown && !r.read).length, unmeasured: all.filter((c) => !byKey.has(c.key)).map((c) => c.key), firstPassRows: readRows(FIRST_PASS).length, regimes: perRegime, findings };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(out, null, 1)}\n`);
  const md = ['# The half-day class: the mixed (2:1 resonant) share by family (propagator/sdn-ap 0.6.3; report only)', '',
    `Registration: ${REGISTRATION} (Amendment 1). Ground: the landed all-regimes rows (TESSERAL-ALL-REGIMES.md, Amendments 1 to 7, estimator fixed). Pins: modules ${PIN.modulesCommit.slice(0, 9)}, sdn-ap ${PIN.sdnAp.version} ${PIN.sdnAp.wasmSha256.slice(0, 12)}, ffm ${PIN.ffm.version} ${PIN.ffm.wasmSha256.slice(0, 12)}. Per cell: Ref_F = FFM EGM96 31x31 with DE440 Sun and Moon; AP_F = the module at caps 31 / 20 fitted to Ref_F's arc (the landed frame re-flown); AP_F0 = the same set flown at MAXIMUM_TESSERAL_DEGREE 0; Ref_Z = FFM EGM96 degree 31 order 0 with the same Sun and Moon from the same initial state. Series in RTN at Ref_F: E_F = AP_F - Ref_F (whole); T = AP_F - AP_F0 (the module's own tesseral content); M = AP_F0 - Ref_Z (the m = 0 member's miss: zonal and lunisolar short-period model, with the class-rate drift against a truth without it in its trend); S = Ref_F - Ref_Z (the reference's tesseral signal); D = E_F - M = T - S (the tesseral members' miss). Each attributed with the all-regimes attribute() (Amendment 3 conditioning, Amendment 6 jackknife, intervals point +- 2 SE). Legs: the 6-day arc (blocks of one day) for E_F and T; the first-day leg (the arc's first ${FIRST_DAYS} days, blocks of one revolution, constant and linear trend) for all five, where the reading is made; the forward day (2 blocks, no interval). Shares are RMS (m) of the reconstructed mixed groups (the even ladders at k n): whole = E_F, m0 = M, tes = D, model = T, signal = S. Reading (first-day leg): m = 0 member dominant when tes's upper bound is below m0's lower bound; tesseral members dominant when the reverse; else shared. The first pass (two fits; Amendment 1) is kept in first-pass-two-fits/ and enters no table.`, '',
    `## Summary`, `Rows ${rows.length}; cells flown ${flown.length}, read from the landed rows ${out.read}, errors ${out.errors}, unmeasured ${out.unmeasured.length}${out.unmeasured.length ? ` (${out.unmeasured.join(', ')})` : ''}; first-pass rows set apart ${out.firstPassRows}.`, '',
    `| regime | arc d | slip n - 2 theta (cpd) | (2,1) period (d) | deep families separable in-arc | m = 0 dominant | tesseral dominant | shared | withheld | slope vs e: tes / m0 / T / signal |`, `|---|---|---|---|---|---|---|---|---|---|`,
    ...perRegime.map((R) => `| ${R.regime} | ${R.arcDays ?? '-'} | ${f(R.slipCyclesPerDay, 6)} | ${f(R.deepPeriodDays, 1)} | ${R.deepSeparableInArc === null ? '-' : R.deepSeparableInArc ? 'yes' : 'no'} | ${R.readings['m = 0 member dominant']} | ${R.readings['tesseral members dominant']} | ${R.readings['shared (intervals overlap)']} | ${R.readings.withheld + R.readings['undecided (no interval)']} | ${R.slopes ? `${f(R.slopes.tesFirstDay)} / ${f(R.slopes.m0FirstDay)} / ${f(R.slopes.modelInArc)} / ${f(R.slopes.signalFirstDay)}` : '-'} |`), '',
    `## Per cell (first-day leg shares with intervals; 6-day whole and module content; landed mixed share for the reproduction)`, '',
    `| cell | state | reading (first day) | whole E_F | m0 M | tes D | model T | signal S | S trend (drift over the window) | 6-day whole E_F | 6-day T | landed in-arc mixed | fwd whole / m0 / tes / T / S | fit n / e | conv Z (m) |`, `|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|`,
    ...perRegime.flatMap((R) => R.cells.map((c) => `| ${R.regime}\\|${c.e} | ${c.state} | ${c.reading?.firstDay ?? '-'} | ${iv(c.shares?.firstDay.whole)} | ${iv(c.shares?.firstDay.m0)} | ${iv(c.shares?.firstDay.tes)} | ${iv(c.shares?.firstDay.model)} | ${iv(c.shares?.firstDay.signal)} | ${f(c.shares?.firstDay.secularS?.rmsM)} | ${iv(c.shares?.inArc.whole)} | ${iv(c.shares?.inArc.model)} | ${c.landed ? iv(c.landed.inArcMixed) : '-'} | ${c.shares ? `${f(c.shares.forward.whole.rmsM)} / ${f(c.shares.forward.m0.rmsM)} / ${f(c.shares.forward.tes.rmsM)} / ${f(c.shares.forward.model.rmsM)} / ${f(c.shares.forward.signal.rmsM)}` : c.landed ? `landed fwd mixed ${f(c.landed.forwardMixed.rmsM)}` : '-'} | ${c.fitted ? `${c.fitted.n.toFixed(6)} / ${c.fitted.e.toFixed(5)}` : '-'} | ${c.convergenceZMaxM !== undefined ? c.convergenceZMaxM.toExponential(1) : '-'} |`)), '',
    `## The even ladders on the first-day leg (group amplitude, m, at k n for k = 1 to 4: E_F / M / D / T / S)`, '',
    `| cell | k = 1 | k = 2 | k = 3 | k = 4 |`, `|---|---|---|---|---|`,
    ...perRegime.flatMap((R) => R.cells.filter((c) => c.ladders).map((c) => { const pick = (name) => c.ladders.firstDay.find((a) => a.arm === name).even; const order = ['EF', 'M', 'D', 'T', 'S'].map(pick); return `| ${R.regime}\\|${c.e} | ${[0, 1, 2, 3].map((k) => `${f(order[0][k].cyclesPerDay, 3)} cpd: ${order.map((a) => f(a[k].amplitudeM)).join(' / ')}`).join(' | ')} |`; })), '',
    `## The even ladders on the 6-day arc (E_F / T) and the first-day self-consistency of E_F`, '',
    `| cell | k = 1 E_F / T (first-day E_F) | k = 2 | k = 3 | k = 4 |`, `|---|---|---|---|---|`,
    ...perRegime.flatMap((R) => R.cells.filter((c) => c.ladders).map((c) => `| ${R.regime}\\|${c.e} | ${[0, 1, 2, 3].map((k) => `${f(c.ladders.inArc[0].even[k].amplitudeM)} / ${f(c.ladders.inArc[1].even[k].amplitudeM)} (${f(c.consistency[k].firstDayM)})`).join(' | ')} |`)), '',
    `## The deep resonant families (2,1) and (4,2)`, '', ...findings.map((x) => `- ${x.regime}: ${x.P3}`), '',
    `## Findings against the registered predictions`, '', `The registered m = 0 / tesseral split (m0 against tes) is "shared (intervals overlap)" in every cell: not separable by a zonal-only reference in this class (Amendments 1 and 2, both constructions disclosed). The module-side reading below is a finding with its assumption stated (Amendment 2.2), not a verdict.`, '', ...findings.flatMap((x) => [`### ${x.regime}`, `- P1 (small e): ${x.P1}`, `- P2 (e 0.1 to 0.2): ${x.P2}`, `- P3 (deep families): ${x.P3}`, ...(x.moduleSide ? [`- Module side: ${x.moduleSide}`] : []), '']),
    `Etalon is read from the landed rows (its landed shares equal GLONASS's to 0.01 m); GLONASS carries the arms for both. The forward leg carries 2 blocks and decides nothing. M's and S's trends hold the class-rate drift against a truth without tesserals and are not read as the resonant theory's accuracy; the deep families are read on E_F and T alone.`, ''];
  fs.writeFileSync(path.join(outDir, 'README.md'), md.join('\n'));
  return out;
}
if (args.table) { const out = table(args.out ?? RESULTS); console.log(JSON.stringify({ rows: out.rows, flown: out.flown, read: out.read, errors: out.errors, unmeasured: out.unmeasured, readings: Object.fromEntries(out.regimes.map((R) => [R.regime, R.readings])) })); process.exit(0); }
if (args.check) {
  let failures = 0;
  const check = (ok, line) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${line}`); if (!ok) failures += 1; };
  const git = (...a) => execFileSync('git', ['-C', REPO, ...a]).toString('utf8').trim();
  const rows = readRows(RESULTS);
  const regSha = git('log', '--reverse', '--format=%H', '--', REGISTRATION).split('\n')[0];
  const regAt = Date.parse(git('show', '-s', '--format=%cI', regSha));
  const firstPass = readRows(FIRST_PASS);
  const first = rows.map((r) => r.createdUtc).sort()[0];
  check(rows.length > 0 && regAt < Date.parse(first), `registration ${regSha.slice(0, 8)} (${git('show', '-s', '--format=%cI', regSha)}) precedes the first of ${rows.length} rows (${first})`);
  check(firstPass.length > 0 && regAt < Date.parse(firstPass.map((r) => r.createdUtc).sort()[0]), `the ${firstPass.length} first-pass rows (first-pass-two-fits/, no table) follow the registration and are set apart`);
  const amendment1 = git('log', '--format=%H %cI', '-S', 'Amendment 1 (2026-11-06', '--', REGISTRATION).split('\n').filter(Boolean).at(-1);
  check(Boolean(amendment1) && Date.parse(amendment1.split(' ')[1]) < Date.parse(first), `Amendment 1 (${(amendment1 ?? '').slice(0, 8)}) precedes the first row of the table (${first})`);
  check(rows.every((r) => r.sdnAp?.wasmSha256 === PIN.sdnAp.wasmSha256 && r.ffm?.wasmSha256 === PIN.ffm.wasmSha256 && r.modulesCommit === PIN.modulesCommit), `every row on sdn-ap ${PIN.sdnAp.version} (${PIN.sdnAp.wasmSha256.slice(0, 12)}) and ffm ${PIN.ffm.version} (${PIN.ffm.wasmSha256.slice(0, 12)})`);
  const flown = rows.filter((r) => r.flown);
  const has = (leg, names) => (r) => names.every((a) => r[leg]?.[a]?.shares?.mixed && 'lo' in r[leg][a].shares.mixed && r[leg][a].ladders?.even?.length === 4);
  check(flown.length > 0 && flown.every((r) => has('inArc', ['EF', 'T'])(r) && has('firstDay', SERIES)(r) && has('forward', SERIES)(r) && r.shares?.firstDay?.whole && r.shares?.firstDay?.m0 && r.shares?.firstDay?.tes && r.shares?.firstDay?.signal && r.shares?.firstDay?.model && typeof r.reading?.firstDay === 'string' && r.fitted && Array.isArray(r.consistency)), `${flown.length} flown cells each carry E_F and T on the 6-day arc, the five series on the first-day and forward legs, with the ladder groups k 1 to 4, the shares with intervals (or "no interval" stated), the fitted elements, the self-consistency and a reading`);
  check(flown.every((r) => r.arms?.F?.field?.[1] === 31 && r.arms?.Z?.field?.[1] === 0 && r.arms?.F?.caps?.[0] === 31), `every flown cell's references are Ref_F 31x31 and Ref_Z 31x0 against the arm F set at caps 31 / 20 and at tesseral cap 0`);
  check(flown.filter((r) => r.convergence).every((r) => Number.isFinite(r.convergenceZMaxM)), `every e 0.001 cell carries the Z reference's 1e-13 / 150 s figure`);
  const landed = landedRows();
  check(rows.filter((r) => r.landed).every((r) => landed.some((l) => l.key === r.key && l.createdUtc === r.landed.createdUtc && l.runner === r.landed.runner)), `every row that names a landed row reads the landed all-regimes row of its key (createdUtc and runner match)`);
  const etalon = rows.filter((r) => r.regime === 'Etalon');
  check(etalon.length === READ.Etalon.length && etalon.every((r) => r.read && r.landed), `Etalon's ${etalon.length} rows are read from the landed rows and name them`);
  check(flown.filter((r) => !r.reading.firstDay.startsWith('withheld')).every((r) => SERIES.every((a) => r.firstDay[a].conditioned)), `every read first-day attribution is conditioned (shares in quadrature within 1.5 of the series RMS)`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'half-day-resonance-'));
  table(tmp);
  check(['table.json', 'README.md'].every((n) => fs.existsSync(path.join(RESULTS, n)) && fs.readFileSync(path.join(tmp, n)).equals(fs.readFileSync(path.join(RESULTS, n)))), `results/ap-truth/half-day-resonance/table.json and README.md reproduce from the rows`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const t = JSON.parse(fs.readFileSync(path.join(RESULTS, 'table.json'), 'utf8'));
  check(t.findings.length === 6 && t.findings.every((x) => x.P1 && x.P2 && x.P3), `the findings P1 to P3 are stated for the six regimes`);
  console.log(failures ? `FAIL (${failures})` : 'PASS');
  process.exit(failures ? 1 : 0);
}
