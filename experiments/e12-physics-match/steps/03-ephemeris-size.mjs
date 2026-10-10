// Step 03 (development): the size of the planetary-ephemeris axis: one GEO day
// under DE440s, DE430, DE421 and DE405 (sub-millimetre: the axis is below the
// gauntlet's floor and is tested through the SPICE_STACK preset only).
import { modulesRoot } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config } from '../common.mjs';
import { loadEnvironment, isoOf } from '../environment.mjs';
import { DEFAULT } from '../hypothesis.mjs';
import { propagate } from '../fit.mjs';
const env = await loadEnvironment({ modulesDir: modulesRoot({ configured: config.inputs.modules, repoRoot }), config });
const e = Date.parse('2026-08-01T00:00:00Z'); let ref;
for (const eph of ['DE440', 'DE430', 'DE421', 'DE405']) {
  const t = performance.now();
  try {
    const s = await propagate(env, { ...DEFAULT, ephemeris: eph, degree: 8, atmosphere: 'NONE', srp: 'NONE', earthRadiation: false, oceanTides: false, solidTides: false }, { cutoffMs: e }, { epoch: isoOf(e), state: [42164137, 0, 0, 0, 3074.66, 0] }, { b: 0, agom: 0 }, [isoOf(e + 86400000)], { integrator: { tolerance: 1e-13, maxStep: 300 } });
    const p = s[0].state; ref ??= p;
    console.log(eph, ((performance.now() - t)).toFixed(0), 'ms', 'GEO 1 d diff vs DE440', Math.hypot(p[0]-ref[0], p[1]-ref[1], p[2]-ref[2]).toExponential(2), 'm');
  } catch (err) { console.log(eph, 'ERROR', err.message); }
}
await env.destroy();
