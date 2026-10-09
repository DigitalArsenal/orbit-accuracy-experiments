#!/usr/bin/env node
// Runs propagator/hpop's 63 Orekit 13.1 reference cases through the
// space-data-module-sdk harness, exactly as the module's own
// tests/orekit_reference.test.mjs does, and records the largest position
// difference of each in site/generated/orekit-results.json. build.mjs
// publishes it as data/orekit/results.json beside the cases' requests, and
// the page re-runs any case in the visitor's browser against it.
//
//   node site/run-orekit.mjs [--modules DIR] [--from N] [--to N]
//
// --from/--to run a range (the results file is merged by case id, and reset
// when the module binary changes), so the suite can run in pieces.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { loadModule, modulesRoot, gitState } from '../harness/modules.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const { values } = parseArgs({ options: { modules: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } });
const v1Config = JSON.parse(fs.readFileSync(path.join(repo, 'experiments/v1-hpop-physical-truth/config.json'), 'utf8'));
const modules = modulesRoot({ flag: values.modules, configured: v1Config.inputs.modules, repoRoot: repo });
const cases = await import(pathToFileURL(path.join(modules, 'propagator/hpop/tests/lib/orekitCases.mjs')));
const out = path.join(here, 'generated/orekit-results.json');

const hpop = await loadModule(modules, 'propagator/hpop');
const sdk = JSON.parse(fs.readFileSync(path.join(repo, 'node_modules/space-data-module-sdk/package.json'), 'utf8')).version;
let results = fs.existsSync(out) ? JSON.parse(fs.readFileSync(out, 'utf8')) : null;
if (results?.hpopWasmSha256 !== hpop.provenance.wasmSha256) results = { cases: [] };
Object.assign(results, {
  hpopWasmSha256: hpop.provenance.wasmSha256,
  runtime: `Node ${process.version}, space-data-module-sdk ${sdk}`,
  modulesCommit: gitState(modules).commit,
  generated: new Date().toISOString(),
  reference: 'propagator/hpop tests/fixtures/orekit/orekit-reference.json (Orekit 13.1, OrekitReference.java)',
  metric: 'largest 3D position difference over the hourly samples of a 24 h arc, m',
});

const all = cases.REFERENCE.cases;
const from = Number(values.from ?? 0), to = Math.min(Number(values.to ?? all.length - 1), all.length - 1);
for (let id = from; id <= to; ++id) {
  const c = all[id];
  const started = performance.now();
  const response = await hpop.invoke('invoke', cases.requestInputs(c));
  const seconds = (performance.now() - started) / 1000;
  const { worst, worstAt } = cases.score(c, response);
  const toleranceM = cases.toleranceFor(c);
  const record = { id, orbit: c.orbit, forces: c.forces, worstM: worst, worstAtHours: worstAt / 3600, toleranceM, pass: worst <= toleranceM, seconds: Number(seconds.toFixed(3)) };
  if (c.parameters) {
    const { stm, parameters } = cases.scoreJacobians(c, response);
    Object.assign(record, { stmRelative: stm, parameterRelative: parameters, jacobiansPass: stm <= 1e-4 && Object.values(parameters).every((v) => v <= 1e-3) });
  }
  results.cases = results.cases.filter((r) => r.id !== id).concat(record).sort((a, b) => a.id - b.id);
  console.log(`${String(id).padStart(2)} ${c.orbit} ${c.forces}: ${worst.toExponential(3)} m (limit ${toleranceM}) ${record.pass ? 'pass' : 'FAIL'} ${seconds.toFixed(2)} s`);
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(results, null, 2)}\n`);
const failed = results.cases.filter((r) => !r.pass || r.jacobiansPass === false);
console.log(`${results.cases.length}/${all.length} cases recorded in ${path.relative(repo, out)}; ${failed.length} outside tolerance`);
await hpop.destroy();
if (failed.length) process.exitCode = 1;
