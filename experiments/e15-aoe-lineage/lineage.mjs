#!/usr/bin/env node
// E15, descriptive (PLAN.md section 7, "AOE may ingest US data"): how close is each AOE set to what Space-Track had
// published when AOE wrote it? For every object in both catalogs, the AOE set of a snapshot is compared, at its own epoch,
// with the newest Space-Track set created at or before the AOE set's ctime, propagated there by SGP4: analysis/gp-error-model
// common_epoch (origin: the Space-Track set; the difference in its RTN axes, GCRF). An AOE set derived from Space-Track's by
// propagation and refit sits metres from it; independent orbit determinations differ by the two catalogs' errors. No truth
// is read. Train-window snapshots only.
//
//   node experiments/e15-aoe-lineage/lineage.mjs [--days 2026-10-11,...]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { json, loadModule } from '../../harness/modules.mjs';
import { ommFrame } from '../../harness/records.mjs';
import { repoRoot, startRun } from '../../harness/provenance.mjs';
import { median, quantile } from '../../harness/stats.mjs';
import { PATHS } from './settings.mjs';
import { config, configPath, issueDays } from './lib/windows.mjs';
import { readSnapshot, snapshotDays } from './lib/aoe.mjs';
import { StCatalog } from './lib/st.mjs';

const { values } = parseArgs({ options: { days: { type: 'string' }, 'no-results': { type: 'boolean' } } });
const train = new Set(issueDays('train'));
const days = (values.days ? values.days.split(',') : snapshotDays()).filter((d) => train.has(d));
if (!days.length) throw new Error('no train-window AOE snapshot to compare');
const run = startRun({ experiment: config.experiment, step: 'lineage', configPath, modulesDir: PATHS.scoreModules, args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const scorer = await loadModule(PATHS.scoreModules, 'analysis/gp-error-model');
run.addModule(scorer.provenance);
const BATCH = 400;
const out = { days: {}, byType: {} };

for (const day of days) {
  const snap = readSnapshot(day);
  run.addInputs('aoe', { [`${day}/records.jsonl`]: snap.sha256.records });
  const sets = snap.sets;
  const norads = new Set(sets.map((s) => s.norad));
  const st = new StCatalog(day, day, { keep: (n) => norads.has(n) });
  run.addInputs('gpHistory', st.files);
  const pairs = [];
  let noSt = 0, sameEpoch = 0;
  for (const a of sets) {
    const b = st.latest(a.norad, Math.min(a.ctimeMs, Date.parse(`${day}T23:59:59Z`)));
    if (!b) { ++noSt; continue; }
    // common_epoch matches sets by epoch within 1 s; a pair that close is counted and compared element by element.
    if (Math.abs(b.epochMs - a.epochMs) < 1000) { ++sameEpoch; continue; }
    pairs.push({ a, b });
  }
  const diffs = [];
  for (let i = 0; i < pairs.length; i += BATCH) {
    const batch = pairs.slice(i, i + BATCH);
    const res = await scorer.invokeJson('common_epoch', [ommFrame(batch.flatMap(({ a, b }) => [a, b])), json('options', {
      targets: batch.map(({ a, b }) => ({ norad: a.norad, epoch: `${a.epoch}Z`, sets: [`${a.epoch}Z`], origin: 'set', originSet: `${b.epoch}Z` })),
    })], 'differences');
    res.targets.forEach((t, k) => {
      const d = t.sets?.[0];
      if (!d) return;
      const { a, b } = batch[k];
      diffs.push({ norad: a.norad, type: a.objectType ?? 'UNKNOWN', km: Math.hypot(d.rtn[0], d.rtn[1], d.rtn[2]), rtn: d.rtn.slice(0, 3), stAgeDays: (a.epochMs - b.epochMs) / 86400000 });
    });
  }
  const km = diffs.map((d) => d.km);
  const frac = (x) => km.filter((v) => v < x).length / km.length;
  out.days[day] = {
    aoeSets: sets.length, noSpaceTrack: noSt, sameEpochWithin1s: sameEpoch, compared: diffs.length,
    medianKm: median(km), quantilesKm: { p05: quantile(km, 0.05), p25: quantile(km, 0.25), p75: quantile(km, 0.75), p95: quantile(km, 0.95) },
    within: { '10 m': frac(0.01), '100 m': frac(0.1), '1 km': frac(1), '10 km': frac(10) },
    medianSpaceTrackAgeDays: median(diffs.map((d) => d.stAgeDays)),
  };
  for (const d of diffs) (out.byType[d.type] ??= []).push(d.km);
  log(`${day}: ${diffs.length} AOE sets compared with Space-Track's newest set at their write time; median ${median(km).toFixed(3)} km; within 100 m ${(frac(0.1) * 100).toFixed(1)} %`);
}
out.byType = Object.fromEntries(Object.entries(out.byType).map(([k, v]) => [k, { n: v.length, medianKm: median(v), within100m: v.filter((x) => x < 0.1).length / v.length }]));
run.write('metrics.json', out);
run.finish();
await scorer.destroy();
if (!values['no-results']) {
  const dir = path.join(repoRoot, 'results', 'e15', run.id);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['manifest.json', 'metrics.json']) fs.copyFileSync(path.join(run.dir, f), path.join(dir, f));
  log(`-> ${path.relative(repoRoot, dir)}`);
}
console.log(JSON.stringify(out, null, 1));
