// C2's precise-track windows (PLAN.md 3.3-3.4, C2-A1, C2-A2): an object's converted precise orbit (analysis/reference-states $OEM, GCRF,
// through the truth gate) chained over its products, each state tagged with its arc's stated sigma; a window at cutoff E is the 24 h
// fit track [E - 24 h, E] at 10-min spacing (the state nearest each 10-min mark, within half the product step) and, per lead L, the
// state nearest E + L within the lead tolerance. Records only: every orbit computation is the modules'.
import fs from 'node:fs';
import path from 'node:path';
import { REFERENCE_ROOTS, HOUR, iso, config } from '../common.mjs';

const b2 = (rel) => path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../sdn-ap-mixed-screening', rel);
const SRC = await import(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../sdn-gp-starlink-ffm-match/lib/sources.mjs'));
const W = await import(path.resolve(path.dirname(new URL(import.meta.url).pathname), '../../sdn-gp-starlink-ffm-match/lib/windows.mjs'));
export { b2 };

/** Product prefixes per object family (C2-A1 point 4: GNSS from ESA0OPSFIN only). */
export const productPrefix = (norad, family) => ({ nsgf: 'nsgf.orb.', ilrsa: 'ilrsa.orb.', gnss: 'ESA0OPSFIN', s1: 'S1', swarm: 'SW_OPER', gfz: 'GFZOP', cosmic2: 'leoOrb' }[family]);

/**
 * The truth series of one object from the products whose directory starts with `prefix`, optionally only arcs with stated sigma at or
 * under `maxSigmaM`: { norad, lines: [{epoch, r, v, sigma, product}] (km, km/s GCRF), t, products: [{product, sha256?, sigma}] }.
 * Later products take their own epochs (G1's chain rule). `opened` (common.mjs Opened) logs every file.
 */
export function truthSeries(norad, prefix, { maxSigmaM = Infinity, opened, from = -Infinity, to = Infinity } = {}) {
  const items = [];
  for (const r of REFERENCE_ROOTS) for (const product of fs.readdirSync(r).filter((p) => p.startsWith(prefix)).sort()) {
    const ixFile = path.join(r, product, 'index.json');
    if (!fs.existsSync(ixFile)) continue;
    const ix = JSON.parse(opened ? opened.read(ixFile, 'index.json') : fs.readFileSync(ixFile));
    const o = ix.objects.find((x) => x.norad === norad);
    if (!o) continue;
    if (Date.parse(o.stop) < from || Date.parse(o.start) > to) continue;
    const sigma = ix.statedSigmaM ?? null;
    if (sigma !== null && sigma > maxSigmaM) continue;
    items.push({ file: path.join(r, product, o.file), product, sigma, start: Date.parse(o.start) });
  }
  items.sort((a, b) => a.start - b.start || (a.product < b.product ? -1 : 1));
  const byEpoch = new Map();
  for (const it of items) {
    if (opened) opened.add(it.file, 'reference $OEM');
    for (const l of SRC.readReference(it.file).lines) byEpoch.set(l.epoch, { ...l, sigma: it.sigma, product: it.product });
  }
  const lines = [...byEpoch.values()].sort((a, b) => W.ms(a.epoch) - W.ms(b.epoch));
  return W.withT({ norad, lines, products: items.map((i) => ({ product: i.product, sigma: i.sigma })) });
}

/** The state of `series` nearest `t` within `tolerance` ms, or null. */
export function nearest(series, t, tolerance) {
  const s = series.t;
  let lo = 0, hi = s.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (s[mid] < t) lo = mid + 1; else hi = mid; }
  let best = null;
  for (const k of [lo - 1, lo]) if (k >= 0 && k < s.length && Math.abs(s[k] - t) <= tolerance && (!best || Math.abs(s[k] - t) < Math.abs(s[best] - t))) best = k;
  return best === null ? null : series.lines[best];
}

/** Window at cutoff E: { E, track (145 marks or fewer), coverage, leads [{L, line}] } or { E, excluded }. */
export function windowAt(series, E, { stepSeconds = 600, trackHours = 24, leadToleranceSeconds = 150, minCoverage = 0.9 } = {}) {
  const marks = trackHours * 3600 / stepSeconds + 1;
  const median = series.t.length > 1 ? (series.t[series.t.length - 1] - series.t[0]) / (series.t.length - 1) : 60e3;
  const track = [];
  for (let j = 0; j < marks; j += 1) { const l = nearest(series, E - trackHours * HOUR + j * stepSeconds * 1000, Math.min(stepSeconds * 500, Math.max(30e3, median / 2))); if (l) track.push(l); }
  const coverage = track.length / marks;
  if (coverage < minCoverage) return { E: iso(E), excluded: `fit track ${track.length}/${marks} states (< ${minCoverage * 100} %)`, coverage };
  // the first state must be at the track's start for fitV3's reference
  const leads = config.model.leads_h.flatMap((L) => { const line = nearest(series, E + L * HOUR, leadToleranceSeconds * 1000); return line ? [{ L, line }] : []; });
  return { E: iso(E), track, coverage, leads };
}
