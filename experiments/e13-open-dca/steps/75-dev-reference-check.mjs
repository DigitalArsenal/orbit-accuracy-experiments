// E13 step 75 (EXPLORATORY, PLAN.md Amendment S3 item 3, "Dev, descriptive"): the dev split on the common reference. The dev arcs rescaled to NRLMSISE-00 (steps/73 --all) are solved with
// the selected solver; the Swarm and GRACE-FO densities of the dev split are read against NRLMSISE-00 (x_N = the 12 h mean of ln(rho_observed / rho_NRLMSISE-00), the same 30 s samples);
// R1 is computed as in section 6 (thresholds not applied) next to the same statistic against JB2008 through the same code, which is the 0.383 of the dev report. The two common modes
// differ by the fleet's mean of ln(W_J / W_N) per day; their correlation and that mean's spread are reported. Dev only.
//
//   node steps/75-dev-reference-check.mjs [--out FILE]      (default: results/e13/s3/dev-reference-check.json)
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pigeonholeBootstrap } from '../../../harness/stats.mjs';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { gitState } from '../../../harness/modules.mjs';
import { DAY, H, STORE, config, configPath, amendmentsSha256, energyModulesDir, modulesDir, paths, readJson, sha256, writeJson } from '../common.mjs';
import { gfzDefinitiveRows, gfzSha256, useCommonReferenceModules } from '../common-reference.mjs';
import { arcCenterOffsetMs, arcsFromRows, solveCommonMode, windowMean } from '../common-mode.mjs';
import { cellsOf, densityRows, devLevels, loadDensityWindows, r1FromCells, spreadReduction } from '../score.mjs';

const { values } = parseArgs({ options: { out: { type: 'string' } } });
useCommonReferenceModules();
const { isoDay, dayStartMs, openDensityEnv, SATELLITES, windowsOfDay } = await import('../density-truth.mjs');
const P = config.planet, S = config.analysis.solver, B = config.analysis.bootstrap;
const [from, to] = P.split.dev;
const run = startRun({ experiment: config.experiment, step: '75-dev-reference-check', configPath, modulesDir: modulesDir(), args: values });
run.addInputs('amendments', { 'amendments.json': amendmentsSha256 });
run.addInputs('gfz', { 'Kp_ap_Ap_SN_F107_since_1932.txt': gfzSha256() });
const log = (m) => console.log(`[${run.id}] ${m}`);
const selection = readJson(path.join(repoRoot, 'results', 'e13', 'selection.json'));
const sample = readJson(path.join(path.dirname(configPath), 'planet-sample.json'));

// ── the dev densities against NRLMSISE-00 ──
const env = await openDensityEnv();
run.addModule({ ...env.dc.provenance, checkout: energyModulesDir(), checkoutState: gitState(energyModulesDir()) });
const windowsN = {};
for (const key of SATELLITES) {
  const file = path.join(STORE, 'density', 'dev-msis', `${key}.json`);
  const windows = [], files = {};
  for (let t = dayStartMs(from); t <= dayStartMs(to); t += DAY) {
    const r = await windowsOfDay(env, key, isoDay(t), { reference: { rowsFor: gfzDefinitiveRows } });
    if (!r.file) continue;
    files[r.file.name] = r.file.sha256;
    windows.push(...r.windows);
  }
  run.addInputs(`densities-${key}`, files);
  writeJson(file, { key, norad: config.inputs.densities[key].norad, split: 'dev', reference: 'NRLMSISE00', from, to, run: run.id, windows });
  windowsN[key] = windows;
  const good = windows.filter((w) => w.x !== null);
  log(`${key}: ${windows.length} windows, ${good.length} with x_N (${(good.reduce((s, w) => s + w.x, 0) / good.length).toFixed(4)} mean)`);
}
await env.destroy();
const windowsJ = loadDensityWindows('dev');
const levelsOf = (windows) => Object.fromEntries(Object.entries(windows).map(([k, list]) => { const x = list.filter((w) => w.x !== null).map((w) => w.x); return [k, x.reduce((a, b) => a + b, 0) / x.length]; }));
const levelsJ = devLevels(), levelsN = levelsOf(windowsN);

// ── the arcs: ours (JB2008) and rescaled (NRLMSISE-00) ──
const arcFile = path.join(paths.planetArcs, `dev-${P.arc.profile}.jsonl`), msisFile = path.join(paths.planetArcs, `dev-${P.arc.profile}.msis.jsonl`);
run.addInputs('planet-arcs', { [path.basename(arcFile)]: sha256(fs.readFileSync(arcFile)), [path.basename(msisFile)]: sha256(fs.readFileSync(msisFile)) });
const rowsJ = fs.readFileSync(arcFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const ratio = new Map(fs.readFileSync(msisFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)).filter((r) => !r.error).map((r) => [`${r.hwid}|${r.ttA}`, Math.exp(r.lnRatio)]));
const rowsN = rowsJ.filter((r) => !r.error && ratio.has(`${r.hwid}|${r.ttA}`)).map((r) => ({ ...r, cdAreaOverMass: r.cdAreaOverMass * ratio.get(`${r.hwid}|${r.ttA}`), sigmaB: r.sigmaB * ratio.get(`${r.hwid}|${r.ttA}`) }));
log(`${rowsJ.filter((r) => !r.error).length} dev arcs, ${rowsN.length} rescaled`);
const arcOptions = { hwids: sample.calibration, maxRelativeSigma: S.arcUse.maximumRelativeSigma, positiveOnly: S.arcUse.positiveOnly };
const solverOptions = { huberK: S.huberK, iterations: S.iterations, tolerance: S.tolerance, scaleSweeps: S.scaleSweeps, minDovesPerNode: S.minimumDovesPerNodeInterval, minNodeInfo: S.minimumNodeInfo };
const solve = (arcs) => solveCommonMode(arcs, { anchorMs: dayStartMs(from) + arcCenterOffsetMs(arcs), nodeHours: selection.solver.nodeHours, baseline: selection.solver.baseline, smoothSigma: selection.solver.smoothSigma ?? null, ...solverOptions });
const times = []; for (let t = dayStartMs(from); t < dayStartMs(to) + DAY; t += 12 * H) times.push(t);
const meanS = (sol) => { const v = times.map((t) => windowMean(sol, t, t + 12 * H)).filter(Number.isFinite); return v.reduce((a, b) => a + b, 0) / v.length; };

function score(windows, levels, arcs, label) {
  const sol = solve(arcs), dev = meanS(sol);
  const rows = densityRows(windows, levels, (lo, hi) => windowMean(sol, lo, hi), dev);
  const r1 = spreadReduction(rows);
  const ci = pigeonholeBootstrap(cellsOf(rows), r1FromCells, { resamples: B.resamples, seed: B.seed, confidence: B.confidence });
  log(`${label}: R1 ${r1.R1.toFixed(3)} [${ci.lower.toFixed(3)}, ${ci.upper.toFixed(3)}] over ${r1.n} windows (sd x' ${r1.sdX.toFixed(4)} -> ${r1.sdRes.toFixed(4)}); ${arcs.length} arcs, robust scatter ${sol.sigma.toFixed(4)}`);
  return { sol, rows, r1: r1.R1, lower: ci.lower, upper: ci.upper, windows: r1.n, sdX: r1.sdX, sdResidual: r1.sdRes, arcs: arcs.length, robustScatter: sol.sigma, devMeanS: dev };
}
const J = score(windowsJ, levelsJ, arcsFromRows(rowsJ, arcOptions), 'against JB2008 (the dev report)');
const N = score(windowsN, levelsN, arcsFromRows(rowsN, arcOptions), 'against NRLMSISE-00 (arcs rescaled)');

// the two common modes: s_N = s_J + (the fleet's mean of ln(W_J / W_N)); the correlation of their 12 h window means and the spread of the difference
const a = [], b = [];
for (const t of times) { const x = windowMean(J.sol, t, t + 12 * H), y = windowMean(N.sol, t, t + 12 * H); if (Number.isFinite(x) && Number.isFinite(y)) { a.push(x - J.devMeanS); b.push(y - N.devMeanS); } }
const mean = (v) => v.reduce((p, q) => p + q, 0) / v.length, sd = (v) => { const m = mean(v); return Math.sqrt(v.reduce((p, q) => p + (q - m) ** 2, 0) / v.length); };
const diff = a.map((x, i) => b[i] - x);
const corr = (() => { const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0; a.forEach((x, i) => { sab += (x - ma) * (b[i] - mb); saa += (x - ma) ** 2; sbb += (b[i] - mb) ** 2; }); return sab / Math.sqrt(saa * sbb); })();
const lnRatios = [...ratio.values()].map(Math.log);
const out = { exploratory: true, amendment: 'S3', split: 'dev', solver: selection.solver,
  againstJB2008: { r1: J.r1, lower: J.lower, upper: J.upper, windows: J.windows, arcs: J.arcs, sdX: J.sdX, sdResidual: J.sdResidual },
  againstNRLMSISE00: { r1: N.r1, lower: N.lower, upper: N.upper, windows: N.windows, arcs: N.arcs, sdX: N.sdX, sdResidual: N.sdResidual },
  commonModes: { windows: a.length, correlation: corr, sdJ: sd(a), sdN: sd(b), sdOfDifference: sd(diff), meanLnRatioWJoverWN: mean(lnRatios), sdLnRatioWJoverWN: sd(lnRatios) },
  levels: { JB2008: levelsJ, NRLMSISE00: levelsN } };
log(`common modes: correlation ${corr.toFixed(3)} over ${a.length} windows; sd ${sd(a).toFixed(4)} (JB2008) and ${sd(b).toFixed(4)} (NRLMSISE-00); sd of the difference ${sd(diff).toFixed(4)}; ln(W_J / W_N) of the arcs: mean ${mean(lnRatios).toFixed(4)}, sd ${sd(lnRatios).toFixed(4)}`);
const file = values.out ?? path.join(repoRoot, 'results', 'e13', 's3', 'dev-reference-check.json');
fs.mkdirSync(path.dirname(file), { recursive: true });
fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
log(`wrote ${file}`);
run.finish({ r1JB2008: J.r1, r1NRLMSISE00: N.r1 });
