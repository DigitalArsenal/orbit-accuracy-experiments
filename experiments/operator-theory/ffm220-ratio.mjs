// COMPARE.md, 2026-11-05: the paired FFM/AP ratio of the precise-orbit cells before and after FFM moved from propagator/ffm 2.0.4 to 2.2.0 (lib/build.mjs FFM_220).
// For each cells.json regime, fit and day: the windows where AP (sdn-ap 0.5.1, ap/b051), FFM on 2.0.4 (ap/b0411, the stores cells.json read before) and FFM on
// 2.2.0 (ap/ffm220, cycle-ffm220.sh) all scored; the ratio is exp(median by window of ln(FFM / AP)), each build's on the same windows. Report only.
// moved: the two ratios differ by more than 0.01. Where FFM 2.2.0 is worse than AP (ratio above 1), the owner's rule (FFM is never worse than AP unless a maneuver
// explains it) is read against the registered burn records: maneuver-flags/flags.json (Sentinel-1, the altimetry satellites, the WA group; lib/steps.mjs
// windowState), maneuver-flags/geo-burns-beidou.json (the geostationary satellites: daily and hourly burns) and ap-truth/tess-rescore/table.json (TESS's perigee
// steps). A window counts as burned when a registered burn falls in its fit arc or its forecast to the lead, burn-free when a record covers it and none does. The
// cell is explained when the ratio on its burn-free windows is 1 or below, or when every window is burned; unexplained otherwise, and where no record covers the regime.
//   node experiments/operator-theory/ffm220-ratio.mjs --out results/ap-truth/compare/ffm-ap-ratio.json
// Each cell where FFM 2.2.0 is worse than AP carries a 95 % interval of its ratio: 10,000 draws of object-week clusters with replacement (the satellite and the ISO
// week of the cutoff, as AP5.md and AP6.md cluster by week), the seed from SHA-256 of the cell; a cell whose interval holds 1 is parity, not a loss.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { median, pct, asc, rand } from './lib/compare.mjs';
import { GROUPS } from './lib/regimes.mjs';
import { HELD_ROW } from './lib/pairs.mjs';
import { FFM_220 } from './lib/build.mjs';
import { windowState } from './lib/steps.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const AP = '/opt/data/sdn-archive/operator-theory/ap', OLD = path.join(AP, 'b0411'), B051 = path.join(AP, 'b051'), NEW = path.join(AP, 'ffm220');
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l && !HELD_ROW.test(l)).map((l) => JSON.parse(l));
const rowsIn = (dir) => fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).flatMap((f) => jsonl(path.join(dir, f)));
const byKey = (...dirs) => new Map(dirs.flatMap((d) => rowsIn(d)).map((r) => [r.key, r]));
const e = (r, arm, day) => r?.arms?.[arm]?.days?.[day]?.e;
// cells.json's precise-orbit regimes, by the same membership: AP5.md's cuts, then AP6.md's groups.
const regimes = [
  { regime: 'Strong drag, 2025', members: rowsIn(path.join(OLD, 'truth')).filter((r) => !r.error), ap: byKey(path.join(B051, 'truth')), old: byKey(path.join(OLD, 'compare-truth')), now: byKey(path.join(NEW, 'compare-truth')), arcs: [24] },
  ...[['Strong drag, 2026', 'P'], ['Near 700 km', 'S1'], ['Medium Earth orbit', 'GN']].map(([regime, group]) => ({ regime, members: rowsIn(path.join(OLD, 'truth2')).filter((r) => r.group === group && !r.error), ap: byKey(path.join(B051, 'truth2')), old: byKey(path.join(OLD, 'compare-truth2')), now: byKey(path.join(NEW, 'compare-truth2')), arcs: [24, 72] })),
];
const six = { ap: byKey(path.join(B051, 'regimes'), path.join(B051, 'regimes-hx')), old: byKey(path.join(OLD, 'regimes')), now: byKey(path.join(NEW, 'regimes')) };
const live = rowsIn(path.join(OLD, 'regimes')).filter((r) => !r.error);
for (const [group, g] of Object.entries(GROUPS)) {
  const members = live.filter((r) => r.group === group);
  if (!members.length) continue;
  regimes.push({ regime: g.label, members, ...six, arcs: [...new Set(members.flatMap((r) => Object.keys(r.arms).filter((a) => /^F\d+$/.test(a)).map((a) => Number(a.slice(1)))))].sort((a, b) => a - b) });
}
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), HOUR = 3600000;
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));
const FLAGS = new Map(readJson('results/operator-theory/maneuver-flags/flags.json').windows.map((w) => [w.key, w]));
const GEO = new Map(readJson('results/operator-theory/maneuver-flags/geo-burns-beidou.json').satellites.map((x) => [x.name, [...x.burns.map((b) => Date.parse(b.day)), ...x.hourly.burns.map((b) => Date.parse(`${b.t}Z`))]]));
const TESS = new Map(readJson('results/ap-truth/tess-rescore/table.json').windows.map((w) => [w.key, w.steps.map((x) => Date.parse(x.epoch))]));
/** A window's registered burns against its fit and forecast to the lead: true, false, or null where no record covers it. */
const burned = (r, fit, lead) => {
  if (FLAGS.has(r.key)) { const s = windowState(FLAGS.get(r.key), fit, lead); return s.flagged ? true : s.stepFree ? false : null; }
  const times = r.group === 'GE' ? GEO.get(r.name) : r.group === 'HE' ? TESS.get(r.key) : null;
  if (!times) return null;
  const D0 = Date.parse(r.cutoff);
  return times.some((t) => t >= D0 - fit * HOUR && t <= D0 + lead * HOUR);
};
const isoWeek = (d) => { const t = new Date(`${d}T00:00:00Z`); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return `${t.getUTCFullYear()}-W${1 + Math.round((t - first) / (7 * 86400000))}`; };
/** The ratio's 95 % interval over object-week clusters: [lower, upper] and the cluster count. */
const interval = (tag, w) => {
  const by = new Map();
  for (const x of w) { const c = `${x.name}|${isoWeek(x.r.cutoff.slice(0, 10))}`; (by.get(c) ?? by.set(c, []).get(c)).push(Math.log(x.now / x.ap)); }
  const clusters = [...by.values()], random = rand(parseInt(crypto.createHash('sha256').update(`FFM220|${tag}`).digest('hex').slice(0, 8), 16)), meds = [];
  for (let t = 0; t < 10000; t += 1) { const draw = []; for (let i = 0; i < clusters.length; i += 1) draw.push(...clusters[Math.floor(random() * clusters.length)]); meds.push(median(draw)); }
  meds.sort(asc);
  return { interval: [Number(Math.exp(pct(meds, 0.025)).toFixed(3)), Number(Math.exp(pct(meds, 0.975)).toFixed(3))], clusters: clusters.length };
};
const ratio = (pairs) => Number(Math.exp(median(pairs.map(([f, a]) => Math.log(f / a)))).toFixed(3));
const out = [];
for (const c of regimes) for (const fit of c.arcs) for (const day of ['1', '2', '3', '7']) {
  const w = c.members.map((r) => ({ r, name: r.name, ap: e(c.ap.get(r.key), `AP${fit}`, day), old: e(c.old.get(r.key), `F${fit}`, day), now: e(c.now.get(r.key), `F${fit}`, day) }))
    .filter((x) => [x.ap, x.old, x.now].every((v) => Number.isFinite(v) && v > 0));
  const notRun = c.members.filter((r) => Number.isFinite(e(c.old.get(r.key), `F${fit}`, day)) && !c.now.has(r.key)).length;
  const row = { regime: c.regime, fit, lead: Number(day) * 24, windows: w.length, satellites: new Set(w.map((x) => x.name)).size, notRun,
    before: w.length ? ratio(w.map((x) => [x.old, x.ap])) : null, after: w.length ? ratio(w.map((x) => [x.now, x.ap])) : null };
  row.moved = row.before !== null && Math.abs(row.after - row.before) > 0.01;
  if (row.after > 1) {
    const state = w.map((x) => burned(x.r, fit, row.lead)), free = w.filter((_, i) => state[i] === false);
    const counts = { burned: state.filter((x) => x === true).length, burnFree: free.length, notCovered: state.filter((x) => x === null).length };
    const freeRatio = free.length ? ratio(free.map((x) => [x.now, x.ap])) : null;
    // The satellites whose burn-free windows have FFM worse than AP, by count.
    const objects = Object.fromEntries(Object.entries(free.filter((x) => x.now > x.ap).reduce((m, x) => ({ ...m, [x.name]: (m[x.name] ?? 0) + 1 }), {})).sort((a, b) => b[1] - a[1]));
    const UNREGISTERED = c.regime === 'Near 700 km'
      ? 'no registered burn of 8 m or more; the 11-05 Sentinel-1 study found burns under 8 m, below the flag threshold and not yet registered (record experiments-ffm-step-flag-per-rev-20261105)'
      : c.regime === 'Geostationary' ? 'station-keeping burns the 8 m flag does not register (record experiments-ffm-step-flag-per-rev-20261105, its scope taking in geostationary orbit)'
        : 'FFM is worse than AP on the windows with no registered burn';
    const ci = interval(`${c.regime}|${fit}|${day}`, w);
    row.worseThanAp = { ...counts, burnFreeRatio: freeRatio, objects, ...ci,
      verdict: ci.interval[0] <= 1 ? `parity: the interval holds 1${counts.burned === w.length ? '; every window also holds a registered burn' : ''}`
        : counts.notCovered === w.length ? 'unexplained: no registered burn record covers these windows'
          : counts.burned === w.length ? 'explained: every window holds a registered burn in its fit or its forecast to the lead'
            : freeRatio !== null && freeRatio <= 1 ? 'explained: on the burn-free windows FFM is not worse than AP' : `unexplained: ${UNREGISTERED}` };
  }
  out.push(row);
}
const doc = { ffm: { before: { version: '2.0.4', sha256: 'c36f1b14fc233e88725d57724c3bae7ad025cfdd9d8d4520c3bcccd0f8a816b2' }, after: { version: FFM_220.version, sha256: FFM_220.wasmSha256 } }, ap: 'sdn-ap 0.5.1 (ap/b051)', statistic: 'exp(median by window of ln(FFM / AP)), on the windows where AP and both FFM builds scored', rows: out };
if (argOf('--out')) fs.writeFileSync(argOf('--out'), `${JSON.stringify(doc, null, 1)}\n`);
for (const r of out) console.log(`${r.regime.padEnd(40)} fit ${String(r.fit).padStart(3)} lead ${String(r.lead).padStart(3)} h  n ${String(r.windows).padStart(4)}  FFM/AP ${r.before} -> ${r.after}${r.moved ? '  MOVED' : ''}${r.notRun ? `  (${r.notRun} windows not yet on 2.2.0)` : ''}${r.worseThanAp ? `  WORSE [${r.worseThanAp.interval.join(', ')}] over ${r.worseThanAp.clusters} object-weeks: ${r.worseThanAp.verdict} (burned ${r.worseThanAp.burned}, burn-free ${r.worseThanAp.burnFree} at ${r.worseThanAp.burnFreeRatio}, not covered ${r.worseThanAp.notCovered}; ${JSON.stringify(r.worseThanAp.objects)})` : ''}`);
