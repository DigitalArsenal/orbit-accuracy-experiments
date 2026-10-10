// Section 5's choices from the Part B dev runs, by its rules: kappa for E26,
// lambda_t for E25T, and the detection thresholds (99th percentiles over B1
// dev epochs after the warm-up). Writes results/e10/selection.json.
//   node steps/20-select.mjs --run <dev run id>[,<dev run id>...]
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../common.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { median, quantile } from '../../../harness/stats.mjs';
import { readJobs, runSummary } from '../score.mjs';

const runIds = (process.argv[process.argv.indexOf('--run') + 1] ?? '').split(',').filter(Boolean);
if (!runIds.length) throw new Error('--run <dev run id>');
const jobs = readJobs(runIds).filter((j) => config.partB.devSeeds.some((s) => s.id === j.seed));
const families = {
  pcrbTrigger: { variant: (v) => `E26:k=${v}`, candidates: config.filters.espf2026.pcrbTriggerCandidates },
  decayRate: { variant: (v) => `E25T:l=${v}`, candidates: config.filters.espf2025t.decayRateCandidates },
};
const selection = { runs: runIds, rule: config.selection, families: {}, chosen: {}, thresholds: {} };
for (const [key, family] of Object.entries(families)) {
  const table = family.candidates.map((value) => {
    const runs = jobs.filter((j) => j.variant === family.variant(value)).map(runSummary);
    return { value, variant: family.variant(value), runs: runs.length, failures: runs.filter((r) => r.failed).length, medianRmsM: median(runs.map((r) => r.rmsPos)) };
  });
  const expected = config.partB.devSeeds.length * Object.keys(config.partB.cases).length;
  for (const row of table) if (row.runs !== expected) throw new Error(`${row.variant}: ${row.runs} dev runs, expected ${expected}`);
  const fewest = Math.min(...table.map((r) => r.failures));
  const eligible = table.filter((r) => r.failures === fewest);
  const best = Math.min(...eligible.map((r) => r.medianRmsM));
  const chosen = eligible.find((r) => r.medianRmsM <= 1.1 * best);
  selection.families[key] = table;
  selection.chosen[key] = chosen.value;
  selection.chosen[`${key}Variant`] = chosen.variant;
}
// Detection thresholds: the 99th percentile of each statistic over B1 dev
// epochs after the warm-up (E26 at the chosen kappa).
const warmup = config.partB.warmupHours * 3600e3;
const b1 = jobs.filter((j) => j.case === 'B1-nominal');
const statistics = {
  'E26.qMin': { variant: selection.chosen.pcrbTriggerVariant, field: 'qMin' },
  'E26.choquet': { variant: selection.chosen.pcrbTriggerVariant, field: 'choquet' },
  'EKF.nis': { variant: 'EKF', field: 'nis' },
  'UKF.nis': { variant: 'UKF', field: 'nis' },
};
for (const [name, s] of Object.entries(statistics)) {
  const values = [];
  for (const j of b1.filter((j) => j.variant === s.variant)) for (const r of j.rows) if (r.ms >= j.epochMs + warmup && Number.isFinite(r[s.field])) values.push(r[s.field]);
  selection.thresholds[name] = { variant: s.variant, epochs: values.length, p99: quantile(values, 0.99) };
}
const out = path.join(repoRoot, 'results', 'e10', 'selection.json');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(selection, null, 2)}\n`);
console.log(JSON.stringify(selection.chosen), JSON.stringify(selection.thresholds));
