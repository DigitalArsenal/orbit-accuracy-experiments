// Step 50, Q2's fitted inputs (PLAN.md 6.2, 6.4): per Q2 regime class, from step 20's epoch errors of every object of
// the class, the arc fits' pseudo-observation weight (the 6x6 RTN second moment about zero after a 5 robust-sigma
// clip per component, E7's weights) and the correlation of two OMMs' errors each at its own epoch by the time between
// them (E7's estimator and forms) on the train window; the form chosen by the validation window's correlations
// (E7's rule: the smaller pair-weighted squared error summed over components; equal: exponential).
//
//   node experiments/e16-cross-regime-epoch/steps/50-q2-train.mjs
import fs from 'node:fs';
import path from 'node:path';
import { startRun } from '../../../harness/provenance.mjs';
import { median } from '../../../harness/stats.mjs';
import { COMPONENTS, empiricalCorrelation, fitForm, sseOf } from '../../e7-full-force-handoff/correlation.mjs';
import { config, configPath, modulesRoot, resultsDir, sha256 } from '../common.mjs';
import { loadSamples } from '../q1lib.mjs';

const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
const run = startRun({ experiment: config.experiment, step: '50-q2-train', configPath, modulesDir: modulesRoot(), args: process.argv.slice(2) });
const classes = Object.keys(config.q2.candidates);
const train = loadSamples('train', classes), val = loadSamples('validation', classes);
run.manifest.sampleRuns = { train: train.runs, validation: val.runs };

// SI records {norad, epochMs, e [m, m/s]} of a class's at-epoch errors.
const recordsOf = (rows, cls) => rows.filter((r) => r.cls === cls && r.errors[0]).map((r) => ({ norad: r.norad, epochMs: r.epochMs, e: r.errors[0].e.map((v) => v * 1000) }));
function moment(errors) {
  const c = config.clip;
  const centre = [0, 1, 2, 3, 4, 5].map((k) => median(errors.map((e) => e[k])));
  const scale = [0, 1, 2, 3, 4, 5].map((k) => c.madScale * median(errors.map((e) => Math.abs(e[k] - centre[k]))));
  const kept = errors.filter((e) => e.every((x, k) => Math.abs(x - centre[k]) <= c.robustSigma * scale[k]));
  const m = Array(36).fill(0);
  for (const e of kept) for (let i = 0; i < 6; ++i) for (let j = 0; j < 6; ++j) m[6 * i + j] += e[i] * e[j] / kept.length;
  return { n: errors.length, kept: kept.length, secondMomentRtn: m, sigma: [0, 1, 2, 3, 4, 5].map((k) => Math.sqrt(m[7 * k])) };
}

const clip = { clipRobustSigma: config.clip.robustSigma, madScale: config.clip.madScale };
const out = { run: run.id, rule: 'PLAN.md 6.2 and 6.4 (E7 section 5 estimators on E16 step 20 errors)', classes: {} };
for (const cls of classes) {
  const rt = recordsOf(train.rows, cls), rv = recordsOf(val.rows, cls);
  const weights = moment(rt.map((r) => r.e));
  const empirical = empiricalCorrelation(rt, config.q2.correlation.lagBinsHours, clip);
  const fits = Object.fromEntries(COMPONENTS.map((c) => [c, Object.fromEntries(config.q2.correlation.forms.map((f) => [f, fitForm(f, empirical.components[c])]))]));
  const validation = empiricalCorrelation(rv, config.q2.correlation.lagBinsHours, clip);
  const sse = Object.fromEntries(config.q2.correlation.forms.map((f) => [f, COMPONENTS.reduce((a, c) => a + sseOf(f, fits[c][f], validation.components[c]), 0)]));
  const form = sse['exponential-nugget'] < sse.exponential ? 'exponential-nugget' : 'exponential';
  out.classes[cls] = { objects: new Set(rt.map((r) => r.norad)).size, weights, correlation: { empirical, fits, validation, validationSse: sse, form } };
  log(`${cls}: n ${weights.n} (${weights.kept} kept), sigma RTN ${weights.sigma.slice(0, 3).map((x) => x.toFixed(0)).join('/')} m; form ${form}; tau T ${fits.T[form].tauHours.toFixed(1)} h, nugget ${fits.T[form].nugget}`);
}
fs.mkdirSync(path.join(resultsDir, 'selection'), { recursive: true });
const file = path.join(resultsDir, 'selection', 'q2-train.json');
fs.writeFileSync(file, `${JSON.stringify(out, null, 1)}\n`);
run.write('q2-train.json', out);
const m = run.finish({ sha256: sha256(fs.readFileSync(file)) });
fs.mkdirSync(path.join(resultsDir, 'manifests'), { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'manifests', `${m.run}.json`), `${JSON.stringify(m, null, 1)}\n`);
