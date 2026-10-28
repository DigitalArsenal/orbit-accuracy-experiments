// C2 runner (PLAN.md 3.3-3.5). Phases:
//   iss-fit    P1 and type I: every part 1b window (B2 lib/iss-window.mjs) refitted with fit_batch version 3 (harness/ffm-fit-v3.mjs,
//              A12's modules), A5's seeds and priors, one round at 10 m per axis in GCRF (the track taken from EME2000 by
//              foundation/frames); the fit only (the track), no truth after E. Rows: <store>/rows/iss-fit.s<k>.jsonl.
//   iss-terms  type I terms (lib/products.mjs) at each lead of the windows of --set calibration|validation (held-out sets refuse until
//              the frozen-constants receipt exists). Rows: <store>/rows/iss-terms.<set>.s<k>.jsonl.
//   p1         the P1 receipt from the iss-fit rows.
//   node experiments/ffm-covariance-calibration/run.mjs --phase iss-fit [--shard k/n] [--limit n]
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, Opened, writeReceipt, store, args, HOUR, iso, root, results } from './common.mjs';
import { b2 } from './lib/precise.mjs';

frozen();
const phase = args.phase;
const B2C = JSON.parse(fs.readFileSync(b2('config.json')));
const F = B2C.part1.starlink.ffm;
const rowsDir = path.join(store, 'rows');
fs.mkdirSync(rowsDir, { recursive: true });
const readJsonl = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);
const allRows = (prefix) => fs.readdirSync(rowsDir).filter((f) => f.startsWith(prefix) && f.endsWith('.jsonl')).sort().flatMap((f) => readJsonl(path.join(rowsDir, f)));
const [k, n] = (args.shard ?? '0/1').split('/').map(Number);
const I = config.split.I;
const setOfIss = (E) => { const d = iso(E).slice(0, 10); return d >= I.calibration[0] && d <= I.calibration[1] ? 'calibration' : d >= I.validation[0] && d <= I.validation[1] ? 'validation' : d >= I.heldOut[0] && d <= I.heldOut[1] ? 'heldOut' : null; };

/** A5's ISS seeds and priors (config.a5.issFfm) for fit_batch version 3: one round at 10 m, A12's evaluation cap and tolerances. */
function issSettings(maximumIterations = B2C.a12.fit.maximumIterations) {
  const seeds = B2C.a5.issFfm.seeds, frac = B2C.a5.issFfm.aprioriParameterFraction;
  const kinds = ['DRAG_AREA_OVER_MASS', 'SRP_AREA_OVER_MASS'];
  const diag = [...Array(3).fill(F.apriori.positionSigmaM ** 2), ...Array(3).fill(F.apriori.velocitySigmaMS ** 2), ...kinds.map((q) => (frac * seeds[q]) ** 2)];
  const m = diag.length;
  return { sigmaM: B2C.a12.fit.sigmaM, parameters: kinds.map((kind) => ({ kind, value: seeds[kind] })), fixed: {}, apriori: Array.from({ length: m * m }, (_, i) => (Math.floor(i / m) === i % m ? diag[i % m] : 0)),
    maximumIterations, correctionTolerance: B2C.a12.fit.correctionTolerance, sigmaEditThreshold: B2C.a12.fit.sigmaEditThreshold, forces: F.forces, integrator: F.integrator };
}

const A3 = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'amendments.json')))['C2-A3'];
/** The ISS fit rows of record (C2-A3 point 3): the 60-evaluation re-run replaces the first fit of its window; weather-gap windows are data exclusions. */
function issFitRows() {
  const rerun = new Map(allRows('iss-fit60.').map((r) => [r.file, r]));
  return allRows('iss-fit.').map((r) => (A3.issFits.dataExclusions.includes(r.file) ? { ...r, excluded: 'data exclusion (C2-A3): B1\'s environment drops a day of the arc', firstFit: r.fit, fit: undefined } : rerun.has(r.file) ? { ...rerun.get(r.file), firstFit: r.fit } : r));
}

if (phase === 'p1') {
  const first = allRows('iss-fit.');
  const stalled = first.filter((r) => r.fit && !r.fit.ok && A3.issFits.rerunAt60.includes(r.file)).map((r) => ({ file: r.file, E: r.E, termination: r.fit.termination, iterations: r.fit.iterations, ffmCalls: r.fit.ffmCalls,
    rejectedTrials: r.fit.rejectedTrials, refusedTrials: r.fit.refusedTrials, reducedChiSquare: r.fit.reducedChiSquare, parameters: r.fit.parameters, boundStatus: r.fit.boundStatus, finalStepNorm: 'not reported (BatchFitResult has no step-norm field)' }));
  const rows = issFitRows();
  const fitted = rows.filter((r) => r.fit);
  const conv = fitted.filter((r) => r.fit.ok).length, refused = fitted.filter((r) => (r.fit.refusedTrials ?? 0) > 0 || (r.fit.refusedRounds ?? 0) > 0).length;
  const failed = fitted.filter((r) => !r.fit.ok).map((r) => ({ file: r.file, E: r.E, error: r.fit.error, termination: r.fit.termination }));
  const bySet = {};
  for (const r of fitted) { const s = r.set ?? 'none'; bySet[s] ??= { windows: 0, converged: 0 }; bySet[s].windows += 1; if (r.fit.ok) bySet[s].converged += 1; }
  const T = config.precheckThresholds.P1;
  const pass = refused === T.refusals && conv / fitted.length >= T.convergedMin;
  const seconds = fitted.map((r) => r.fit.seconds).sort((a, b) => a - b);
  console.log(writeReceipt('precheck-P1', {
    plan: '3.8 P1; D2 (iss-ffm3)', criterion: 'ISS refit with fit_batch version 3: zero refusals and at least 99.9 % CONVERGED', settings: { ...issSettings(), apriori: 'diagonal: 1e5 m, 10 m/s, 100 % of each seed' },
    windows: rows.length, excluded: rows.filter((r) => r.excluded).length, dataExclusions: rows.filter((r) => /C2-A3/.test(r.excluded ?? '')).map((r) => ({ file: r.file, E: r.E, firstFit: { error: r.firstFit?.error } })),
    fitted: fitted.length, converged: conv, convergedRate: conv / fitted.length, refusedFits: refused, failed, bySet, rerunAt60: { files: A3.issFits.rerunAt60, maximumIterations: A3.issFits.maximumIterations, results: rows.filter((r) => r.firstFit && r.fit).map((r) => ({ file: r.file, ok: r.fit.ok, termination: r.fit.termination, iterations: r.fit.iterations, rejectedTrials: r.fit.rejectedTrials })) }, stalledDetail: stalled,
    secondsPerFit: { median: seconds[Math.floor(seconds.length / 2)], p90: seconds[Math.floor(seconds.length * 0.9)], note: 'wall seconds per fit (24 h track, 4-min NASA states) at RK78 1e-10, steps <= 120 s, while the host load was ~30 of 28 cores' },
    labeled: 'in-sample-seen (the planner read A5\'s ISS rows)', outcome: pass ? 'pass' : 'FAIL (C2-A3 point 3: failures are excluded from the cells and C2 proceeds)',
  }));
  process.exit(0);
}

const { fitV3 } = await import(path.join(root, 'harness/ffm-fit-v3.mjs'));
const { openV3, fitInput } = await import(b2('lib/a12.mjs'));
const G1M = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/modules.mjs'));
const FR = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/frames.mjs'));
const v3 = await openV3();
const frames = await G1M.openModule(B2C.a12.modulesLinks, 'foundation/frames');
const toGcrf = async (lines) => { const out = []; for (const l of lines) { const t = await FR.transformState(frames, 'EME2000', 'GCRF', l.epoch, [...l.r, ...l.v]); out.push({ epoch: l.epoch, r: t.slice(0, 3), v: t.slice(3, 6) }); } return out; };
const W = await import(b2('lib/iss-window.mjs'));
const opened = new Opened();
const openedLog = path.join(store, 'opened', `${phase}.s${k}.txt`);
fs.mkdirSync(path.dirname(openedLog), { recursive: true });

if (phase === 'iss-fit60') {
  const out = path.join(rowsDir, 'iss-fit60.s0.jsonl');
  const done = new Set(readJsonl(out).map((r) => r.file));
  const settings = issSettings(A3.issFits.maximumIterations);
  for (let i = 0; i < W.headers.length; i += 1) {
    if (!A3.issFits.rerunAt60.includes(W.headers[i].date) || done.has(W.headers[i].date) || i % n !== k) continue;
    const w = W.windowOf(i);
    fs.appendFileSync(openedLog, `${W.headers[i].file}\n`);
    const t0 = Date.now();
    const track = await toGcrf(w.track);
    const { points, reference } = fitInput(track);
    const f = await fitV3(v3.ctxFor(Date.parse(track[0].epoch), w.E + 72 * HOUR), points, reference, settings);
    const row = { file: W.headers[i].date, E: iso(w.E), set: setOfIss(w.E), maximumIterations: settings.maximumIterations, fit: { ok: f.ok, termination: f.termination ?? null, error: f.error ?? null, epoch: f.epoch, state: f.state, parameters: f.parameters, boundStatus: f.boundStatus, reducedChiSquare: f.reducedChiSquare,
      measurements: f.measurements, rejected: f.rejected, iterations: f.iterations, rejectedTrials: f.rejectedTrials, refusedTrials: f.refusedTrials, refusedRounds: f.refusedRounds, refusal: f.refusal ?? null, ffmCalls: f.ffmCalls, covariance: f.covariance, seconds: (Date.now() - t0) / 1000 },
      provenance: { estimation: v3.provenance.estimation.wasmSha256, ffm: v3.provenance.ffm.wasmSha256 } };
    fs.appendFileSync(out.replace('.s0.', `.s${k}.`), `${JSON.stringify(row)}\n`);
  }
}

if (phase === 'iss-fit') {
  const out = path.join(rowsDir, `iss-fit.s${k}.jsonl`);
  const done = new Set(readJsonl(out).map((r) => r.file));
  const settings = issSettings();
  let count = 0;
  for (let i = 0; i < W.headers.length; i += 1) {
    if (i % n !== k || done.has(W.headers[i].date)) continue;
    if (args.limit && count >= Number(args.limit)) break;
    // the track only: windowOf also builds the truth lines in memory; only the track and E are used here
    const w = W.windowOf(i);
    fs.appendFileSync(openedLog, `${W.headers[i].file}\n`);
    const row = { file: W.headers[i].date, ...(w.E ? { E: iso(w.E), set: setOfIss(w.E) } : {}) };
    if (w.excluded) row.excluded = w.excluded;
    else {
      const t0 = Date.now();
      const track = await toGcrf(w.track);
      const { points, reference } = fitInput(track);
      const f = await fitV3(v3.ctxFor(Date.parse(track[0].epoch), w.E + 72 * HOUR), points, reference, settings);
      row.fit = { ok: f.ok, termination: f.termination ?? null, error: f.error ?? null, epoch: f.epoch, state: f.state, parameters: f.parameters, boundStatus: f.boundStatus, reducedChiSquare: f.reducedChiSquare,
        measurements: f.measurements, rejected: f.rejected, iterations: f.iterations, rejectedTrials: f.rejectedTrials, refusedTrials: f.refusedTrials, refusedRounds: f.refusedRounds, refusal: f.refusal ?? null, ffmCalls: f.ffmCalls,
        covariance: f.covariance, seconds: (Date.now() - t0) / 1000 };
      row.provenance = { estimation: v3.provenance.estimation.wasmSha256, ffm: v3.provenance.ffm.wasmSha256 };
    }
    fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
    count += 1;
    if (count % 10 === 0) console.error(`iss-fit shard ${k}/${n}: ${count}`);
  }
  console.error(`iss-fit shard ${k}/${n}: ${count} windows`);
}

if (phase === 'iss-terms') {
  const set = args.set;
  if (!['calibration', 'validation', 'heldOut'].includes(set)) throw new Error('--set calibration|validation|heldOut');
  if (set === 'heldOut' && !fs.existsSync(path.join(results, 'frozen-constants.json'))) throw new Error('held-out sets are scored only after the frozen-constants receipt');
  const { openPairs } = await import('./lib/pairs.mjs');
  const { windowTerms } = await import('./lib/products.mjs');
  const { leadLines } = await import(b2('lib/leads.mjs'));
  const pairs = await openPairs(B2C.a12.modulesLinks);
  const fits = new Map(issFitRows().filter((r) => r.fit?.ok && r.set === set).map((r) => [r.file, r]));
  const out = path.join(rowsDir, `iss-terms.${set}.s${k}.jsonl`);
  const done = new Set(readJsonl(out).map((r) => r.file));
  const settings = issSettings();
  let count = 0;
  for (let i = 0; i < W.headers.length; i += 1) {
    const f = fits.get(W.headers[i].date);
    if (!f || i % n !== k || done.has(f.file)) continue;
    if (args.limit && count >= Number(args.limit)) break;
    const w = W.windowOf(i);
    fs.appendFileSync(openedLog, `${W.headers[i].file}\n`);
    const leads = leadLines(w.truth, w.E, B2C.a5.ca.leadToleranceSeconds.iss);
    const g = await toGcrf(leads.map((x) => x.line));
    const t0 = Date.now();
    const terms = await windowTerms(v3.ctxFor(Date.parse(f.fit.epoch), w.E + 72 * HOUR), pairs, f.fit, w.E, leads.map((x, j) => ({ L: x.L, line: { ...g[j], file: x.line.file } })), settings);
    fs.appendFileSync(out, `${JSON.stringify({ file: f.file, E: f.E, set, truthFiles: [...new Set(leads.map((x) => x.line.file))], ...terms, seconds: (Date.now() - t0) / 1000 })}\n`);
    count += 1;
    if (count % 10 === 0) console.error(`iss-terms ${set} shard ${k}/${n}: ${count}`);
  }
  await pairs.close();
}
await v3.close();
await frames.destroy();
process.exit(0);
