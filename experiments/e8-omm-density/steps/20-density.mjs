#!/usr/bin/env node
// E8 step 20: density endpoint (PLAN.md section 4a). For each held-out
// satellite, every variant's density at its own samples, compared with its
// observed density as orbit means (one orbital period centred on each scoring
// time, the same valid samples on both sides): ln(observed / model).
//   D0       JB2008, SET's indices
//   D2a      JB2008 + E5's correction of the concurrent 3-hour bin (degree 0),
//            from the target's E5 calibration set
//   D5a-*    JB2008 + the D5 analysis fit (one per step 10 analysis run)
//   D3, J    HASDM and the published JB2008 of the historical files
// Forecast from each issue day (2026), per driver arm (definitive, operational):
//   D0, D2f (E5's forecast as published, tau = 12 h, zero latency assumed) and
//   D5f-*-T<tau> (each step 10 forecast run, each decay).
// The module computes every density; this file averages and takes logs.
//
//   node .../20-density.mjs --window W --analysis RUN[,RUN] [--forecast RUN[,RUN]] [--decays 12,48,null]
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { parseArgs } from 'node:util';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { config, configPath, DAY_MS, dayMs, gfzDays, HOUR_MS, isHistorical, isoDay, loadModules, maxKp, modulesDir, readRun, regimeOf,
  runConfigHash, setIndices, windowSpans } from '../common.mjs';
import { samples } from '../../e5-density-calibration/densities.mjs';
import { decayed, nowcast } from '../../e5-density-calibration/forecast.mjs';
import { analysisCorrection, forecastCorrection } from '../correction.mjs';
import { definitiveRows, jb2008 as evaluateAt, orbitMeans } from '../density-eval.mjs';
import { operationalJb2008Rows, rsga } from '../drivers.mjs';

const { values } = parseArgs({ options: { window: { type: 'string' }, analysis: { type: 'string' }, forecast: { type: 'string' }, decays: { type: 'string' }, modules: { type: 'string' } } });
const spans = windowSpans(values.window);
const historical = isHistorical(values.window);
const decays = (values.decays ?? config.decay.forecast.candidates.decayHours.map(String).join(',')).split(',').map((x) => (x === 'null' ? null : Number(x)));
const run = startRun({ experiment: config.experiment, step: `20-density-${values.window}`, configPath, modulesDir: modulesDir(values.modules), args: values });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const { loaded } = await loadModules(run, ['analysis/density-calibration'], values);
const dc = loaded['analysis/density-calibration'];
const jb2008 = (s, correction, rowsFor) => evaluateAt(dc, s, correction, rowsFor);
run.addInputs('set', setIndices().sha256);
run.addInputs('gfz', { kp: gfzDays().sha256 });
if (!historical) run.addInputs('rsga', rsga().files);
const densityInputs = (name, hash) => run.addInputs('densities', { [name]: hash });

// E5's calibration bins for this window (degree 0) and its selected decay.
const e5File = path.join(repoRoot, config.inputs.e5.calibration[values.window]);
const e5Raw = fs.readFileSync(e5File);
run.addInputs('e5', { [path.relative(repoRoot, e5File)]: (await import('../../../harness/modules.mjs')).sha256(e5Raw) });
const e5 = JSON.parse(zlib.gunzipSync(e5Raw));
const e5Tau = JSON.parse(fs.readFileSync(path.join(repoRoot, config.inputs.e5.selection), 'utf8')).decayHours;
const e5Bins = (calibrators) => e5.sets[[...calibrators].sort().join('+')].degrees[0].filter((b) => b.coefficients);

// D5 fits: analysis runs (one fit per span) and forecast runs (one per issue day).
const tagOf = (r) => `K${r.perBin}-${r.structure}${r.noPriors ? '-nopriors' : ''}`;
const analysisRuns = (values.analysis ?? '').split(',').filter(Boolean).map((id) => { run.addInputs('estimates', { [id]: runConfigHash(id) }); return readRun(id, 'estimates.json'); });
const forecastRuns = (values.forecast ?? '').split(',').filter(Boolean).map((id) => { run.addInputs('estimates', { [id]: runConfigHash(id) }); return readRun(id, 'estimates.json'); });
for (const r of [...analysisRuns, ...forecastRuns]) if (r.window !== values.window) throw new Error(`estimates for ${r.window}, not ${values.window}`);
const forecastFits = new Map();  // `${tag}|${issue}` -> fit
for (const r of forecastRuns) for (const s of r.spans) for (const f of s.fits) forecastFits.set(`${tagOf(r)}|${f.issue}`, f);
const forecastTags = [...new Set(forecastRuns.map(tagOf))];

const heldOut = historical ? config.density.heldOut.historical : config.density.heldOut['2026'];
const rows = [], forecastRows = [];
for (const { target, d2Calibrators } of heldOut) {
  const periodS = config.density.orbitAverage.periodSeconds[target];
  for (const [k, span] of spans.entries()) {
    const from = dayMs(span.from), to = dayMs(span.to) + 7 * DAY_MS;
    const s = samples(target, from - 2 * HOUR_MS, to + 2 * HOUR_MS, densityInputs);
    if (s.t.length < 100) { log(`${target} ${span.from}: no samples`); continue; }
    const bins = e5Bins(d2Calibrators);
    const models = { D0: await jb2008(s, null, definitiveRows),
      D2a: await jb2008(s, { degree: 0, segments: bins.map((b) => ({ fromMjd: b.fromMjd, toMjd: b.toMjd, coefficients: b.coefficients })) }, definitiveRows) };
    if (historical) { models.D3 = s.hasdm; models.J = s.jb2008Published; }
    for (const r of analysisRuns) models[`D5a-${tagOf(r)}`] = await jb2008(s, analysisCorrection(r.spans[k].fits[0]), definitiveRows);
    for (const m of orbitMeans(s, models, periodS, from, to)) {
      const kp = maxKp(m.s - 3 * HOUR_MS, m.s + 1), day = isoDay(m.s);
      for (const [variant, v] of Object.entries(m.models)) rows.push({ target, s: m.s, day, kp, regime: regimeOf(kp), variant, lnRatio: Math.log(m.obs / v) });
    }
    // Forecasts from each issue day, both driver arms.
    if (!historical) {
      for (let t0 = dayMs(span.from); t0 <= dayMs(span.to); t0 += DAY_MS) {
        const idx = s.t.map((t, i) => i).filter((i) => s.t[i] >= t0 - 2 * HOUR_MS && s.t[i] < t0 + 7 * DAY_MS + 2 * HOUR_MS);
        if (idx.length < 100) continue;
        const sub = Object.fromEntries(Object.entries(s).map(([key, v]) => [key, idx.map((i) => v[i])]));
        const now = nowcast(bins, t0, 0);
        const d2f = { degree: 0, segments: decayed(now, t0, e5Tau, 7 * DAY_MS + 3 * HOUR_MS, 0) };
        const opRows = operationalJb2008Rows(t0, isoDay(t0 - 8 * DAY_MS), isoDay(t0 + 10 * DAY_MS));
        const opFor = (day) => opRows.filter((r) => r.DATE >= isoDay(day - 6 * DAY_MS) && r.DATE <= isoDay(day + 2 * DAY_MS));
        for (const [arm, rowsFor] of [['definitive', definitiveRows], ['operational', opFor]]) {
          const fmodels = { D0: await jb2008(sub, null, rowsFor), D2f: await jb2008(sub, d2f, rowsFor) };
          for (const tag of forecastTags) {
            const f = forecastFits.get(`${tag}|${isoDay(t0)}`);
            if (!f) continue;
            for (const tau of decays) fmodels[`D5f-${tag}-T${tau ?? 'inf'}`] = await jb2008(sub, forecastCorrection(f, tau), rowsFor);
          }
          for (const m of orbitMeans(sub, fmodels, periodS, t0, t0 + 7 * DAY_MS)) {
            const lead = (m.s - t0) / DAY_MS, kp = maxKp(t0, m.s + 1);
            for (const [variant, v] of Object.entries(m.models)) {
              forecastRows.push({ target, issue: isoDay(t0), arm, s: m.s, day: isoDay(m.s), leadDays: lead, kp, regime: regimeOf(kp), variant,
                lnRatio: Math.log(m.obs / v), lnRatioD0: Math.log(m.obs / m.models.D0) });
            }
          }
        }
      }
    }
    log(`${target} ${span.from}..${span.to}: ${s.t.length} samples`);
  }
}
run.write('density-rows.json', { window: values.window, analysis: values.analysis ?? null, forecast: values.forecast ?? null, decays, e5Tau, rows, forecastRows });
run.finish({ rows: rows.length, forecastRows: forecastRows.length });
log(`done: ${rows.length} orbit means, ${forecastRows.length} forecast pairs`);
