// E11 step 50: products for E9. Every converged OMM-fit of every captured version
// in a window, one JSON line each.
//   node experiments/e11-omm-fit/steps/50-products.mjs --window dev|validation|test
// Each line holds:
// - provider, norad, version, issue time and fit id;
// - CCSDS OMM fields (epoch and mean elements, full precision, TEME, SGP4);
// - the exact fit statistics over the window (every point; per-coordinate =
//   3D / sqrt 3) and the half-split closure;
// - the SupGP gate when paired;
// - the raw file's sha256 and terms, and where the $OMM record is stored
//   (file, offset, length).
// No orbit computation: the fits were made by analysis/gp-error-model in the
// capture. The test window only lists products here; its comparisons are step
// 40's.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, configPath, assertWindowReadable } from '../common.mjs';
import { startRun } from '../../../harness/provenance.mjs';
import { versions } from '../analysis.mjs';

const { values } = parseArgs({ options: { window: { type: 'string', default: 'dev' }, modules: { type: 'string' } } });
assertWindowReadable(values.window);
const modulesDir = values.modules ?? '/Users/tj/software/worktrees/space-data-network-modules--omm-fit-20261010';
const run = startRun({ experiment: config.experiment, step: `50-products-${values.window}`, configPath, modulesDir, args: values });
const lines = [];
for (const v of versions(values.window)) {
  const s = v.stats;
  for (const o of s.omm ?? []) {
    if (!o.converged) continue;
    const gate = o.id.startsWith('celestrak') ? (s.gate ?? []).find((g) => g.id === o.id) : null;
    lines.push({
      provider: v.provider, norad: v.norad, version: v.version, created: v.created, fit: o.id, window: [o.options?.from, o.options?.to],
      omm: { CCSDS_OMM_VERS: 3.0, CENTER_NAME: 'EARTH', REF_FRAME: 'TEME', TIME_SYSTEM: 'UTC', MEAN_ELEMENT_THEORY: 'SGP4', NORAD_CAT_ID: v.norad, EPOCH: o.epoch, ...o.elements },
      rms: o.rms, closure: o.closure?.rms ?? null, iterations: o.iterations, stop: o.stop,
      supgpGate: gate && { supgpEpoch: gate.supgpEpoch, publishedRmsKm: gate.publishedRmsKm, recomputedRmsKm: gate.recomputedRmsKm, pass: gate.pass },
      source: { url: s.url, sha256: s.source?.sha256, bytes: s.source?.bytes, terms: s.source?.terms },
      record: { file: v.ommPath, offset: v.ommOffset, length: v.ommLength },
    });
  }
}
run.write('products.jsonl', `${lines.map((l) => JSON.stringify(l)).join('\n')}\n`);
run.finish({ products: lines.length, versions: new Set(lines.map((l) => l.version)).size });
console.log(`run ${run.id}: ${lines.length} products from ${new Set(lines.map((l) => l.version)).size} versions -> ${path.join(run.dir, 'products.jsonl')}`);
