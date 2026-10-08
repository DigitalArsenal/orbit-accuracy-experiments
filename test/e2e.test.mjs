// End-to-end checks of the harness (PLAN.md §6). They run the real modules
// on public verification vectors and on the real archive; nothing is mocked.
//
//   SDN_MODULES_ROOT=<modules checkout> npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadModule, modulesRoot } from '../harness/modules.mjs';
import { decodeOemStream, mpeFrame } from '../harness/records.mjs';
import { repoRoot } from '../harness/provenance.mjs';
import { ReferenceIndex } from '../harness/reference.mjs';

const config = JSON.parse(fs.readFileSync(path.join(repoRoot, 'experiments/e1-gps-epoch/config.json'), 'utf8'));
const modules = modulesRoot({ configured: config.inputs.modules, repoRoot });
const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

// A0.1. Vallado's SGP4 verification set (SGP4-VER.TLE, t = 0 rows of
// tcppver.out), with GCRF expectations computed independently with pyerfa;
// the fixture is the one analysis/epoch-state's own tests use. tcppver.out
// prints 1e-8 km and 1e-9 km/s, hence the tolerances.
test('A0.1 epoch-state through this harness reproduces the Vallado verification set', async (t) => {
  const fixture = JSON.parse(fs.readFileSync(path.join(modules, 'analysis/epoch-state/tests/vallado-verification.json'), 'utf8'));
  const epochState = await loadModule(modules, 'analysis/epoch-state');
  t.after(() => epochState.destroy());
  const response = await epochState.invoke('derive', [mpeFrame(fixture.cases)]);
  const states = decodeOemStream(response.outputs.find((f) => f.portId === 'states').payload);
  assert.equal(states.length, fixture.cases.length);
  const { valladoPositionKm, valladoVelocityKmS } = config.acceptance.a0;
  fixture.cases.forEach((expected, i) => {
    const line = states[i].EPHEMERIS_DATA_BLOCK[0].EPHEMERIS_DATA_LINES[0];
    assert.ok(distance([line.X, line.Y, line.Z], expected.gcrfR) < valladoPositionKm, `${expected.satnum} position`);
    assert.ok(distance([line.X_DOT, line.Y_DOT, line.Z_DOT], expected.gcrfV) < valladoVelocityKmS, `${expected.satnum} velocity`);
  });
});

// A0.4. Two runs of the baseline on the same inputs give byte-identical
// per-sample tables. Needs the local archive and reference states; skipped,
// and reported as skipped, without them.
const archive = process.env.SDN_GP_HISTORY ?? config.inputs.gpHistory;
const reference = process.env.SDN_REFERENCE_STATES ?? config.inputs.reference;
const haveData = fs.existsSync(archive) && fs.existsSync(reference);
test('A0.4 the baseline is deterministic', { skip: haveData ? false : `no local data at ${archive} / ${reference}` }, () => {
  const step = path.join(repoRoot, 'experiments/e1-gps-epoch/steps/10-baseline.mjs');
  const two = new ReferenceIndex(reference, config.inputs.referenceProductPrefix).objects().slice(0, 2).join(',');
  const runOnce = () => {
    // The step's own A0 verdicts set its exit status; determinism is judged
    // on its output whatever they are.
    const { stdout, stderr } = spawnSync(process.execPath, [step, '--window', 'a0', '--objects', two,'--resamples', '200',
      '--modules', modules, '--archive', archive, '--reference', reference], { encoding: 'utf8' });
    const id = /\[(e1-gps-epoch-10-baseline-[^\]]+)\]/.exec(stdout)?.[1];
    assert.ok(id, `no run id in output:\n${stdout}\n${stderr}`);
    return fs.readFileSync(path.join(repoRoot, 'runs', id, 'samples.jsonl.gz'));
  };
  const first = runOnce();
  // Run IDs have one-second resolution.
  execFileSync('sleep', ['1.1']);
  const second = runOnce();
  assert.ok(first.length > 0);
  assert.ok(first.equals(second), 'per-sample tables differ between runs');
});
