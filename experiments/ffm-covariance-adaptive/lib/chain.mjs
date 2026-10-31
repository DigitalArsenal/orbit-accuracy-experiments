// C3-small's arc-disjoint chain (PLAN.md section 1): C2's chain (ffm-covariance-calibration lib/precise.mjs) restricted. A window at cutoff E: the fit track is the last 24 h of the latest arc
// ending (t_in) by E; leads run from t_in; truth and references come only from arcs that start at or after t_in, excluding the fit's own arc (C3-A1). ESA0OPSFIN's next daily file starts at t_in
// exactly. A product is read only inside the phase's allowed span, by the date in its name, before its index is opened.
// Records only: every orbit computation is the modules'.
import fs from 'node:fs';
import path from 'node:path';
import { root, store, config, HOUR, DAY, iso } from '../common.mjs';

const C2 = path.join(root, 'experiments/ffm-covariance-calibration');
const { REFERENCE_ROOTS: C2_ROOTS } = await import(path.join(C2, 'common.mjs'));
const { nearest, windowAt } = await import(path.join(C2, 'lib/precise.mjs'));
const SRC = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs'));
const W = await import(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/windows.mjs'));
export { nearest, windowAt };

export const REFERENCE_ROOTS = [...C2_ROOTS, path.join(store, 'reference')];
const SPHERE = { 22195: 'lageos2', 8820: 'lageos1', 19751: 'etalon1', 20026: 'etalon2', 53105: 'lares2', 16908: 'ajisai', 38077: 'lares', 27944: 'larets', 7646: 'starlette', 25398: 'westpac', 22824: 'stella' };
const P = config.population;
const ILRSA = new Set(Object.values(P.judged.ilrsa));
const NSGF = new Set([...Object.values(P.judged.nsgf), ...Object.values(P.reported.nsgf)]);
export const familyOf = (norad) => (ILRSA.has(norad) ? 'ilrsa' : NSGF.has(norad) ? 'nsgf' : 'gnss');
export const prefixOf = (norad) => { const f = familyOf(norad); return f === 'gnss' ? 'ESA0OPSFIN_' : `${f}.orb.${SPHERE[norad]}.`; };
/** The date in a product's name, ms UTC. */
export function productDate(name) {
  const m = /^ESA0OPSFIN_(\d{4})(\d{3})/.exec(name);
  if (m) return Date.UTC(Number(m[1]), 0, Number(m[2]));
  const n = /\.(\d{2})(\d{2})(\d{2})\.v\d+$/.exec(name);
  return n ? Date.UTC(2000 + Number(n[1]), Number(n[2]) - 1, Number(n[3])) : NaN;
}

/** The arcs of one object whose product dates lie in [fromMs, toMs]: [{ product, file, start, stop, sigma }], sorted by start. allowedToMs refuses anything later (P10). */
export function arcsOf(norad, { fromMs, toMs, allowedToMs, opened }) {
  if (toMs > allowedToMs) throw new Error(`P10: arcs to ${iso(toMs)} are past the phase's allowed ${iso(allowedToMs)}`);
  const items = [], prefix = prefixOf(norad);
  for (const r of REFERENCE_ROOTS) {
    if (!fs.existsSync(r)) continue;
    for (const product of fs.readdirSync(r).filter((p) => p.startsWith(prefix)).sort()) {
      const d = productDate(product);
      if (!(d >= fromMs && d <= toMs)) continue;
      const ixFile = path.join(r, product, 'index.json');
      if (!fs.existsSync(ixFile)) continue;
      const ix = JSON.parse(opened ? opened.read(ixFile, 'index.json') : fs.readFileSync(ixFile));
      const o = ix.objects.find((x) => x.norad === norad);
      if (!o) continue;
      items.push({ norad, product, file: path.join(r, product, o.file), start: Date.parse(o.start), stop: Date.parse(o.stop), sigma: ix.statedSigmaM ?? null, opened });
    }
  }
  return items.sort((a, b) => a.start - b.start || (a.product < b.product ? -1 : 1));
}

const cache = new Map();
const CACHE_MAX = 64;
/** An arc's states (through the truth gate), tagged with the product and its stated sigma; cached. */
export function arcLines(arc) {
  if (cache.has(arc.file)) { const v = cache.get(arc.file); cache.delete(arc.file); cache.set(arc.file, v); return v; }
  if (arc.opened) arc.opened.add(arc.file, 'reference $OEM');
  const lines = SRC.readReference(arc.file).lines.map((l) => ({ ...l, sigma: arc.sigma, product: arc.product }));
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(arc.file, lines);
  return lines;
}
/** One series from arcs: later-starting arcs take their own epochs (C2's chain rule). */
export function seriesOf(norad, arcs) {
  const byEpoch = new Map();
  for (const a of arcs) for (const l of arcLines(a)) byEpoch.set(l.epoch, l);
  const lines = [...byEpoch.values()].sort((a, b) => W.ms(a.epoch) - W.ms(b.epoch));
  return W.withT({ norad, lines, products: arcs.map((a) => ({ product: a.product, sigma: a.sigma })) });
}

/** The arcs allowed after t_in: starting at or after it, excluding the fit's own arc. */
export const arcsAfter = (arcs, inArc) => arcs.filter((a) => a !== inArc && a.start >= inArc.stop);

/**
 * The window at cutoff E: { E, tIn, product, track, coverage, leads [{ L, epochMs, line | null }], after (the allowed series), firstAllowed } or { E, excluded }.
 * leadToleranceSeconds as C2's laser tolerance (150 s).
 */
export function windowOf(norad, arcs, E, { leadToleranceSeconds = 150, leads_h = config.leads_h, minCoverage = config.exclusions.coverage } = {}) {
  let inArc = null;
  for (const a of arcs) if (a.stop <= E && (!inArc || a.stop > inArc.stop || (a.stop === inArc.stop && a.start > inArc.start))) inArc = a;
  if (!inArc) return { E: iso(E), excluded: 'no arc ends by the cutoff' };
  const tIn = inArc.stop;
  if (E - tIn > 7.5 * DAY) return { E: iso(E), tIn: iso(tIn), excluded: 'the latest arc ended more than 7.5 d before the cutoff' };
  const fit = W.withT({ norad, lines: arcLines(inArc) });
  const w = windowAt(fit, tIn, { leadToleranceSeconds, minCoverage, trackHours: 24 });
  if (w.excluded) return { E: iso(E), tIn: iso(tIn), product: inArc.product, excluded: w.excluded, coverage: w.coverage };
  if (Math.abs(W.ms(w.track[0].epoch) - (tIn - 24 * HOUR)) > 300e3) return { E: iso(E), tIn: iso(tIn), product: inArc.product, excluded: 'no state at the track start', coverage: w.coverage };
  const afterArcs = arcsAfter(arcs, inArc).filter((a) => a.start <= tIn + 120 * HOUR);
  const after = seriesOf(norad, afterArcs);
  const firstAllowed = after.t.find((t) => t >= tIn) ?? null;
  const leads = leads_h.map((L) => ({ L, epochMs: tIn + L * HOUR, line: after.t.length ? nearest(after, tIn + L * HOUR, leadToleranceSeconds * 1000) : null }));
  return { E: iso(E), tIn: iso(tIn), tInMs: tIn, inArc, product: inArc.product, track: w.track, coverage: w.coverage, leads, after, firstAllowed, afterProducts: afterArcs.map((a) => a.product) };
}

/** The reference track of lead group center c hours: the 24 h centered on t_in + c, shifted to the first allowed epoch; { start, track, coverage } or { excluded }. */
export function referenceTrack(win, centerHours, { minCoverage = config.exclusions.coverage } = {}) {
  if (win.firstAllowed === null) return { excluded: 'no allowed arc' };
  const start = Math.max(win.tInMs + (centerHours - 12) * HOUR, win.firstAllowed);
  const w = windowAt(win.after, start + 24 * HOUR, { leadToleranceSeconds: 0, minCoverage, trackHours: 24 });
  if (w.excluded) return { excluded: w.excluded, start: iso(start) };
  if (Math.abs(W.ms(w.track[0].epoch) - start) > 300e3) return { excluded: 'no state at the reference track start', start: iso(start) };
  return { start: iso(start), track: w.track, coverage: w.coverage, products: [...new Set(w.track.map((l) => l.product))] };
}

/** C2's maneuver screen on the truth itself (C2-A4 point 4): the track of [t_in - 24 h, t_in + 72 h] at 10 min, from the fit arc and the allowed arcs. */
export function screenTrack(norad, win) {
  const series = W.withT({ norad, lines: [...arcLines(win.inArc).filter((l) => W.ms(l.epoch) <= win.tInMs), ...win.after.lines.filter((l) => W.ms(l.epoch) > win.tInMs)] });
  return windowAt(series, win.tInMs + 72 * HOUR, { trackHours: 96, leadToleranceSeconds: 0, minCoverage: 0 }).track;
}
export const msOf = W.ms;
