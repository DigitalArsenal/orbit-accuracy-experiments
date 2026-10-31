// C3-small's windows as statistics see them (PLAN.md sections 1-3): the stored rows of a class, each with its cluster, availability and exclusion flags, and for each lead its error, terms and reference. No orbit
// computation: every number here was computed by a module and stored by run.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { config, store, readJsonl, c2Results, sha256, DAY, HOUR, iso } from '../common.mjs';
import { parseSinex, loadNotices } from './notices.mjs';
import { availableAt, pC2, truthTerm, median } from './model.mjs';

const P = config.population.judged;
const GLO = [...P.glonass.c2, ...P.glonass.new], GAL = [...P.galileo.new, ...P.galileo.c2Six];
export const constellationOf = (norad) => (GLO.includes(norad) ? 'GLONASS' : GAL.includes(norad) ? 'Galileo' : 'sphere');
const FZ = JSON.parse(fs.readFileSync(path.join(c2Results, 'frozen-constants.json')));
if (sha256(fs.readFileSync(path.join(c2Results, 'frozen-constants.json'))) !== config.c2.constantsSha256) throw new Error('C2 constants differ from the registration');
export const CLASSES = { R3: { key: 'R3' }, 'R2-M': { key: 'R2' }, 'R2-O': { key: 'R2-O' } };
export const paramsOf = (cls) => FZ.classes[CLASSES[cls].key].parameters;
export const groupOf = (L) => (L <= 12 ? 0 : 1);

/** Clusters (PLAN.md section 3): spheres singly, Etalon-1 and -2 in GLONASS planes 1 and 3 by RAAN, GNSS by IGS plane. */
export function clusterMap(sinex) {
  const map = new Map([[19751, 'GLO-P1'], [20026, 'GLO-P3']]);
  for (const n of GLO) { const svn = sinex.svnOfNorad(n), pl = sinex.plane.filter((x) => x.svn === svn).at(-1); map.set(n, `GLO-P${pl.plane}`); }
  for (const n of GAL) { const svn = sinex.svnOfNorad(n), pl = sinex.plane.filter((x) => x.svn === svn).at(-1); map.set(n, `GAL-${pl.slot[0]}`); }
  return (norad) => map.get(norad) ?? String(norad);
}

/** Storm days from GFZ Ap, reading only lines dated up to `throughDate` (the date is read before the line is parsed). */
export function stormDays(file, throughDate, opened, ap = 30) {
  const out = new Set();
  for (const line of (opened ? opened.read(file, `GFZ Ap, lines to ${throughDate}`) : fs.readFileSync(file)).toString().split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const date = `${line.slice(0, 4)}-${line.slice(5, 7)}-${line.slice(8, 10)}`;
    if (date < '2025-06-01' || date > throughDate) continue;
    if (Number(line.trim().split(/\s+/)[23]) >= ap) out.add(date);
  }
  return out;
}
/** A sample is a storm sample when [t_in - 24 h, t_in + L) meets a UTC day with Ap >= 30. */
export const isStorm = (storms, tIn, L) => { for (let d = Math.floor((tIn - 24 * HOUR) / DAY); d * DAY < tIn + L * HOUR; d += 1) if (storms.has(new Date(d * DAY).toISOString().slice(0, 10))) return true; return false; };

/**
 * The stored windows of a class: Map norad -> windows sorted by t_in, one per t_in. A window: { norad, cls, set, E, tIn, family, cluster, chi, leads: Map L -> { L, err, terms, P, C, ref }, fitAvail, refAvail(L), storm(L), notice }.
 * Rows that did not produce a window are counted in `counts`.
 */
export function loadClass(cls, { rowsDir = path.join(store, 'rows'), opened, seal = config.exclusions.notices.sealFrom, gfzFile = '/opt/data/sdn-archive/hac/gfz-kp/20261009/Kp_ap_Ap_SN_F107_since_1932.txt', gfzThrough = '2026-05-31' } = {}) {
  const sinex = parseSinex((opened ? opened.read('/opt/data/sdn-archive/hac/igs-metadata/20261009/igs_satellite_metadata.snx', 'IGS SINEX') : fs.readFileSync('/opt/data/sdn-archive/hac/igs-metadata/20261009/igs_satellite_metadata.snx')).toString());
  const N = loadNotices(path.join(store, 'notices'), sinex, seal, opened);
  const storms = stormDays(gfzFile, gfzThrough, opened);
  const clusterOf = clusterMap(sinex), p = paramsOf(cls);
  const files = fs.readdirSync(rowsDir).filter((f) => f.endsWith('.jsonl')).sort();
  const counts = { rows: 0, excluded: {}, refused: {}, fitFailed: {}, noLeads: 0, duplicateTIn: 0 };
  const bump = (o, why) => { const k = String(why).replace(/\d+\/\d+/, 'n/145').slice(0, 100); o[k] = (o[k] ?? 0) + 1; };
  const by = new Map();
  for (const f of files) {
    const file = path.join(rowsDir, f);
    if (opened) opened.add(file, 'C3 rows');
    for (const r of readJsonl(file)) {
      if (r.cls !== cls) continue;
      counts.rows += 1;
      if (r.excluded) { bump(counts.excluded, r.excluded); continue; }
      if (r.refused) { bump(counts.refused, r.refused); continue; }
      if (!r.fit?.ok) { bump(counts.fitFailed, r.fit?.termination ?? r.fit?.error ?? 'no fit'); continue; }
      if (!r.leads?.length) { counts.noLeads += 1; continue; }
      const family = r.family, tIn = Date.parse(r.tIn), E = Date.parse(r.E);
      const stops = new Map();
      for (const g of r.refGroups ?? []) if (g.ok && g.productStops) stops.set(g.center, Math.max(...g.productStops.map((s, i) => availableAt(family, Date.parse(s)))));
      const leads = new Map();
      for (const l of r.leads) {
        const center = l.L <= 12 ? 12 : l.L;
        leads.set(l.L, { L: l.L, err: l.errRtnM ?? null, terms: l.terms, P: pC2(p, l.terms), C: cls === 'R3' ? 0 : truthTerm(l.truthSigmaM), truthSigmaM: l.truthSigmaM ?? null, ref: l.ref ?? null, refAvail: stops.get(center) ?? Infinity });
      }
      const w = { norad: r.norad, name: r.name, cls, set: r.set, E, tIn, family, cluster: clusterOf(r.norad), chi: r.fit.reducedChiSquare, leads, fitAvail: availableAt(family, tIn), screen: r.screen, notice: N.overlap(r.norad, tIn - 24 * HOUR, tIn + 84 * HOUR, Date.parse(`${seal}T00:00:00Z`)).length > 0 };
      for (const l of leads.values()) l.storm = isStorm(storms, tIn, l.L);
      if (!by.has(r.norad)) by.set(r.norad, new Map());
      const m = by.get(r.norad);
      if (m.has(tIn)) { counts.duplicateTIn += 1; if (E >= m.get(tIn).E) continue; }
      m.set(tIn, w);
    }
  }
  const windows = new Map([...by.entries()].map(([k, m]) => [k, [...m.values()].sort((a, b) => a.tIn - b.tIn)]));
  // chi2nu~: the median of o's fits available at E within 90 d, at least 5, else the class's calibration median (fixed at the freeze)
  const calChi = [...windows.values()].flat().filter((w) => w.set === 'calibration').map((w) => w.chi);
  const classMedian = median(calChi);
  for (const list of windows.values()) for (const w of list) {
    const prior = list.filter((j) => j !== w && j.E > w.E - 90 * DAY && j.fitAvail <= w.E).map((j) => j.chi);
    w.chiRef = prior.length >= 5 ? median(prior) : classMedian;
    w.chiRefFrom = prior.length >= 5 ? 'own' : 'class';
  }
  // the history of each window and lead: cutoffs in (E - 90 d, E - 3 d], the fit's file and the reference's files available at E, no notice issued by E over the window
  for (const list of windows.values()) for (const w of list) {
    w.hist = new Map();
    for (const L of w.leads.keys()) w.hist.set(L, []);
    for (const j of list) {
      if (!(j.E > w.E - 90 * DAY && j.E <= w.E - 3 * DAY) || j.fitAvail > w.E) continue;
      if (N.overlap(j.norad, j.tIn - 24 * HOUR, j.tIn + 84 * HOUR, w.E).length) continue;
      for (const [L, jl] of j.leads) { if (jl.ref?.errRtnM && jl.refAvail <= w.E && w.hist.has(L)) w.hist.get(L).push({ j, l: jl }); }
    }
  }
  return { cls, windows, counts, classMedian, sinex, N, storms };
}
/** Every window's lead as a flat sample; primary = storm samples out, notices out, truth present. */
export const samplesOf = (loaded, set) => [...loaded.windows.values()].flat().filter((w) => !set || w.set === set).flatMap((w) => [...w.leads.values()].filter((l) => l.err).map((l) => ({ w, l, primary: !l.storm && !w.notice })));
export { iso };
