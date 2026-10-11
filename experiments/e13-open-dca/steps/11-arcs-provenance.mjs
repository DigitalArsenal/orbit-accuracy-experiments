// E13 step 11: the provenance of one split's Planet arcs. Step 10 resumes across invocations and writes no run manifest of its own; this writes one
// in the format of harness/provenance.mjs after the arcs are done: the code (the repository commit, and the hashes of the files that make an arc, as of
// the commit the run started from and as of now), the modules (WASM hashes), every input by SHA-256 (the Planet state files of the span, the SET
// indices, EOP C04, the kernel), and the arcs file itself (hash, rows, errors, time span).
//
//   node steps/11-arcs-provenance.mjs --split dev|testA|testB [--started-from COMMIT]
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { gitState, loadModule, sha256 } from '../../../harness/modules.mjs';
import { config, configPath, energyModulesDir, modulesDir, paths, amendmentsSha256 } from '../common.mjs';
import { PLANET_DIR } from '../planet-history.mjs';
import { readSetIndices } from '../vendor/full-force.mjs';

const { values } = parseArgs({ options: { split: { type: 'string' }, 'started-from': { type: 'string', default: '4221f03' } } });
const P = config.planet;
const [from, to] = P.split[values.split] ?? (() => { throw new Error(`unknown split ${values.split}`); })();
const run = startRun({ experiment: config.experiment, step: `10-planet-arcs-${values.split}`, configPath, modulesDir: modulesDir(), args: values });
run.addInputs('amendments', { 'amendments.json': amendmentsSha256 });
const log = (m) => console.log(`[${run.id}] ${m}`);

for (const name of ['propagator/hpop', 'foundation/frames', 'foundation/time', 'data-source/eop-parser']) { const m = await loadModule(modulesDir(), name); run.addModule(m.provenance); await m.destroy(); }
const dc = await loadModule(energyModulesDir(), 'analysis/density-calibration');
run.addModule({ ...dc.provenance, checkout: energyModulesDir(), checkoutState: gitState(energyModulesDir()) });
await dc.destroy();

// the Planet state files of the span (the arcs read from three days before to three days after)
const day = (ms) => new Date(ms).toISOString().slice(0, 10).replaceAll('-', '');
const files = {};
for (let t = Date.parse(`${from}T00:00:00Z`) - 3 * 86400e3; t <= Date.parse(`${to}T00:00:00Z`) + 3 * 86400e3; t += 86400e3) {
  const f = path.join(PLANET_DIR, `planet_${day(t)}.states`);
  if (fs.existsSync(f)) files[path.basename(f)] = sha256(fs.readFileSync(f));
}
run.addInputs('planet', files);
run.addInputs('set', readSetIndices(config.inputs.solfsmy, config.inputs.dtcfile).sha256);
run.addInputs('eop', { [path.basename(config.inputs.eopC04)]: sha256(fs.readFileSync(config.inputs.eopC04)) });
run.addInputs('kernel', { [path.basename(config.inputs.kernel.path)]: sha256(fs.readFileSync(config.inputs.kernel.path)) });

// the files that make an arc, at the commit the run started from and now
const rel = 'experiments/e13-open-dca';
const code = {};
for (const f of ['arcs.mjs', 'planet-history.mjs', 'steps/10-planet-arcs.mjs', 'vendor/frames.mjs', 'vendor/full-force.mjs', 'common.mjs']) {
  let atStart = null;
  try { atStart = sha256(execFileSync('git', ['-C', repoRoot, 'show', `${values['started-from']}:${rel}/${f}`], { maxBuffer: 1 << 26 })); } catch { /* not in that commit */ }
  code[f] = { atStartCommit: atStart, now: sha256(fs.readFileSync(path.join(repoRoot, rel, f))) };
}
run.addInputs('code', Object.fromEntries(Object.entries(code).map(([f, h]) => [f, h.now])));

const arcsFile = path.join(paths.planetArcs, `${values.split}-${P.arc.profile}.jsonl`);
const raw = fs.readFileSync(arcsFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
run.addInputs('planet-arcs', { [path.basename(arcsFile)]: sha256(fs.readFileSync(arcsFile)) });
const ok = raw.filter((r) => !r.error);
const summary = { split: values.split, span: [from, to], profile: P.arc.profile, arcs: raw.length, errors: raw.length - ok.length, nonPositive: ok.filter((r) => r.nonPositive).length,
  firstArcUtc: ok.reduce((a, r) => (r.utcA < a ? r.utcA : a), '9'), lastArcUtc: ok.reduce((a, r) => (r.utcB > a ? r.utcB : a), '0'), doves: new Set(raw.map((r) => r.hwid)).size,
  startedFromCommit: values['started-from'], code };
run.write('arcs-summary.json', summary);
run.finish(summary);
log(`${summary.arcs} arcs (${summary.errors} errors, ${summary.nonPositive} non-positive) of ${summary.doves} Doves, ${summary.firstArcUtc} .. ${summary.lastArcUtc}; code unchanged since ${values['started-from']}: ${Object.entries(code).filter(([, h]) => h.atStartCommit === h.now).map(([f]) => f).join(', ') || 'none'}; changed: ${Object.entries(code).filter(([, h]) => h.atStartCommit !== h.now).map(([f]) => f).join(', ') || 'none'}`);
