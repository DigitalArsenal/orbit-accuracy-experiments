#!/usr/bin/env node
// E4 step 30 (amendment A6): the half-split closure gate of the ephemeris
// fitter (harness/ephemeris-fit.mjs) on randomized data that
// propagator/hpop generates with every perturbation on and no maneuver.
// Owner, 2026-10-10: "The fitter (OD) should be able to start with the first
// half of any data and reproduce the second half within 1 cm", "Using all the
// different perturbations", "If no maneuvers". A case passes when the fitter
// keeps the arc as one segment and the largest 3D difference over every
// point after the split is at most config.a6.gate.maxClosureM.
//
// Each case draws an orbit class, an epoch, a span (one orbit to seven
// days), a sample step, a representation (GCRF or EME2000 tags, exact or
// rounded to 1 mm and 1 um/s) and the force parameters the fitter solves for
// (its parameterSet for the span before the split, so the fitter can
// estimate every generating parameter). propagator/hpop generates the arc
// from Keplerian elements converted by foundation/frames, at a tighter
// tolerance and half the step the fitter uses. The drivers are those
// released at the arc's start, for generation and fit alike.
//
//   node experiments/e4-operator-ephemeris-parity/steps/30-closure-gate.mjs --modules <checkout> [--shard 0/4] [--cases 48] [--seed 20261010]
//   node experiments/e4-operator-ephemeris-parity/steps/30-closure-gate.mjs --summarize   (--list prints the cases)
// Output: runs/cache/e4-a6-gate/<seed>/shard-<i>.jsonl (resumable), then
// results/e4/a6/closure-gate.json (committed).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { modulesRoot } from '../../../harness/modules.mjs';
import { ephemerisFitEnv, fitEphemeris, forcesFor, parameterSet, propagate, segmentSetup, SETTINGS, VERSION } from '../../../harness/ephemeris-fit.mjs';
import { convertRepresentation, fromGcrf } from '../../../harness/frames.mjs';
import { config, configPath } from '../common.mjs';

const { values } = parseArgs({ options: { modules: { type: 'string' }, shard: { type: 'string', default: '0/1' }, cases: { type: 'string' }, seed: { type: 'string' }, summarize: { type: 'boolean' }, list: { type: 'boolean' } } });
const G = config.a6.gate;
const seed = Number(values.seed ?? G.seed), cases = Number(values.cases ?? G.cases);
const cacheDir = path.join(repoRoot, 'runs', 'cache', 'e4-a6-gate', String(seed));
const R_EARTH_KM = 6378.137, MU = 398600.4418;
const iso = (ms) => new Date(ms).toISOString();

// mulberry32: the case list depends only on the seed.
function rng(s) {
  let a = s >>> 0;
  return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function caseList() {
  const r = rng(seed);
  const uni = ([a, b]) => a + (b - a) * r();
  const logUni = ([a, b]) => Math.exp(Math.log(a) + (Math.log(b) - Math.log(a)) * r());
  const pick = (list) => list[Math.floor(r() * list.length)];
  const classes = Object.keys(G.classes);
  const out = [];
  for (let i = 0; i < cases; ++i) {
    const name = classes[i % classes.length];
    const c = G.classes[name];
    let aKm, e;
    if (c.perigeeKm && c.apogeeKm) { const rp = R_EARTH_KM + uni(c.perigeeKm), ra = R_EARTH_KM + uni(c.apogeeKm); aKm = (rp + ra) / 2; e = (ra - rp) / (ra + rp); }
    else if (c.perigeeKm) { e = uni(c.ecc); aKm = (R_EARTH_KM + uni(c.perigeeKm)) / (1 - e); }
    else { aKm = uni(c.aKm); e = uni(c.ecc); }
    const elements = [aKm * 1000, e, uni(c.incDeg) * Math.PI / 180, uni([0, 2 * Math.PI]), uni([0, 2 * Math.PI]), uni([0, 2 * Math.PI])];
    const periodS = 2 * Math.PI * Math.sqrt(aKm ** 3 / MU);
    const spanS = Math.round(logUni([Math.max(periodS, G.minimumSpanSeconds), G.maximumSpanSeconds]));
    const steps = G.stepsSeconds.filter((s) => s <= periodS / G.minimumSamplesPerOrbit && spanS / s <= G.maximumPoints);
    const stepS = steps.length ? pick(steps) : Math.max(...G.stepsSeconds.filter((s) => spanS / s <= G.maximumPoints));
    const startMs = Math.round(uni([Date.parse(G.epochs[0]), Date.parse(G.epochs[1])]) / 1000) * 1000;
    const representation = { frame: pick(['GCRF', 'EME2000']), rounding: pick(['exact', 'rounded']) };
    const drag = elements[0] * (1 - e) / 1000 - R_EARTH_KM < SETTINGS.dragCeilingAltitudeM / 1000;
    const halfSpan = spanS / 2;
    const p = G.parameters;
    const coefficients = drag
      ? { b: logUni(p.dragAreaOverMass), agom: logUni(p.srpAreaOverMass), inTrack: uni([-p.inTrackMps2, p.inTrackMps2]) }
      : { b: 0, agom: logUni(p.srpAreaOverMassHigh), ecom2: Object.fromEntries(parameterSet('HIGH', halfSpan, SETTINGS.apriori).slice(1).map((q) => [q.kind.slice(6), uni([-p.ecom2Mps2, p.ecom2Mps2])])) };
    out.push({ case: i, class: name, regime: drag ? 'LEO' : 'HIGH', elements, periodS, spanS, stepS, startMs, representation, coefficients });
  }
  return out;
}

if (values.list) {
  for (const c of caseList()) console.log(c.case, c.class, c.regime, `${(c.spanS / 3600).toFixed(2)} h`, `${(c.spanS / c.periodS).toFixed(1)} orbits`, `step ${c.stepS}`, `${Math.floor(c.spanS / c.stepS) + 1} pts`, c.representation.frame, c.representation.rounding, iso(c.startMs).slice(0, 10), JSON.stringify(c.coefficients));
  process.exit(0);
}
if (values.summarize) {
  const rows = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir).filter((f) => f.endsWith('.jsonl')).flatMap((f) => fs.readFileSync(path.join(cacheDir, f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l))) : [];
  rows.sort((a, b) => a.case - b.case);
  const pass = rows.filter((r) => r.pass);
  const byClass = {};
  for (const r of rows) {
    const b = (byClass[r.class] ??= { cases: 0, pass: 0, worstClosureM: 0, worstCase: null });
    b.cases += 1; if (r.pass) b.pass += 1;
    const m = r.closure?.max3d ?? Infinity;
    if (m > b.worstClosureM) Object.assign(b, { worstClosureM: m, worstCase: r.case });
  }
  const out = {
    experiment: config.experiment, amendment: 'A6', step: '30-closure-gate', generated: new Date().toISOString(), fitter: VERSION, seed, cases,
    gate: { maxClosureM: G.maxClosureM, rule: 'one segment, and the largest 3D difference over every point after the mid-time split at most maxClosureM' },
    summary: { cases: rows.length, pass: pass.length, fail: rows.length - pass.length, byClass,
      worstClosureM: Math.max(...rows.map((r) => r.closure?.max3d ?? Infinity)), medianClosureM: rows.map((r) => r.closure?.max3d ?? Infinity).sort((a, b) => a - b)[rows.length >> 1] },
    failures: rows.filter((r) => !r.pass).map((r) => ({ case: r.case, class: r.class, reason: r.reason, closureMax3dM: r.closure?.max3d ?? null })),
    rows,
  };
  const dir = path.join(repoRoot, 'results', 'e4', 'a6');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'closure-gate.json'), `${JSON.stringify(out, null, 1)}\n`);
  console.log(JSON.stringify(out.summary, null, 1));
  process.exit(0);
}

const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const [shard, shards] = values.shard.split('/').map(Number);
const run = startRun({ experiment: config.experiment, step: `30-closure-gate-${shard}of${shards}`, configPath, modulesDir: modules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const A4 = config.a4.inputs;
const env = await ephemerisFitEnv({ modulesDir: modules, eopFinals: config.inputs.eopFinals, gfzKp: A4.gfzKp, swpcRsga: A4.swpcRsga,
  kernelPath: path.join(repoRoot, A4.kernel.path), kernelSha256: A4.kernel.sha256 });
for (const m of env.provenance.modules) run.addModule(m);
run.addInputs('environment', { [A4.kernel.path]: A4.kernel.sha256, eopFinals: env.provenance.inputs.eopFinals.sha256, gfzKp: env.provenance.inputs.gfzKp.sha256 });
fs.mkdirSync(cacheDir, { recursive: true });
const outFile = path.join(cacheDir, `shard-${shard}.jsonl`);
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l).case) : []);
const frames = env.modules['foundation/frames'];
const round = (x, q) => Math.round(x / q) * q;

for (const c of caseList().filter((x) => x.case % shards === shard && !done.has(x.case))) {
  const started = performance.now();
  const epoch = iso(c.startMs).replace('Z', '');
  const state = await convertRepresentation(frames, `${epoch}Z`, 'KEPLERIAN', c.elements, 'CARTESIAN');
  const forces = forcesFor(c.regime);
  const epochs = [];
  for (let t = 0; t <= c.spanS; t += c.stepS) epochs.push(c.startMs + t * 1000);
  let row;
  try {
    // The generator: the fitter's request chunks, a tighter tolerance and
    // half the fitter's step.
    const setup = await segmentSetup(env, { ms: c.startMs, state });
    const integrator = { tolerance: G.generator.tolerance, maxStep: Math.min(G.generator.maxStep, setup.integrator.maxStep / 2) };
    const gen = await propagate(env, { epoch, state, fixed: c.coefficients, parameters: [] }, epochs, { forces, integrator, issuedMs: c.startMs });
    const gcrf = gen.map((g) => g.state);
    const states = [];
    for (let k = 0; k < epochs.length; ++k) {
      let s = gcrf[k];
      if (c.representation.frame === 'EME2000') s = await fromGcrf(frames, 'MEAN_EQUATOR_EQUINOX_J2000', iso(epochs[k]), s);
      if (c.representation.rounding === 'rounded') s = [...s.slice(0, 3).map((v) => round(v, 1e-3)), ...s.slice(3).map((v) => round(v, 1e-6))];
      states.push({ epoch: iso(epochs[k]), position: s.slice(0, 3), velocity: s.slice(3) });
    }
    const generatedSeconds = (performance.now() - started) / 1000;
    const out = await fitEphemeris(env, { object: { norad: 90000 + c.case, name: `GATE ${c.case}` }, source: { provider: 'synthetic', issued: iso(c.startMs) },
      frame: c.representation.frame, states });
    const seg = out.segments;
    const truth = c.regime === 'LEO' ? { DRAG_AREA_OVER_MASS: c.coefficients.b, IN_TRACK_ACCELERATION: c.coefficients.inTrack, SRP_AREA_OVER_MASS: c.coefficients.agom }
      : { SRP_AREA_OVER_MASS: c.coefficients.agom, ...Object.fromEntries(Object.entries(c.coefficients.ecom2).map(([t, v]) => [`ECOM2_${t}`, v])) };
    const recovery = (params) => params.map((p) => ({ kind: p.kind, value: p.value, truth: truth[p.kind] ?? 0, error: p.value - (truth[p.kind] ?? 0) }));
    const closure = seg.length === 1 ? seg[0].closure : null;
    const pass = seg.length === 1 && !!closure && !closure.skipped && closure.max3d <= G.maxClosureM;
    row = {
      case: c.case, class: c.class, regime: c.regime, start: iso(c.startMs), spanHours: c.spanS / 3600, orbits: c.spanS / c.periodS, stepSeconds: c.stepS, points: epochs.length,
      representation: c.representation, elements: c.elements, perigeeAltitudeKm: c.elements[0] * (1 - c.elements[1]) / 1000 - R_EARTH_KM, coefficients: c.coefficients,
      segments: seg.length, splits: out.splits, skipped: out.skipped,
      full: seg[0] ? { n: seg[0].stats.n, rms3d: seg[0].stats.rms3d, max3d: seg[0].stats.max3d, iterations: seg[0].fit.iterations, converged: seg[0].fit.converged, hpopCalls: seg[0].fit.hpopCalls, parameters: recovery(seg[0].fit.parameters) } : null,
      closure: closure && !closure.skipped ? { splitEpoch: closure.splitEpoch, n: closure.n, rms3d: closure.rms3d, rmsR: closure.rmsR, rmsT: closure.rmsT, rmsN: closure.rmsN, max3d: closure.max3d, maxR: closure.maxR, maxT: closure.maxT, maxN: closure.maxN,
        firstHalfMax3d: closure.firstHalf.max3d, iterations: closure.fit.iterations, converged: closure.fit.converged, hpopCalls: closure.fit.hpopCalls, parameters: recovery(closure.fit.parameters) } : closure,
      pass, reason: pass ? null : seg.length !== 1 ? `${seg.length} segments` : !closure || closure.skipped ? 'no closure' : `closure max ${closure.max3d.toExponential(3)} m`,
      generator: integrator, fitterMaxStepSeconds: setup.integrator.maxStep,
      seconds: { generate: generatedSeconds, total: (performance.now() - started) / 1000 }, rssMB: process.memoryUsage().rss / 1e6,
    };
  } catch (error) {
    row = { case: c.case, class: c.class, regime: c.regime, start: iso(c.startMs), spanHours: c.spanS / 3600, stepSeconds: c.stepS, representation: c.representation, coefficients: c.coefficients,
      pass: false, reason: `error: ${String(error.message).slice(0, 300)}`, seconds: { total: (performance.now() - started) / 1000 } };
  }
  fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  log(`case ${c.case} ${c.class} ${(c.spanS / 3600).toFixed(1)} h step ${c.stepS} s ${c.representation.frame}/${c.representation.rounding}: ${row.pass ? 'PASS' : 'FAIL'} closure max ${row.closure?.max3d?.toExponential(3) ?? '-'} m (${row.seconds.total.toFixed(0)} s)${row.pass ? '' : ` ${row.reason}`}`);
  run.checkpoint();
}
run.finish({ shard, shards, file: path.relative(repoRoot, outFile) });
await env.destroy();
