// Part 1b's windows (PLAN.md): file k's first 24 h is the operator track, E its first epoch plus 24 h; the truth is the first 24 h of each newer
// file that starts in (E, E + 72 h], each epoch from the newest such file that starts at or before it; a window is excluded when a planned
// burn of any file's header lies in [the start of file k, E + 72 h]. Every phase of part1-iss.mjs reads its windows here. Records only.
import fs from 'node:fs';
import path from 'node:path';
import { config, g1Dir } from '../common.mjs';

const I = config.part1.iss;
const H = 3600e3;
const iso = (t) => new Date(Math.round(t)).toISOString();
const { parseIssOem } = await import(path.join(g1Dir, 'lib/iss-oem.mjs'));
const { archiveHeaders, burnClusters } = await import(path.join(g1Dir, 'lib/iss-windows.mjs'));

export const headers = archiveHeaders();
const burns = burnClusters(headers).flatMap((c) => c.members.map((m) => m.tigMs));
const starts = headers.map((h) => h.header.startMs);
const cache = new Map();
const statesOf = (i) => { if (!cache.has(i)) { if (cache.size > 12) cache.delete(cache.keys().next().value); cache.set(i, parseIssOem(fs.readFileSync(headers[i].file, 'utf8')).states); } return cache.get(i); };
const lineOf = (s) => ({ epoch: iso(s.ms), r: s.r, v: s.v });
export const object = { frame: 'EME2000', name: 'ISS', norad: 25544, originator: 'NASA JSC FOD (ISS trajectory archive)' };
export const binOf = (E) => (t) => { const h = (t - E) / H; const b = I.binsHours.findIndex(([lo, hi]) => h > lo && h <= hi); return b < 0 ? null : String(b + 1); };

/** Window i: { row (the stored row's identity), excluded } or { row, E, track, truth, epochs, forecastBy }; states EME2000 km, km/s. */
export function windowOf(i) {
  const start = starts[i], E = start + I.trackHours * H;
  if (!Number.isFinite(start)) return { row: { file: headers[i].date }, excluded: 'the header has no readable START_TIME' };
  const row = { file: headers[i].date, startUtc: iso(start), fitEndUtc: iso(E) };
  const burn = burns.find((t) => t >= start && t <= E + 72 * H);
  if (burn) return { row, excluded: `planned burn ${iso(burn)}` };
  const newer = starts.map((s, j) => ({ s, j })).filter(({ s }) => s > E && s <= E + 72 * H).sort((x, y) => x.s - y.s);
  const truthBy = new Map();
  for (const { s, j } of newer) for (const st of statesOf(j)) if (st.ms >= s && st.ms <= s + I.truthHours * H && st.ms <= E + 72 * H) truthBy.set(st.ms, { ...lineOf(st), file: headers[j].date });
  const truth = [...truthBy.values()].sort((x, y) => Date.parse(x.epoch) - Date.parse(y.epoch));
  if (!truth.length) return { row, excluded: 'no newer file starts in the 72 h after the fit' };
  const own = statesOf(i);
  const track = own.filter((s) => s.ms >= start && s.ms <= E).map(lineOf);
  return { row, E, track, truth, epochs: truth.map((t) => Date.parse(t.epoch)), forecastBy: new Map(own.map((s) => [s.ms, s])) };
}
