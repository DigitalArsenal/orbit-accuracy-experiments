#!/usr/bin/env node
// E8 step 10: the D5 fits (analysis/density-calibration `calibrate_decay`).
//   analysis  one fit per window span: nodes from fitLeadDays before the first
//             issue day to scoreDays after the last, every set whose epoch lies
//             there (the latest version of each).
//   forecast  one fit per issue day t0: the spanDays before t0, the sets
//             created before t0 (of each epoch the latest version created
//             before t0). 2026 windows only (the historical sets carry no
//             creation times).
// The calibration set is the first --per-bin objects of each bin of a step 08
// pool, with their ln B priors (--no-priors drops them: the identifiability
// diagnostic). The module estimates; this file selects sets and routes them.
//
//   node .../10-estimate.mjs --window W --pool RUN --mode analysis|forecast --per-bin K --structure global|linear
//        [--no-priors] [--days YYYY-MM-DD,...] [--shard k/n] [--resume RUN]
// Each fit is appended to partial.jsonl as it completes; --resume continues
// an unfinished run (the same config bytes and modules checkout).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startRun } from '../../../harness/provenance.mjs';
import { callJson, config, configPath, DAY_MS, dayMs, isHistorical, isoDay, issueDays, jb2008Rows, loadModules, mjdOfMs, modulesDir, readRun, runConfigHash, windowSpans } from '../common.mjs';
import { asModuleSet, asOf, readCache } from '../omm.mjs';

const { values } = parseArgs({ options: {
  window: { type: 'string' }, pool: { type: 'string' }, mode: { type: 'string' }, 'per-bin': { type: 'string' }, structure: { type: 'string' },
  'no-priors': { type: 'boolean', default: false }, days: { type: 'string' }, shard: { type: 'string', default: '0/1' }, modules: { type: 'string' }, resume: { type: 'string' },
} });
const spans = windowSpans(values.window);
if (!['analysis', 'forecast'].includes(values.mode)) throw new Error('--mode analysis|forecast');
if (values.mode === 'forecast' && isHistorical(values.window)) throw new Error('forecast mode needs creation times (2026 windows only)');
const K = Number(values['per-bin']);
if (!config.pool.candidates.perBin.includes(K)) throw new Error(`--per-bin must be one of ${config.pool.candidates.perBin}`);
const altitudeKm = config.decay.structures[values.structure];
if (!altitudeKm) throw new Error(`--structure must be one of ${Object.keys(config.decay.structures)}`);
const [shard, shards] = values.shard.split('/').map(Number);
const tag = `${values.mode}-${values.window}-K${K}-${values.structure}${values['no-priors'] ? '-nopriors' : ''}`;
const run = startRun({ experiment: config.experiment, step: `10-estimate-${tag}-${shard}of${shards}`, configPath, modulesDir: modulesDir(values.modules), args: values, resume: values.resume });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const { loaded } = await loadModules(run, ['analysis/density-calibration'], values);
const dc = loaded['analysis/density-calibration'];
const pool = readRun(values.pool, 'pool.json');
if (pool.window !== values.window) throw new Error(`pool ${values.pool} is for ${pool.window}`);
run.addInputs('pool', { [values.pool]: runConfigHash(values.pool) });
const d = config.decay;

// One calibrate_decay call over [fromMs, toMs] with the sets chosen by select(rows).
async function fit(objects, fromMs, toMs, select) {
  const request = {
    jb2008: { rows: jb2008Rows(isoDay(fromMs - 7 * DAY_MS), isoDay(toMs + 2 * DAY_MS)) },
    nodes: { fromMjd: mjdOfMs(fromMs), toMjd: mjdOfMs(toMs), stepHours: d.nodeHours, altitudeKm },
    priors: d.priors, stepSeconds: d.stepSeconds, maxGapDays: d.maxGapDays, sigmaFloorM: d.sigmaFloorM, editSigma: d.editSigma,
    iterations: d.iterations, reweightIterations: d.reweightIterations, tolerance: d.tolerance, minSets: d.minimumSets,
    objects: objects.map((o) => ({ id: String(o.norad), sets: select(o.rows).map(asModuleSet), ...(o.prior && !values['no-priors'] ? { lnBPrior: o.prior } : {}) })),
  };
  const started = performance.now();
  const out = await callJson(dc, 'calibrate_decay', 'request', request);
  out.computeSeconds = (performance.now() - started) / 1000;
  out.setsGiven = request.objects.reduce((a, o) => a + o.sets.length, 0);
  return out;
}

const result = { window: values.window, mode: values.mode, perBin: K, structure: values.structure, noPriors: values['no-priors'], pool: values.pool, spans: [] };
const partialFile = path.join(run.dir, 'partial.jsonl');
const done = new Map(fs.existsSync(partialFile) ? fs.readFileSync(partialFile, 'utf8').split('\n').filter(Boolean).map((l) => { const f = JSON.parse(l); return [`${f.span}|${f.issue}`, f.fit]; }) : []);
const keep = (span, fitOut) => fs.appendFileSync(partialFile, `${JSON.stringify({ span, issue: fitOut.issue, fit: fitOut })}\n`);
let job = 0;
for (const [k, span] of spans.entries()) {
  const cache = readCache(`${values.window}-${k}`);
  run.addInputs('elementSetCache', { [`${values.window}-${k}`]: cache.sha256 });
  const chosen = pool.spans[k].bins.flatMap((b) => b.chosen.slice(0, K));
  const objects = chosen.map((c) => ({ ...c, rows: cache.objects.get(c.norad)?.rows ?? [] }));
  const entry = { span, objects: chosen.map((c) => ({ norad: c.norad, tier: c.tier, prior: c.prior, perigeeKm: c.perigeeKm })), fits: [] };
  if (values.mode === 'analysis') {
    if (job++ % shards !== shard) continue;
    const from = dayMs(span.from) - d.fitLeadDays * DAY_MS, to = dayMs(span.to) + d.scoreDays * DAY_MS;
    if (done.has(`${k}|null`)) { entry.fits.push(done.get(`${k}|null`)); log(`${span.from}..${span.to} analysis: from the partial file`); result.spans.push(entry); continue; }
    const out = await fit(objects, from, to, (rows) => asOf(rows, from, to + 1, null));
    entry.fits.push({ issue: null, fromMjd: mjdOfMs(from), toMjd: mjdOfMs(to), ...out });
    keep(k, entry.fits.at(-1));
    log(`${span.from}..${span.to} analysis: ${out.fit.objects} objects, ${out.fit.observations} sets used, ${out.fit.iterations} iterations, converged ${out.fit.converged}, level ${out.fit.level.map((l) => `${l.meanK.toFixed(1)}+-${l.sigmaK?.toFixed(1)}`).join(' ')} K, ${out.computeSeconds.toFixed(0)} s`);
  } else {
    for (const t0 of issueDays([span]).filter((t) => !values.days || values.days.split(',').includes(isoDay(t)))) {
      if (job++ % shards !== shard) continue;
      const from = t0 - d.forecast.spanDays * DAY_MS;
      if (done.has(`${k}|${isoDay(t0)}`)) { entry.fits.push(done.get(`${k}|${isoDay(t0)}`)); continue; }
      const out = await fit(objects, from, t0, (rows) => asOf(rows, from, t0, t0));
      entry.fits.push({ issue: isoDay(t0), fromMjd: mjdOfMs(from), toMjd: mjdOfMs(t0), ...out });
      keep(k, entry.fits.at(-1));
      log(`${isoDay(t0)} forecast: ${out.fit.objects} objects, ${out.fit.observations} sets used, ${out.fit.iterations} iterations, converged ${out.fit.converged}, value at t0 ${out.correction.values.at(-1).map((v) => v.toFixed(1)).join('/')} K, ${out.computeSeconds.toFixed(0)} s`);
    }
  }
  result.spans.push(entry);
}
run.write('estimates.json', result);
run.finish({ fits: result.spans.reduce((a, s) => a + s.fits.length, 0) });
log('done');
