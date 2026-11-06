// HALF-DAY-RESONANCE.md: the half-day class's mixed (2:1 resonant) share by family (report only). Per cell the full arm (the landed
// frame re-flown), the zonal-only arm (reference EGM96 31x0 with the Sun and Moon against the module at tesseral cap 0), the difference
// series D = E_F - E_Z (the m > 0 members' miss) and the reference's own tesseral signal S = Ref_F - Ref_Z, each attributed with the
// all-regimes record's exported attribute() unchanged (Amendment 7: the estimator is fixed).
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
const DAY = 86400000, THETA = 1.00273781;
export const ARMS = { F: { field: [31, 31], caps: [31, 20] }, Z: { field: [31, 0], caps: [0, 20] } };
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
/** The reading rule (HALF-DAY-RESONANCE.md): in-arc, m0 = E_Z mixed, tes = D mixed. */
export function reading(EF, EZ, D) {
  if (!(EF.conditioned && EZ.conditioned && D.conditioned)) return 'withheld (estimator)';
  const m0 = mixedShare(EZ), tes = mixedShare(D);
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
      const arm = async (name) => {
        const fixture = { ...base, name: `${c.key}|${name}`, field: ARMS[name].field, forces: ARMS[name].caps };
        const r = await runModelTruth(fixture);
        const set = Buffer.from(r.omm, 'base64');
        const arcOem = OEM.getRootAsOEM(new fb.ByteBuffer((await runModelTruth({ ...fixture, fitInput: true })).ephemeris.payload)).unpack().EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES;
        const arcFlown = await fly(set, arcOem.map((l) => l.EPOCH));
        return { fixture, r, arcOem, arcFlown, fwdFlown: r.flown.map((s) => s.slice(0, 3)), fwdRef: r.referenceStates };
      };
      const F = await arm('F'), Z = await arm('Z');
      row.slipCyclesPerDay = slip(F.r.fitted.n);
      row.fitted = { F: F.r.fitted, Z: Z.r.fitted };
      row.initialGcrfKm = F.r.fixture.initialGcrfKm;
      // In-arc (6 days, 30-minute samples): the four series in RTN at Ref_F (E_Z at Ref_Z), from the inertial vectors.
      const arcTau = F.arcOem.map((l) => (Date.parse(`${l.EPOCH}Z`) - Date.parse(`${F.arcOem[0].EPOCH}Z`)) / DAY);
      const refF = F.arcOem.map((l) => ({ p: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] })), refZ = Z.arcOem.map((l) => ({ p: [l.X, l.Y, l.Z], v: [l.X_DOT, l.Y_DOT, l.Z_DOT] }));
      if (Z.arcOem.some((l, k) => l.EPOCH !== F.arcOem[k].EPOCH)) throw new Error('the two arms sample different arc epochs');
      const series = (n, apF, rF, apZ, rZ) => {
        const EF = [], EZ = [], D = [], S = [];
        for (let k = 0; k < n; k += 1) {
          const eF = sub(apF[k], rF[k].p), eZ = sub(apZ[k], rZ[k].p);
          EF.push(AR.rtnOf(eF, rF[k].p, rF[k].v)); EZ.push(AR.rtnOf(eZ, rZ[k].p, rZ[k].v));
          D.push(AR.rtnOf(sub(eF, eZ), rF[k].p, rF[k].v)); S.push(AR.rtnOf(sub(rF[k].p, rZ[k].p), rF[k].p, rF[k].v));
        }
        return { EF, EZ, D, S };
      };
      const arc = series(F.arcOem.length, F.arcFlown, refF, Z.arcFlown, refZ);
      const nFit = F.r.fitted.n;
      const leg = (ser, tau, windowDays, blockDays) => Object.fromEntries(Object.entries(ser).map(([name, s]) => { const a = AR.attribute(tau, s, nFit, windowDays, blockDays); return [name, { rmsM: rms(s.map((p) => Math.hypot(...p))), maxM: Math.max(...s.map((p) => Math.hypot(...p))), ...a, ladders: ladders(a) }]; }));
      const inArc = { samples: arc.EF.length, ...leg(arc, arcTau, c.arcDays, 1) };
      // Forward day: 64 samples a revolution.
      const fwdRefF = F.fwdRef.map((s) => ({ p: s.position, v: s.velocity })), fwdRefZ = Z.fwdRef.map((s) => ({ p: s.position, v: s.velocity }));
      const tau = F.r.profile.map((p) => p.h / 24);
      const fwd = series(F.fwdFlown.length, F.fwdFlown, fwdRefF, Z.fwdFlown, fwdRefZ);
      const forward = { samples: fwd.EF.length, gridSeconds: AR.gridSeconds(c.n), ...leg(fwd, tau, 1, 1 / nFit) };
      const shares = (L) => ({ whole: mixedShare(L.EF), m0: mixedShare(L.EZ), tes: mixedShare(L.D), signal: mixedShare(L.S), secularEF: L.EF.shares.secular, secularD: L.D.shares.secular, tesseralEF: L.EF.shares.tesseral });
      Object.assign(row, { flown: true, inArc, forward, shares: { inArc: shares(inArc), forward: shares(forward) }, reading: { inArc: reading(inArc.EF, inArc.EZ, inArc.D), forward: reading(forward.EF, forward.EZ, forward.D) },
        reproduction: land ? { inArcMixedM: inArc.EF.shares.mixed.rmsM - land.inArc.shares.mixed.rmsM, forwardMixedM: forward.EF.shares.mixed.rmsM - land.forward.shares.mixed.rmsM } : null,
        reference: `propagator/ffm ${PIN.ffm.version}: EGM96 31x31 (F) and 31x0 (Z), Sun and Moon point masses (DE440), no drag, SRP, tides, relativity or Earth radiation; RK78 rel 1e-12 abs 1e-9, steps 0.01 to 300 s; zero EOP`,
        referenceIntegrator: F.r.fixture.referenceIntegrator, kernelSha256: F.r.kernelSha256 });
      if (c.convergence) {
        const r2 = await runModelTruth({ ...Z.fixture, referenceTolerance: 1e-13, referenceMaxStep: 150 });
        row.convergenceZMaxM = Math.max(...Z.fwdRef.map((s, k) => Math.hypot(...s.position.map((x, ax) => (x - r2.referenceStates[k].position[ax]) * 1000))));
      }
      row.seconds = (Date.now() - t0) / 1000;
      fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
      const sh = (s) => `whole ${f(s.whole.rmsM)} [${f(s.whole.lo?.rmsM)},${f(s.whole.hi?.rmsM)}] m0 ${f(s.m0.rmsM)} [${f(s.m0.lo?.rmsM)},${f(s.m0.hi?.rmsM)}] tes ${f(s.tes.rmsM)} [${f(s.tes.lo?.rmsM)},${f(s.tes.hi?.rmsM)}] signal ${f(s.signal.rmsM)}`;
      const lad = (L) => L.EF.ladders.even.map((g, k) => `k${g.k} EF ${f(g.amplitudeM)} EZ ${f(L.EZ.ladders.even[k].amplitudeM)} D ${f(L.D.ladders.even[k].amplitudeM)} S ${f(L.S.ladders.even[k].amplitudeM)}`).join('; ');
      console.log(c.key, row.reading.inArc, `| in-arc ${sh(row.shares.inArc)} | ${lad(inArc)} | fwd ${sh(row.shares.forward)} | fit n F ${F.r.fitted.n.toFixed(6)} Z ${Z.r.fitted.n.toFixed(6)} | repro ${f(row.reproduction?.inArcMixedM)}/${f(row.reproduction?.forwardMixedM)}`, row.convergenceZMaxM !== undefined ? `convZ ${row.convergenceZMaxM.toExponential(1)}` : '', `${row.seconds.toFixed(0)} s`);
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
    const readings = fl.map((r) => r.reading.inArc);
    const count = (s) => readings.filter((x) => x === s).length;
    const deep = fl.length ? { inArcEF: fl.map((r) => ({ e: r.e, '(2,1)': r.inArc.EF.ladders.deep['(2,1)'], '(4,2)': r.inArc.EF.ladders.deep['(4,2)'] })), inArcS: fl.map((r) => ({ e: r.e, '(2,1)': r.inArc.S.ladders.deep['(2,1)'], '(4,2)': r.inArc.S.ladders.deep['(4,2)'] })), secularEF: fl.map((r) => ({ e: r.e, rmsM: r.inArc.EF.shares.secular.rmsM, lo: r.inArc.EF.shares.secular.lo?.rmsM, hi: r.inArc.EF.shares.secular.hi?.rmsM })) } : null;
    const slip_ = fl[0]?.slipCyclesPerDay ?? (name === 'Etalon' ? slip(cs.find((r) => r.landed)?.landed?.fitted?.n ?? NaN) : null);
    const separable = Number.isFinite(slip_) ? Math.abs(slip_) >= 1.5 / (cs[0]?.arcDays ?? 6) : null;
    return {
      regime: name, arcDays: cs[0]?.arcDays, slipCyclesPerDay: slip_, deepPeriodDays: Number.isFinite(slip_) && slip_ !== 0 ? 1 / Math.abs(slip_) : null, deepSeparableInArc: separable,
      cells: cs.map((r) => ({ e: r.e, state: r.flown ? 'flown' : r.read ? 'read (landed)' : r.error ? `error: ${r.error}` : 'unmeasured', reading: r.reading ?? null, fitted: r.fitted ?? null, shares: r.shares ?? null, landed: r.landed ? { inArcMixed: r.landed.inArcMixed, forwardMixed: r.landed.forwardMixed, verdict: r.landed.verdict } : null, reproduction: r.reproduction ?? null, ladders: r.flown ? { inArc: ['EF', 'EZ', 'D', 'S'].map((a) => ({ arm: a, even: r.inArc[a].ladders.even })), forward: ['EF', 'EZ', 'D', 'S'].map((a) => ({ arm: a, even: r.forward[a].ladders.even })) } : null, conditioned: r.flown ? { inArc: ['EF', 'EZ', 'D', 'S'].map((a) => r.inArc[a].conditioned), forward: ['EF', 'EZ', 'D', 'S'].map((a) => r.forward[a].conditioned) } : null, convergenceZMaxM: r.convergenceZMaxM, createdUtc: r.createdUtc })),
      readings: { 'm = 0 member dominant': count('m = 0 member dominant'), 'tesseral members dominant': count('tesseral members dominant'), 'shared (intervals overlap)': count('shared (intervals overlap)'), withheld: count('withheld (estimator)') },
      slopes: fl.length ? { tesInArc: slope(fl.map((r) => [r.e, r.shares.inArc.tes.rmsM])), m0InArc: slope(fl.map((r) => [r.e, r.shares.inArc.m0.rmsM])), wholeInArc: slope(fl.map((r) => [r.e, r.shares.inArc.whole.rmsM])), signalInArc: slope(fl.map((r) => [r.e, r.shares.inArc.signal.rmsM])) } : null,
      deep,
    };
  });
  // P1 to P3 per regime (the registered reading rule).
  const findings = perRegime.map((R) => {
    const fl = R.cells.filter((c) => c.state === 'flown');
    if (!fl.length) return { regime: R.regime, P1: R.regime === 'Etalon' ? 'read from GLONASS (its landed rows equal GLONASS to 0.01 m)' : 'unmeasured', P2: '-', P3: '-' };
    const small = fl.filter((c) => c.e <= 0.01), large = fl.filter((c) => c.e >= 0.1);
    const summar = (cs) => cs.map((c) => `e ${c.e}: ${c.reading.inArc} (m0 ${f(c.shares.inArc.m0.rmsM)}, tes ${f(c.shares.inArc.tes.rmsM)}, whole ${f(c.shares.inArc.whole.rmsM)} m)`).join('; ');
    const P1 = `at small e: ${summar(small)}`;
    const P2 = `at e 0.1 to 0.2: ${summar(large)}; slope of tes against e ${f(R.slopes.tesInArc)}, of m0 ${f(R.slopes.m0InArc)}, of the reference signal ${f(R.slopes.signalInArc)}`;
    const d21 = fl.map((c) => { const g = R.deep.inArcEF.find((x) => x.e === c.e)['(2,1)'], s = R.deep.inArcS.find((x) => x.e === c.e)['(2,1)']; return g ? `e ${c.e}: (2,1) group ${g.cyclesPerDay} cpd E_F ${f(g.amplitudeM)} m against the signal ${f(s?.amplitudeM)} m` : null; }).filter(Boolean);
    const P3 = R.deepSeparableInArc ? d21.join('; ') : `not separable from the trend on ${R.arcDays} days (period ${f(R.deepPeriodDays, 0)} days); E_F in-arc secular share bounds them: ${R.deep.secularEF.map((x) => `e ${x.e}: ${f(x.rmsM)} m`).join(', ')}`;
    return { regime: R.regime, P1, P2, P3 };
  });
  const out = { registration: REGISTRATION, pins: PIN, arms: ARMS, rows: rows.length, flown: flown.length, read: rows.filter((r) => r.read).length, errors: rows.filter((r) => !r.flown && !r.read).length, unmeasured: all.filter((c) => !byKey.has(c.key)).map((c) => c.key), regimes: perRegime, findings };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'table.json'), `${JSON.stringify(out, null, 1)}\n`);
  const md = ['# The half-day class: the mixed (2:1 resonant) share by family (propagator/sdn-ap 0.6.3; report only)', '',
    `Registration: ${REGISTRATION}. Ground: the landed all-regimes rows (TESSERAL-ALL-REGIMES.md, Amendments 1 to 7, estimator fixed). Pins: modules ${PIN.modulesCommit.slice(0, 9)}, sdn-ap ${PIN.sdnAp.version} ${PIN.sdnAp.wasmSha256.slice(0, 12)}, ffm ${PIN.ffm.version} ${PIN.ffm.wasmSha256.slice(0, 12)}. Arms per cell: F = FFM EGM96 31x31 with DE440 Sun and Moon against the module at caps 31 / 20 (the landed frame re-flown); Z = FFM EGM96 degree 31 order 0 with the same Sun and Moon from the same initial state against the module at caps 0 / 20; D = E_F - E_Z (the m > 0 members' miss); S = Ref_F - Ref_Z (the reference's tesseral signal); all four attributed with the all-regimes attribute() (Amendment 3 conditioning, Amendment 6 jackknife, intervals point +- 2 SE; in-arc 6 days of 30-minute samples in blocks of one day; forward 64 samples a revolution, 2 blocks, no interval). Shares are RMS (m) of the reconstructed mixed groups (the even ladders at k n): whole = E_F, m0 = E_Z (the zonal and lunisolar short-period model, m = 0), tes = D (the tesseral members), signal = S. Reading (in-arc): m = 0 member dominant when tes's upper bound is below m0's lower bound; tesseral members dominant when the reverse; else shared.`, '',
    `## Summary`, `Rows ${rows.length}; cells flown ${flown.length}, read from the landed rows ${out.read}, errors ${out.errors}, unmeasured ${out.unmeasured.length}${out.unmeasured.length ? ` (${out.unmeasured.join(', ')})` : ''}.`, '',
    `| regime | arc d | slip n - 2 theta (cpd) | (2,1) period (d) | deep families separable in-arc | m = 0 dominant | tesseral dominant | shared | withheld | slope tes / m0 / signal vs e |`, `|---|---|---|---|---|---|---|---|---|---|`,
    ...perRegime.map((R) => `| ${R.regime} | ${R.arcDays ?? '-'} | ${f(R.slipCyclesPerDay, 6)} | ${f(R.deepPeriodDays, 1)} | ${R.deepSeparableInArc === null ? '-' : R.deepSeparableInArc ? 'yes' : 'no'} | ${R.readings['m = 0 member dominant']} | ${R.readings['tesseral members dominant']} | ${R.readings['shared (intervals overlap)']} | ${R.readings.withheld} | ${R.slopes ? `${f(R.slopes.tesInArc)} / ${f(R.slopes.m0InArc)} / ${f(R.slopes.signalInArc)}` : '-'} |`), '',
    `## Per cell (in-arc shares with intervals; forward beside; landed mixed share for the reproduction)`, '',
    `| cell | state | reading in-arc | whole E_F | m0 E_Z | tes D | signal S | landed in-arc mixed | fwd whole / m0 / tes / signal | fit n F / Z | fit e F / Z | conv Z (m) |`, `|---|---|---|---|---|---|---|---|---|---|---|---|`,
    ...perRegime.flatMap((R) => R.cells.map((c) => `| ${R.regime}\\|${c.e} | ${c.state} | ${c.reading?.inArc ?? '-'} | ${iv(c.shares?.inArc.whole)} | ${iv(c.shares?.inArc.m0)} | ${iv(c.shares?.inArc.tes)} | ${iv(c.shares?.inArc.signal)} | ${c.landed ? iv(c.landed.inArcMixed) : '-'} | ${c.shares ? `${f(c.shares.forward.whole.rmsM)} / ${f(c.shares.forward.m0.rmsM)} / ${f(c.shares.forward.tes.rmsM)} / ${f(c.shares.forward.signal.rmsM)}` : c.landed ? `landed fwd mixed ${f(c.landed.forwardMixed.rmsM)}` : '-'} | ${c.fitted ? `${c.fitted.F.n.toFixed(6)} / ${c.fitted.Z.n.toFixed(6)}` : '-'} | ${c.fitted ? `${c.fitted.F.e.toFixed(5)} / ${c.fitted.Z.e.toFixed(5)}` : '-'} | ${c.convergenceZMaxM !== undefined ? c.convergenceZMaxM.toExponential(1) : '-'} |`)), '',
    `## The even ladders in-arc (group amplitude, m, at k n for k = 1 to 4: E_F / E_Z / D / S)`, '',
    `| cell | k = 1 | k = 2 | k = 3 | k = 4 |`, `|---|---|---|---|---|`,
    ...perRegime.flatMap((R) => R.cells.filter((c) => c.ladders).map((c) => `| ${R.regime}\\|${c.e} | ${[0, 1, 2, 3].map((k) => `${f(c.ladders.inArc[0].even[k].cyclesPerDay, 3)} cpd: ${c.ladders.inArc.map((a) => f(a.even[k].amplitudeM)).join(' / ')}`).join(' | ')} |`)), '',
    `## The deep resonant families (2,1) and (4,2)`, '', ...findings.map((x) => `- ${x.regime}: ${x.P3}`), '',
    `## Findings against the registered predictions`, '', ...findings.flatMap((x) => [`### ${x.regime}`, `- P1 (small e): ${x.P1}`, `- P2 (e 0.1 to 0.2): ${x.P2}`, `- P3 (deep families): ${x.P3}`, '']),
    `Etalon is read from the landed rows (its landed shares equal GLONASS's to 0.01 m); GLONASS carries the arms for both. The forward leg carries 2 blocks and decides nothing. The Z arm's trend holds the SGP4XP native class terms against a reference without tesserals and is not read as the resonant theory's accuracy; the deep families are read on E_F alone.`, ''];
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
  const first = rows.map((r) => r.createdUtc).sort()[0];
  check(rows.length > 0 && regAt < Date.parse(first), `registration ${regSha.slice(0, 8)} (${git('show', '-s', '--format=%cI', regSha)}) precedes the first of ${rows.length} rows (${first})`);
  check(rows.every((r) => r.sdnAp?.wasmSha256 === PIN.sdnAp.wasmSha256 && r.ffm?.wasmSha256 === PIN.ffm.wasmSha256 && r.modulesCommit === PIN.modulesCommit), `every row on sdn-ap ${PIN.sdnAp.version} (${PIN.sdnAp.wasmSha256.slice(0, 12)}) and ffm ${PIN.ffm.version} (${PIN.ffm.wasmSha256.slice(0, 12)})`);
  const flown = rows.filter((r) => r.flown);
  const arms = ['EF', 'EZ', 'D', 'S'];
  check(flown.length > 0 && flown.every((r) => ['inArc', 'forward'].every((leg) => arms.every((a) => r[leg]?.[a]?.shares?.mixed && 'lo' in r[leg][a].shares.mixed && r[leg][a].ladders?.even?.length === 4)) && r.shares?.inArc?.whole && r.shares?.inArc?.m0 && r.shares?.inArc?.tes && r.shares?.inArc?.signal && typeof r.reading?.inArc === 'string' && r.fitted?.F && r.fitted?.Z), `${flown.length} flown cells each carry the four attributions (E_F, E_Z, D, S) in-arc and forward with the ladder groups k 1 to 4, the shares with intervals (or "no interval" stated), both arms' fitted elements and a reading`);
  check(flown.every((r) => r.arms?.F?.field?.[1] === 31 && r.arms?.Z?.field?.[1] === 0 && r.arms?.Z?.caps?.[0] === 0 && r.arms?.F?.caps?.[0] === 31), `every flown cell's arms are F = 31x31 against caps 31 / 20 and Z = 31x0 against caps 0 / 20`);
  check(flown.filter((r) => r.convergence).every((r) => Number.isFinite(r.convergenceZMaxM)), `every e 0.001 cell carries the Z reference's 1e-13 / 150 s figure`);
  const landed = landedRows();
  check(rows.filter((r) => r.landed).every((r) => landed.some((l) => l.key === r.key && l.createdUtc === r.landed.createdUtc && l.runner === r.landed.runner)), `every row that names a landed row reads the landed all-regimes row of its key (createdUtc and runner match)`);
  const etalon = rows.filter((r) => r.regime === 'Etalon');
  check(etalon.length === READ.Etalon.length && etalon.every((r) => r.read && r.landed), `Etalon's ${etalon.length} rows are read from the landed rows and name them`);
  check(flown.filter((r) => !r.reading.inArc.startsWith('withheld')).every((r) => arms.every((a) => r.inArc[a].conditioned)), `every read in-arc attribution is conditioned (shares in quadrature within 1.5 of the series RMS)`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'half-day-resonance-'));
  table(tmp);
  check(['table.json', 'README.md'].every((n) => fs.existsSync(path.join(RESULTS, n)) && fs.readFileSync(path.join(tmp, n)).equals(fs.readFileSync(path.join(RESULTS, n)))), `results/ap-truth/half-day-resonance/table.json and README.md reproduce from the rows`);
  fs.rmSync(tmp, { recursive: true, force: true });
  const t = JSON.parse(fs.readFileSync(path.join(RESULTS, 'table.json'), 'utf8'));
  check(t.findings.length === 6 && t.findings.every((x) => x.P1 && x.P2 && x.P3), `the findings P1 to P3 are stated for the six regimes`);
  console.log(failures ? `FAIL (${failures})` : 'PASS');
  process.exit(failures ? 1 : 0);
}
