// End-to-end known answers for the common reference (experiments/e13-open-dca PLAN.md Amendment S3): the real modules (propagator/ffm, analysis/density-calibration
// 0.4.0 `energy` and `drag_work` with NRLMSISE-00, foundation/frames), the real EOP, SET indices and GFZ indices. Skipped, and reported as skipped, without them.
//
//  1. An arc made by FFM (Full Force Model) under NRLMSISE-00 at a known Cd*A/m is read back through the orbital energy under NRLMSISE-00 (the direct fit of the live Planet arcs).
//  2. The same arc made under JB2008 (what the splits' arcs are), read under JB2008 and then rescaled by the ratio of the drag works of its trajectory under
//     JB2008 and NRLMSISE-00, agrees with the direct NRLMSISE-00 reading of the same end state to 0.2 %, while the two references differ by far more: the
//     rescaling, not a coincidence of two similar models, carries the agreement.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { config, modulesDir } from '../experiments/e13-open-dca/common.mjs';
import { COMMON_REFERENCE_MODULES, gfzDefinitiveRows, useCommonReferenceModules } from '../experiments/e13-open-dca/common-reference.mjs';

const have = (() => { try { modulesDir(); } catch { return false; } return [config.inputs.eopC04, config.inputs.solfsmy, config.inputs.dtcfile, config.inputs.kernel.path, config.inputs.gfzHistory, COMMON_REFERENCE_MODULES].every((p) => fs.existsSync(p)); })();
const skip = !have && 'the modules checkouts (density-calibration 0.4.0), EOP C04, SET or GFZ indices or DE440s are absent';

test('a Cd*A/m is read back under NRLMSISE-00, and the rescaled JB2008 reading equals the direct NRLMSISE-00 one', { skip }, async (t) => {
  useCommonReferenceModules();
  const { openArcEnv } = await import('../experiments/e13-open-dca/arcs.mjs');
  const { dragWorkRatio } = await import('../experiments/e13-open-dca/common-reference.mjs');
  const { convertRepresentation } = await import('../experiments/e13-open-dca/vendor/frames.mjs');
  const sigma = config.planet.arc.sigma, cr = config.planet.arc.crAreaOverMass;
  const truth = 0.025, day = 86400e3, epochMs = Date.parse('2025-11-10T12:00:00Z');
  const jEnv = await openArcEnv({ profile: 'g24lean' });
  const nEnv = await openArcEnv({ profile: 'g24lean', atmosphere: 'NRLMSISE00', spaceWeather: gfzDefinitiveRows });
  try {
    const d = Math.PI / 180;
    const state = await convertRepresentation(jEnv.modules['foundation/frames'], '2025-11-10T12:00:00.000000Z', 'KEPLERIAN', [6378137 + 480e3, 0.0009, 97.4 * d, 120 * d, 80 * d, 10 * d], 'CARTESIAN');
    const a = { ms: epochMs, state };
    // 1. an arc made under NRLMSISE-00
    const madeN = await nEnv.propagate(a, epochMs + day, truth, cr);
    const readN = await nEnv.energyArc(a, { ms: epochMs + day, state: madeN.state }, { b0: 0.05, cr, sigma, tolerance: 1e-5, maxIterations: 8 });
    assert.ok(Math.abs(readN.B / truth - 1) < 2e-3, `NRLMSISE-00 read ${readN.B} for ${truth} (${readN.iterations} iterations)`);
    // 2. an arc made under JB2008
    const madeJ = await jEnv.propagate(a, epochMs + day, truth, cr);
    const b = { ms: epochMs + day, state: madeJ.state };
    const readJ = await jEnv.energyArc(a, b, { b0: 0.05, cr, sigma, tolerance: 1e-5, maxIterations: 8 });
    assert.ok(Math.abs(readJ.B / truth - 1) < 2e-3, `JB2008 read ${readJ.B} for ${truth}`);
    const direct = await nEnv.energyArc(a, b, { b0: readJ.B, cr, sigma, tolerance: 1e-5, maxIterations: 8 });
    const rowsN = nEnv.spaceWeather(a.ms - 8 * day, b.ms + 2 * day);
    const w = await dragWorkRatio(jEnv, a, b.ms, readJ.B, cr, rowsN);
    const rescaled = readJ.B * w.ratio;
    const difference = Math.log(rescaled / direct.B), between = Math.log(direct.B / readJ.B);
    t.diagnostic(`JB2008 read ${readJ.B.toFixed(6)}, direct NRLMSISE-00 ${direct.B.toFixed(6)} (${(100 * between).toFixed(2)} %), rescaled ${rescaled.toFixed(6)} (${(100 * difference).toFixed(4)} % from the direct reading); drag works ${w.workJ.toFixed(3)} and ${w.workN.toFixed(3)} J/kg per unit B at B = ${readJ.B.toFixed(4)}`);
    assert.ok(Math.abs(between) > 0.02, `the two references should differ by more than 2 %: ln(B_N / B_J) = ${between}`);
    assert.ok(Math.abs(difference) < 2e-3, `rescaled ${rescaled} against the direct NRLMSISE-00 reading ${direct.B}: ${(100 * difference).toFixed(3)} % (the references differ by ${(100 * between).toFixed(1)} %)`);
  } finally {
    await jEnv.destroy();
    await nEnv.destroy();
  }
});
