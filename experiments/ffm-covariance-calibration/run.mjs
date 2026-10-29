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
  const out = path.join(rowsDir, `iss-fit60.s${k}.jsonl`);
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
    fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
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
    let terms;
    try { terms = await windowTerms(v3.ctxFor(Date.parse(f.fit.epoch), w.E + 72 * HOUR), pairs, f.fit, w.E, leads.map((x, j) => ({ L: x.L, line: { ...g[j], file: x.line.file } })), settings); }
    catch (error) { terms = { excluded: `terms: ${String(error.message).slice(0, 200)}` }; } // counted and disclosed (a weather gap in the prediction span)
    fs.appendFileSync(out, `${JSON.stringify({ file: f.file, E: f.E, set, truthFiles: [...new Set(leads.map((x) => x.line.file))], ...terms, seconds: (Date.now() - t0) / 1000 })}\n`);
    count += 1;
    if (count % 10 === 0) console.error(`iss-terms ${set} shard ${k}/${n}: ${count}`);
  }
  await pairs.close();
}
if (phase === 'iss-screen') {
  // PLAN.md 3.7, ISS: a window is excluded when a header-listed burn lies in [start of file k, E + 72 h] (B2's windowOf) or when two
  // overlapping NASA files differ radially by more than 0.5 km at a common epoch in that span (hourly epochs, pair_statistics radial
  // component of file j' minus file j in j's RTN axes). Truth against truth only: no FFM error is read. Rows: rows/iss-screen.s<k>.jsonl.
  const { parseIssOem } = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/iss-oem.mjs'));
  const { openPairs } = await import('./lib/pairs.mjs');
  const pairs = await openPairs(B2C.a12.modulesLinks);
  const fits = new Map(issFitRows().filter((r) => r.fit?.ok).map((r) => [r.file, r]));
  const out = path.join(rowsDir, `iss-screen.s${k}.jsonl`);
  const done = new Set(readJsonl(out).map((r) => r.file));
  const cache = new Map();
  const statesOf = (j) => { if (!cache.has(j)) { if (cache.size > 16) cache.delete(cache.keys().next().value); opened.add(W.headers[j].file, 'ISS OEM'); cache.set(j, new Map(parseIssOem(fs.readFileSync(W.headers[j].file, 'utf8')).states.map((x) => [x.ms, x]))); } return cache.get(j); };
  const starts = W.headers.map((h) => h.header.startMs);
  for (let i = 0; i < W.headers.length; i += 1) {
    const f = fits.get(W.headers[i].date);
    if (!f || i % n !== k || done.has(f.file)) continue;
    const start = starts[i], E = Date.parse(f.E), end = E + 72 * HOUR;
    const files = starts.map((s0, j) => ({ s0, j })).filter(({ s0, j }) => j === i || (s0 > start && s0 <= end)).sort((a, b) => a.s0 - b.s0).map((x) => x.j);
    let maxRadialKm = 0, compared = 0;
    for (let a = 0; a < files.length; a += 1) for (let b = a + 1; b < files.length; b += 1) {
      const A = statesOf(files[a]), Bm = statesOf(files[b]);
      const common = [...A.keys()].filter((t) => t >= Math.max(start, starts[files[b]]) && t <= end && t % HOUR === 0 && Bm.has(t));
      if (!common.length) continue;
      const st = await pairs.stats(common.map((t) => ({ predicted: { position: Bm.get(t).r.map((x) => x * 1000), velocity: Bm.get(t).v.map((x) => x * 1000), covariance: [1, 0, 1, 0, 0, 1], covarianceAxes: 'RTN' }, truth: { position: A.get(t).r.map((x) => x * 1000), velocity: A.get(t).v.map((x) => x * 1000) } })), 'truth');
      for (const x of st) maxRadialKm = Math.max(maxRadialKm, Math.abs(x.errorRtn[0]) / 1000);
      compared += common.length;
    }
    fs.appendFileSync(out, `${JSON.stringify({ file: f.file, E: f.E, set: f.set, files: files.map((j) => W.headers[j].date), compared, maxRadialKm, excluded: maxRadialKm > 0.5 })}\n`);
  }
  await pairs.close();
}

if (phase === 'heldout') {
  // PLAN.md 3.5 point 5: the held-out sets, scored once with the frozen constants, end to end through FFM's PROCESS_NOISE: FFM carries
  // k_e x A5's covariance from t0 to E and from E with q = [q_RN, q_T, q_RN] (600 s) to each lead; the floor and the density term are
  // added in the composition (score.mjs --heldout). The window's error and unit density terms come from windowTerms. Rows:
  // rows/heldout.<class>.s<k>.jsonl.
  const cls = args.class;
  const frozenFile = path.join(results, 'frozen-constants.json');
  if (!fs.existsSync(frozenFile)) throw new Error('no frozen constants');
  const FZ = JSON.parse(fs.readFileSync(frozenFile)).classes;
  const keys = Object.keys(FZ).filter((x) => x === cls || x === `${cls}-sensitivity`);
  if (!keys.length) throw new Error(`${cls} is not frozen`);
  const { openPairs } = await import('./lib/pairs.mjs');
  const { windowTerms, ffmNoiseCovariances } = await import('./lib/products.mjs');
  const pairs = await openPairs(B2C.a12.modulesLinks);
  const out = path.join(rowsDir, `heldout.${cls}.s${k}.jsonl`);
  const done = new Set(readJsonl(out).map((r) => r.id));
  const variantsOf = async (ctx, f, E, leads, settings) => {
    const v = {};
    for (const key of keys) { const p = FZ[key].parameters; v[key] = (await ffmNoiseCovariances(ctx, pairs, f, E, leads, settings, [p.q_RN ?? 0, p.q_T ?? 0, p.q_RN ?? 0], p.k_e)).map((x) => x.rtn); }
    return v;
  };
  if (cls === 'I') {
    const { leadLines } = await import(b2('lib/leads.mjs'));
    const fits = new Map(issFitRows().filter((r) => r.fit?.ok && r.set === 'heldOut').map((r) => [r.file, r]));
    const settings = issSettings();
    for (let i = 0; i < W.headers.length; i += 1) {
      const f = fits.get(W.headers[i].date);
      if (!f || i % n !== k || done.has(f.file)) continue;
      const w = W.windowOf(i);
      fs.appendFileSync(openedLog, `${W.headers[i].file}\n`);
      const leads = leadLines(w.truth, w.E, B2C.a5.ca.leadToleranceSeconds.iss);
      const g = await toGcrf(leads.map((x) => x.line));
      const L = leads.map((x, j) => ({ L: x.L, line: { ...g[j], file: x.line.file } }));
      const ctx = v3.ctxFor(Date.parse(f.fit.epoch), w.E + 72 * HOUR);
      const row = { id: f.file, file: f.file, E: f.E, set: 'heldOut' };
      try { Object.assign(row, await windowTerms(ctx, pairs, f.fit, w.E, L, settings)); row.ffm = await variantsOf(ctx, f.fit, w.E, L, settings); }
      catch (error) { row.failed = `FFM refused (C2-A5 point 4: a failure): ${String(error.message).slice(0, 200)}`; }
      fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
    }
  } else if (cls === 'LP') {
    const { truthSeries, windowAt } = await import('./lib/precise.mjs');
    const E6 = JSON.parse(fs.readFileSync(path.join(root, 'experiments/e6-public-observations/config.json'))).slr.targets;
    const [lo, hi] = config.split.L.heldOut;
    const tasks = [];
    for (const t of config.classes.L.objects.map((o) => o.toLowerCase())) for (let E = Date.parse(`${lo}T00:00:00Z`); E <= Date.parse(`${hi}T00:00:00Z`); E += 24 * HOUR) tasks.push([t, E]);
    let series = null;
    for (let i = 0; i < tasks.length; i += 1) {
      const [t, E] = tasks[i], id = `${t}|${iso(E)}`;
      if (i % n !== k || done.has(id)) continue;
      if (series?.sphere !== t) series = { sphere: t, s: truthSeries(E6[t].norad, `nsgf.orb.${t}.`, { opened, from: Date.parse(lo) - 3 * 24 * HOUR, to: Date.parse(hi) + 5 * 24 * HOUR }) };
      const w = windowAt(series.s, E, { leadToleranceSeconds: B2C.a5.ca.leadToleranceSeconds.laser });
      const row = { id, sphere: t, norad: E6[t].norad, E: iso(E), set: 'heldOut' };
      if (w.excluded) row.excluded = w.excluded;
      else if (Math.abs(Date.parse(w.track[0].epoch) - (E - 24 * HOUR)) > 300e3) row.excluded = 'no state at the track start';
      else {
        const diag = [1e10, 1e10, 1e10, 100, 100, 100, (0.3 * E6[t].b) ** 2];
        const settings = { sigmaM: 10, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: E6[t].b }], fixed: { agom: E6[t].agom }, apriori: Array.from({ length: 49 }, (_, j) => (Math.floor(j / 7) === j % 7 ? diag[j % 7] : 0)),
          maximumIterations: B2C.a12.fit.maximumIterations, correctionTolerance: B2C.a12.fit.correctionTolerance, sigmaEditThreshold: B2C.a12.fit.sigmaEditThreshold, forces: F.forces, integrator: F.integrator };
        const { points, reference } = fitInput(w.track);
        const ctx = v3.ctxFor(E - 24 * HOUR, E + 72 * HOUR);
        const f = await fitV3(ctx, points, reference, settings);
        row.fit = { ok: f.ok, termination: f.termination ?? null, error: f.error ?? null, parameters: f.parameters, reducedChiSquare: f.reducedChiSquare };
        row.trackMaxSigmaM = Math.max(...w.track.map((l) => l.sigma ?? 0));
        if (f.ok && w.leads.length) { try { Object.assign(row, await windowTerms(ctx, pairs, f, E, w.leads, settings)); row.ffm = await variantsOf(ctx, f, E, w.leads, settings); } catch (error) { row.failed = `FFM refused (C2-A5 point 4: a failure): ${String(error.message).slice(0, 200)}`; } }
      }
      fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
    }
  }
  await pairs.close();
}

if (phase === 'precise') {
  // R classes (PLAN.md 3.3-3.4; C2-A1, C2-A2, C2-A4): per object and cutoff E of --set, the truth-only maneuver screen (C2-A4 point 4: FFM
  // fitted to the truth over [E - 24 h, E + 72 h] at 10 min, state + B + AGOM, 10 m; flagged when its 3D RMS, sqrt(3) x 10 m x the
  // weighted RMS, exceeds 5 m), then the class fit on the 24 h track (seeds from seeds-R3.json / seeds-R1R2.json) and the terms at each lead.
  // Rows: rows/<class>.<set>.s<k>.jsonl. --weather M only here (condition O is a separate pass).
  const cls = args.class, set = args.set;
  if (!['R3', 'R1', 'R2'].includes(cls)) throw new Error('--class R3|R1|R2');
  if (!['calibration', 'validation', 'heldOut'].includes(set)) throw new Error('--set calibration|validation|heldOut');
  const FZ = fs.existsSync(path.join(results, 'frozen-constants.json')) ? JSON.parse(fs.readFileSync(path.join(results, 'frozen-constants.json'))).classes : {};
  const CK = `${cls}${args.weather === 'O' ? '-O' : ''}`;
  if (set === 'heldOut' && !FZ[CK]) throw new Error(`${CK} is not frozen: held-out sets are scored only after the freeze`);
  const { truthSeries, windowAt } = await import('./lib/precise.mjs');
  const { openPairs } = await import('./lib/pairs.mjs');
  const { windowTerms } = await import('./lib/products.mjs');
  const pairs = await openPairs(B2C.a12.modulesLinks);
  const seeds = JSON.parse(fs.readFileSync(path.join(results, cls === 'R3' ? 'seeds-R3.json' : 'seeds-R1R2.json')));
  const P9 = JSON.parse(fs.readFileSync(path.join(results, 'precheck-P9.json')));
  const objects = P9.perObject.filter((o) => o.class === cls && (set === 'heldOut' ? true : o.set === 'calibration')).map((o) => ({ ...o, seed: seeds.objects.find((x) => x.norad === o.norad) })).filter((o) => o.seed);
  const prefixOf = (o) => (o.products.includes('ESA') ? 'ESA0OPSFIN' : o.products.includes('nsgf') ? 'nsgf.orb.' : o.products.includes('ilrsa') ? 'ilrsa.orb.' : o.products.includes('SW') ? 'SW_OPER' : o.products.includes('S') ? `${o.name.replace('Sentinel-', 'S')}_OPER` : o.products[0]);
  const every = (from, to, d = 2) => { const out = []; for (let E = Date.parse(`${from}T00:00:00Z`); E <= Date.parse(`${to}T00:00:00Z`); E += d * 24 * HOUR) out.push(E); return out; };
  const S = set === 'heldOut' ? { cutoffs: { from: config.split.calibration.cutoffs.from, to: '2026-10-31' } } : config.split[set];
  const cutoffs = set === 'heldOut' ? null : every(S.cutoffs.from, S.cutoffs.to, S.cutoffs.everyDays);
  // held out (PLAN.md 3.4): by object, every cutoff of every set to the end of the product; by time, calibration objects from 2026-06-01 to the end
  const lastE = (o) => (o.last ? iso(Date.parse(o.last) - 72 * HOUR).slice(0, 10) : config.split.heldOutTime.from);
  const heldTasks = (o) => (o.set === 'heldOutObject' ? every(config.split.calibration.cutoffs.from, lastE(o)).map((E) => [o, E, 'object']) : every(config.split.heldOutTime.from, lastE(o)).map((E) => [o, E, 'time']));
  const weather = args.weather ?? 'M';
  if (!['M', 'O'].includes(weather) || (weather === 'O' && cls === 'R3')) throw new Error('--weather M|O (O for R1/R2 only)');
  const out = path.join(rowsDir, `${cls}.${set}${weather === 'O' ? '.O' : ''}.s${k}.jsonl`);
  const done = new Set(readJsonl(out).map((r) => `${r.norad}|${r.E}`));
  const WO = weather === 'O' ? await (await import('./lib/weather-o.mjs')).openWeatherO(B2C.a12.modulesLinks) : null;
  // condition O reuses condition M's maneuver screen (truth only, weather-independent)
  const screenM = weather === 'O' ? new Map(fs.readdirSync(rowsDir).filter((f) => f.startsWith(`${cls}.${set}.s`)).flatMap((f) => readJsonl(path.join(rowsDir, f))).map((r) => [`${r.norad}|${r.E}`, r.screen])) : null;
  const frac = cls === 'R3' ? 1 : B2C.a12.fit.apriori.parameterFraction;
  const settingsOf = (o, withB) => {
    const ps = [...(withB ? [{ kind: 'DRAG_AREA_OVER_MASS', value: o.seed.bSeed ?? o.seed.areaOverMassM2kg * 2.2 }] : []), { kind: 'SRP_AREA_OVER_MASS', value: o.seed.agomSeed }];
    const diag = [...Array(3).fill(F.apriori.positionSigmaM ** 2), ...Array(3).fill(F.apriori.velocitySigmaMS ** 2), ...ps.map((q) => (frac * q.value) ** 2)];
    const m = diag.length;
    return { sigmaM: 10, parameters: ps, fixed: withB ? {} : { b: 0 }, apriori: Array.from({ length: m * m }, (_, j) => (Math.floor(j / m) === j % m ? diag[j % m] : 0)), maximumIterations: B2C.a12.fit.maximumIterations, correctionTolerance: B2C.a12.fit.correctionTolerance, sigmaEditThreshold: B2C.a12.fit.sigmaEditThreshold, forces: F.forces, integrator: F.integrator };
  };
  const tasks = set === 'heldOut' ? objects.flatMap(heldTasks) : objects.flatMap((o) => cutoffs.map((E) => [o, E]));
  let series = null;
  for (let i = 0; i < tasks.length; i += 1) {
    const [o, E, subset] = tasks[i], id = `${o.norad}|${iso(E)}`;
    if (i % n !== k || done.has(id)) continue;
    if (args.limit && i / n > Number(args.limit)) break;
    if (series?.norad !== o.norad) series = { norad: o.norad, s: truthSeries(o.norad, prefixOf(o), { opened, from: Date.parse(S.cutoffs.from) - 3 * 24 * HOUR, to: Date.parse(S.cutoffs.to) + 5 * 24 * HOUR }) };
    const w = windowAt(series.s, E, { leadToleranceSeconds: B2C.a5.ca.leadToleranceSeconds.laser });
    const row = { norad: o.norad, name: o.name, cluster: o.cluster, E: iso(E), set, class: cls, weather, ...(subset ? { subset } : {}) };
    const t0 = Date.now();
    if (w.excluded) row.excluded = w.excluded;
    else if (Math.abs(Date.parse(w.track[0].epoch) - (E - 24 * HOUR)) > 300e3) row.excluded = 'no state at the track start';
    else {
      try {
        // the maneuver screen on the truth itself
        if (screenM) row.screen = screenM.get(id) ? { ...screenM.get(id), from: 'condition M rows' } : null;
        else {
          const sw = windowAt(series.s, E + 72 * HOUR, { trackHours: 96, leadToleranceSeconds: 0, minCoverage: 0 });
          const ctxS = v3.ctxFor(E - 24 * HOUR, E + 72 * HOUR);
          const fs0 = await fitV3(ctxS, fitInput(sw.track).points, fitInput(sw.track).reference, settingsOf(o, true));
          row.screen = { ok: fs0.ok, termination: fs0.termination ?? null, points: sw.track.length, rms3dM: fs0.weightedRms != null ? Math.sqrt(3) * 10 * fs0.weightedRms : null };
          row.screen.flagged = fs0.ok && row.screen.rms3dM > 5; // C2-A4 point 4
          row.screen.failed = !fs0.ok; // a screen fit that does not converge cannot clear the window: counted apart
        }
        const settings = cls === 'R3' ? settingsOf(o, false) : settingsOf(o, true);
        const { points, reference } = fitInput(w.track);
        let ctx = v3.ctxFor(E - 24 * HOUR, E + 72 * HOUR);
        if (WO) { const o2 = WO.inputsO(ctx.inputs, E, E + 72 * HOUR); if (o2.excluded) throw new Error(`condition O: ${o2.excluded}`); ctx = { ...ctx, inputs: o2.inputs }; row.rsga = o2.rsga; }
        const f = await fitV3(ctx, points, reference, settings);
        row.fit = { ok: f.ok, termination: f.termination ?? null, error: f.error ?? null, epoch: f.epoch, state: f.state, parameters: f.parameters, reducedChiSquare: f.reducedChiSquare, iterations: f.iterations, rejectedTrials: f.rejectedTrials, refusedTrials: f.refusedTrials, covariance: f.covariance };
        row.trackMaxSigmaM = Math.max(...w.track.map((l) => l.sigma ?? 0));
        if (f.ok && w.leads.length) Object.assign(row, await windowTerms(ctx, pairs, f, E, w.leads, settings));
        if (set === 'heldOut' && f.ok && w.leads.length) {
          // end to end through FFM's PROCESS_NOISE with the frozen constants (C2-A5: the hand-off at E symmetrized); a refusal is a failure
          const { ffmNoiseCovariances } = await import('./lib/products.mjs');
          row.ffm = {};
          for (const key of Object.keys(FZ).filter((x) => x === CK)) { const p = FZ[key].parameters; row.ffm[key] = (await ffmNoiseCovariances(ctx, pairs, f, E, w.leads, settings, [p.q_RN ?? 0, p.q_T ?? 0, p.q_RN ?? 0], p.k_e)).map((x) => x.rtn); }
        }
      } catch (error) { if (set === 'heldOut' && row.fit?.ok) row.failed = `FFM refused (a failure): ${String(error.message).slice(0, 200)}`; else row.excluded = `refused: ${String(error.message).slice(0, 200)}`; }
    }
    row.seconds = (Date.now() - t0) / 1000;
    fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
  }
  fs.writeFileSync(path.join(store, 'opened', `${cls}.${set}${weather === 'O' ? '.O' : ''}.s${k}.json`), JSON.stringify(opened.list()));
  await pairs.close();
}

if (phase === 'lp-terms') {
  // Class L-P (C2-A3 point 2): FFM fitted to the NSGF positions of a type L sphere, E6 R's parameterization, cutoffs every 24 h on type L's
  // splits; then the terms at each lead (truth: every NSGF arc, its stated sigma kept for the C2-A1 truth covariance).
  const set = args.set;
  if (!['calibration', 'validation', 'heldOut'].includes(set)) throw new Error('--set calibration|validation|heldOut');
  if (set === 'heldOut' && !fs.existsSync(path.join(results, 'frozen-constants.json'))) throw new Error('held-out sets are scored only after the frozen-constants receipt');
  const { truthSeries, windowAt } = await import('./lib/precise.mjs');
  const { openPairs } = await import('./lib/pairs.mjs');
  const { windowTerms } = await import('./lib/products.mjs');
  const pairs = await openPairs(B2C.a12.modulesLinks);
  const E6 = JSON.parse(fs.readFileSync(path.join(root, 'experiments/e6-public-observations/config.json'))).slr.targets;
  const [lo, hi] = config.split.L[set];
  const out = path.join(rowsDir, `lp-terms.${set}.s${k}.jsonl`);
  const done = new Set(readJsonl(out).map((r) => `${r.sphere}|${r.E}`));
  const tasks = [];
  for (const t of config.classes.L.objects.map((o) => o.toLowerCase())) for (let E = Date.parse(`${lo}T00:00:00Z`); E <= Date.parse(`${hi}T00:00:00Z`); E += 24 * HOUR) tasks.push([t, E]);
  let series = null, count = 0;
  for (let i = 0; i < tasks.length; i += 1) {
    const [t, E] = tasks[i];
    if (i % n !== k || done.has(`${t}|${iso(E)}`)) continue;
    if (args.limit && count >= Number(args.limit)) break;
    if (series?.sphere !== t) series = { sphere: t, s: truthSeries(E6[t].norad, `nsgf.orb.${t}.`, { opened, from: Date.parse(lo) - 3 * 24 * HOUR, to: Date.parse(hi) + 5 * 24 * HOUR }) };
    const w = windowAt(series.s, E, { leadToleranceSeconds: B2C.a5.ca.leadToleranceSeconds.laser });
    const row = { sphere: t, norad: E6[t].norad, E: iso(E), set };
    if (w.excluded) row.excluded = w.excluded;
    else if (Math.abs(Date.parse(w.track[0].epoch) - (E - 24 * HOUR)) > 300e3) row.excluded = 'no state at the track start';
    else {
      const t0 = Date.now();
      const diag = [1e10, 1e10, 1e10, 100, 100, 100, (0.3 * E6[t].b) ** 2];
      const settings = { sigmaM: 10, parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: E6[t].b }], fixed: { agom: E6[t].agom }, apriori: Array.from({ length: 49 }, (_, j) => (Math.floor(j / 7) === j % 7 ? diag[j % 7] : 0)),
        maximumIterations: B2C.a12.fit.maximumIterations, correctionTolerance: B2C.a12.fit.correctionTolerance, sigmaEditThreshold: B2C.a12.fit.sigmaEditThreshold, forces: F.forces, integrator: F.integrator };
      const { points, reference } = fitInput(w.track);
      const ctx = v3.ctxFor(E - 24 * HOUR, E + 72 * HOUR);
      const f = await fitV3(ctx, points, reference, settings);
      row.fit = { ok: f.ok, termination: f.termination ?? null, error: f.error ?? null, epoch: f.epoch, state: f.state, parameters: f.parameters, reducedChiSquare: f.reducedChiSquare, iterations: f.iterations, rejectedTrials: f.rejectedTrials, refusedTrials: f.refusedTrials, covariance: f.covariance };
      row.trackMaxSigmaM = Math.max(...w.track.map((l) => l.sigma ?? 0));
      if (f.ok && w.leads.length) { try { Object.assign(row, await windowTerms(ctx, pairs, f, E, w.leads, settings)); } catch (error) { row.excluded = `terms: ${String(error.message).slice(0, 200)}`; } }
      row.seconds = (Date.now() - t0) / 1000;
    }
    fs.appendFileSync(out, `${JSON.stringify(row)}\n`);
    count += 1;
  }
  fs.writeFileSync(path.join(store, 'opened', `lp-terms.${set}.s${k}.json`), JSON.stringify(opened.list()));
  await pairs.close();
}
await v3.close();
await frames.destroy();
process.exit(0);
