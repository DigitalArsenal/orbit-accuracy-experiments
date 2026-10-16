// End-to-end checks of E13's arc estimator (experiments/e13-open-dca PLAN.md sections 4.1 and 7): the real modules (propagator/ffm,
// analysis/density-calibration `energy`, foundation/frames), the real SET indices and EOP files. Skipped, and reported as skipped,
// without them.
//
// Known answer: a day's arc made by FFM (Full Force Model) at a known Cd*A/m must give that Cd*A/m back through the energy form, from a wrong starting
// value; and an arc made with the full force model (EGM2008 70x70, ocean tides, Earth radiation, five bodies, relativity) must be read
// by the production profile (24x24, Sun and Moon) to within 2 %, the tolerance of the profile's own evidence (PLAN 4.1: 1.4 % on
// four Dove arcs).
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { config, energyModulesDir, modulesDir } from '../experiments/e13-open-dca/common.mjs';

const have = (() => { try { modulesDir(); energyModulesDir(); } catch { return false; } return [config.inputs.eopC04, config.inputs.solfsmy, config.inputs.dtcfile, config.inputs.kernel.path].every((p) => fs.existsSync(p)); })();
const skip = !have && 'the modules checkouts, EOP C04, SET indices or DE440s are absent';

test('an FFM-made arc at a known Cd*A/m is read back through the orbital energy (production profile, and across profiles)', { skip }, async () => {
  const { openArcEnv } = await import('../experiments/e13-open-dca/arcs.mjs');
  const { convertRepresentation } = await import('../experiments/e13-open-dca/vendor/frames.mjs');
  const sigma = config.planet.arc.sigma, cr = config.planet.arc.crAreaOverMass;
  const truth = 0.025;                     // m^2/kg: a Dove's Cd*A/m is 0.014-0.03
  const epochMs = Date.parse('2025-11-10T12:00:00Z');
  const lean = await openArcEnv({ profile: 'g24lean' });
  try {
    // A 480 km, 97.4 degree orbit, from Keplerian elements by foundation/frames (a, e, i, raan, argp, nu; rad).
    const d = Math.PI / 180;
    const state = await convertRepresentation(lean.modules['foundation/frames'], '2025-11-10T12:00:00.000000Z', 'KEPLERIAN', [6378137 + 480e3, 0.0009, 97.4 * d, 120 * d, 80 * d, 10 * d], 'CARTESIAN');
    const a = { ms: epochMs, state };
    const day = 86400e3;
    const made = await lean.propagate(a, epochMs + day, truth, cr);
    const b = { ms: epochMs + day, state: made.state };
    const read = await lean.energyArc(a, b, { b0: 0.05, cr, sigma });          // started at twice the truth
    assert.ok(Math.abs(read.B / truth - 1) < 2e-3, `read ${read.B} for ${truth} (${read.iterations} iterations)`);
    assert.ok(Math.abs(read.energyMismatchJkg) < 0.5, `energy mismatch left ${read.energyMismatchJkg} J/kg`);
    // The arc made by the full force model, read by the production profile.
    const full = await openArcEnv({ profile: 'full' });
    try {
      const madeFull = await full.propagate(a, epochMs + day, truth, cr);
      const readFull = await lean.energyArc(a, { ms: epochMs + day, state: madeFull.state }, { b0: 0.02, cr, sigma });
      assert.ok(Math.abs(readFull.B / truth - 1) < 0.02, `production profile read ${readFull.B} of the full-force arc made at ${truth}`);
    } finally {
      await full.destroy();
    }
  } finally {
    await lean.destroy();
  }
});
