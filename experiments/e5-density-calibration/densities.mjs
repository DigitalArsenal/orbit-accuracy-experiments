// Observed thermosphere densities for E5: the ESA/TU Delft daily products
// (Swarm DNSxPOD, GRACE-FO DNS1ACC; CDF converted by convert/cdf_densities.py
// into runs/cache) and the Licata et al. (2021) CHAMP and GRACE-A files
// (Zenodo 10.5281/zenodo.4602380), which carry the observed density with
// HASDM and JB2008 interpolated to each sample. Reading and resampling only.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { repoRoot } from '../../harness/provenance.mjs';
import { sha256 } from '../../harness/modules.mjs';
import { config, DAY_MS, dayMs, isoDay } from './common.mjs';

const cacheDir = path.join(repoRoot, 'runs', 'cache', 'e5-densities');
const python = process.env.E5_PYTHON ?? 'python3';

// Product file of one day for one satellite, or null.
function productFile(key, dayIso) {
  const spec = config.inputs.densities[key];
  const stamp = dayIso.replaceAll('-', '');
  const name = fs.readdirSync(spec.dir).find((n) => n.startsWith(`${spec.pattern}${stamp}T`) && !n.endsWith('.provenance.json'));
  return name ? path.join(spec.dir, name) : null;
}

// One day of samples, every config.density.sampleSeconds on the UTC grid:
// {t ms, lat, lon, altKm, rho, valid} arrays, plus the file's provenance.
const dayCache = new Map();
const memberCache = new Map();
export function productDay(key, dayIso, inputs) {
  const id = `${key}/${dayIso}`;
  if (dayCache.has(id)) return dayCache.get(id);
  const file = productFile(key, dayIso);
  if (!file) { dayCache.set(id, null); return null; }
  const out = path.join(cacheDir, key);
  const target = path.join(out, `${path.basename(file).replace(/\.(ZIP|zip|cdf)$/, '')}.json.gz`);
  if (!fs.existsSync(target)) execFileSync(python, ['-I', path.join(path.dirname(new URL(import.meta.url).pathname), 'convert/cdf_densities.py'), out, file], { stdio: 'inherit' });
  const record = JSON.parse(zlib.gunzipSync(fs.readFileSync(target)));
  inputs?.(path.basename(file), record.sha256);
  const step = config.density.sampleSeconds * 1000;
  const day = { t: [], lat: [], lon: [], altKm: [], rho: [], valid: [] };
  record.t.forEach((s, i) => {
    if (s === null) return;
    const ms = Math.round(s * 1000);
    if (ms % step !== 0) return;
    day.t.push(ms); day.lat.push(record.lat[i]); day.lon.push(record.lon[i]); day.altKm.push(record.altKm[i]); day.rho.push(record.rho[i]);
    day.valid.push(record.flag[i] === 0 && record.rho[i] > 0 && [record.lat[i], record.lon[i], record.altKm[i]].every(Number.isFinite));
  });
  dayCache.set(id, day);
  return day;
}

// Licata et al. CHAMP / GRACE-A day: the same arrays plus HASDM and their JB2008.
export function historicalDay(key, dayIso, inputs) {
  const id = `${key}/${dayIso}`;
  if (dayCache.has(id)) return dayCache.get(id);
  const h = config.inputs.historical, spec = h.satellites[key];
  const zip = path.join(h.zip, spec.file);
  const [y, m, d] = dayIso.split('-').map(Number);
  const doy = Math.round((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 1)) / DAY_MS) + 1;
  // Members are <prefix>/<year>/<name>_YY_DDD_v2.txt; found by their year and
  // day suffix (GRACE-A's files are named graceA_Density, not as config.json
  // has it: PLAN.md amendment 1).
  const suffix = `_${String(y % 100).padStart(2, '0')}_${String(doy).padStart(3, '0')}_v2.txt`;
  if (!memberCache.has(zip)) memberCache.set(zip, execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8', maxBuffer: 1 << 26 }).split('\n'));
  const member = memberCache.get(zip).find((m) => m.startsWith(`${spec.prefix}/${y}/`) && m.endsWith(suffix));
  if (!member) { dayCache.set(id, null); return null; }
  let text;
  try { text = execFileSync('unzip', ['-p', zip, member], { encoding: 'latin1', maxBuffer: 1 << 28, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { dayCache.set(id, null); return null; }
  if (!text) { dayCache.set(id, null); return null; }
  inputs?.(member, sha256(Buffer.from(text, 'latin1')));
  const lines = text.split('\n');
  const head = lines[0].split(',').map((s) => s.trim());
  const col = (name) => { const i = head.indexOf(name.trim()); if (i < 0) throw new Error(`${member}: no column ${name}`); return i; };
  const [cT, cAlt, cLat, cLon, cObs, cHasdm, cJb] = ['GPS Time (sec)', 'Geodetic Altitude (km)', 'Geodetic Latitude (deg)', 'Geodetic Longitude (deg)', h.observed, h.hasdm, h.jb2008Published].map(col);
  const leap = h.gpsMinusUtcSeconds.filter(([from]) => dayIso >= from).at(-1)[1];
  const step = config.density.sampleSeconds * 1000, base = dayMs(dayIso);
  const day = { t: [], lat: [], lon: [], altKm: [], rho: [], valid: [], hasdm: [], jb2008Published: [] };
  for (const line of lines.slice(1)) {
    const v = line.trim().split(/\s+/).map(Number);
    if (v.length < head.length) continue;
    const gpsMs = Math.round(v[cT] * 1000);
    if (gpsMs % step !== 0) continue;  // the GPS-time grid; UTC = GPS - leap seconds
    day.t.push(base + gpsMs - leap * 1000); day.lat.push(v[cLat]); day.lon.push(v[cLon]); day.altKm.push(v[cAlt]); day.rho.push(v[cObs]);
    day.valid.push(v[cObs] > 0 && Number.isFinite(v[cObs]));
    day.hasdm.push(v[cHasdm]); day.jb2008Published.push(v[cJb]);
  }
  dayCache.set(id, day);
  return day;
}

// Samples of one satellite over [fromMs, toMs), concatenated from its days.
export function samples(key, fromMs, toMs, inputs) {
  const historical = key in config.inputs.historical.satellites;
  const out = { t: [], lat: [], lon: [], altKm: [], rho: [], valid: [], ...(historical ? { hasdm: [], jb2008Published: [] } : {}) };
  for (let t = Math.floor(fromMs / DAY_MS) * DAY_MS; t < toMs; t += DAY_MS) {
    const day = historical ? historicalDay(key, isoDay(t), inputs) : productDay(key, isoDay(t), inputs);
    if (!day) continue;
    day.t.forEach((ms, i) => {
      if (ms < fromMs || ms >= toMs) return;
      for (const k of Object.keys(out)) out[k].push(k === 't' ? ms : day[k][i]);
    });
  }
  return out;
}

export function dropDensityCache() { dayCache.clear(); }
