// Amendment A11c, M31: the first available files of the new batch seen in the capture cycle of 2026-10-24T05:01Z (provisional ids 799501701 to 799501727). Each current file is fetched into
// memory (one request at a time, the paced fetch of lib/spacex.mjs; never written), fitted by analysis/od and propagated by FFM-1 for 96 h exactly as the registered Starlinks are (truth.mjs
// `satellite()`), and only the derived trajectory and the fit are kept, under <store>/m31/. The fits of 6, 12 and 24 h and their scoring on newer files are a later step.
//   node experiments/sdn-gp-starlink-ffm-match/m31-capture.mjs [--only 799501701,799501702] [--workers k/n]
//   node experiments/sdn-gp-starlink-ffm-match/m31-capture.mjs --summary      (writes results/sdn-gp-starlink-ffm-match/m31-capture.json: derived values only)
import fs from 'node:fs';
import path from 'node:path';
import { config, frozen, store, write, args, results } from './common.mjs';
import { quantile } from './lib/windows.mjs';
import { modulesRoot } from './lib/modules.mjs';
import { openBaselines } from './lib/baselines.mjs';
import { loadEnvironment } from './lib/ffm.mjs';
import { satellite } from './truth.mjs';

if (args.summary) {
  const dir = path.join(store, 'm31');
  const rowFiles = fs.readdirSync(path.join(dir, 'rows')).filter((n) => /^\d+\.json$/.test(n)), failed = fs.readdirSync(path.join(dir, 'rows')).filter((n) => /\.failed\.json$/.test(n));
  const rows = rowFiles.map((n) => ({ row: JSON.parse(fs.readFileSync(path.join(dir, 'rows', n), 'utf8')), meta: JSON.parse(fs.readFileSync(path.join(dir, 'truth', n), 'utf8')), mtime: fs.statSync(path.join(dir, 'truth', n)).mtimeMs })).sort((a, b) => a.row.norad - b.row.norad);
  const stat = (list) => ({ n: list.length, min: quantile(list, 0), median: quantile(list, 0.5), p90: quantile(list, 0.9), max: quantile(list, 1) });
  const when = (ms) => new Date(ms).toISOString();
  const ids = rows.map((x) => x.row.norad), starts = rows.map((x) => Date.parse(`${x.meta.memeStartUtc}Z`)), created = rows.map((x) => Date.parse(`${x.meta.memeCreatedUtc}Z`));
  const day = (key) => Object.fromEntries([1, 2, 3].map((k) => [k, stat(rows.filter((x) => x.row.ffm[key]?.ok).map((x) => x.row.ffm[key].days[k].rmsKm))]));
  write(path.join(results, 'm31-capture.json'), {
    generatedFrom: 'derived values of the 27 satellites of the batch first seen in the capture cycle of 2026-10-24T05:01Z (raw files not kept)', satellites: 27, firstId: 799501701, lastId: 799501727, captured: rows.length, failed: failed.length, ids,
    processed: { first: when(Math.min(...rows.map((x) => x.mtime))), last: when(Math.max(...rows.map((x) => x.mtime))) }, fileStart: { min: when(Math.min(...starts)), max: when(Math.max(...starts)) }, fileCreated: { min: when(Math.min(...created)), max: when(Math.max(...created)) },
    fitRmsKm: stat(rows.map((x) => x.row.fit.rmsKm)), bEff: stat(rows.map((x) => x.row.fit.bEffM2Kg)), bEffZeroBound: rows.filter((x) => x.row.fit.bEffAtZeroBound).length, notConverged: rows.filter((x) => x.row.fit.convergence !== 'converged').length,
    xpDays: day('xp'), sgp4Days: day('sgp4'), xpFailed: rows.filter((x) => !x.row.ffm.xp?.ok).length, sgp4Failed: rows.filter((x) => !x.row.ffm.sgp4?.ok).length,
  });
  console.log(`m31-capture.json: ${rows.length} captured, ${failed.length} failed`);
  process.exit(0);
}
frozen();
const modules = modulesRoot();
const context = await loadEnvironment(modules, { archive: config.archive, store });
const baselines = await openBaselines(modules);
const rowsDir = path.join(store, 'm31/rows'), truthDir = path.join(store, 'm31/truth');
fs.mkdirSync(rowsDir, { recursive: true }); fs.mkdirSync(truthDir, { recursive: true });
const ids = args.only ? args.only.split(',').map(Number) : Array.from({ length: 27 }, (_, i) => 799501701 + i);
const [k, n] = (args.workers ?? '0/1').split('/').map(Number);
for (const [i, norad] of ids.entries()) {
  if (i % n !== k) continue;
  if (fs.existsSync(path.join(rowsDir, `${norad}.json`))) continue;
  const t0 = performance.now();
  try {
    await satellite({ norad, population: 'batch', stratum: null, tercile: null, replacements: [] }, context, baselines, modules, { rowsDir, truthDir });
    console.error(`${norad}: ok in ${((performance.now() - t0) / 1000).toFixed(0)} s`);
  } catch (error) {
    const reason = String(error.message).slice(0, 300);
    console.error(`${norad}: FAILED ${reason}`);
    write(path.join(rowsDir, `${norad}.failed.json`), { norad, reason, atUtc: new Date().toISOString() });
    if (/HTTP (403|429)/.test(reason)) break;
  }
}
await baselines.close();
process.exit(0);
