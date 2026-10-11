// E13 step 35: the propagation endpoint (PLAN.md section 6, H4 and H5). For an issue state of an object that did not calibrate the common mode:
// Cd*A/m is read from the arc that ends at the issue state, through the orbital energy and under the variant's density (arcs.mjs energyArc), the
// state is propagated by propagator/hpop with that Cd*A/m and density to +1 and +3 days, and the 3D distance to the truth there is the error.
//   H4  Swarm A, B, C: issue 00:00 UTC every second day; arc from the precise orbit 24 h before; truth: the precise orbit (SW_OPER_SP3xCOM).
//   H5  held-out Doves: every third state is an issue state; arc from the previous state; truth: the Dove's states one and three states later.
// Variants: D0 JB2008 with SET's indices as published; D13 the nowcast + forecast of the common mode (arcs that ended at least 6 h before the issue
// time, tau from the selection) as a temperature offset a00 = s / kappa on the hourly DTC rows; D13-def the common mode of the whole split's
// calibration arcs (non-causal, an upper bound, never the primary).
//
//   node steps/35-propagation.mjs --split dev|testA|testB --target swarm|doves [--variants D0,D13,D13-def] [--selection FILE]
//        [--shard k/n] [--limit N] [--out FILE]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { gitState, sha256 } from '../../../harness/modules.mjs';
import { Products } from '../../e3-combined-catalog/truth.mjs';
import { DAY, H, STORE, appendJsonl, config, configPath, energyModulesDir, isoZ, modulesDir, paths, readJson, sleep, amendmentsSha256 } from '../common.mjs';
import { arcCenterOffsetMs, arcsFromRows, nowcast, sAt, solveCommonMode, withLag } from '../common-mode.mjs';
import { openArcEnv } from '../arcs.mjs';
import { kappaTable } from '../kappa.mjs';
import { openDensityEnv } from '../density-truth.mjs';
import { arcsOf, readPlanetSeries } from '../planet-history.mjs';
import { assertDensityReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { split: { type: 'string' }, target: { type: 'string' }, variants: { type: 'string', default: 'D0,D13,D13-def' }, selection: { type: 'string' }, shard: { type: 'string', default: '0/1' }, limit: { type: 'string' }, out: { type: 'string' }, profile: { type: 'string' }, start: { type: 'string' } } });
const P = config.planet, S = config.analysis.solver;
const [from, to] = P.split[values.split] ?? (() => { throw new Error(`unknown split ${values.split}`); })();
assertDensityReadable(values.split);            // Swarm orbits and Planet states of a test split: the freeze and the committed selection
const selectionPath = values.selection ?? path.join(repoRoot, 'results', 'e13', 'selection.json');
const selectionBytes = fs.readFileSync(selectionPath);
const selection = JSON.parse(selectionBytes.toString('utf8'));
const variants = values.variants.split(',');
const [shard, shards] = values.shard.split('/').map(Number);
const profile = values.profile ?? P.arc.profile;
const run = startRun({ experiment: config.experiment, step: `35-propagation-${values.split}-${values.target}-${shard}of${shards}`, configPath, modulesDir: modulesDir(), args: values });
run.addInputs('amendments', { 'amendments.json': amendmentsSha256 });
run.addInputs('selection', { [path.basename(selectionPath)]: sha256(selectionBytes) });
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

// Calibration arcs of every split (history for the nowcast comes from earlier splits).
const sample = readJson(path.join(path.dirname(configPath), 'planet-sample.json'));
const arcRows = (split) => { const f = path.join(paths.planetArcs, `${split}-${P.arc.profile}.jsonl`); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []; };
const arcOptions = { hwids: sample.calibration, maxRelativeSigma: S.arcUse.maximumRelativeSigma, positiveOnly: S.arcUse.positiveOnly };
const splitArcs = arcsFromRows(arcRows(values.split), arcOptions);
const upto = Object.entries(P.split).filter(([, [, end]]) => end <= to).map(([name]) => name);     // the splits up to this one: a run never loads a later split's arcs
const allArcs = upto.flatMap((sp) => arcsFromRows(arcRows(sp), arcOptions));
for (const sp of upto) { const f = path.join(paths.planetArcs, `${sp}-${P.arc.profile}.jsonl`); if (fs.existsSync(f)) run.addInputs('planet-arcs', { [path.basename(f)]: sha256(fs.readFileSync(f)) }); }
const solverOptions = { huberK: S.huberK, iterations: S.iterations, tolerance: S.tolerance, scaleSweeps: S.scaleSweeps, minDovesPerNode: S.minimumDovesPerNodeInterval, minNodeInfo: S.minimumNodeInfo };
const nowOptions = { latencyHours: S.nowcast.latencyHours, historyDays: S.nowcast.historyDays, nodeHours: selection.solver.nodeHours, baseline: selection.solver.baseline, smoothSigma: selection.solver.smoothSigma ?? null, lagHours: selection.lagHours ?? 0, ...solverOptions };
const tauHours = selection.tauHours;

const arcEnv = await openArcEnv({ profile });
const densityEnv = await openDensityEnv();
for (const [family, files] of Object.entries(arcEnv.inputs)) run.addInputs(family, files);
run.addInputs('set', densityEnv.set.sha256);
run.addModule({ ...densityEnv.dc.provenance, checkout: energyModulesDir(), checkoutState: gitState(energyModulesDir()) });
const dayMs = (iso) => Date.parse(`${iso}T00:00:00Z`);
const days = []; for (let t = dayMs(from) - 32 * DAY; t <= dayMs(to) + 5 * DAY; t += DAY) days.push(new Date(t).toISOString().slice(0, 10));
const kappa = await kappaTable(densityEnv, days);
const kappaOf = (t) => { const d = new Date(t).toISOString().slice(0, 10); return (kappa[d] ?? kappa[days.at(-1)]).kappa; };

// The hindcast (whole split) and the nowcast solutions
let hindcast = null;
const hindcastSolution = () => (hindcast ??= withLag(solveCommonMode(splitArcs, { anchorMs: dayMs(from) + arcCenterOffsetMs(splitArcs), nodeHours: selection.solver.nodeHours, baseline: selection.solver.baseline, smoothSigma: selection.solver.smoothSigma ?? null, ...solverOptions }), selection.lagHours ?? 0));
const nowcasts = new Map();
function nowcastAt(issueMs) {
  const cutoff = issueMs - S.nowcast.latencyHours * H;
  const used = allArcs.filter((a) => a.endMs <= cutoff && a.startMs >= cutoff - S.nowcast.historyDays * DAY);
  if (!used.length) return null;
  const key = `${used.length}|${Math.max(...used.map((a) => a.endMs))}|${Math.min(...used.map((a) => a.startMs))}`;
  if (!nowcasts.has(key)) nowcasts.set(key, nowcast(allArcs, issueMs, nowOptions));
  return nowcasts.get(key);
}
// a00(t) [K] for a variant at an issue time, or null for D0; the closure also reports its value at the issue time
function correctionFor(variant, issueMs) {
  if (variant === 'D0') return { a00: null, info: {} };
  if (variant === 'D13') {
    const sol = nowcastAt(issueMs);
    if (!sol) return null;
    return { a00: (t) => sAt(sol, t, tauHours) / kappaOf(t), info: { arcsUsed: sol.usedArcs, latestArcEnd: isoZ(sol.latestArcEndMs), sAtIssue: sAt(sol, issueMs, tauHours), a00AtIssueK: sAt(sol, issueMs, tauHours) / kappaOf(issueMs) } };
  }
  if (variant === 'D13-def') {
    const sol = hindcastSolution();
    return { a00: (t) => sAt(sol, t, null) / kappaOf(t), info: { sAtIssue: sAt(sol, issueMs, null), a00AtIssueK: sAt(sol, issueMs, null) / kappaOf(issueMs) } };
  }
  throw new Error(`unknown variant ${variant}`);
}

const outFile = values.out ?? path.join(STORE, 'propagation', `${values.split}-${values.target}-${shard}of${shards}.jsonl`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.id}|${r.issue}|${r.variant}`; }) : []);

// ── jobs ──
const jobs = [];
const stateM = (s) => [...s.r, ...s.v].map((x) => x * 1000);
if (values.target === 'swarm') {
  const products = new Products(config.inputs.reference, ['SW_OPER_SP3']);
  const tolMs = 15e3;
  const nearest = (norad, t) => { const s = products.firstAtOrAfter(norad, t - tolMs, 2 * tolMs); return s && Math.abs(s.ms - t) <= tolMs ? { ms: s.ms, state: stateM(s) } : null; };
  for (let t0 = dayMs(from); t0 <= dayMs(to); t0 += config.analysis.hypotheses.H4.swarmIssueEveryDays * DAY) {
    for (const [norad, name] of [[39452, 'Swarm A'], [39451, 'Swarm B'], [39453, 'Swarm C']]) {
      const a = nearest(norad, t0 - DAY), b = nearest(norad, t0), h1 = nearest(norad, t0 + DAY), h3 = nearest(norad, t0 + 3 * DAY);
      if (a && b && h1) jobs.push({ id: name, issue: isoZ(t0), issueMs: b.ms, a, b, b0: 0.0045, cr: 0.009, sigma: { posRtnM: [0.02, 0.02, 0.02], velRtnMmS: [0.02, 0.02, 0.02] }, horizons: { 1: h1, ...(h3 ? { 3: h3 } : {}) } });
    }
  }
  run.addInputs('reference', {});
  run.afterwards = () => run.addInputs('reference', products.read);
} else if (values.target === 'doves') {
  const series = readPlanetSeries({ fromDay: new Date(dayMs(from) - 3 * DAY).toISOString().slice(0, 10), toDay: new Date(dayMs(to) + 6 * DAY).toISOString().slice(0, 10) });
  for (const hwid of sample.heldOut) {
    const states = (series.get(hwid) ?? []);
    const inSplit = states.map((s, i) => ({ s, i })).filter(({ s }) => s.epochTt.slice(0, 10) >= from && s.epochTt.slice(0, 10) <= to);
    const regular = (i) => { const h = (states[i].ttMs - states[i - 1].ttMs) / H; return h >= P.arc.minHours && h <= P.arc.maxHours; };
    let n = 0;
    for (const { i } of inSplit) {
      if (i < 1 || !regular(i)) continue;
      if (n++ % 3) continue;                                                       // every third state with a regular arc before it
      const horizons = {};
      if (i + 1 < states.length && regular(i + 1)) horizons[1] = i + 1;
      if (horizons[1] && i + 3 < states.length && regular(i + 2) && regular(i + 3)) horizons[3] = i + 3;
      if (horizons[1]) jobs.push({ id: hwid, issue: states[i].epochTt, raw: { a: states[i - 1], b: states[i], horizons: Object.fromEntries(Object.entries(horizons).map(([k, j]) => [k, states[j]])) }, b0: states[i].ballisticKgPerM2 > 0 ? 1 / states[i].ballisticKgPerM2 : P.arc.cdAreaOverMass0, cr: P.arc.crAreaOverMass, sigma: P.arc.sigma });
    }
  }
} else throw new Error('--target swarm|doves');
const mine = jobs.filter((j) => !values.start || j.issue.slice(0, 10) >= values.start).filter((_, i) => i % shards === shard).slice(0, values.limit ? Number(values.limit) : Infinity);
log(`${values.split} ${values.target}: ${jobs.length} issue states, ${mine.length} in shard ${shard}/${shards}; variants ${variants}; solver ${selection.solver.label}, tau ${tauHours ?? 'held'}`);

const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
let count = 0;
const started = performance.now();
for (const job of mine) {
  while (os.loadavg()[0] > config.compute.pauseAboveLoad1m) await sleep(60e3);
  let a = job.a, b = job.b, horizons = job.horizons;
  if (job.raw) { a = await arcEnv.toUtcGcrf(job.raw.a); b = await arcEnv.toUtcGcrf(job.raw.b); horizons = Object.fromEntries(await Promise.all(Object.entries(job.raw.horizons).map(async ([k, s]) => [k, await arcEnv.toUtcGcrf(s)]))); }
  const issueMs = b.ms;
  for (const variant of variants) {
    if (done.has(`${job.id}|${job.issue}|${variant}`)) continue;
    const row = { id: job.id, target: values.target, issue: job.issue, variant };
    try {
      const corr = correctionFor(variant, issueMs);
      if (!corr) { appendJsonl(outFile, { ...row, error: 'no arc available for the nowcast' }); continue; }
      const fit = await arcEnv.energyArc(a, b, { b0: job.b0, cr: job.cr, sigma: job.sigma, a00: corr.a00 });
      if (!(fit.B > 0)) { appendJsonl(outFile, { ...row, error: 'non-positive Cd*A/m', B: fit.B }); continue; }
      const keys = Object.keys(horizons);
      const states = await arcEnv.trajectory(b, keys.map((k) => horizons[k].ms), fit.B, job.cr, { a00: corr.a00 });
      const errors = Object.fromEntries(keys.map((k, n) => [k, dist(states[n], horizons[k].state)]));
      appendJsonl(outFile, { ...row, B: fit.B, sigmaB: fit.sigmaB, energyMismatchJkg: fit.energyMismatchJkg, errors, ...corr.info });
    } catch (error) {
      appendJsonl(outFile, { ...row, error: String(error.message ?? error).slice(0, 300) });
    }
  }
  if (++count % 5 === 0) log(`${count}/${mine.length} issue states, ${((performance.now() - started) / 1000 / count).toFixed(1)} s each; at ${job.issue.slice(0, 10)}`);
}
run.afterwards?.();
run.finish({ rows: fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).length, out: outFile });
fs.writeFileSync(`${outFile}.meta.json`, `${JSON.stringify({ run: run.id, split: values.split, target: values.target, shard: `${shard}/${shards}`, variants, solver: selection.solver, tauHours, finished: new Date().toISOString() }, null, 1)}\n`);
await arcEnv.destroy();
await densityEnv.destroy();
log('done');
