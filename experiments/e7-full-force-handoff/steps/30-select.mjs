#!/usr/bin/env node
// E7 step 30 (PLAN.md section 5): the validation window's choices, by the
// plan's rules: the B rule per drag regime, the arc span, the debiasing
// window, and the correlation form per regime. Writes
// results/e7/validation/selection.json and, with --write-config, the choices
// into config.json `chosen` (before the freeze only).
//
//   node experiments/e7-full-force-handoff/steps/30-select.mjs --batch ID --weights results/e7/train/weights.json
//        --correlation results/e7/train/correlation.json --correlation-validation results/e7/validation/correlation.json [--write-config]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { sha256 } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';
import { config, configPath } from '../common.mjs';
import { loadBatch, norm } from '../analysis.mjs';
import { COMPONENTS, sseOf } from '../correlation.mjs';

const { values } = parseArgs({ options: { batch: { type: 'string' }, weights: { type: 'string' }, correlation: { type: 'string' }, 'correlation-validation': { type: 'string' }, 'write-config': { type: 'boolean' } } });
if (config.frozen) throw new Error('config.json is frozen; the choices are fixed');
const { rows, runs } = loadBatch('validation', values.batch);
const k72 = config.horizonsHours.indexOf(config.decision.selectionHorizonHours);
const at = (r, v) => r.errors[v]?.[k72] ?? null;
const selection = { batch: values.batch, runs, horizonHours: config.decision.selectionHorizonHours, bRule: {}, spanDays: {}, debiasWindowDays: {}, correlationForm: {}, detail: {} };

// The candidate with the lowest median 3D error at the selection horizon on
// the samples where every eligible candidate has one; ties to the first listed.
function lowest(mine, candidates, eligibleCoverage = 0) {
  const coverage = Object.fromEntries(candidates.map(([key, v]) => [key, mine.filter((r) => at(r, v)).length / mine.length]));
  const eligible = candidates.filter(([key]) => coverage[key] >= eligibleCoverage);
  const common = mine.filter((r) => eligible.every(([, v]) => at(r, v)));
  const med = Object.fromEntries(eligible.map(([key, v]) => [key, median(common.map((r) => norm(at(r, v))))]));
  const best = eligible.length ? eligible.reduce((a, c) => (med[c[0]] < med[a[0]] ? c : a), eligible[0])[0] : null;
  return { coverage, eligible: eligible.map(([k]) => k), paired: common.length, medianM: med, chosen: best };
}

const trainCorrelation = JSON.parse(fs.readFileSync(path.resolve(values.correlation), 'utf8'));
const validationCorrelation = JSON.parse(fs.readFileSync(path.resolve(values['correlation-validation']), 'utf8'));
for (const name of Object.keys(config.regimes)) {
  const mine = rows.filter((r) => r.regime === name && at(r, 'S'));
  const detail = { samples: mine.length };
  if (config.regimes[name].forces.drag) {
    detail.bRule = lowest(mine, config.bRules.map((b) => [b, `H-epoch:${b}`]));
    selection.bRule[name] = detail.bRule.chosen;
  }
  detail.span = lowest(mine, config.regimes[name].arcSpansDays.map((d) => [d, `H-arc:${d}d`]), config.spanEligibleCoverage);
  selection.spanDays[name] = detail.span.chosen === null ? null : Number(detail.span.chosen);
  detail.debias = lowest(mine, config.debias.windowsDays.map((w) => [w, `S-debiased:${w}d`]));
  selection.debiasWindowDays[name] = detail.debias.chosen === null ? null : Number(detail.debias.chosen);
  const fits = trainCorrelation.regimes[name].fits, bins = validationCorrelation.regimes[name].empirical.components;
  const sse = Object.fromEntries(config.correlation.forms.map((f) => [f, COMPONENTS.reduce((s, c) => s + sseOf(f, fits[c][f], bins[c]), 0)]));
  const form = config.correlation.forms.reduce((a, f) => (sse[f] < sse[a] ? f : a), config.correlation.forms[0]);
  selection.correlationForm[name] = form;
  detail.correlation = { sse, chosen: form };
  selection.detail[name] = detail;
}
const out = path.join(repoRoot, 'results/e7/validation');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'selection.json'), `${JSON.stringify(selection, null, 1)}\n`);
console.log(JSON.stringify({ bRule: selection.bRule, spanDays: selection.spanDays, debiasWindowDays: selection.debiasWindowDays, correlationForm: selection.correlationForm }, null, 1));
if (values['write-config']) {
  if (Object.values(selection.spanDays).some((d) => d === null)) throw new Error('a regime has no eligible span; amend the plan before choosing');
  const cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const rel = (f) => path.relative(repoRoot, path.resolve(f));
  cfg.chosen = { on: 'validation', batch: values.batch, bRule: selection.bRule, spanDays: selection.spanDays, debiasWindowDays: selection.debiasWindowDays, correlationForm: selection.correlationForm,
    weights: rel(values.weights), weightsSha256: sha256(fs.readFileSync(path.resolve(values.weights))),
    correlation: rel(values.correlation), correlationSha256: sha256(fs.readFileSync(path.resolve(values.correlation))),
    selection: 'results/e7/validation/selection.json' };
  fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log('config.json chosen written');
}
