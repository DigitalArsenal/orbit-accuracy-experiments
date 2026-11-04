// Selection's truth: x = ln(rho_obs / rho_NRLMSISE-00) under XM's condition O rows at the cutoff, from the observed densities E13 cached, and the statistic D.
// analysis/density-calibration evaluate; the bins and the statistic are arithmetic on its answers.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { config, root, store, args, sha256, DAY, HOUR, dateOf, dayName } from '../common.mjs';
import { DCL, DCL_TYPE, flatbuffers } from './product.mjs';
import { normalizedDir } from './rsga.mjs';

const C = config.selection.truth;
const xmCommon = await import(path.join(root, 'experiments/xp-atmosphere-merit/common.mjs'));
// Amendment A3: every row reads the normalized bulletins. --reading raw exists only to compare what an arc read before them.
xmCommon.config.spaceWeather.rsgaDirs.push(args.reading === 'raw' ? path.join(store, 'rsga') : normalizedDir);
export const W = await import(path.join(root, 'experiments/xp-atmosphere-merit/lib/weather.mjs'));
const cache = new Map();
function day(k, d) {
  const id = `${k}/${d}`;
  if (cache.has(id)) return cache.get(id);
  const stamp = d.replaceAll('-', ''), dir = path.join(C.cacheDir, k);
  const name = fs.readdirSync(dir).find((n) => n.startsWith(`${C.products[k]}${stamp}T`));
  let out = null;
  if (name) {
    const r = JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(dir, name))));
    out = [];
    r.t.forEach((s, i) => {
      if (s === null) return;
      const ms = Math.round(s * 1000);
      if (ms % 60000 !== 0 || r.flag[i] !== 0 || !(r.rho[i] > 0) || ![r.lat[i], r.lon[i], r.altKm[i]].every(Number.isFinite)) return;
      out.push({ ms, lat: r.lat[i], lon: r.lon[i], alt: r.altKm[i], rho: r.rho[i] });
    });
  }
  if (cache.size > 64) cache.delete(cache.keys().next().value);
  cache.set(id, out);
  return out;
}
export function samples(k, fromMs, toMs) {
  const out = [];
  for (let t = Date.parse(`${dateOf(fromMs)}T00:00:00Z`); t < toMs; t += DAY) { const L = day(k, dateOf(t)); if (L) for (const p of L) if (p.ms >= fromMs && p.ms < toMs) out.push(p); }
  return out;
}
/** Condition O at a cutoff, every day through the cutoff's day + 8 (XM3's drivers rule). */
export function rowsAt(cutoff) {
  const O = W.rowsO(cutoff - 72 * HOUR - 7 * DAY, cutoff);  // an arc ending at a lagged node starts days before the cutoff's arc
  if (O.excluded) return null;
  const byDate = new Map(O.rows.map((r) => [r.date, r])), out = [];
  let last = null;
  for (let t = Date.parse(`${O.rows[0].date}T00:00:00Z`); t <= Date.parse(`${dateOf(cutoff)}T00:00:00Z`) + 8 * DAY; t += DAY) { const r = byDate.get(dateOf(t)); if (r) { out.push(r); last = r; } else out.push({ ...last, date: dateOf(t) }); }
  return out;
}
/** An arc's weather input: the rows are all that the space-weather frame encodes. */
export const weatherOf = (rows) => sha256(JSON.stringify(rows));
const T = (name, fields) => Object.assign(new DCL[`${name}T`](), fields);
/** ln(rho_obs / rho_model) of points. */
export async function anomalies(density, points, rows) {
  const value = T('DCL', { ATMOSPHERE: T('ATM', { MODEL: DCL.AtmosphericModelFamily.NRLMSIS00E, YEAR: 2000 }), SETTINGS: T('dclSettings', {}),
    SPACE_WEATHER: rows.map((r) => Object.assign(new DCL.SPWT(), { DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap })),
    POINTS: T('dclPoints', { TIME_MS: points.map((p) => BigInt(p.ms)), LATITUDE_DEG: points.map((p) => p.lat), LONGITUDE_DEG: points.map((p) => p.lon), ALTITUDE_KM: points.map((p) => p.alt) }) });
  const b = new flatbuffers.Builder(1 << 20);
  DCL.DCL.finishDCLBuffer(b, value.pack(b));
  const r = await density.invoke('evaluate', [{ portId: 'request', typeRef: DCL_TYPE, payload: b.asUint8Array().slice() }]);
  if (r.statusCode !== 0) throw new Error(`evaluate: ${r.errorMessage}`);
  const o = DCL.DCL.getRootAsDCL(new flatbuffers.ByteBuffer(new Uint8Array(r.outputs[0].payload))).unpack();
  if (o.POINTS.REFUSED.length) throw new Error(`evaluate refused ${o.POINTS.REFUSED.length} points`);
  return points.map((p, i) => Math.log(p.rho / o.POINTS.DENSITY_KG_M3[i]));
}
/** The 3 h bin means of x over the 72 h arc ending at `end`, or null when a bin holds under 90 samples: { x[24], t[24] }. */
export async function arcBins(density, k, end, rows) {
  const points = samples(k, end - 72 * HOUR, end);
  if (points.length < 2000) return null;
  const x = await anomalies(density, points, rows), sum = new Array(24).fill(0), n = new Array(24).fill(0);
  points.forEach((p, i) => { const b = Math.floor((p.ms - (end - 72 * HOUR)) / (3 * HOUR)); sum[b] += x[i]; n[b] += 1; });
  if (n.some((v) => v < 90)) return null;
  return { x: sum.map((v, i) => v / n[i]), t: sum.map((_, i) => end - 72 * HOUR + (i + 0.5) * 3 * HOUR) };
}
// D: the rms of the double time integral of the series less its mean, after a quadratic in time is removed.
const N = 24, ts = Array.from({ length: N }, (_, i) => ((i + 0.5) / N) * 2 - 1), Q = [];
for (const b of [ts.map(() => 1), ts, ts.map((t) => t * t)]) { let v = [...b]; for (const q of Q) { const d = v.reduce((a, x, i) => a + x * q[i], 0); v = v.map((x, i) => x - d * q[i]); } const n = Math.hypot(...v); Q.push(v.map((x) => x / n)); }
export function statD(series) {
  const m = series.reduce((a, b) => a + b, 0) / N;
  let v = 0, p = 0, out = series.map((x) => { v += x - m; p += v; return p; });
  for (const q of Q) { const d = out.reduce((a, x, i) => a + x * q[i], 0); out = out.map((x, i) => x - d * q[i]); }
  return Math.sqrt(out.reduce((a, x) => a + x * x, 0) / N);
}
