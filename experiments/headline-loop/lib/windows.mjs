// The published precise-orbit windows and their truth, exactly as the published harness read them: membership from the stores the published cells
// were built from (compare-cells.mjs; ap-all-regimes-suite/run.mjs), truth through the same readers, the same scoring grid, coverage rule and
// as-issued weather. Reading and selection only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { REPO } from './env.mjs';

const OT = path.join(REPO, 'experiments/operator-theory');
const xp2 = await import(path.join(OT, 'lib/xp2.mjs'));
export const { config: XP2F, root, HOUR, DAY, iso, ms, rms, XM } = xp2;
// all-regimes.mjs and the suite read the 2026 RSGAs from the archive's NOAA warehouse copy and the daily collector (AP9.md)
XM.config.spaceWeather.rsgaDirs = [...XM.config.spaceWeather.rsgaDirs, '/opt/data/sdn-archive/hac/noaa-swpc/warehouse/2026/RSGA', '/opt/data/sdn-archive/hac/noaa-swpc/2026'];
const R = await import(path.join(OT, 'lib/regimes.mjs'));
export const T = await import(path.join(root, XP2F.xm.dir, 'lib/truth.mjs'));
export const W = await import(path.join(root, XP2F.xm.dir, 'lib/weather.mjs'));
const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
const { driverRows } = await import(path.join(OT, 'lib/xm3.mjs'));
const APL = await import(path.join(OT, 'lib/ap.mjs'));

export const ARCHIVE = '/opt/data/sdn-archive/operator-theory/ap';
export const GRID = XM.config.scoring.gridSeconds * 1000;
export const MIN_BIN = XM.config.scoring.binMinimumEpochs;
export const MIN_COV = XM.config.fit.minimumCoverage;
export const LEADS = [1, 2, 3, 5, 7];

// Passes. Nothing dated after 2026-11-10 is ever read. The first pass is every window whose fit arc and 7-day forecast stay clear of
// 2026-03-01 to 05-31; the second pass is the windows that touch those months, flown after the first (refly.mjs --second-pass).
const MARCH_TO_MAY = [Date.parse('2026-03-01T00:00:00Z'), Date.parse('2026-06-01T00:00:00Z')], AFTER = [Date.parse('2026-11-10T00:00:00Z'), Infinity];
const touches = ([a, b], fromMs, toMs) => fromMs < b && toMs >= a;

/** Each group: its published label, its provider and satellite naming (compare-cells.mjs), its membership store, its fit arcs, vacuum or not. */
export const GROUPS = {
  T: { label: 'Strong drag, 2025', store: 'b0411/truth', xm: 'objects', arcs: [24], ffmCol: 'FFM40' },
  P: { label: 'Strong drag, 2026', store: 'b0411/truth2', xm: 'P', arcs: [24, 72], ffmCol: 'FFM40' },
  S1: { label: 'Near 700 km', store: 'b0411/truth2', xm: 'S1', arcs: [24, 72], ffmCol: 'FFM40' },
  GN: { label: 'Medium Earth orbit', store: 'b0411/truth2', xm: 'GN', arcs: [24, 72], ffmCol: 'FFM20' },
  GN_GAL: { label: 'Medium Earth orbit, Galileo (suite)', store: 'b065/truth-fresh', truth: 'gnss', arcs: [24, 72], ffmCol: 'FFM20', suiteOnly: true },
  LS: { label: 'Low orbit, laser spheres', store: 'b0411/regimes', static: true, ffmCol: 'FFM40' },
  DO: { label: 'Low orbit, altimetry', store: 'b0411/regimes', static: true, ffmCol: 'FFM40' },
  GD: { label: 'Laser geodetic', store: 'b0411/regimes', static: true, ffmCol: 'FFM20' },
  IG: { label: 'Inclined geosynchronous', store: 'b0411/regimes', mgex: 'igso', ffmCol: 'FFM20' },
  GE: { label: 'Geostationary', store: 'b0411/regimes', mgex: 'geo', ffmCol: 'FFM20' },
  HE: { label: 'Highly elliptical', store: 'b0411/regimes', vacuum: true, ffmCol: 'FFM20' },
  HX: { label: 'Highly elliptical, THEMIS and Chandra', store: 'b0411/regimes', vacuum: true, ffmCol: 'FFM20' },
  WA: { label: 'Geostationary, commercial', store: 'b065/truth-fresh', vacuum: true, arcs: [24, 72], ffmCol: 'FFM20', suiteOnly: true },
};
const XM_PROVIDER = (name) => (/^Swarm/.test(name) ? 'ESA' : /^GRACE/.test(name) ? 'Data E' : /^Sentinel/.test(name) ? 'Copernicus' : 'ESA navigation');
const XM_PUBLIC = (name) => (/^GRACE-FO/.test(name) ? `Research satellite ${name.at(-1)}` : name);
export const providerOf = (group, name) => (GROUPS[group].store.startsWith('b0411/truth') || GROUPS[group].truth === 'gnss' ? XM_PROVIDER(name) : R.GROUPS[group]?.provider ?? 'All');
export const satelliteOf = (group, name) => (GROUPS[group].store.startsWith('b0411/truth') ? XM_PUBLIC(name) : name);

const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
export const rowsIn = (dir, re = /^rows(-\d+)?\.jsonl$/) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => re.test(f)).sort().flatMap((f) => jsonl(path.join(dir, f))) : []);
export const inShard = (key, k, n) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % n === k;

/** Every published window of the groups asked for, with the fit arcs its stored row carries: [{ key, group, name, norad, cutoffMs, arcs }].
 *  windows: the first pass; second: the second pass (the windows touching 2026-03..05); after: windows reaching past 2026-11-10, never read. */
export function windowsOf(groups) {
  const out = [], second = [], after = [];
  for (const g of groups) {
    const G = GROUPS[g];
    if (!G) throw new Error(`group ${g}`);
    const stored = rowsIn(path.join(ARCHIVE, G.store)).filter((r) => !r.error);
    const mine = G.store === 'b0411/truth' ? stored : stored.filter((r) => r.group === g);
    for (const r of mine) {
      const cutoffMs = Date.parse(r.cutoff ?? `${r.key.split('|').at(-1)}T00:00:00Z`);
      const arcs = G.arcs ?? [...new Set(Object.keys(r.arms).filter((a) => /^AP\d+$/.test(a)).map((a) => Number(a.slice(2))))].sort((a, b) => a - b);
      const w = { key: r.key, group: g, name: r.name, norad: r.norad ?? null, cutoffMs, arcs };
      const from = cutoffMs - Math.max(...arcs) * HOUR - HOUR, to = cutoffMs + 7 * DAY + HOUR;
      (touches(AFTER, from, to) ? after : touches(MARCH_TO_MAY, from, to) ? second : out).push(w);
    }
  }
  return { windows: out, second, after };
}

// ---- truth readers, one object at a time (each kept until the next object of the shard) ----
const XM_OBJECTS = new Map([...XP2F.objects.map((o) => [o.norad, o]), ...Object.values(XM.config.groups).flatMap((g) => g.objects.map((o) => [o.norad, o]))]);
const GALILEO = { 43567: 'Galileo FOC 19', 37847: 'Galileo IOV 2', 41862: 'Galileo FOC 14', 41174: 'Galileo FOC 9', 43055: 'Galileo FOC 15', 41175: 'Galileo FOC 8' };
let staticCache = null, mgexCache = new Map(), spkCache = new Map();
async function spkOnGrid(lines, axes) {
  const norm = lines.map((l) => ({ ...l, epoch: new Date(Date.parse(/Z$/.test(l.epoch) ? l.epoch : `${l.epoch}Z`)).toISOString() }));
  const first = Math.round(ms(norm[0].epoch) / 1000) * 1000;
  const thin = norm.filter((l) => (Math.round(ms(l.epoch) / 1000) * 1000 - first) % GRID === 0).map((l) => ({ ...l, epoch: new Date(Math.round(ms(l.epoch) / 1000) * 1000).toISOString() }));
  return axes.convert(thin, 'EME2000', 'GCRF');
}
/** The window's truth in [fromMs, toMs] (GCRF, UTC): [{epoch, r, v}], and the object's identity for the records. */
export async function truthOf(w, fromMs, toMs, axes) {
  const G = GROUPS[w.group];
  const cut = (lines) => lines.filter((l) => { const t = ms(l.epoch); return t >= fromMs && t <= toMs; });
  if (G.store.startsWith('b0411/truth') || G.truth === 'gnss') {
    // the suite's Galileo rows carry the name alone (ap-all-regimes-suite/run.mjs GALILEO_HELD): the NORAD number by name
    const gal = w.norad ?? Object.keys(GALILEO).find((n) => GALILEO[n] === w.name);
    const o = (w.norad ? XM_OBJECTS.get(Number(w.norad)) : null) ?? (GALILEO[gal] ? { norad: Number(gal), name: GALILEO[gal], truth: 'gnss' } : null);
    if (!o) throw new Error(`no truth object for ${w.key}`);
    return { lines: T.series(o, fromMs, toMs).lines, norad: o.norad, objectId: o.objectId ?? '' };
  }
  if (G.static) {
    // the series' name is its first file's (all-regimes.mjs: series.name || o.name); one object's chained series is kept at a time
    if (!staticCache || staticCache.group !== w.group) {
      staticCache = { group: w.group, byName: new Map(), loaded: null };
      for (const s of R.STATIC.filter((x) => x.group === w.group)) {
        const files = s.files();
        if (files.length) staticCache.byName.set(SRC.readReference(files[0]).name || s.name, files);
      }
    }
    if (staticCache.loaded?.name !== w.name) {
      const files = staticCache.byName.get(w.name);
      if (!files) throw new Error(`no truth series for ${w.key}`);
      staticCache.loaded = { name: w.name, series: SRC.chain(files) };
    }
    const s = staticCache.loaded.series;
    return { lines: cut(s.lines), norad: s.norad, objectId: s.objectId ?? '' };
  }
  if (G.mgex) {
    if (!mgexCache.has(G.mgex)) mgexCache.set(G.mgex, new Map(SRC.mgex({ klass: G.mgex }).map((o) => [o.name, o])));
    const o = mgexCache.get(G.mgex).get(w.name);
    if (!o) throw new Error(`no truth series for ${w.key}`);
    return { lines: cut(o.lines), norad: o.norad, objectId: o.objectId ?? '' };
  }
  if (w.group === 'WA') {
    const { SBAS, series, STORE } = await import(path.join(OT, 'lib/sbas.mjs'));
    const [prn, sat] = Object.entries(SBAS).find(([, s]) => s.name === w.name) ?? [];
    if (!sat) throw new Error(`no WAAS satellite ${w.name}`);
    // the stored broadcast days only: sbas.mjs would fetch a missing day, and the loop reads no network
    for (let day = Math.floor(fromMs / DAY) * DAY; day <= toMs; day += DAY) {
      const d = new Date(day), doy = Math.floor((day - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1;
      if (!fs.existsSync(path.join(STORE, String(d.getUTCFullYear()), `${String(doy).padStart(3, '0')}.json`))) throw new Error(`WAAS truth for ${d.toISOString().slice(0, 10)} is not stored`);
    }
    const lines = await series(Number(prn), fromMs, toMs);
    return { lines: cut(lines), norad: sat.norad, objectId: '' };
  }
  // HE and HX: NAIF kernels on the 300 s grid (all-regimes.mjs objects())
  if (!spkCache.has(w.name)) {
    const { spkObjectSeries } = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/spk-sources.mjs')).href);
    let s;
    if (w.group === 'HE') {
      const files = fs.readdirSync(R.TESS.dir).filter((f) => /^TESS_EPH_DEF_.*\.bsp$/.test(f)).sort().map((f) => path.join(R.TESS.dir, f));
      s = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files, source: 'ap6-heo', id: 'TESS (-95)', name: R.TESS.name, norad: R.TESS.norad, fromUtc: R.TESS.from, toUtc: R.TESS.to, stride: 1 });
      s = { lines: await spkOnGrid(s.lines, axes), norad: R.TESS.norad, objectId: R.TESS.objectId };
    } else {
      const h = R.HX.find((x) => x.name === w.name);
      if (!h) throw new Error(`no HX object ${w.name}`);
      const raw = await spkObjectSeries(process.env.SDN_MODULES_ROOT, { files: [h.file], source: 'ap6-heo', id: h.id, name: h.name, norad: h.norad, fromUtc: h.from, toUtc: h.to, stride: 1 });
      s = { lines: await spkOnGrid(raw.lines, axes), norad: h.norad, objectId: h.objectId };
    }
    spkCache.clear();
    spkCache.set(w.name, s);
  }
  const s = spkCache.get(w.name);
  return { lines: cut(s.lines), norad: s.norad, objectId: s.objectId ?? '' };
}

/** The scored epochs after the cutoff (all-regimes.mjs): lead-day bins on the 300 s grid of the truth's own epochs, a bin entering at 90 % cover. */
export function scoredOf(after, D0) {
  const stepMs = after.length > 1 ? ms(after[1].epoch) - ms(after[0].epoch) : GRID;
  const gridMs = Math.max(GRID, Math.ceil(GRID / stepMs) * stepMs);
  const minBin = Math.ceil((MIN_BIN / (DAY / GRID)) * (DAY / gridMs));
  const first = after.length ? ms(after[0].epoch) : 0;
  const grid = after.filter((l) => (ms(l.epoch) - first) % gridMs === 0);
  const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
  const entered = LEADS.filter((k) => bins[k].length >= minBin);
  const scored = entered.flatMap((k) => bins[k]);
  return { entered, sizes: entered.map((k) => bins[k].length), epochs: scored.map((l) => l.epoch), truth: scored.map((l) => ({ r: l.r, v: l.v })) };
}
/** The fit arc: the truth's states in [D0 - hours, D0] thinned to 300 s (G1), or null under the coverage rule. */
export function arcOf(lines, hours) {
  const coverage = lines.length > 1 ? lines.length / ((hours * 3600) / ((ms(lines[1].epoch) - ms(lines[0].epoch)) / 1000)) : 0;
  return coverage >= MIN_COV ? T.thinned(lines).chosen : null;
}
/** As-issued weather at the cutoff (O condition): the AP fit's $SPW rows through the record's horizon and FFM's driver rows to D0 + 8 d. */
export function weatherAt(D0) {
  const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
  if (O.excluded) throw new Error(O.excluded);
  return { rows: O.rows, spw: APL.fitWeather(O.rows, APL.horizonOf(D0)), ffm: driverRows(O.rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap })) };
}
/** Per lead day: 3D RMS e and the R, T, N RMS of the [R, T, N] errors (km), as the published rows hold them. */
export function byDay(err, entered, sizes) {
  const days = {};
  let i = 0;
  entered.forEach((k, j) => {
    const s = err.slice(i, i + sizes[j]);
    i += sizes[j];
    const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c])));
    days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] };
  });
  return days;
}
