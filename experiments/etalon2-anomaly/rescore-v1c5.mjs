// V1c5 re-derived without the truth samples that fall on the days the ILRS combination is wrong (compare.mjs: the combination far from every
// analysis center while the centers agree), with V1c5's own code and its durable run: (a) as published; (b) the same frozen models, those
// samples removed from the test (the object labeled, not dropped: every removed sample is counted); (c) the cross-validation and the selection
// from the fold scores without those samples, the selected candidate refitted in WASM on the training arcs without them, and the test rescored.
//   node experiments/etalon2-anomaly/rescore-v1c5.mjs <findings.json> [--run /opt/data/sdn-archive/v1c5] > rescore-v1c5.json
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const here = path.dirname(new URL(import.meta.url).pathname);
const v = (name) => import(path.join(here, '../v1c5', name));
const [{ config, configs, registration, read }, cv, { compactCell }, { deriveMetrics, scoresFile }] = await Promise.all([v('common.mjs'), v('cv.mjs'), v('train.mjs'), v('test.mjs')]);
const { loadModule } = await import(path.join(here, '../../harness/modules.mjs'));
const findings = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const runDir = process.argv.includes('--run') ? process.argv[process.argv.indexOf('--run') + 1] : config.durableRunDirectory;
const NORAD = { etalon1: 19751, etalon2: 20026, lageos1: 8820, lageos2: 22195 };
// a sample is affected when its truth time lies within WINDOW_MS of a wrong epoch: the truth is interpolated (Lagrange, degree 5 by default in
// analysis/reference-states) through the six nearest 15-min states, so a wrong state reaches the samples up to 45 min from it
const WINDOW_MS = 3600e3;
const bad = findings.wrongDays.flatMap((d) => d.wrongEpochs.map((e) => ({ norad: NORAD[d.satellite], ms: Date.parse(e.epoch) })));
const jsonl = (f) => fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
const safe = (name) => name.replace(/[/|]/g, '_');
const isBad = (a, s) => bad.some((b) => b.norad === a.norad && Math.abs(s.ms - b.ms) <= WINDOW_MS);
const removed = { training: 0, cv: 0, test: 0 };
const strip = (arcs, kind) => arcs.map((a) => { const keep = (a.samples ?? []).filter((s) => !isBad(a, s)); removed[kind] += (a.samples?.length ?? 0) - keep.length; return { ...a, samples: keep }; });
const spec = read(path.join(here, '../v1c5/candidates.json'));
const candidates = cv.candidatesOf(spec);
const sel = read(path.join(here, '../../results/v1c5/selection.json'));
const published = read(path.join(here, '../../results/v1c5/metrics.json'));
const flagsTrain = jsonl(path.join(runDir, 'events-train.jsonl')), flagMap = new Map(flagsTrain.map((r) => [r.key, r.flagged])), recordsTrain = new Map(flagsTrain.map((r) => [r.key, r]));
const flagsTest = jsonl(path.join(runDir, 'events-test.jsonl')), recordsTest = new Map(flagsTest.map((r) => [r.key, r]));
const training = jsonl(path.join(runDir, 'train-sgp.jsonl')), testArcs = jsonl(path.join(runDir, 'test-sgp.jsonl'));

// (b) the frozen models, the corrupt-day samples removed from the test
const scoredBy = Object.fromEntries(candidates.map((c) => [c.name, strip(jsonl(path.join(runDir, scoresFile(c.name))), 'test')]));
const labeled = deriveMetrics({ config, configs, spec, registration, sel, arcs: testArcs, flagRecords: flagsTest, scoredBy });
removed.test /= candidates.length;

// (c) cross-validation and selection without them, the selected candidate refitted and rescored
const foldCells = {};
for (const c of candidates) {
  const rows = strip(jsonl(path.join(runDir, `cv-${safe(c.name)}-scores.jsonl`)), 'cv');
  foldCells[c.name] = {};
  for (const id of sel.evaluationFolds) foldCells[c.name][id] = cv.cellsOf(cv.claimed(rows.filter((r) => r.fold === id).map(({ fold, ...a }) => a), c.claim, flagMap), configs);
}
removed.cv /= candidates.length;
const share = training.filter((a) => flagMap.get(a.key)).length / training.length;
const reselected = cv.selectCv(foldCells, candidates, spec, (c) => c.claim === 'ALL' || share <= spec.selection.flagShareCap);
const cleanTraining = strip(training, 'training');
const runtime = path.join(runDir, 'runtime');
const gp = await loadModule(runtime, 'analysis/gp-error-model');
const codec = await import(pathToFileURL(path.join(runtime, 'analysis/gp-error-model/scripts/erm-codec.mjs')));
const corrected = {};
try {
  for (const name of [...new Set([sel.selected, reselected.selected])]) {
    const c = candidates.find((x) => x.name === name);
    const fit = c.method === 'none' ? { model: null } : await cv.fitTiered(gp, codec, cv.fitRows(cleanTraining, { base: c.base, tiering: c.tiering, claim: c.claim, flagRecords: recordsTrain, spec }), c.method, config, `v1c5-${c.name}-etalon-clean`, cv.tierGroups(c, spec));
    const scored = strip(await cv.scoreArcs({ gp, codec, model: fit.model, arcs: testArcs, base: c.base, tiering: c.tiering, flagRecords: recordsTest, spec }), 'refit');
    const m = deriveMetrics({ config, configs, spec, registration, sel: { ...sel, selected: name }, arcs: testArcs, flagRecords: flagsTest, scoredBy: { ...scoredBy, [name]: scored } });
    corrected[name] = { realistic: m.candidates[name].realistic, cells: m.candidates[name].cells };
  }
} finally { await gp.destroy(); }

const claimedOf = (m, name) => m.candidates[name]?.realistic?.claimed;
const slrMeo = (cells) => Object.fromEntries(['all', 'unflagged'].map((view) => [view, (cells?.[view] ?? []).filter((x) => /SLR MEO/.test(x.group ?? '')).map((x) => ({ hours: x.hours, n: x.n, objects: x.objects, meanD2Over3: x.mean?.[0] ?? null, coverage95: x.coverage?.[0] ?? null, decision: x.decision }))]));
const out = {
  rule: 'samples of an object whose truth time lies within 1 h of an epoch compare.mjs finds wrong in the ILRS combination are removed and counted',
  wrongDays: findings.wrongDays, removedSamples: { test: removed.test, crossValidation: removed.cv, training: removed.training },
  published: { selected: sel.selected, claimed: claimedOf(published, sel.selected), candidates: Object.fromEntries(candidates.map((c) => [c.name, claimedOf(published, c.name)])), slrMeoCellsOfSelected: slrMeo(published.candidates[sel.selected].cells) },
  labeled: { selected: sel.selected, claimed: claimedOf(labeled, sel.selected), candidates: Object.fromEntries(candidates.map((c) => [c.name, claimedOf(labeled, c.name)])), slrMeoCellsOfSelected: slrMeo(labeled.candidates[sel.selected].cells), extremes: labeled.extremes },
  crossValidation: { publishedSelected: sel.selected, reselected: reselected.selected, ranking: reselected.ranked.slice(0, 8) },
  corrected: Object.fromEntries(Object.entries(corrected).map(([name, x]) => [name, { claimed: x.realistic.claimed, all: x.realistic.all, unflagged: x.realistic.unflagged, slrMeoCells: slrMeo(x.cells) }])),
};
process.stdout.write(`${JSON.stringify(out, null, 1)}\n`);
