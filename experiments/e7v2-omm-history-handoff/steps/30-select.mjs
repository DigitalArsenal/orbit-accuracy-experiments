#!/usr/bin/env node
// E7v2 step 30 (PLAN.md sections 10 and 11), on a validation batch, per
// class:
//  - the arc span: the smallest median 3D error at 72 h among the class's
//    H-arc-v2:<d>d, on samples paired across its candidates (failures
//    unbounded; ties: the shorter span);
//  - truth-rich classes, the debiasing: the smallest median 3D error at 72 h
//    among the S-debiased candidates (ties: history before class before e1,
//    shorter windows first);
//  - the object-blocked standard error of log(H-arc-v2 / S) at 72 h, and from
//    it the test's objects per OMM-only regime (section 11) and each
//    truth-rich class's projected minimum detectable ratio.
// Writes selection.json; --write also records `chosen` and the test sample
// sizes in config.json (before the freeze only).
//
//   node experiments/e7v2-omm-history-handoff/steps/30-select.mjs --batch ID --train DIR [--write]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { config, configPath } from '../common.mjs';
import { loadBatch, paired, ratio, norm } from '../analysis.mjs';

const { values } = parseArgs({ options: { batch: { type: 'string' }, train: { type: 'string' }, write: { type: 'boolean', default: false }, modules: { type: 'string' } } });
if (!values.batch || !values.train) throw new Error('--batch and --train are required');
if (values.write && config.frozen) throw new Error('config.json is frozen');
const run = startRun({ experiment: config.experiment, step: '30-select', configPath, modulesDir: values.modules ?? repoRoot, args: values });
const { rows, runs } = loadBatch('validation', values.batch);
const H = config.decision.primaryHorizonHours;
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor((s.length - 1) / 2)] / 2 + s[Math.ceil((s.length - 1) / 2)] / 2 : null; };
const medianOfVariant = (samples, j) => median(samples.map((s) => (s.errors[j] ? norm(s.errors[j]) : Infinity)));
// z for Holm's first step (alpha/3, two-sided) and 80 % power.
const Z_ALPHA = 2.39398, Z_POWER = 0.841621;

const selection = { batch: values.batch, runs, horizonHours: H, classes: {} };
const chosen = { on: 'validation', batch: values.batch, spanDays: {}, debias: {}, debiasWindowDays: {}, correlationForm: {}, train: {}, selection: 'results/e7v2/validation/selection.json' };
const sizes = { objectsPerRegime: {}, samplesPerObject: 2, minimumGapDays: 14, minimumObjects: 100, maximumObjects: 600, mdr: {} };
for (const [cls, c] of Object.entries(config.classes)) {
  const mine = rows.filter((r) => r.cls === cls);
  if (!mine.length) continue;
  const kind = c.kind === 'truth' ? 'truth' : 'pseudo';
  const out = { kind, samples: mine.length, objects: new Set(mine.map((r) => r.norad)).size };
  // Arc span.
  const spanIds = c.arcSpansDays.map((d) => `H-arc-v2:${d}d`);
  const spanSamples = paired(mine, () => true, ['S', ...spanIds], kind, H);
  out.spans = c.arcSpansDays.map((d, i) => ({ days: d, median: medianOfVariant(spanSamples, i + 1), failures: spanSamples.filter((s) => !s.errors[i + 1]).length }));
  out.spanSamples = spanSamples.length;
  const best = out.spans.reduce((a, b) => (b.median < a.median ? b : a));
  chosen.spanDays[cls] = best.days;
  // Debiasing (truth-rich): S-debiased candidates.
  if (c.kind === 'truth') {
    const ids = ['S-debiased:history-15d', 'S-debiased:history-30d', 'S-debiased:history-60d', 'S-debiased:class', 'S-debiased:e1'].filter((id) => mine.some((r) => r.errors[id] || r.failures[id]));
    const ds = paired(mine, () => true, ['S', ...ids], kind, H);
    out.debias = ids.map((id, i) => ({ id, median: medianOfVariant(ds, i + 1) }));
    const b = out.debias.reduce((a, x) => (x.median < a.median ? x : a));
    const m = /S-debiased:(history|class|e1)(?:-(\d+)d)?/.exec(b.id);
    chosen.debias[cls] = m[1];
    if (m[2]) chosen.debiasWindowDays[cls] = Number(m[2]);
  } else chosen.debias[cls] = 'class';
  chosen.correlationForm[cls] = 'exponential-nugget';
  // Standard error and sizes.
  const id = `H-arc-v2:${best.days}d`;
  const r = ratio(paired(mine, () => true, ['S', id], kind, H), 1, 0);
  out.ratio = r;
  if (c.kind === 'omm') {
    const kVal = out.objects;
    const k = r.se ? Math.ceil(1.2 * kVal * (r.se / config.statistics.targetLogSe) ** 2) : sizes.maximumObjects;
    sizes.objectsPerRegime[cls] = Math.min(sizes.maximumObjects, Math.max(sizes.minimumObjects, k));
  } else {
    const days = (w) => (Date.parse(`${config.windows[w][1]}T00:00:00Z`) - Date.parse(`${config.windows[w][0]}T00:00:00Z`)) / 86400000 + 1;
    const nTest = r.n * (days('test') / days('validation')) * (c.strideDays.validation / c.strideDays.test);
    const seTest = r.se ? r.se * Math.sqrt(r.n / nTest) : null;
    sizes.mdr[cls] = seTest ? { seTest, nTest: Math.round(nTest), minimumDetectableRatio: Math.exp(-(Z_ALPHA + Z_POWER) * seTest) } : null;
  }
  selection.classes[cls] = out;
  console.log(`[${run.id}] ${cls}: span ${best.days} d (${out.spans.map((s) => `${s.days} d ${s.median?.toFixed(0)}`).join(', ')}); debias ${chosen.debias[cls]}${chosen.debiasWindowDays[cls] ? ` ${chosen.debiasWindowDays[cls]} d` : ''}; ratio ${r.estimate?.toFixed(3)} [${r.lower?.toFixed(3)}, ${r.upper?.toFixed(3)}] se ${r.se?.toFixed(3)} n ${r.n} objects ${r.objects}`);
}
for (const name of ['weights.json', 'correlation.json', 'debias-models.json']) {
  const key = { 'weights.json': 'weightsSha256', 'correlation.json': 'correlationSha256', 'debias-models.json': 'debiasModelsSha256' }[name];
  chosen.train[key] = sha256(fs.readFileSync(path.resolve(values.train, name)));
}
chosen.train.path = 'results/e7v2/train';
selection.chosen = chosen;
selection.sampleSizes = sizes;
run.write('selection.json', selection);
if (values.write) {
  const c = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  c.chosen = chosen;
  c.sampleSizes.test = { objectsPerRegime: sizes.objectsPerRegime, samplesPerObject: sizes.samplesPerObject, minimumGapDays: sizes.minimumGapDays };
  c.sampleSizes.confirm = c.sampleSizes.test;
  c.sampleSizes.projected = sizes.mdr;
  fs.writeFileSync(configPath, `${JSON.stringify(c, null, 1)}\n`);
}
run.finish({ wrote: values.write });
