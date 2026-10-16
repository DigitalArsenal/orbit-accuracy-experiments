#!/usr/bin/env node
// CHAMP through the storms of 28 October to 1 November 2003, as E5 scored it
// on HASDM's windows: its accelerometer densities and HASDM's (Licata et al.
// 2021, CC BY 4.0), JB2008 with SET's indices and JB2008 with E5's
// temperature correction calibrated on GRACE-A alone (CHAMP held out), both
// from analysis/density-calibration, and CHAMP's position in GCRF from its
// geodetic samples (foundation/frames: WGS-84, then IERS C04 Earth
// orientation). Writes site/generated/champ-2003-storm.json; build.mjs
// publishes it. SET's index files stay on this machine; the densities the
// module computes from them are results.
//
//   node site/run-drag.mjs [--modules DIR] [--from 2003-10-28] [--to 2003-11-01]
import fs from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { gitState, loadModule, modulesRoot, sha256 } from '../harness/modules.mjs';
import { c04Records } from '../harness/eop.mjs';
import { DAY_MS, callJson, config, dayMs, isoDay, jb2008Rows, mjdOfMs } from '../experiments/e5-density-calibration/common.mjs';
import { samples } from '../experiments/e5-density-calibration/densities.mjs';
import { eopFrames, geodeticToItrf, transformState } from './src/od/codec.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const { values } = parseArgs({ options: { modules: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } });
const v1Config = JSON.parse(fs.readFileSync(path.join(repo, 'experiments/v1-ffm-physical-truth/config.json'), 'utf8'));
const modules = modulesRoot({ flag: values.modules, configured: v1Config.inputs.modules, repoRoot: repo });
const from = dayMs(values.from ?? '2003-10-28'), to = dayMs(values.to ?? '2003-11-01');
const TARGET = 'champ', CALIBRATOR = 'graceA', DEGREE = 0, STEP_MS = 60000;
const periodS = config.density.orbitAverage.periodSeconds[TARGET], scoreMs = config.density.scoreEverySeconds * 1000;

const dc = await loadModule(modules, 'analysis/density-calibration');
const frames = await loadModule(modules, 'foundation/frames');
const parser = await loadModule(modules, 'data-source/eop-parser');

// E5's correction for HASDM's windows calibrated on GRACE-A only: one global
// temperature offset (degree 0) per 3-hour bin.
const calibrationFile = 'results/e5/calibration/e5-density-calibration-10-calibrate-historicalTest-20261009T191214Z.calibration.json.gz';
const calibration = JSON.parse(gunzipSync(fs.readFileSync(path.join(repo, calibrationFile))));
const bins = calibration.sets[CALIBRATOR].degrees[DEGREE].filter((b) => b.coefficients);

// CHAMP's samples (E5's 30 s grid), with a half-orbit margin for the orbit means.
const inputs = {};
const s = samples(TARGET, from - 2 * 3600e3, to + 2 * 3600e3, (name, hash) => { inputs[name] = hash; });
if (s.t.length < 1000) throw new Error(`CHAMP: ${s.t.length} samples`);

// JB2008 densities at the samples, one call per UTC day, with or without the correction (E5 step 20).
async function jb2008(correction) {
  const out = new Array(s.t.length).fill(null);
  for (let i = 0; i < s.t.length;) {
    const day = Math.floor(s.t[i] / DAY_MS) * DAY_MS;
    let j = i;
    while (j < s.t.length && s.t[j] < day + DAY_MS) ++j;
    const idx = [...Array(j - i).keys()].map((k) => i + k);
    const r = await callJson(dc, 'evaluate', 'request', {
      points: { mjd: idx.map((k) => mjdOfMs(s.t[k])), latDeg: idx.map((k) => s.lat[k]), lonDeg: idx.map((k) => s.lon[k]), altKm: idx.map((k) => s.altKm[k]) },
      jb2008: { rows: jb2008Rows(isoDay(day - 6 * DAY_MS), isoDay(day + 2 * DAY_MS)) },
      ...(correction ? { correction: { degree: DEGREE, segments: correction.filter((g) => g.toMjd > mjdOfMs(day) && g.fromMjd < mjdOfMs(day + DAY_MS)) } } : {}),
    });
    idx.forEach((k, n) => { out[k] = r.density[n]; });
    i = j;
  }
  return out;
}
const models = {
  jb2008: await jb2008(null),
  corrected: await jb2008(bins.map((b) => ({ fromMjd: b.fromMjd, toMjd: b.toMjd, coefficients: b.coefficients }))),
  hasdm: s.hasdm,
};

// Orbit means every 10 min, one period centered on each, over the samples
// valid for the observation and every model (E5 step 20's orbitMeans).
const means = { t: [], obs: [], jb2008: [], corrected: [], hasdm: [] };
{
  const half = (periodS * 1000) / 2, expected = Math.round(periodS / config.density.sampleSeconds);
  let lo = 0, hi = 0;
  for (let t = Math.ceil((from + half) / scoreMs) * scoreMs; t <= to - half; t += scoreMs) {
    while (lo < s.t.length && s.t[lo] < t - half) ++lo;
    while (hi < s.t.length && s.t[hi] < t + half) ++hi;
    let n = 0, obs = 0, ok = true;
    const sums = { jb2008: 0, corrected: 0, hasdm: 0 };
    for (let k = lo; k < hi && ok; ++k) {
      if (!s.valid[k]) continue;
      for (const m of Object.keys(sums)) { const v = models[m][k]; if (!(v > 0)) { ok = false; break; } sums[m] += v; }
      if (ok) { obs += s.rho[k]; ++n; }
    }
    if (!ok || n < config.density.orbitAverage.minimumValidFraction * expected) continue;
    means.t.push(t); means.obs.push(obs / n);
    for (const m of Object.keys(sums)) means[m].push(sums[m] / n);
  }
}

// The scene's samples: every minute in the window, positions in GCRF (km).
const eopRows = (await c04Records(parser, process.env.SDN_EOP_C04 ?? '/opt/data/sdn-archive/reference-states/products/eopc04.1962-now')).records;
const mjd0 = Math.floor(mjdOfMs(from)) - 1, mjd1 = Math.ceil(mjdOfMs(to)) + 1;
const eop = eopFrames(eopRows.filter((r) => r.mjd >= mjd0 && r.mjd <= mjd1).map((r) => r.row));
const scene = { t: [], gcrfKm: [], latDeg: [], altKm: [], obs: [], jb2008: [], corrected: [], hasdm: [] };
const round = (x, d) => Number(x.toFixed(d));
const sig = (x) => (x > 0 ? Number(x.toPrecision(5)) : null);
// The samples sit on the GPS-time grid, UTC = GPS − 13 s in 2003: every
// minute of that grid.
const phase = (((s.t.find((t) => t >= from) ?? from) % STEP_MS) + STEP_MS) % STEP_MS;
for (let k = 0; k < s.t.length; ++k) {
  const t = s.t[k];
  if (t < from || t >= to || ((t % STEP_MS) + STEP_MS) % STEP_MS !== phase) continue;
  const itrf = await geodeticToItrf(frames, { lat: s.lat[k], lon: s.lon[k], alt: s.altKm[k] * 1000 });
  const g = await transformState(frames, eop, { from: 'ITRF', to: 'GCRF', epoch: new Date(t).toISOString().slice(0, 23), position: itrf, velocity: [0, 0, 0] });
  scene.t.push(t); scene.gcrfKm.push(...g.position.map((x) => round(x, 3)));
  scene.latDeg.push(round(s.lat[k], 3)); scene.altKm.push(round(s.altKm[k], 3));
  scene.obs.push(s.valid[k] ? sig(s.rho[k]) : null);
  for (const m of ['jb2008', 'corrected', 'hasdm']) scene[m].push(sig(models[m][k]));
}

// E5's scores on CHAMP held out and on both satellites (σ of ln(observed / model) of orbit means).
const metrics = JSON.parse(fs.readFileSync(path.join(repo, 'results/e5/test/metrics.json'), 'utf8'));
const binary = (relative) => {
  const wasm = fs.readFileSync(path.join(modules, relative, 'dist/isomorphic/module.wasm'));
  const m = JSON.parse(fs.readFileSync(path.join(modules, relative, 'plugin-manifest.json'), 'utf8'));
  return { path: relative, version: m.version, wasmSha256: sha256(wasm) };
};
const out = {
  object: { name: 'CHAMP', norad: 26405, heldOut: true, calibratedOn: 'GRACE-A' },
  window: [isoDay(from), isoDay(to)],
  generated: new Date().toISOString(), runtime: `Node ${process.version}`,
  modulesRepository: gitState(modules), modules: [binary('analysis/density-calibration'), binary('foundation/frames'), binary('data-source/eop-parser')],
  inputs: { licata2021: { doi: config.inputs.historical.doi, files: inputs }, calibration: calibrationFile, set: 'SOLFSMY.TXT and DTCFILE.TXT, not reproduced' },
  correction: { degree: DEGREE, binHours: calibration.binHours, bins: bins.filter((b) => b.toMjd > mjdOfMs(from) - 0.5 && b.fromMjd < mjdOfMs(to) + 0.5)
    .map((b) => ({ fromMjd: b.fromMjd, toMjd: b.toMjd, deltaTK: round(b.coefficients[0], 3), sigmaK: round(b.sigmas[0], 3) })) },
  orbitMeans: { periodSeconds: periodS, everySeconds: scoreMs / 1000, ...Object.fromEntries(Object.entries(means).map(([k, v]) => [k, k === 't' ? v : v.map(sig)])) },
  samples: { stepSeconds: STEP_MS / 1000, ...scene },
  // σ with its 95 % interval, for JB2008 (D0), the correction (D2a, degree 0) and HASDM (D3).
  e5: Object.fromEntries([['pooled', metrics.historical.pooled], ['champ', metrics.historical.bySatellite.champ]].map(([k, x]) => [k, { days: x.days, satellites: x.satellites,
    ...Object.fromEntries([['jb2008', 'D0'], ['corrected', 'D2a-L0'], ['hasdm', 'D3']].map(([name, v]) => [name, { n: x.variants[v].n,
      sigma: [x.variants[v].sigma.estimate, x.variants[v].sigma.lower, x.variants[v].sigma.upper].map((y) => round(y, 6)) }])) }])),
};
fs.mkdirSync(path.join(here, 'generated'), { recursive: true });
fs.writeFileSync(path.join(here, 'generated/champ-2003-storm.json'), `${JSON.stringify(out)}\n`);
const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1)); };
const sigma = (m) => sd(means.t.map((_, i) => Math.log(means.obs[i] / means[m][i])));
console.log(`${scene.t.length} samples, ${means.t.length} orbit means; σ JB2008 ${sigma('jb2008').toFixed(3)}, corrected ${sigma('corrected').toFixed(3)}, HASDM ${sigma('hasdm').toFixed(3)}`);
