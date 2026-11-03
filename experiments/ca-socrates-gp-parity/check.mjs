#!/usr/bin/env node
// End-to-end check of task experiments-ca-validation-on-0-17-20261031: both validations on CA 0.17.0, each by its own
// verify.mjs (registered inputs re-derived, one registered call re-screened by the pinned module, the stored report
// regenerated, the fabricated listing reproduced), run one after the other as child processes. Exits nonzero unless
// both pass; the recall check's skip (exit 3, inputs absent) is not a pass.
//   node experiments/ca-socrates-gp-parity/check.mjs        (SDN_MODULES_ROOT names the modules checkout when it is not in the stack)
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const experiments = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const checks = [
  ['ca-socrates-gp-parity', path.join(experiments, 'ca-socrates-gp-parity/verify.mjs'), ['--amendment', 'A3']],
  ['ca-screen-recall', path.join(experiments, 'ca-screen-recall/verify.mjs'), []],
];
const verdicts = checks.map(([name, script, args]) => {
  console.log(`== ${name}: verify.mjs ${args.join(' ')}`.trimEnd());
  const { status, signal } = spawnSync(process.execPath, [script, ...args], { stdio: 'inherit' });
  return [name, status === 0 ? 'pass' : status === 3 ? 'skipped (a skip is not a pass)' : `failed (${status ?? signal})`];
});
for (const [name, verdict] of verdicts) console.log(`${name}: ${verdict}`);
const passed = verdicts.every(([, verdict]) => verdict === 'pass');
console.log(passed ? 'CA-VALIDATION-0.17.0 E2E PASS' : 'CA-VALIDATION-0.17.0 E2E FAIL');
process.exit(passed ? 0 : 1);
