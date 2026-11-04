// The maneuver flag of every precise-orbit window of Sentinel-1 (AP5.md), the altimetry satellites and the WAAS geostationary satellites (AP6.md, GEO-TRUTH.md):
// the steps of the truth's mean semimajor axis (lib/steps.mjs) in each window's fit arc and forecast span, and FFM against AP split into flagged and step-free
// windows. Truth through the existing readers only; a held object is never read. Statistics on stored rows and module elements only.
//   SDN_MODULES_ROOT=<modules> node experiments/operator-theory/maneuver-flags.mjs --out results/operator-theory/maneuver-flags
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { config, root, XM } from './lib/xp2.mjs';
import { STATIC, WA_CUTOFFS, windowKey } from './lib/regimes.mjs';
import { HELD_NORADS } from './lib/pairs.mjs';
import { gfzDays } from './lib/weather.mjs';
import { BUILD } from './lib/build.mjs';
import { DAY, HOUR, LOW, GEO, openElements, revolutions, lowSteps, geoSteps, classOf, windowState, windowSteps } from './lib/steps.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
if (!OUT) throw new Error('--out');
const A = '/opt/data/sdn-archive/operator-theory/ap', OLD = path.join(A, BUILD), B051 = path.join(A, 'b051');
// Never read: C2's held-out objects (TerraSAR-X, Stella, Sentinel-1D, LAGEOS-1, its six Galileo satellites), Swarm and GRACE-FO, every Starlink group, any
// Sentinel-1 cutoff from 2026-06-01 (C2's calibration hold) and any operator capture. Sentinel-1 truth is read to 2026-06-08, as AP5's own day 7 and the study did.
export const EXCLUDE = { norads: new Set([...HELD_NORADS, 31698, 22824, 66315, 8820]), names: /stella|terrasar|sentinel-1d|lageos ?1\b|starlink|swarm|grace/i, s1CutoffBefore: '2026-06-01', s1TruthTo: '2026-06-08T00:00:00Z' };
const held = (w) => EXCLUDE.norads.has(Number(w.norad)) || EXCLUDE.names.test(w.name) || (w.group === 'S1' && w.cutoff.slice(0, 10) >= EXCLUDE.s1CutoffBefore);
const SPAN = { fitHours: 72, leadHours: 168 };
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l && !/"source":"starlink"/.test(l)).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const byKey = (...dirs) => new Map(dirs.flatMap((d) => rowsIn(d)).map((r) => [r.key, r]));
const iso = (t) => new Date(t).toISOString().slice(0, 16);
const r1 = (x) => Math.round(x * 10) / 10;

// The windows: the site's (compare-cells.mjs): AP5's Sentinel-1 rows and AP6's altimetry rows of the AP build's stores, GEO-TRUTH's WAAS rows; errors left out.
const GROUPS = {
  S1: { label: 'Near 700 km', rows: rowsIn(path.join(OLD, 'truth2')).filter((r) => r.group === 'S1' && !r.error), ffm: byKey(path.join(OLD, 'compare-truth2')), ap: byKey(path.join(B051, 'truth2')) },
  DO: { label: 'Low orbit, altimetry', rows: rowsIn(path.join(OLD, 'regimes')).filter((r) => r.group === 'DO' && !r.error), ffm: byKey(path.join(OLD, 'regimes')), ap: byKey(path.join(B051, 'regimes')) },
  WA: { label: 'Geostationary, commercial (WAAS)', rows: rowsIn(path.join(OLD, 'regimes-wa')).filter((r) => !r.error), ffm: byKey(path.join(OLD, 'regimes-wa')), ap: byKey(path.join(B051, 'regimes-wa')) },
};
for (const g of Object.values(GROUPS)) for (const w of g.rows) if (held(w)) throw new Error(`${w.key}: held`);

const el = await openElements();
/** Each object's steps and checked spans, from its truth through the reader its runner used. */
async function detect(group, name, norad) {
  if (EXCLUDE.norads.has(Number(norad)) || EXCLUDE.names.test(name)) throw new Error(`${name}: held`);
  if (group === 'S1') {
    const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
    const o = XM.config.groups.S1.objects.find((x) => x.norad === Number(norad));
    const cut = GROUPS.S1.rows.filter((r) => r.norad === o.norad).map((r) => Date.parse(r.cutoff));
    const from = Math.min(...cut) - SPAN.fitHours * HOUR - DAY, to = Math.min(Math.max(...cut) + SPAN.leadHours * HOUR + DAY, Date.parse(EXCLUDE.s1TruthTo));
    const lines = [];
    for (let t = from; t < to; t += DAY) lines.push(...T.series(o, t, Math.min(t + DAY, to) - 1).lines);
    return { rule: 'low', ...lowSteps(await revolutions(lines, el)), truthFrom: from, truthTo: to };
  }
  if (group === 'DO') {
    const SRC = await import(pathToFileURL(path.join(root, 'experiments/sdn-gp-starlink-ffm-match/lib/sources.mjs')).href);
    const o = STATIC.filter((x) => x.group === 'DO').map((x) => ({ x, s: SRC.chain(x.files()) })).find(({ s }) => (s.name || '') === name);
    const lines = o.s.lines;
    return { rule: 'low', ...lowSteps(await revolutions(lines, el)), truthFrom: Date.parse(`${lines[0].epoch.replace(/Z?$/, 'Z')}`), truthTo: Date.parse(`${lines.at(-1).epoch.replace(/Z?$/, 'Z')}`) };
  }
  const { SBAS, series, STORE } = await import('./lib/sbas.mjs');
  const [prn] = Object.entries(SBAS).find(([, s]) => s.name === name);
  const from = WA_CUTOFFS[0] - 3 * DAY, to = WA_CUTOFFS.at(-1) + 8 * DAY;
  for (let d = Math.floor(from / DAY) * DAY; d <= to; d += DAY) {
    const y = new Date(d).getUTCFullYear(), f = path.join(STORE, String(y), `${String(Math.floor((d - Date.UTC(y, 0, 1)) / DAY) + 1).padStart(3, '0')}.json`);
    if (!fs.existsSync(f)) throw new Error(`missing input ${f} (not fetched)`);
  }
  const g = await geoSteps(await series(Number(prn), from, to), el);
  return { rule: 'geo', ...g, truthFrom: from, truthTo: to };
}

const objects = [], windows = [];
const storms = new Map(gfzDays('2025-01-01').filter((d) => d.ap !== undefined).map((d) => [d.date, d.ap]));
for (const [group, g] of Object.entries(GROUPS)) {
  for (const name of [...new Set(g.rows.map((r) => r.name))].sort()) {
    const list = g.rows.filter((r) => r.name === name), d = await detect(group, name, list[0].norad);
    objects.push({ group, name, steps: d.steps.map((s) => ({ t: iso(s.t), sizeM: r1(s.sizeM), ...(s.planeMdeg !== undefined ? { residualM: r1(s.residualM), planeMdeg: r1(s.planeMdeg), by: s.by } : {}) })),
      checked: d.checked.map(([a, b]) => [iso(a), iso(b)]), truth: [iso(d.truthFrom), iso(d.truthTo)], ...(d.medianResidualM !== undefined ? { medianResidualM: r1(d.medianResidualM), medianPlaneMdeg: Math.round(d.medianPlaneMdeg * 100) / 100 } : {}) });
    for (const r of list) {
      const c = Date.parse(r.cutoff), { steps, unchecked } = windowSteps(d, c, SPAN);
      const stormDays = group === 'WA' ? null : [...Array(10).keys()].map((k) => new Date(c + (k - 3) * DAY).toISOString().slice(0, 10)).filter((day) => storms.get(day) >= 30);
      windows.push({ key: r.key, group, name, cutoff: r.cutoff.slice(0, 10), steps, unchecked, stormDays });
    }
  }
}
await el.close();

const pct = (v, q) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), x = (s.length - 1) * q, lo = Math.floor(x), hi = Math.ceil(x); return s[lo] + (s[hi] - s[lo]) * (x - lo); };
const fig = (x) => (x === null ? null : Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4)));
const e = (r, arm, day) => r?.arms?.[arm]?.days?.[day]?.e;
const tables = [];
for (const [group, g] of Object.entries(GROUPS)) for (const fit of [24, 72]) for (const day of ['1', '2', '3', '7']) {
  const lead = Number(day) * 24, cell = { group, label: g.label, fit, day: Number(day), windows: 0, flagged: 0, inFit: 0, inForecast: 0, stepFree: 0, unchecked: 0, split: {}, classes: { maneuver: 0, storm: 0, neither: 0 }, maneuverWithStorm: 0 };
  const pairs = { flagged: [], stepFree: [], unchecked: [] };
  for (const w of windows.filter((x) => x.group === group)) {
    const f = e(g.ffm.get(w.key), `F${fit}`, day), a = e(g.ap.get(w.key), `AP${fit}`, day);
    if (!Number.isFinite(f) || !Number.isFinite(a)) continue;
    const s = windowState(w, fit, lead);
    cell.windows += 1; cell.inFit += s.inFit; cell.inForecast += s.inForecast;
    const k = s.flagged ? 'flagged' : s.stepFree ? 'stepFree' : 'unchecked';
    cell[k] += 1; pairs[k].push({ f, a });
    if (f > a) {
      const storm = w.stormDays ? w.stormDays.some((d) => { const t = Date.parse(`${d}T00:00:00Z`) - Date.parse(`${w.cutoff}T00:00:00Z`); return t >= -Math.ceil(fit / 24) * DAY && t < lead * HOUR; }) : false;
      cell.classes[classOf({ maneuver: s.flagged, storm })] += 1;
      if (s.flagged && storm) cell.maneuverWithStorm += 1;
    }
  }
  for (const [k, v] of Object.entries(pairs)) cell.split[k] = { n: v.length, ffmMedianKm: fig(pct(v.map((p) => p.f), 0.5)), apMedianKm: fig(pct(v.map((p) => p.a), 0.5)), ffmWorseShare: v.length ? Number((v.filter((p) => p.f > p.a).length / v.length).toFixed(3)) : null, medianRatio: v.length ? Number(pct(v.map((p) => p.f / p.a), 0.5).toFixed(3)) : null };
  tables.push(cell);
}
const provenance = { modulesRoot: process.env.SDN_MODULES_ROOT ?? null, elements: 'foundation/orbits cartesian_to_keplerian (sdn-gp-starlink-ffm-match/lib/orbits.mjs)', stores: { windows: [path.join(OLD, 'truth2'), path.join(OLD, 'regimes'), path.join(OLD, 'regimes-wa')], ffm: [path.join(OLD, 'compare-truth2'), path.join(OLD, 'regimes'), path.join(OLD, 'regimes-wa')], ap: [path.join(B051, 'truth2'), path.join(B051, 'regimes'), path.join(B051, 'regimes-wa')] }, storm: 'GFZ daily Ap of 30 or more (lib/weather.mjs gfzDays)' };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'flags.json'), `${JSON.stringify({ rules: { low: LOW, geo: GEO, span: SPAN }, exclude: { norads: [...EXCLUDE.norads].sort((a, b) => a - b), names: String(EXCLUDE.names), s1CutoffBefore: EXCLUDE.s1CutoffBefore, s1TruthTo: EXCLUDE.s1TruthTo }, provenance, objects, windows })}\n`);
fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify({ tables }, null, 1)}\n`);
const md = ['| Group | Fit, h | Day | Windows | Flagged (in fit, in forecast) | Step-free | Unchecked | FFM / AP median km, flagged | FFM / AP median km, step-free | FFM worse, flagged / step-free | Median FFM/AP, flagged / step-free | FFM losses: maneuver, storm, neither |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
for (const c of tables) md.push(`| ${c.label} | ${c.fit} | ${c.day} | ${c.windows} | ${c.flagged} (${c.inFit}, ${c.inForecast}) | ${c.stepFree} | ${c.unchecked} | ${c.split.flagged.ffmMedianKm ?? '-'} / ${c.split.flagged.apMedianKm ?? '-'} | ${c.split.stepFree.ffmMedianKm ?? '-'} / ${c.split.stepFree.apMedianKm ?? '-'} | ${c.split.flagged.ffmWorseShare ?? '-'} / ${c.split.stepFree.ffmWorseShare ?? '-'} | ${c.split.flagged.medianRatio ?? '-'} / ${c.split.stepFree.medianRatio ?? '-'} | ${c.classes.maneuver}, ${c.classes.storm}, ${c.classes.neither} |`);
fs.writeFileSync(path.join(OUT, 'table.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
console.log('objects', objects.map((o) => `${o.group} ${o.name}: ${o.steps.length}`).join('; '));
process.exit(0);
