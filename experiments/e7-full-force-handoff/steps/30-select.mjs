#!/usr/bin/env node
// E7 step 30 (PLAN.md section 5): the validation window's choices, by the
// plan's rules, from a step-20 validation batch: the B rule per drag regime
// and the arc span per regime. Writes results/e7/validation/selection.json
// and, with --write-config, the choices into config.json `chosen` (before
// the freeze only).
//
//   node experiments/e7-full-force-handoff/steps/30-select.mjs --batch ID --weights results/e7/train/weights.json [--write-config]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { sha256 } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';
import { config, configPath } from '../common.mjs';
import { loadBatch, norm } from '../analysis.mjs';

const { values } = parseArgs({ options: { batch: { type: 'string' }, weights: { type: 'string' }, 'write-config': { type: 'boolean' } } });
if (config.frozen) throw new Error('config.json is frozen; the choices are fixed');
const { rows, runs } = loadBatch('validation', values.batch);
const k72 = config.horizonsHours.indexOf(config.decision.selectionHorizonHours);
const at = (r, v) => r.errors[v]?.[k72] ?? null;
const selection = { batch: values.batch, runs, horizonHours: config.decision.selectionHorizonHours, bRule: {}, spanDays: {}, detail: {} };

for (const name of Object.keys(config.regimes)) {
  const mine = rows.filter((r) => r.regime === name && at(r, 'S'));
  const detail = { samples: mine.length };
  if (config.regimes[name].forces.drag) {
    const both = mine.filter((r) => config.bRules.every((b) => at(r, `H-epoch:${b}`)));
    const med = Object.fromEntries(config.bRules.map((b) => [b, median(both.map((r) => norm(at(r, `H-epoch:${b}`))))]));
    const best = config.bRules.reduce((a, b) => (med[b] < med[a] ? b : a), 'bstar');
    selection.bRule[name] = best;
    detail.bRule = { paired: both.length, medianM: med, chosen: best };
  }
  const coverage = Object.fromEntries(config.arcSpansDays.map((d) => [d, mine.filter((r) => at(r, `H-arc:${d}d`)).length / mine.length]));
  const eligible = config.arcSpansDays.filter((d) => coverage[d] >= config.spanEligibleCoverage);
  const common = mine.filter((r) => eligible.every((d) => at(r, `H-arc:${d}d`)));
  const med = Object.fromEntries(eligible.map((d) => [d, median(common.map((r) => norm(at(r, `H-arc:${d}d`))))]));
  const best = eligible.length ? eligible.reduce((a, d) => (med[d] < med[a] ? d : a), eligible[0]) : null;
  selection.spanDays[name] = best;
  detail.span = { coverage, eligible, paired: common.length, medianM: med, chosen: best };
  selection.detail[name] = detail;
}
if (values.weights) selection.weightsSha256 = sha256(fs.readFileSync(path.resolve(values.weights)));
const out = path.join(repoRoot, 'results/e7/validation');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'selection.json'), `${JSON.stringify(selection, null, 1)}\n`);
console.log(JSON.stringify({ bRule: selection.bRule, spanDays: selection.spanDays }, null, 1));
if (values['write-config']) {
  if (!values.weights) throw new Error('--write-config needs --weights (the freeze pins its SHA-256)');
  if (Object.values(selection.spanDays).some((d) => d === null)) throw new Error('a regime has no eligible span; amend the plan before choosing');
  const text = fs.readFileSync(configPath, 'utf8');
  const cfg = JSON.parse(text);
  cfg.chosen = { on: 'validation', batch: values.batch, bRule: selection.bRule, spanDays: selection.spanDays,
    weights: path.relative(repoRoot, path.resolve(values.weights)), weightsSha256: selection.weightsSha256, selection: 'results/e7/validation/selection.json' };
  fs.writeFileSync(configPath, `${JSON.stringify(cfg, null, 2)}\n`);
  console.log('config.json chosen written');
}
