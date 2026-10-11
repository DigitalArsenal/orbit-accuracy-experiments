// Observed thermosphere densities for E13: ESA/TU Delft daily products (Swarm A, B, C DNSxPOD, GRACE-FO 1 DNS1ACC; CDF converted by the
// E5 reader into gzip JSON in the derived store, values copied) and the 12-hour window statistic of PLAN.md section 6,
//   x = mean over the window's valid 30 s samples of ln(rho_observed / rho_JB2008),
// with rho_JB2008 from analysis/density-calibration `evaluate` (SET's indices as published). Reading, averaging and logs only; every
// density is a module's or the products'. A day of a test split is read only when windows.mjs lets it.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { json, loadModule } from '../../harness/modules.mjs';
import { readSetIndices, jb2008Rows } from './vendor/full-force.mjs';
import { DAY, STORE, config, energyModulesDir, experimentDir } from './common.mjs';
import { assertDensityDayReadable } from './windows.mjs';

export const SATELLITES = Object.keys(config.inputs.densities);                 // swarmA, swarmB, swarmC, gracefo1
export const WINDOW_MS = config.analysis.windowHours * 3600e3;
export const SAMPLE_MS = 30e3;
const cacheDir = path.join(STORE, 'density-cache');
const isoDay = (ms) => new Date(ms).toISOString().slice(0, 10);
const dayStartMs = (iso) => Date.parse(`${iso}T00:00:00Z`);

// The product file of one day, or null (GRACE-FO's density ends on `lastDay`).
function productFile(key, dayIso) {
  const spec = config.inputs.densities[key];
  if (spec.lastDay && dayIso > spec.lastDay) return null;
  const stamp = dayIso.replaceAll('-', '');
  const name = fs.readdirSync(spec.dir).find((n) => n.startsWith(`${spec.pattern}${stamp}T`) && !n.endsWith('.provenance.json'));
  return name ? path.join(spec.dir, name) : null;
}

// One day of samples on the 30 s UTC grid: {t [ms], lat, lon, altKm, rho, valid [bool]} and the file's name and SHA-256, or null.
const dayCache = new Map();
export function productDay(key, dayIso) {
  assertDensityDayReadable(dayIso);
  const id = `${key}/${dayIso}`;
  if (dayCache.has(id)) return dayCache.get(id);
  const file = productFile(key, dayIso);
  if (!file) { dayCache.set(id, null); return null; }
  const out = path.join(cacheDir, key);
  const target = path.join(out, `${path.basename(file).replace(/\.(ZIP|zip|cdf)$/, '')}.json.gz`);
  if (!fs.existsSync(target)) execFileSync(config.inputs.python, ['-I', path.resolve(experimentDir, config.inputs.densityConverter), out, file], { stdio: 'inherit' });
  const record = JSON.parse(zlib.gunzipSync(fs.readFileSync(target)));
  const day = { file: path.basename(file), sha256: record.sha256, t: [], lat: [], lon: [], altKm: [], rho: [], valid: [] };
  record.t.forEach((s, i) => {
    if (s === null) return;
    const ms = Math.round(s * 1000);
    if (ms % SAMPLE_MS !== 0) return;
    day.t.push(ms); day.lat.push(record.lat[i]); day.lon.push(record.lon[i]); day.altKm.push(record.altKm[i]); day.rho.push(record.rho[i]);
    day.valid.push(record.flag[i] === 0 && record.rho[i] > 0 && [record.lat[i], record.lon[i], record.altKm[i]].every(Number.isFinite));
  });
  dayCache.set(id, day);
  return day;
}

export async function openDensityEnv() {
  const dc = await loadModule(energyModulesDir(), 'analysis/density-calibration');
  const set = readSetIndices(config.inputs.solfsmy, config.inputs.dtcfile);
  return { dc, set, destroy: () => dc.destroy() };
}

// JB2008 densities (and local solar times) at the points of a day's valid samples. `correction` (optional): the module's node correction
// {nodesMjd, altitudeKm?, values} in K; `derivative` adds d ln(rho) / dT.
export async function jb2008At(env, day, indices, { correction = null, derivative = false } = {}) {
  const t0 = day.t[indices[0]];
  const rows = jb2008Rows(env.set, t0 - 6 * DAY, t0 + 2 * DAY);
  const r = await env.dc.invokeJson('evaluate', [json('request', {
    points: { mjd: indices.map((k) => day.t[k] / DAY + 40587), latDeg: indices.map((k) => day.lat[k]), lonDeg: indices.map((k) => day.lon[k]), altKm: indices.map((k) => day.altKm[k]) },
    jb2008: { rows }, ...(correction ? { correction } : {}), ...(derivative ? { derivative: true } : {}) })], 'result');
  return r;
}

// NRLMSISE-00 densities at the points of a day's valid samples (analysis/density-calibration 0.4.0 `evaluate`, atmosphere NRLMSISE00): the common reference of
// PLAN.md Amendment S3. `rowsFor(fromMs, toMs)`: SPW rows (CSSI layout) of the days.
export async function nrlmsise00At(env, day, indices, rowsFor) {
  const t0 = day.t[indices[0]];
  const rows = rowsFor(t0 - 3 * DAY, t0 + 2 * DAY).map((r) => ({ DATE: r.DATE, F107_OBS: r.F107_OBS, F107_OBS_CENTER81: r.F107_OBS_CENTER81, AP_AVG: r.AP_AVG }));
  return env.dc.invokeJson('evaluate', [json('request', {
    points: { mjd: indices.map((k) => day.t[k] / DAY + 40587), latDeg: indices.map((k) => day.lat[k]), lonDeg: indices.map((k) => day.lon[k]), altKm: indices.map((k) => day.altKm[k]) },
    atmosphere: 'NRLMSISE00', nrlmsise00: { rows } })], 'result');
}

// The 12 h windows of one UTC day: [{startMs, n, x, altKm}] (x null when fewer than the required share of the window's nominal
// samples are valid and have a model density). The model is JB2008 with SET's indices, or, with `reference: {rowsFor}`, NRLMSISE-00 (Amendment S3).
export async function windowsOfDay(env, key, dayIso, { reference = null } = {}) {
  const day = productDay(key, dayIso);
  if (!day) return { windows: [], file: null };
  const valid = day.t.map((_, k) => k).filter((k) => day.valid[k]);
  const r = valid.length ? (reference ? await nrlmsise00At(env, day, valid, reference.rowsFor) : await jb2008At(env, day, valid)) : { density: [] };
  const model = new Map(valid.map((k, n) => [k, r.density[n]]));
  const start = dayStartMs(dayIso), nominal = WINDOW_MS / SAMPLE_MS, windows = [];
  for (let w = 0; w < DAY / WINDOW_MS; ++w) {
    const lo = start + w * WINDOW_MS, hi = lo + WINDOW_MS;
    let n = 0, sum = 0, alt = 0;
    day.t.forEach((t, k) => {
      if (t < lo || t >= hi) return;
      const rho = model.get(k);
      if (!(rho > 0)) return;
      ++n; sum += Math.log(day.rho[k] / rho); alt += day.altKm[k];
    });
    const ok = n >= config.analysis.minimumValidFraction * nominal;
    windows.push({ startMs: lo, n, x: ok ? sum / n : null, altKm: n ? alt / n : null });
  }
  return { windows, file: { name: day.file, sha256: day.sha256 } };
}

export { isoDay, dayStartMs };
