// Read-only audit of existing results; does not fly states or generate encounters.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { aggregate, report } from './table.mjs';
const current = aggregate();
assert.deepEqual(current, JSON.parse(fs.readFileSync('results/five-day-ca/metrics.json')));
assert.equal(report(current), fs.readFileSync('results/five-day-ca/README.md', 'utf8'));
const prior = JSON.parse(fs.readFileSync('results/five-day-ca/e2e.json'));
const evidence = {
  auditedCommit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(),
  command: 'node experiments/five-day-ca/resume-audit.mjs',
  aggregateRegeneration: 'PASS',
  newStatesFlown: 0,
  reproduction: current.reproduction,
  coverage: current.coverage,
  priorE2E: prior,
  acceptance: {
    completeTables: 'FAIL: p10-p90, bootstrap intervals, CA reach and encounters missing',
    coverage: `${current.coverage.filter(c => c.expected > 0 && c.completed === c.expected).length}/${current.coverage.length} group/phase cells complete; not an arm/arc/day acceptance pass`,
    oldLeads: `${current.reproduction.compared} comparable scalars; ${current.reproduction.different} differences; partial coverage only`,
    registration: 'FAIL: restored requirements were not registered before earlier day-4/day-5 reads',
    fiveDayCAParagraph: 'FAIL: no measured CA reach supports an answer'
  },
  blocker: 'FIVE-DAY.md amendment is required, but modifying any tracked file is prohibited. Its frozen content is also enforced by guard.mjs. New RESUME-REGISTRATION.md preserves the restored specification and discloses prior reads without claiming compliance.',
  nextStep: 'Resolve the tracked-file constraint for this lane’s own files; append the required disclosure and registration to FIVE-DAY.md, update its provenance guard, commit and WIP-push before further propagation. Preserve descriptive status of prior reads, then complete cheap arms, FFM, CA tables and E2E.',
  gauntlet: 'NOT RUN: task E2E has not passed',
  receipt: null
};
fs.writeFileSync('results/five-day-ca/resume-audit.json', JSON.stringify(evidence, null, 2)+'\n');
console.log(JSON.stringify({aggregateRegeneration:evidence.aggregateRegeneration, acceptance:evidence.acceptance}));
