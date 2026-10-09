#!/usr/bin/env node
// E5 step 20: density endpoint. For each held-out satellite, the densities of
// each variant at its own samples, compared with its observed density as
// orbit means (one orbital period centred on each scoring time, the same
// valid samples on both sides): ln(observed / model).
//   D0  JB2008 with SET's indices (analysis/density-calibration, no correction)
//   D1  NRLMSISE-00 (propagator/hpop ATMOSPHERE_REQUEST, daily drivers as
//       hpop's space_weather reading gives them)
//   D2a JB2008 + the correction of the concurrent 3-hour bin (analysis mode,
//       what the HASDM database is), per degree
//   D2f JB2008 + the correction forecast from each issue day (nowcast = mean
//       of the bins in the preceding window, decayed), per degree and decay
//   D3  HASDM (historical windows; Licata et al. 2021's interpolation)
//   J   the published JB2008 of the historical files (a check on D0)
// The models compute every density; this file averages and takes logs.
//
//   node .../20-density.mjs --window validation|test|historicalTest --calibration RUN_ID [--degrees 0,1,2] [--decays 12,48,null]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot, startRun } from '../../../harness/provenance.mjs';
import { config, configPath, callJson, DAY_MS, dayMs, gfzDays, isoDay, jb2008Rows, loadModules, maxKp, mjdOfMs, modulesDir, msOfMjd, regimeOf, setIndices, spwRows, windowSpans } from '../common.mjs';
import { samples } from '../densities.mjs';
import { atmosphereFrame, decodeAtmosphere } from '../hpop.mjs';
import { decayed, nowcast } from '../forecast.mjs';

const { values } = parseArgs({ options: { window: { type: 'string' }, calibration: { type: 'string' }, degrees: { type: 'string' }, decays: { type: 'string' }, modules: { type: 'string' } } });
const spans = windowSpans(values.window);
const historical = values.window === 'historicalTest';
const calibration = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', values.calibration, 'calibration.json'), 'utf8'));
if (calibration.window !== values.window) throw new Error(`calibration ${values.calibration} is for ${calibration.window}`);
const degrees = (values.degrees ?? calibration.degrees.join(',')).split(',').map(Number);
const decays = (values.decays ?? config.calibration.candidates.decayHours.map(String).join(',')).split(',').map((x) => (x === 'null' ? null : Number(x)));
const run = startRun({ experiment: config.experiment, step: `20-density-${values.window}`, configPath, modulesDir: modulesDir(values.modules), args: values });
run.addInputs('calibration', { [values.calibration]: JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', values.calibration, 'manifest.json'), 'utf8')).config.sha256 });
const { loaded } = await loadModules(run, ['analysis/density-calibration', 'propagator/hpop'], values);
const dc = loaded['analysis/density-calibration'], hpop = loaded['propagator/hpop'];
run.addInputs('set', setIndices().sha256);
run.addInputs('gfz', { kp: gfzDays().sha256 });
const log = (...a) => console.log(`[${run.id}]`, ...a);
const inputs = (name, hash) => run.addInputs('densities', { [name]: hash });
const sampleMs = config.density.sampleSeconds * 1000, scoreMs = config.density.scoreEverySeconds * 1000;

// JB2008 densities at samples (one call per UTC day), with an optional correction.
async function jb2008(s, correction) {
  const out = new Array(s.t.length).fill(null);
  for (let i = 0; i < s.t.length;) {
    const day = Math.floor(s.t[i] / DAY_MS) * DAY_MS;
    let j = i;
    while (j < s.t.length && s.t[j] < day + DAY_MS) ++j;
    const idx = [...Array(j - i).keys()].map((k) => i + k);
    const r = await callJson(dc, 'evaluate', 'request', {
      points: { mjd: idx.map((k) => mjdOfMs(s.t[k])), latDeg: idx.map((k) => s.lat[k]), lonDeg: idx.map((k) => s.lon[k]), altKm: idx.map((k) => s.altKm[k]) },
      jb2008: { rows: jb2008Rows(isoDay(day - 6 * DAY_MS), isoDay(day + 2 * DAY_MS)) },
      ...(correction ? { correction: { degree: correction.degree, segments: correction.segments.filter((g) => g.toMjd > mjdOfMs(day) && g.fromMjd < mjdOfMs(day + DAY_MS)) } } : {}),
    });
    idx.forEach((k, n) => { out[k] = r.density[n]; });
    i = j;
  }
  return out;
}
// NRLMSISE-00 densities: F10.7 of the previous day, its 81-day centred mean
// and Ap of the day (hpop's SpaceWeatherTable reading).
async function msis(s) {
  const spw = new Map(spwRows(isoDay(s.t[0] - 2 * DAY_MS), isoDay(s.t.at(-1) + DAY_MS)).map((r) => [r.DATE, r]));
  const out = [];
  for (let k = 0; k < s.t.length; ++k) {
    const today = spw.get(isoDay(s.t[k])), yesterday = spw.get(isoDay(s.t[k] - DAY_MS));
    const lon = ((s.lon[k] + 540) % 360) - 180;
    out.push(decodeAtmosphere(await hpop.invoke('invoke', [atmosphereFrame({ epoch: new Date(s.t[k]).toISOString().slice(0, 23), altKm: s.altKm[k], latDeg: s.lat[k],
      lonDeg: lon, f107: yesterday.F107_OBS, f107a: today.F107_OBS_CENTER81, ap: today.AP_AVG })])));
  }
  return out;
}
// Orbit means at scoring times: {s, n, obs, models: {name: mean}} where
// every model is averaged over the same valid samples as the observation.
function orbitMeans(s, models, periodS, fromMs, toMs) {
  const half = (periodS * 1000) / 2, expected = Math.round(periodS / config.density.sampleSeconds);
  const out = [];
  let lo = 0, hi = 0;
  for (let t = Math.ceil((fromMs + half) / scoreMs) * scoreMs; t <= toMs - half; t += scoreMs) {
    while (lo < s.t.length && s.t[lo] < t - half) ++lo;
    while (hi < s.t.length && s.t[hi] < t + half) ++hi;
    let n = 0, obs = 0;
    const sums = Object.fromEntries(Object.keys(models).map((m) => [m, 0]));
    let ok = true;
    for (let k = lo; k < hi; ++k) {
      if (!s.valid[k]) continue;
      for (const m of Object.keys(models)) { const v = models[m][k]; if (!(v > 0)) { ok = false; break; } sums[m] += v; }
      if (!ok) break;
      obs += s.rho[k]; ++n;
    }
    if (!ok || n < config.density.orbitAverage.minimumValidFraction * expected) continue;
    out.push({ s: t, n, obs: obs / n, models: Object.fromEntries(Object.entries(sums).map(([m, v]) => [m, v / n])) });
  }
  return out;
}

const heldOut = historical ? config.density.heldOut.historical : config.density.heldOut['2026'];
const rows = [];       // {target, s, day, kp, regime, variant, lnRatio}
const forecastRows = [];  // {target, issue, s, leadDays, day, regime, variant, lnRatio, lnRatioD0}
for (const { target, calibrators } of heldOut) {
  const key = [...calibrators].sort().join('+');
  const periodS = config.density.orbitAverage.periodSeconds[target];
  for (const span of spans) {
    const from = dayMs(span.from), to = dayMs(span.to) + 7 * DAY_MS;
    const s = samples(target, from - 2 * 3600000, to + 2 * 3600000, inputs);
    if (s.t.length < 100) { log(`${target} ${span.from}: no samples`); continue; }
    const models = { D0: await jb2008(s, null), D1: await msis(s) };
    if (historical) { models.D3 = s.hasdm; models.J = s.jb2008Published; }
    const bins = {};
    for (const degree of degrees) {
      bins[degree] = calibration.sets[key].degrees[degree].filter((b) => b.coefficients);
      models[`D2a-L${degree}`] = await jb2008(s, { degree, segments: bins[degree].map((b) => ({ fromMjd: b.fromMjd, toMjd: b.toMjd, coefficients: b.coefficients })) });
    }
    for (const m of orbitMeans(s, models, periodS, from, to)) {
      const kp = maxKp(m.s - 3 * 3600000, m.s + 1), regime = regimeOf(kp), day = isoDay(m.s);
      for (const [variant, v] of Object.entries(m.models)) rows.push({ target, s: m.s, day, kp, regime, variant, lnRatio: Math.log(m.obs / v) });
    }
    // Forecasts from each issue day.
    for (let t0 = dayMs(span.from); t0 <= dayMs(span.to); t0 += DAY_MS) {
      const idx = s.t.map((t, k) => k).filter((k) => s.t[k] >= t0 - 2 * 3600000 && s.t[k] < t0 + 7 * DAY_MS + 2 * 3600000);
      const sub = Object.fromEntries(Object.entries(s).map(([k, v]) => [k, idx.map((i) => v[i])]));
      const fmodels = { D0: idx.map((i) => models.D0[i]) };
      for (const degree of degrees) {
        const now = nowcast(bins[degree], t0, degree);
        for (const tau of decays) {
          fmodels[`D2f-L${degree}-T${tau ?? 'inf'}`] = await jb2008(sub, { degree, segments: decayed(now, t0, tau, 7 * DAY_MS + 3 * 3600000, degree) });
        }
      }
      for (const m of orbitMeans(sub, fmodels, periodS, t0, t0 + 7 * DAY_MS)) {
        const lead = (m.s - t0) / DAY_MS, kp = maxKp(t0, m.s + 1);
        for (const [variant, v] of Object.entries(m.models)) {
          if (variant === 'D0') continue;
          forecastRows.push({ target, issue: isoDay(t0), s: m.s, day: isoDay(m.s), leadDays: lead, kp, regime: regimeOf(kp), variant, lnRatio: Math.log(m.obs / v), lnRatioD0: Math.log(m.obs / m.models.D0) });
        }
      }
    }
    log(`${target} ${span.from}..${span.to}: ${s.t.length} samples`);
  }
}
run.write('density-rows.json', { window: values.window, calibration: values.calibration, degrees, decays, rows, forecastRows });
run.finish({ rows: rows.length, forecastRows: forecastRows.length });
log(`done: ${rows.length} orbit means, ${forecastRows.length} forecast pairs`);
