// Q2's propagation environment (PLAN.md 6.1, 6.3): the pinned modules, the DE440s kernel, Earth orientation, SET's
// JB2008 drivers, GFZ and NOAA SWPC space weather, and E13's density correction, each as public at a sample's
// information cutoff. Selection and framing of published rows only; E13's correction is E13's own code
// (common-mode.mjs nowcast and sAt, kappa.mjs) with E13's committed selection.
import fs from 'node:fs';
import path from 'node:path';
import { kernelFrame } from '../../harness/prw.mjs';
import { c04Records, eopFrame as eopFrameOf } from '../../harness/eop.mjs';
import { jb2008Frame, jb2008RowsWithOffset, readGfzKp, readSetIndices, spaceWeatherFrame } from '../../harness/full-force.mjs';
import { readRsga, releasedEopRecords, releasedSpwRows } from '../../harness/cutoff-environment.mjs';
import { estimationCodec } from '../e2-catalog-covariance/estimation-wire.mjs';
import { config as e13config } from '../e13-open-dca/common.mjs';
import { arcsFromRows, nowcast, sAt } from '../e13-open-dca/common-mode.mjs';
import { kappaTable } from '../e13-open-dca/kappa.mjs';
import { DAY_MS, config, loadPinned, modulesRoot, readJson, repoRoot, sha256 } from './common.mjs';

const mjd = (ms) => Math.floor(ms / DAY_MS) + 40587;
const dayIso = (ms) => new Date(ms).toISOString().slice(0, 10);

export async function q2Context(run) {
  const names = ['propagator/ffm', 'analysis/estimation', 'analysis/gp-error-model', 'analysis/epoch-state', 'analysis/maneuver-detection', 'foundation/frames', 'foundation/time', 'data-source/eop-parser', 'analysis/density-calibration'];
  const loaded = {};
  for (const n of names) loaded[n] = await loadPinned(n, run);
  const kernelPath = path.join(repoRoot, config.inputs.kernel.path);
  const kernelBytes = fs.readFileSync(kernelPath);
  if (sha256(kernelBytes) !== config.inputs.kernel.sha256) throw new Error('DE440s kernel bytes differ from the pinned SHA-256');
  run.addInputs('kernel', { 'de440s.bsp': config.inputs.kernel.sha256 });
  const eop = await c04Records(loaded['data-source/eop-parser'], config.inputs.eopC04);
  run.addInputs('eop', { [path.basename(config.inputs.eopC04)]: eop.sha256 });
  const set = readSetIndices(config.inputs.solfsmy, config.inputs.dtcfile);
  run.addInputs('jb2008', { 'SOLFSMY.TXT': set.sha256.solfsmy, 'DTCFILE.TXT': set.sha256.dtcfile });
  const gfz = readGfzKp(config.inputs.gfzKp);
  run.addInputs('spaceWeather', { [path.basename(config.inputs.gfzKp)]: gfz.sha256 });
  const rsga = readRsga(config.inputs.swpcRsga, path.join(repoRoot, 'runs', 'cache', 'rsga'));
  run.addInputs('swpcRsga', rsga.files);
  const kernel = kernelFrame(kernelBytes);
  const codec = await estimationCodec(modulesRoot(), path.join(repoRoot, 'node_modules/space-data-module-sdk/schemas/orbpro'));
  const ctx = Object.fromEntries(Object.entries(loaded).map(([k, v]) => [k.split('/')[1], v]));
  return {
    ...ctx,
    'gp-error-model': loaded['analysis/gp-error-model'], 'epoch-state': loaded['analysis/epoch-state'], 'maneuver-detection': loaded['analysis/maneuver-detection'],
    codec, set, gfz, rsga,
    // E7's contract (methods.mjs fitArc and ffmErrors call it): the environment frames for a propagation over
    // [fromMs, toMs]. env: {drivers: 'released' | 'published', cutoffMs, a00 (K, JB2008 only) | null}.
    inputsFor(fromMs, toMs, forces, env) {
      const from = mjd(fromMs) - 2, to = mjd(toMs) + 2;
      const frames = [kernel, eopFrameOf(releasedEopRecords(eop.records, env.cutoffMs, 1, from, to), from, to)];
      if (forces.drag && forces.atmosphere === 'JB2008') {
        if (env.drivers !== 'published') throw new Error('JB2008 runs on SET\'s drivers as published (PLAN.md 6.3)');
        frames.push(jb2008Frame(jb2008RowsWithOffset(set, fromMs - 6 * DAY_MS, toMs + 2 * DAY_MS, env.a00 ?? null)));
      } else if (forces.drag) {
        if (env.drivers !== 'released' || env.a00) throw new Error('NRLMSISE-00 runs on drivers released at the cutoff, without a DTC offset');
        frames.push(spaceWeatherFrame(releasedSpwRows(gfz, rsga, env.cutoffMs, fromMs - 2 * DAY_MS, toMs + 2 * DAY_MS).rows));
      }
      return frames;
    },
    async destroy() { for (const m of Object.values(loaded)) await m.destroy(); },
  };
}

// E13's correction a00(t) [K] at an issue time: the causal nowcast and forecast of E13's selected solver on the
// calibration Doves' arcs that ended at least 6 h before the cutoff, over kappa of JB2008 at 490 km (E13 4.4, R2).
export async function e13Correction(ctx, run) {
  const S = e13config.analysis.solver;
  const sample = readJson(path.join(repoRoot, config.inputs.e13.sample));
  const selectionPath = path.join(repoRoot, config.inputs.e13.selection);
  const selection = readJson(selectionPath);
  run.addInputs('e13', { selection: sha256(fs.readFileSync(selectionPath)), sample: sha256(fs.readFileSync(path.join(repoRoot, config.inputs.e13.sample))) });
  const arcs = [];
  for (const split of config.inputs.e13.splits) {
    const file = path.join(config.inputs.e13.planetArcs, `${split}-${config.inputs.e13.arcProfile}.jsonl`);
    const bytes = fs.readFileSync(file);
    run.addInputs('e13Arcs', { [path.basename(file)]: sha256(bytes) });
    arcs.push(...arcsFromRows(bytes.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)), { hwids: sample.calibration, maxRelativeSigma: S.arcUse.maximumRelativeSigma, positiveOnly: S.arcUse.positiveOnly }));
  }
  const solverOptions = { huberK: S.huberK, iterations: S.iterations, tolerance: S.tolerance, scaleSweeps: S.scaleSweeps, minDovesPerNode: S.minimumDovesPerNodeInterval, minNodeInfo: S.minimumNodeInfo };
  const nowOptions = { latencyHours: config.q2.e13.latencyHours, historyDays: config.q2.e13.historyDays, nodeHours: selection.solver.nodeHours, baseline: selection.solver.baseline, smoothSigma: selection.solver.smoothSigma ?? null, lagHours: selection.lagHours ?? 0, ...solverOptions };
  const kappa = new Map();
  const kappaOf = async (t) => {
    const d = dayIso(t);
    if (!kappa.has(d)) Object.entries(await kappaTable({ dc: ctx['density-calibration'], set: ctx.set }, [d])).forEach(([k, v]) => kappa.set(k, v.kappa));
    return kappa.get(d);
  };
  const cache = new Map();
  return {
    arcs: arcs.length, tauHours: selection.tauHours, solver: selection.solver.label,
    // {a00: (t) -> K, info} or null when no arc is available for the nowcast.
    async at(issueMs, spanFromMs, spanToMs) {
      const key = `${issueMs}`;
      if (!cache.has(key)) cache.set(key, nowcast(arcs, issueMs, nowOptions));
      const sol = cache.get(key);
      if (!sol) return null;
      const days = [];
      for (let t = Math.floor(spanFromMs / DAY_MS) * DAY_MS - 6 * DAY_MS; t <= spanToMs + 3 * DAY_MS; t += DAY_MS) days.push(t);
      const table = new Map();
      for (const t of days) table.set(dayIso(t), await kappaOf(t));
      const k = (t) => table.get(dayIso(t)) ?? table.get(dayIso(days.at(-1)));
      return { a00: (t) => sAt(sol, t, selection.tauHours) / k(t), info: { arcsUsed: sol.usedArcs, latestArcEnd: new Date(sol.latestArcEndMs).toISOString(), a00AtIssueK: sAt(sol, issueMs, selection.tauHours) / k(issueMs) } };
    },
  };
}
