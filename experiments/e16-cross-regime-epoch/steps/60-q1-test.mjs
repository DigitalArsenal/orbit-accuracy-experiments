// Step 60, Q1 on the test window, once (PLAN.md 5.4–5.6): the selection's models (fitted on the train window, never
// refitted) correct the held-out objects' test OMMs — M* in every tier and fold, and each family's best in tier O —
// and the corrected OMMs are scored by the modules at ages 0, 1 and 3 days (rescore.mjs). Opens only with both locks.
// Writes runs/<run>/q1-test.jsonl.gz (per-sample errors: never committed).
//
//   node experiments/e16-cross-regime-epoch/steps/60-q1-test.mjs --window test
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startRun } from '../../../harness/provenance.mjs';
import { SELECTION_FILE, cli, config, configPath, modulesRoot, readJson, repoRoot, resultsDir, sha256 } from '../common.mjs';
import { Fleet, clipKept, correctionOf, fleetSample, loadSamples } from '../q1lib.mjs';
import { rescoreAll } from '../rescore.mjs';
import { windowSets } from '../sets.mjs';

const { window, locks, values } = cli({ workers: { type: 'string' } });   // --workers: an operating limit (load), not a result
if (window !== 'test') throw new Error('step 60 reads the test window');
const run = startRun({ experiment: config.experiment, step: '60-q1-test', configPath, modulesDir: modulesRoot(), args: { window } });
run.manifest.locks = locks;
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

// The selection pins every file the test applies.
const selection = readJson(path.join(repoRoot, SELECTION_FILE));
for (const [f, h] of Object.entries(selection.files)) if (sha256(fs.readFileSync(path.join(repoRoot, f))) !== h) throw new Error(`${f} differs from the file the selection pinned`);
run.addInputs('selection', { 'selection.json': sha256(fs.readFileSync(path.join(repoRoot, SELECTION_FILE))), ...selection.files });
const inventory = readJson(path.join(resultsDir, 'inventory.json'));
const meta = new Map(inventory.objects.filter((o) => !o.excluded).map((o) => [o.norad, o]));
const models = readJson(path.join(resultsDir, 'selection', 'q1-models.json'));
const classes = Object.keys(config.regimes);
const test = loadSamples('test', classes), prev = loadSamples('validation', ['LEO-PL', 'LEO-POD', 'SLR-LEO']);
run.manifest.sampleRuns = { test: test.runs, validationFleet: prev.runs };
const kept = new Set([...clipKept(test.rows).kept, ...clipKept(prev.rows).kept]);
const fleetRows = [...prev.rows, ...test.rows].filter((r) => kept.has(r.gpId) && r.errors[0] && meta.get(r.norad)?.group === 'LEO');
const usable = (r, group) => r.errors[0] && meta.get(r.norad)?.group === group && (group !== 'LEO' || r.W);
const C2min = config.q1.groups.LEO.families.C2.minimumContributors;

const dt = new Map();   // gpId -> {key: s}
function apply(group, spec, scales, key, model, heldOut) {
  const out = new Set(heldOut);
  const rows = test.rows.filter((r) => usable(r, group) && out.has(r.norad));
  const fleet = group === 'LEO' && (spec.family === 'C2' || spec.family === 'C3') ? new Fleet(fleetRows.filter((r) => !out.has(r.norad)).map(fleetSample)) : null;
  for (const r of rows) {
    const row = { ...r, fleet: fleet ? fleet.value(r, spec.L, spec.dn, C2min) : null };
    if (!dt.has(r.gpId)) dt.set(r.gpId, {});
    dt.get(r.gpId)[key] = correctionOf({ candidate: spec, standardizer: model.standardizer, fit: model.fit }, row, scales);
  }
  return rows.length;
}
for (const group of ['LEO', 'MEO/GEO']) {
  const g = models[group];
  for (const [tf, m] of Object.entries(g.tiers)) {
    const n = apply(group, g.spec, g.scales, `M*|${m.tier}`, m, m.heldOut);
    log(`${group} ${tf}: ${n} held-out test samples`);
  }
  for (const [fam, fb] of Object.entries(g.familyBest)) {
    for (const [tf, m] of Object.entries(fb.tiers)) {
      const fold = m.fold;
      const heldOut = [...meta.values()].filter((o) => o.group === group && o.tiers.O === fold).map((o) => o.norad);
      apply(group, fb.spec, g.scales, `${fam}|O`, m, heldOut);
    }
  }
}
const byClass = {};
for (const r of test.rows) {
  if (!dt.has(r.gpId)) continue;
  const targets = Object.entries(r.errors).filter(([, e]) => e).map(([age, e]) => ({ age, ms: e.targetMs, file: e.file }));
  (byClass[r.cls] ??= []).push({ gpId: r.gpId, norad: r.norad, targets, dt: dt.get(r.gpId) });
}
const setsById = new Map(windowSets('test', inventory.objects.map((o) => o.norad)).sets.map((s) => [s.gpId, s]));
log(`rescoring ${Object.values(byClass).reduce((a, x) => a + x.length, 0)} test samples`);
const scored = await rescoreAll({ window: 'test', byClass, setsById, log, ...(values.workers ? { workers: Number(values.workers) } : {}) });
const out = [];
for (const r of test.rows) {
  out.push({ gpId: r.gpId, norad: r.norad, cls: r.cls, group: meta.get(r.norad)?.group ?? null, epochMs: r.epochMs, inClip: kept.has(r.gpId),
    c0: Object.fromEntries(Object.entries(r.errors).map(([a, e]) => [a, e ? e.e : null])),
    dt: dt.get(r.gpId) ?? {}, corrected: Object.fromEntries(Object.keys(dt.get(r.gpId) ?? {}).map((k) => [k, scored[k]?.[r.gpId] ?? null])) });
}
const file = run.write('q1-test.jsonl.gz', zlib.gzipSync(out.map((x) => JSON.stringify(x)).join('\n')));
run.finish({ samples: out.length, corrected: dt.size, output: path.relative(repoRoot, file) });
log(`done: ${out.length} test samples, ${dt.size} corrected`);
