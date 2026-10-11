// E13 step 73 (EXPLORATORY, PLAN.md Amendment S3 item 3): the Planet arcs of a split on the common reference, NRLMSISE-00 with GFZ's indices. Nothing is refitted:
// for each arc the HPOP trajectory of its first state with its own fitted B (JB2008, profile g24lean) is integrated for the drag work under JB2008 and under NRLMSISE-00
// (analysis/density-calibration 0.4.0 `drag_work`), and B_N = B_J * W_J / W_N (common-reference.mjs).
//
//   node steps/73-planet-rescale.mjs --split dev --sample 120 [--out FILE]      the test of item 3: every k-th arc of the split's file, also fitted DIRECTLY under
//                                                                                NRLMSISE-00 (the same energy-form estimator, HPOP g24lean, converged); the rescaled
//                                                                                value must agree to within the arc's stated sigma of ln B (results/e13/s3/rescale-sample.json)
//   node steps/73-planet-rescale.mjs --split dev|testA|testB --all [--group calibration,heldOut] [--shard k/n]  every arc of the split (of the groups' Doves), one row each in <store>/planet-arcs/<split>-<profile>.msis.jsonl
//
// A test split stays locked (windows.mjs) exactly as for the arcs themselves. The indices are GFZ's definitive history file (the splits end 2026-07-31).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { gitState } from '../../../harness/modules.mjs';
import { quantile } from '../../../harness/stats.mjs';
import { DAY, STORE, appendJsonl, config, configPath, amendmentsSha256, energyModulesDir, modulesDir, paths, sha256, sleep } from '../common.mjs';
import { COMMON_REFERENCE_MODULES, dragWorkRatio, gfzDefinitiveRows, gfzSha256, useCommonReferenceModules } from '../common-reference.mjs';
import { arcsOf, readPlanetSeries } from '../planet-history.mjs';
import { assertWindowReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { split: { type: 'string' }, sample: { type: 'string' }, all: { type: 'boolean', default: false }, group: { type: 'string', default: 'calibration,heldOut' }, 'trajectory-profile': { type: 'string' }, 'step-seconds': { type: 'string', default: '60' }, shard: { type: 'string', default: '0/1' }, profile: { type: 'string' }, out: { type: 'string' } } });
if (!values.sample === !values.all) throw new Error('--sample N or --all');
useCommonReferenceModules();
const { openArcEnv } = await import('../arcs.mjs');
const P = config.planet, profile = values.profile ?? P.arc.profile;
const [from, to] = P.split[values.split] ?? (() => { throw new Error(`unknown split ${values.split}`); })();
assertWindowReadable(values.split);
const [shard, shards] = values.shard.split('/').map(Number);
const run = startRun({ experiment: config.experiment, step: `73-planet-rescale-${values.split}-${values.sample ? 'sample' : `all-${shard}of${shards}`}`, configPath, modulesDir: modulesDir(), args: values });
run.addInputs('amendments', { 'amendments.json': amendmentsSha256 });
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

const arcFile = path.join(paths.planetArcs, `${values.split}-${profile}.jsonl`);
const planetSample = JSON.parse(fs.readFileSync(path.join(path.dirname(configPath), 'planet-sample.json'), 'utf8'));
const groupHwids = new Set(values.group.split(',').flatMap((g) => planetSample[g] ?? (() => { throw new Error(`unknown group ${g}`); })()));
const arcRows = fs.readFileSync(arcFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error && !r.nonPositive && r.cdAreaOverMass > 0 && groupHwids.has(r.hwid));
run.addInputs('planet-arcs', { [path.basename(arcFile)]: sha256(fs.readFileSync(arcFile)) });
run.addInputs('gfz', { 'Kp_ap_Ap_SN_F107_since_1932.txt': gfzSha256() });
const series = readPlanetSeries({ fromDay: new Date(Date.parse(`${from}T00:00:00Z`) - 3 * DAY).toISOString().slice(0, 10), toDay: new Date(Date.parse(`${to}T00:00:00Z`) + 3 * DAY).toISOString().slice(0, 10) });

let chosen;
if (values.sample) {
  const count = Number(values.sample), stride = Math.floor(arcRows.length / count);
  chosen = Array.from({ length: count }, (_, i) => arcRows[i * stride]);
} else {
  chosen = arcRows.filter((_, i) => i % shards === shard);
}
const outFile = path.join(paths.planetArcs, `${values.split}-${profile}.msis.jsonl`);
const done = new Set(values.all && fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.hwid}|${r.ttA}`; }) : []);
log(`split ${values.split}: ${arcRows.length} valid arcs, ${chosen.length} chosen${values.all ? ` (shard ${shard}/${shards}, ${chosen.filter((r) => !done.has(`${r.hwid}|${r.ttA}`)).length} left)` : ' for the sample test'}; common reference modules ${COMMON_REFERENCE_MODULES}`);

// The trajectory only carries the integrals: a coarser force profile and sampling give the same ratio (Amendment S6 validates it against the direct fits); the sample test keeps the arc's own profile.
const trajectoryProfile = values['trajectory-profile'] ?? profile, stepSeconds = Number(values['step-seconds']);
const jEnv = await openArcEnv({ profile: trajectoryProfile });
const nEnv = values.sample ? await openArcEnv({ profile, atmosphere: 'NRLMSISE00', spaceWeather: gfzDefinitiveRows }) : null;
for (const [family, files] of Object.entries(jEnv.inputs)) run.addInputs(family, files);
const energyModule = jEnv.modules['analysis/density-calibration'];
run.addModule({ ...energyModule.provenance, checkout: energyModulesDir(), checkoutState: gitState(energyModulesDir()) });

const out = [];
let n = 0;
const started = performance.now();
for (const r of chosen) {
  if (done.has(`${r.hwid}|${r.ttA}`)) continue;
  while (os.loadavg()[0] > config.compute.pauseAboveLoad1m) await sleep(60e3);
  const states = series.get(r.hwid) ?? [], i = states.findIndex((s) => s.ttMs === r.ttA);
  if (i < 0 || !states[i + 1] || states[i + 1].ttMs !== r.ttB) { log(`${r.hwid} ${r.utcA}: the states of the arc are not in the series`); continue; }
  try {
    const [A, B] = await Promise.all([jEnv.toUtcGcrf(states[i]), jEnv.toUtcGcrf(states[i + 1])]);
    const cr = r.crAreaOverMass ?? P.arc.crAreaOverMass;
    const rowsN = gfzDefinitiveRows(A.ms - 8 * DAY, B.ms + 2 * DAY);
    const w = await dragWorkRatio(jEnv, A, B.ms, r.cdAreaOverMass, cr, rowsN, { stepSeconds });
    const row = { hwid: r.hwid, ttA: r.ttA, ttB: r.ttB, utcA: r.utcA, hours: r.hours, cdAreaOverMassJ: r.cdAreaOverMass, workJ: w.workJ, workN: w.workN, lnRatio: Math.log(w.ratio), cdAreaOverMassN: r.cdAreaOverMass * w.ratio,
      sigmaLnB: r.sigmaB / r.cdAreaOverMass, altitudeKm: r.altitudeKm, profile, trajectoryProfile, stepSeconds, crAreaOverMass: cr, atmosphere: 'NRLMSISE00', samples: w.samples };
    if (values.sample) {
      const direct = await nEnv.energyArc(A, B, { b0: r.cdAreaOverMass, cr, sigma: P.arc.sigma, tolerance: 1e-5, maxIterations: 8 });
      row.directB = direct.B; row.directSigmaLnB = direct.sigmaB / direct.B; row.directIterations = direct.iterations; row.directEnergyMismatchJkg = direct.energyMismatchJkg;
      row.lnDifference = Math.log(row.cdAreaOverMassN / direct.B);                                  // rescaled less direct
      row.lnBetweenReferences = Math.log(direct.B / r.cdAreaOverMass);
      row.withinStatedSigma = Math.abs(row.lnDifference) <= row.sigmaLnB;
    } else appendJsonl(outFile, row);
    out.push(row);
  } catch (error) {
    log(`${r.hwid} ${r.utcA}: ${String(error.message ?? error).slice(0, 200)}`);
    if (values.all) appendJsonl(outFile, { hwid: r.hwid, ttA: r.ttA, ttB: r.ttB, error: String(error.message ?? error).slice(0, 300) });
  }
  if (++n % 10 === 0) log(`${n} arcs in ${((performance.now() - started) / 1000).toFixed(0)} s (${((performance.now() - started) / 1000 / n).toFixed(1)} s each); at ${r.utcA.slice(0, 10)}`);
}

if (values.sample) {
  const abs = out.map((o) => Math.abs(o.lnDifference));
  const summary = {
    arcs: out.length, allWithinStatedSigma: out.every((o) => o.withinStatedSigma), failures: out.filter((o) => !o.withinStatedSigma).map((o) => ({ hwid: o.hwid, utcA: o.utcA, lnDifference: o.lnDifference, sigmaLnB: o.sigmaLnB })),
    medianAbsLnDifference: quantile(abs, 0.5), p95AbsLnDifference: quantile(abs, 0.95), maxAbsLnDifference: Math.max(...abs), shareWithin0p5Percent: abs.filter((x) => x <= 0.005).length / abs.length, shareWithin1Percent: abs.filter((x) => x <= 0.01).length / abs.length,
    medianLnBetweenReferences: quantile(out.map((o) => o.lnBetweenReferences), 0.5), p5LnBetweenReferences: quantile(out.map((o) => o.lnBetweenReferences), 0.05), p95LnBetweenReferences: quantile(out.map((o) => o.lnBetweenReferences), 0.95),
    medianSigmaLnB: quantile(out.map((o) => o.sigmaLnB), 0.5), meanLnDifference: out.reduce((a, o) => a + o.lnDifference, 0) / out.length,
  };
  console.log(`rescaled against direct NRLMSISE-00 fits, ${summary.arcs} arcs: all within the stated sigma: ${summary.allWithinStatedSigma}; |ln difference| median ${(100 * summary.medianAbsLnDifference).toFixed(3)} %, 95th percentile ${(100 * summary.p95AbsLnDifference).toFixed(3)} %, max ${(100 * summary.maxAbsLnDifference).toFixed(3)} %; within 0.5 % ${(100 * summary.shareWithin0p5Percent).toFixed(0)} %, within 1 % ${(100 * summary.shareWithin1Percent).toFixed(0)} %; the references differ by a median ${(100 * summary.medianLnBetweenReferences).toFixed(2)} % (5-95 %: ${(100 * summary.p5LnBetweenReferences).toFixed(2)} to ${(100 * summary.p95LnBetweenReferences).toFixed(2)} %); stated sigma median ${(100 * summary.medianSigmaLnB).toFixed(1)} %`);
  // The per-arc rows are Planet's per-satellite-day fits (CC BY-NC 4.0): they stay in the store; the repository gets the summary.
  const file = values.out ?? path.join(repoRoot, 'results', 'e13', 's3', 'rescale-sample.json');
  const arcsFile = path.join(STORE, 's3', `rescale-sample-${values.split}-arcs.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.mkdirSync(path.dirname(arcsFile), { recursive: true });
  fs.writeFileSync(arcsFile, `${JSON.stringify(out, null, 1)}\n`);
  fs.writeFileSync(file, `${JSON.stringify({ exploratory: true, amendment: 'S3', split: values.split, stride: Math.floor(arcRows.length / Number(values.sample)), summary, arcsFile: 'the per-arc rows (hardware ids, epochs, fits) are in the store, outside the repository: Planet\'s per-satellite-day fits are not published (CC BY-NC 4.0)' }, null, 1)}\n`);
  log(`wrote ${file} and ${arcsFile}`);
  run.finish(summary);
} else run.finish({ rows: out.length, out: outFile });
await jEnv.destroy();
await nEnv?.destroy();
