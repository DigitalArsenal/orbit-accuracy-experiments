// E13 step 20: the density truth of a split as 12 h windows (PLAN.md section 6): for each of Swarm A, B, C and GRACE-FO 1, the mean of
// ln(rho_observed / rho_JB2008) over the window's valid 30 s samples. Written to the derived store (ESA terms: cited, not redistributed),
// with a run manifest naming every product file by SHA-256.
//
//   node steps/20-density-windows.mjs --split dev|testA|testB [--sats swarmA,swarmB,swarmC,gracefo1]
//
// A test split is read only after the freeze commit and the committed selection (windows.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startRun } from '../../../harness/provenance.mjs';
import { gitState } from '../../../harness/modules.mjs';
import { DAY, STORE, configPath, config, energyModulesDir, modulesDir, writeJson, amendmentsSha256 } from '../common.mjs';
import { isoDay, dayStartMs, openDensityEnv, SATELLITES, windowsOfDay } from '../density-truth.mjs';
import { assertDensityReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { split: { type: 'string' }, sats: { type: 'string' } } });
const [from, to] = config.planet.split[values.split] ?? (() => { throw new Error(`unknown split ${values.split}`); })();
assertDensityReadable(values.split);
const sats = values.sats ? values.sats.split(',') : SATELLITES;
const run = startRun({ experiment: config.experiment, step: `20-density-windows-${values.split}`, configPath, modulesDir: modulesDir(), args: values });
run.addInputs('amendments', { 'amendments.json': amendmentsSha256 });
const env = await openDensityEnv();
run.addModule({ ...env.dc.provenance, checkout: energyModulesDir(), checkoutState: gitState(energyModulesDir()) });
run.addInputs('set', env.set.sha256);
const log = (m) => console.log(`[${run.id}] ${m}`);

for (const key of sats) {
  const windows = [], files = {};
  for (let t = dayStartMs(from); t <= dayStartMs(to); t += DAY) {
    const r = await windowsOfDay(env, key, isoDay(t));
    if (!r.file) continue;
    files[r.file.name] = r.file.sha256;
    windows.push(...r.windows);
  }
  run.addInputs(`densities-${key}`, files);
  const good = windows.filter((w) => w.x !== null);
  writeJson(path.join(STORE, 'density', values.split, `${key}.json`), { key, norad: config.inputs.densities[key].norad, split: values.split, from, to, run: run.id, windows });
  log(`${key}: ${Object.keys(files).length} days, ${windows.length} windows, ${good.length} with x (${(good.reduce((s, w) => s + w.x, 0) / good.length).toFixed(4)} mean)`);
}
run.finish({ split: values.split, satellites: sats });
await env.destroy();
