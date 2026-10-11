// End-to-end known answer for the collector's pair record (experiments/e13-open-dca PLAN.md Amendment S1): two "versions" of a satellite made by HPOP from the
// same start state, the previous one at Cd*A/m 0.030 (the operator's model) and the new one's state at 7 h at 0.036 (what happened). The record must give back
// the energy that separates them and read Cd*A/m = 0.036 from the previous start state and the new state (Method B), with the real modules, the real EOP, space
// weather and kernel of the archive. Skipped, and reported as skipped, without them.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { repoRoot } from '../harness/provenance.mjs';

const tmp = fs.mkdtempSync(path.join(repoRoot, 'runs', 'e13-pair-'));
process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
process.env.E13_STORE = tmp;                                    // the environment helper writes a merged space-weather file into the store: not the production one
const { config, energyModulesDir, modulesDir } = await import('../experiments/e13-open-dca/common.mjs');
const have = (() => { try { modulesDir(); energyModulesDir(); } catch { return false; } return [config.inputs.kernel.path, config.inputs.gfzHistory, '/opt/data/sdn-archive/hac/iers-eop/2026'].every((p) => fs.existsSync(p)); })();
const skip = !have && 'the modules checkouts or the archive inputs (kernel, GFZ indices, IERS EOP) are absent';

test('the pair record gives back the energy between two versions and reads Cd*A/m from it (Method B)', { skip }, async () => {
  const { cycleEnv } = await import('../experiments/e13-open-dca/env.mjs');
  const { openFitter } = await import('../experiments/e13-open-dca/head-fit.mjs');
  const { convertRepresentation } = await import('../experiments/e13-open-dca/vendor/frames.mjs');
  const fitter = await openFitter(cycleEnv().envConfig);
  try {
    const d = Math.PI / 180, startMs = Date.parse('2026-10-09T09:48:42Z'), hours = 7, t1 = startMs + hours * 3600e3;
    const iso = (ms) => new Date(ms).toISOString().replace(/\.(\d{3})Z$/, '.$1000Z');
    const state0 = await convertRepresentation(fitter.env.modules['foundation/frames'], iso(startMs), 'KEPLERIAN', [6378137 + 400e3, 0.0009, 70.09 * d, 120 * d, 80 * d, 10 * d], 'CARTESIAN');
    const cr = 0.11;                                          // the class value of a NORAD number below 56000 (config.starlink.srpLock)
    const [predicted] = await fitter.truthStates({ startMs, state: state0, B: 0.030, cr, epochsMs: [t1] });
    const [realised] = await fitter.truthStates({ startMs, state: state0, B: 0.036, cr, epochsMs: [t1] });
    const sig = [1, 1, 1, 1, 1, 1];
    const job = { norad: 44747, satName: 'SYNTHETIC',
      prev: { name: 'prev', sha256: '0', startMs, createdMs: startMs + 22 * 60e3, frame: 'GCRF', timeScale: 'UTC', state0, stateT1: predicted, sigmaT1: sig },
      next: { name: 'next', sha256: '1', startMs: t1, createdMs: t1 + 22 * 60e3, frame: 'GCRF', timeScale: 'UTC', state: realised, sigma: sig } };
    const rec = await fitter.pairMismatch(job);
    // the realised state is 0.006 m2/kg more drag over seven hours: the energy and position differ by that, and Method B finds 0.036
    assert.ok(rec.energyJkg.mismatch < -5, `energy mismatch ${rec.energyJkg.mismatch} J/kg`);
    assert.ok(Math.abs(rec.mismatch.position3dM - Math.hypot(...[0, 1, 2].map((i) => realised[i] - predicted[i]))) < 1e-3, 'the position mismatch is the difference of the two states');
    const b = rec.methodB.cdAreaOverMass;
    assert.ok(Math.abs(b / 0.036 - 1) < 5e-3, `Method B read ${b} for 0.036 (check ${rec.methodB.checkMismatchJkg} J/kg)`);
    assert.ok(Math.abs(rec.methodB.checkMismatchJkg) < 0.5, `energy left at the answer: ${rec.methodB.checkMismatchJkg} J/kg`);
    // and the predicted change is the previous version's own: the energy lost from t0 to t1 at 0.030
    assert.ok(rec.energyJkg.predictedChange < 0 && rec.energyJkg.realisedChange < rec.energyJkg.predictedChange, 'both versions lose energy, the realised more');
    assert.ok(Math.abs(rec.hoursBetween - hours) < 1e-9);
  } finally {
    await fitter.destroy();
  }
});
