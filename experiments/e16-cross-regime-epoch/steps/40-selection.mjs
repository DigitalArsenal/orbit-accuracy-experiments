// Step 40, the selection (PLAN.md 5.5, 5.6, 6.5): Q2's choices per class from the validation runs (step 55) — of the
// span x B-dot candidates that predict at least 90 % of the validation samples with an S error at 72 h, the lowest
// median 3D error of A at 72 h on the samples every eligible candidate scores (equal: the shorter span, then B-dot
// off) — the test stride from the measured cost (at most 150 CPU-hours, at least 7 days), A-corr's weights, and Q1's
// choices (step 30). Writes results/e16/selection.json; committing it opens the test window.
//
//   node experiments/e16-cross-regime-epoch/steps/40-selection.mjs
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { startRun } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';
import { DAY_MS, SELECTION_FILE, config, configPath, modulesRoot, readJson, repoRoot, resultsDir, sha256, windowSpan } from '../common.mjs';

const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
const run = startRun({ experiment: config.experiment, step: '40-selection', configPath, modulesDir: modulesRoot(), args: process.argv.slice(2) });
const RUNS = path.join(repoRoot, 'runs');
const P = config.q2;

// Step 55's validation runs: the latest finished run per shard.
const latest = new Map();
for (const id of fs.readdirSync(RUNS).filter((n) => n.startsWith(`${config.experiment}-55-q2-run-validation-s`)).sort()) {
  const mf = path.join(RUNS, id, 'manifest.json');
  if (!fs.existsSync(mf)) continue;
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  if (m.finished && !m.args.limit) latest.set(m.shard, id);
}
const rows = [...latest.values()].flatMap((id) => zlib.gunzipSync(fs.readFileSync(path.join(RUNS, id, 'q2.jsonl.gz'))).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)));
log(`validation: ${rows.length} samples from ${latest.size} shards`);
const norm = (e) => Math.hypot(e[0], e[1], e[2]);
const h72 = P.horizonsHours.indexOf(P.choiceHorizonHours);

const chosen = {}, choice = {};
for (const cls of Object.keys(P.candidates)) {
  const mine = rows.filter((r) => r.cls === cls && r.products.S.errors?.[h72]);
  const ids = P.candidates[cls].spanDays.flatMap((s) => P.candidates[cls].bdot.map((b) => `A:${s}d:${b ? 'bdot' : 'b'}`));
  const share = Object.fromEntries(ids.map((id) => [id, mine.filter((r) => r.products[id]?.errors?.[h72]).length / Math.max(1, mine.length)]));
  const eligible = ids.filter((id) => share[id] >= 0.9);
  const paired = mine.filter((r) => eligible.every((id) => r.products[id]?.errors?.[h72]));
  const med = Object.fromEntries(eligible.map((id) => [id, median(paired.map((r) => norm(r.products[id].errors[h72])))]));
  const order = (id) => { const [, s, b] = id.split(':'); return Number(s.replace('d', '')) * 10 + (b === 'bdot' ? 1 : 0); };
  const best = eligible.sort((a, b) => med[a] - med[b] || order(a) - order(b))[0] ?? null;
  const [, span, b] = best ? best.split(':') : [null, `${P.candidates[cls].spanDays[0]}d`, 'b'];
  chosen[cls] = { spanDays: Number(span.replace('d', '')), bdot: b === 'bdot', from: best ?? 'no eligible candidate: the shortest span without B-dot' };
  choice[cls] = { samples: mine.length, pairedSamples: paired.length, shareWithPrediction: share, eligible, medianAt72hM: med, sMedianAt72hM: median(paired.map((r) => norm(r.products.S.errors[h72]))) };
  log(`${cls}: ${best} (${JSON.stringify(Object.fromEntries(Object.entries(med).map(([k, v]) => [k, Math.round(v)])))})`);
}

// Cost: the median CPU seconds of an A-family product, measured on validation, times the test products and samples.
const cpu = median(rows.flatMap((r) => Object.entries(r.products).filter(([id]) => id.startsWith('A')).map(([, p]) => p.info?.cpuMs).filter((x) => Number.isFinite(x)))) / 1000;
const inventory = readJson(path.join(resultsDir, 'inventory.json'));
const [tFrom, tTo] = windowSpan('test', 'LEO-POD');
const testDays = (Date.parse(`${tTo}T00:00:00Z`) - Date.parse(`${tFrom}T00:00:00Z`)) / DAY_MS + 1;
const aProducts = 6;
let stride = P.testStride.minimumDays;
const costHours = (s) => inventory.q2.length * Math.ceil(testDays / s) * aProducts * cpu / 3600;
while (costHours(stride) > P.testStride.budgetCpuHours) ++stride;
log(`A product: median ${cpu.toFixed(1)} CPU s; test stride ${stride} days (${costHours(stride).toFixed(0)} CPU-hours estimated)`);

// A-corr's weights: the published weight with each component scaled by its corrected-to-published RMS (step 30, M*'s
// tier O held-out validation errors): D W D.
const q1 = readJson(path.join(resultsDir, 'selection', 'q1.json'));
const q2train = readJson(path.join(resultsDir, 'selection', 'q2-train.json'));
const correctedWeights = {};
for (const cls of Object.keys(P.candidates)) {
  const c = q1.groups.LEO.covariance[cls];
  const d = c.corrected.map((v, k) => Math.sqrt(v / c.published[k]));
  const W = q2train.classes[cls].weights.secondMomentRtn;
  correctedWeights[cls] = W.map((v, idx) => v * d[Math.floor(idx / 6)] * d[idx % 6]);
}

const git = (...args) => execFileSync('git', ['-C', repoRoot, ...args], { encoding: 'utf8' }).trim();
const files = ['results/e16/inventory.json', 'results/e16/selection/q1.json', 'results/e16/selection/q1-models.json', 'results/e16/selection/q2-train.json'];
const selection = {
  experiment: config.experiment, run: run.id, decided: new Date().toISOString(),
  freezeCommit: git('log', '--format=%H', '--diff-filter=A', '--', 'experiments/e16-cross-regime-epoch/config.json').split('\n').at(-1),
  files: Object.fromEntries(files.map((f) => [f, sha256(fs.readFileSync(path.join(repoRoot, f)))])),
  q1: Object.fromEntries(Object.entries(q1.groups).map(([g, s]) => [g, { chosen: s.chosen, familyBest: s.familyBest, covariance: s.covariance }])),
  q2: { rule: 'PLAN.md 6.5', validationRuns: [...latest.values()].sort(), chosen, choice, cpuSecondsPerProduct: cpu, testStrideDays: stride, estimatedCpuHours: costHours(stride), correctedWeights },
};
fs.writeFileSync(path.join(repoRoot, SELECTION_FILE), `${JSON.stringify(selection, null, 1)}\n`);
run.write('selection.json', selection);
const m = run.finish({ selectionSha256: sha256(fs.readFileSync(path.join(repoRoot, SELECTION_FILE))) });
fs.mkdirSync(path.join(resultsDir, 'manifests'), { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'manifests', `${m.run}.json`), `${JSON.stringify(m, null, 1)}\n`);
log(`wrote ${SELECTION_FILE}`);
