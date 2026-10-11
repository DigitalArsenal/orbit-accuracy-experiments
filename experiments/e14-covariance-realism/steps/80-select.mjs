#!/usr/bin/env node
// E14 step 80: the choice on dev-select (PLAN.md section 8). Per source, the candidate with the most REALISTIC testable
// cells; ties to the lower mean energy score over those cells; then to the simpler (the order of section 4). S4's
// shrinkage: the same rule over S2-QCD's LEO cells. The chosen models are the dev-fit fits (changes before the
// freeze). Writes results/e14/selection.json with each model file's SHA-256 and the calibration versions; with
// --s1 it adds (or replaces) S1's entry from results/e14/s1-devSelect/s1-realism.json.
//
//   node experiments/e14-covariance-realism/steps/80-select.mjs [--s1]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { sha256 } from '../../../harness/modules.mjs';
import { config, writeJson } from '../common.mjs';

const { values } = parseArgs({ options: { s1: { type: 'boolean', default: false } } });
const read = (rel) => JSON.parse(fs.readFileSync(path.join(repoRoot, rel), 'utf8'));
const hash = (rel) => sha256(fs.readFileSync(path.join(repoRoot, rel)));
const file = path.join(repoRoot, 'results/e14/selection.json');
const selection = fs.existsSync(file) ? read('results/e14/selection.json') : { experiment: config.experiment, rule: 'most REALISTIC testable dev-select cells; ties: lower mean energy score over those cells; then the simpler (PLAN.md section 4 order)', sources: {}, scores: {} };

// [{name, cells: {regime: {horizon: cell}}}] -> the chosen name and the scores.
function choose(entries, order, filter = () => true) {
  const scores = entries.map(({ name, cells }) => {
    let realistic = 0, testable = 0, energy = 0, nEnergy = 0;
    for (const [regime, byH] of Object.entries(cells)) for (const [h, c] of Object.entries(byH)) {
      if (!filter(regime, h)) continue;
      if (c.decision !== 'INSUFFICIENT') ++testable;
      if (c.decision === 'REALISTIC') { ++realistic; if (Number.isFinite(c.energyScoreM)) { energy += c.energyScoreM; ++nEnergy; } }
    }
    return { name, realistic, testable, meanEnergyScoreM: nEnergy ? energy / nEnergy : null };
  });
  const sorted = [...scores].sort((a, b) => b.realistic - a.realistic || ((a.meanEnergyScoreM ?? Infinity) - (b.meanEnergyScoreM ?? Infinity)) || order.indexOf(a.name) - order.indexOf(b.name));
  return { chosen: sorted[0].name, scores };
}

if (!values.s1) {
  const s3 = read('results/e14/devSelect/s3-realism.json');
  const c3 = choose(config.candidates.S3.map((name) => ({ name, cells: s3.candidates[name].primary })), config.candidates.S3);
  const s2 = read('results/e14/devSelect/s2-realism.json');
  const s2names = Object.keys(s2.candidates);
  const order2 = ['S2-P0', 'S2-Q', 'S2-QC', ...s2names.filter((n) => n.startsWith('S2-QCD'))];
  const c2 = choose(s2names.map((name) => ({ name, cells: s2.candidates[name].primary })), order2);
  const qcd = s2names.filter((n) => n.startsWith('S2-QCD'));
  const c4 = choose(qcd.map((name) => ({ name, cells: s2.candidates[name].primary })), qcd, (regime) => regime.startsWith('LEO'));
  const shrinkage = Number(c4.chosen.split(':')[1]);
  const s3models = read('results/e14/dev/s3-models.json');
  selection.sources.S3 = { candidate: c3.chosen, models: { file: 'results/e14/dev/s3-models.json', sha256: hash('results/e14/dev/s3-models.json') },
    calibrationVersion: `e14-s3-${hash('results/e14/dev/s3-models.json').slice(0, 12)}`, model: s3models.candidates[c3.chosen].version ?? c3.chosen };
  selection.sources.S2 = { candidate: c2.chosen, models: { file: 'results/e14/dev/s2-models.json', sha256: hash('results/e14/dev/s2-models.json') },
    calibrationVersion: `e14-s2-${hash('results/e14/dev/s2-models.json').slice(0, 12)}`,
    p0: { file: 'results/e14/dev/s3-models-s2p0.json', sha256: hash('results/e14/dev/s3-models-s2p0.json'), candidate: 'S3-T', ageIndex: 0 } };
  selection.sources.S4 = { shrinkage, candidate: c4.chosen, models: { file: 'results/e14/dev/s4-dcp.json', sha256: hash('results/e14/dev/s4-dcp.json') },
    calibrationVersion: `e14-s4-${hash('results/e14/dev/s4-dcp.json').slice(0, 12)}` };
  selection.scores.S3 = c3.scores;
  selection.scores.S2 = c2.scores;
  selection.scores.S4 = c4.scores;
  selection.inputs = { s3: { file: 'results/e14/devSelect/s3-realism.json', sha256: hash('results/e14/devSelect/s3-realism.json') },
    s2: { file: 'results/e14/devSelect/s2-realism.json', sha256: hash('results/e14/devSelect/s2-realism.json') } };
  selection.note = 'The chosen models are the dev-fit fits (PLAN.md, changes before the freeze); S1 is chosen when its dev-select window closes (2026-10-15).';
} else {
  const s1 = read('results/e14/s1-devSelect/s1-realism.json');
  const out = {};
  for (const operator of ['starlink', 'planet']) {
    const entries = config.candidates.S1.filter((n) => s1.candidates[n]?.[operator]).map((name) => ({ name, cells: s1.candidates[name][operator].table }));
    if (!entries.length) continue;
    const c = choose(entries, config.candidates.S1);
    out[operator] = { candidate: c.chosen, scores: c.scores };
  }
  selection.sources.S1 = { byOperator: out, models: { file: 'results/e14/dev/s1-models.json', sha256: hash('results/e14/dev/s1-models.json') },
    calibrationVersion: `e14-s1-${hash('results/e14/dev/s1-models.json').slice(0, 12)}`, inputs: { file: 'results/e14/s1-devSelect/s1-realism.json', sha256: hash('results/e14/s1-devSelect/s1-realism.json') } };
}
writeJson(file, selection);
console.log(JSON.stringify(selection.sources, null, 1));
