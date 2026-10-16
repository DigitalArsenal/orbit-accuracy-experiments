// PLAN.md Amendment S3 (exploratory): one density reference, NRLMSISE-00 driven by GFZ's indices, for Planet's and Starlink's arcs.
//
// What an arc measures is the energy the drag took out of the orbit, B * integral of 1/2 rho |v_r|^3 dt along it. Under a density model X the arc reads
// B_X = W_obs / I_X, I_X = the integral per unit B along the trajectory; so the same arc under two models differs by B_N = B_J * I_J / I_N. `drag_work` of
// analysis/density-calibration 0.4.0 (JB2008 and NRLMSISE-00, WASM) gives both integrals along the trajectory FFM makes from the arc's first state with the
// arc's own B (the profile, the Earth orientation and the locked Cr*A/m of the arc). Nothing is refitted. This file frames requests, selects rows and divides.
import { json } from '../../harness/modules.mjs';
import { DAY, config } from './common.mjs';
import { readGfzKp, spwRows } from './vendor/full-force.mjs';

// The analysis/density-calibration with NRLMSISE-00 (0.4.0) is a modules checkout of its own; E13_COMMON_REFERENCE_MODULES overrides it.
export const COMMON_REFERENCE_MODULES = process.env.E13_COMMON_REFERENCE_MODULES ?? '/Users/tj/software/worktrees/space-data-network-modules--e13-nrlmsise-20261011';
// Point arcs.mjs's energy module at it (energyModulesDir reads E13_ENERGY_MODULES when called); the frozen steps never call this.
export function useCommonReferenceModules() { process.env.E13_ENERGY_MODULES = COMMON_REFERENCE_MODULES; }

let gfz = null;
// SPW rows (CSSI layout) of the days [fromMs, toMs] from GFZ's definitive history file: the indices of the splits.
export function gfzDefinitiveRows(fromMs, toMs) {
  gfz ??= readGfzKp(config.inputs.gfzHistory);
  return spwRows(gfz, fromMs, toMs);
}
export const gfzSha256 = () => (gfz ??= readGfzKp(config.inputs.gfzHistory)).sha256;

// The rows the module takes: PRW SPW names, only the fields NRLMSISE-00 reads.
export const msisJsonRows = (rows) => rows.map((r) => ({ DATE: r.DATE, F107_OBS: r.F107_OBS, F107_OBS_CENTER81: r.F107_OBS_CENTER81, AP_AVG: r.AP_AVG }));

// The drag works per unit B of the FFM trajectory of state `a` (arc env `env`, JB2008) to `bMs` with Cd*A/m = BJ and Cr*A/m = cr, samples every stepSeconds,
// under JB2008 (SET's rows of the env) and under NRLMSISE-00 (`rowsN`, SPW rows of the days). Returns {workJ, workN, ratio = workJ / workN, samples, refused}.
export async function dragWorkRatio(env, a, bMs, BJ, cr, rowsN, { stepSeconds = 60 } = {}) {
  const epochs = [];
  for (let t = a.ms; t < bMs; t += stepSeconds * 1000) epochs.push(t);
  epochs.push(bMs);
  const states = (await env.trajectory(a, epochs, BJ, cr)).map((s, i) => ({ mjd: epochs[i] / DAY + 40587, r: s.slice(0, 3), v: s.slice(3, 6) }));
  const module = env.modules['analysis/density-calibration'];
  const ask = async (request) => module.invokeJson('drag_work', [json('request', request)], 'result');
  const jb = await ask({ states, jb2008: { rows: env.rowsFor(a.ms - 8 * DAY, bMs + 2 * DAY, null) }, B: 1 });
  const n = await ask({ states, atmosphere: 'NRLMSISE00', nrlmsise00: { rows: msisJsonRows(rowsN) }, B: 1 });
  if (jb.refused.length || n.refused.length) throw new Error(`drag_work refused ${jb.refused.length} (JB2008) and ${n.refused.length} (NRLMSISE-00) of ${states.length} states`);
  const workJ = jb.cumulativeWork.at(-1), workN = n.cumulativeWork.at(-1);
  return { workJ, workN, ratio: workJ / workN, samples: states.length };
}
