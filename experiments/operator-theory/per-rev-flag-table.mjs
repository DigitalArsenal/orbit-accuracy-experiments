// PER-REV-FLAG.md's tables: from the stored rows of per-rev-flag.mjs, every window's flag (lib/steps.mjs revFlag) at each fit arc and lead, the counts before
// (the 8 m truth step, the geosynchronous burn record, TESS's perigee steps, where a record covered the window) and after, the paired FFM/AP ratio on the
// burn-free windows with its 95 % interval over object-week clusters (ffm220-ratio.mjs's statistic), the false alarms on the passive satellites, and the verdict
// of the near-700 km and geostationary cells. Statistics on stored rows only.
//   node experiments/operator-theory/per-rev-flag-table.mjs --out results/operator-theory/per-rev-flag
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { median, pct, asc, rand } from './lib/compare.mjs';
import { HOUR, PER_REV, revDifferences, revFlag, periodOf, windowState } from './lib/steps.mjs';
import { HELD_ROW } from './lib/pairs.mjs';
import { FFM_220, ORBITS_010 } from './lib/build.mjs';
import { STORE, SPAN, WINDOW_STORES, windowsOf, heldWindow } from './per-rev-flag.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const OUT = argOf('--out');
if (!OUT) throw new Error('--out');
const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'), AP = '/opt/data/sdn-archive/operator-theory/ap';
const jsonl = (f) => fs.readFileSync(f, 'utf8').split('\n').filter((l) => l && !HELD_ROW.test(l)).map((l) => JSON.parse(l));
const rowsIn = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => jsonl(path.join(dir, f))) : []);
const byKey = (...dirs) => new Map(dirs.flatMap((d) => rowsIn(path.join(AP, d))).map((r) => [r.key, r]));
const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(REPO, rel), 'utf8'));
const e = (r, arm, day) => r?.arms?.[arm]?.days?.[day]?.e;
const round = (x, k = 3) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(k)));

// The regimes: each group's FFM store (2.2.0 where it was flown again, else the store cells.json reads) and AP's (sdn-ap 0.5.1).
const REGIMES = [
  { group: 'S1', label: 'Near 700 km', ffm: ['ffm220/compare-truth2'], ffmBuild: '2.2.0', ap: ['b051/truth2'], decide: true },
  { group: 'GE', label: 'Geostationary (GFZ)', ffm: ['ffm220/regimes'], ffmBuild: '2.2.0', ap: ['b051/regimes'], decide: true },
  { group: 'WA', label: 'Geostationary, WAAS', ffm: ['b0411/regimes-wa'], ffmBuild: '2.0.4', ap: ['b051/regimes-wa'], decide: true },
  { group: 'LS', label: 'Low orbit, laser spheres', ffm: ['ffm220/regimes'], ffmBuild: '2.2.0', ap: ['b051/regimes'], quiet: true },
  { group: 'GD', label: 'Laser geodetic', ffm: ['ffm220/regimes'], ffmBuild: '2.2.0', ap: ['b051/regimes'], quiet: true },
  { group: 'GN', label: 'Medium Earth orbit', ffm: ['ffm220/compare-truth2'], ffmBuild: '2.2.0', ap: ['b051/truth2'] },
  { group: 'IG', label: 'Inclined geosynchronous', ffm: ['ffm220/regimes'], ffmBuild: '2.2.0', ap: ['b051/regimes'] },
  { group: 'DO', label: 'Low orbit, altimetry', ffm: ['ffm220/regimes'], ffmBuild: '2.2.0', ap: ['b051/regimes'] },
  { group: 'HE', label: 'Highly elliptical, TESS', ffm: ['ffm220/regimes'], ffmBuild: '2.2.0', ap: ['b051/regimes'] },
  { group: 'HX', label: 'Highly elliptical, THEMIS and Chandra', ffm: ['ffm220/regimes'], ffmBuild: '2.2.0', ap: ['b051/regimes-hx'] },
];
const DAYS = ['1', '2', '3', '7'];

// Before: the 8 m flag (maneuver-flags/flags.json: Sentinel-1, altimetry, WAAS), the geosynchronous burn record (geo-burns-beidou.json, ffm220-ratio.mjs's
// reading) and TESS's perigee steps; null where no record covers the window.
const FLAGS = new Map(readJson('results/operator-theory/maneuver-flags/flags.json').windows.map((w) => [w.key, w]));
const GEO = new Map(readJson('results/operator-theory/maneuver-flags/geo-burns-beidou.json').satellites.map((x) => [x.name, [...x.burns.map((b) => Date.parse(b.day)), ...x.hourly.burns.map((b) => Date.parse(`${b.t}Z`))]]));
const TESS = new Map(readJson('results/ap-truth/tess-rescore/table.json').windows.map((w) => [w.key, w.steps.map((x) => Date.parse(x.epoch))]));
const before = (w, fit, lead) => {
  if (FLAGS.has(w.key)) { const s = windowState(FLAGS.get(w.key), fit, lead); return s.flagged ? 'flagged' : s.stepFree ? 'burnFree' : 'unchecked'; }
  const times = w.group === 'GE' ? GEO.get(w.name) : w.group === 'HE' ? TESS.get(w.key) : null;
  if (!times) return 'none';
  const D0 = Date.parse(w.cutoff);
  return times.some((t) => t >= D0 - fit * HOUR && t <= D0 + lead * HOUR) ? 'flagged' : 'burnFree';
};

const isoWeek = (d) => { const t = new Date(`${d}T00:00:00Z`); const day = (t.getUTCDay() + 6) % 7; t.setUTCDate(t.getUTCDate() - day + 3); const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4)); return `${t.getUTCFullYear()}-W${1 + Math.round((t - first) / (7 * 86400000))}`; };
const ratio = (w) => (w.length ? round(Math.exp(median(w.map((x) => Math.log(x.f / x.a)))), 3) : null);
/** ffm220-ratio.mjs's interval: 10,000 draws of object-week clusters with replacement, the seed from SHA-256 of the cell. */
const interval = (tag, w) => {
  if (!w.length) return { interval: null, clusters: 0 };
  const by = new Map();
  for (const x of w) { const c = `${x.name}|${isoWeek(x.cutoff.slice(0, 10))}`; (by.get(c) ?? by.set(c, []).get(c)).push(Math.log(x.f / x.a)); }
  const clusters = [...by.values()], random = rand(parseInt(crypto.createHash('sha256').update(`PERREV|${tag}`).digest('hex').slice(0, 8), 16)), meds = [];
  for (let t = 0; t < 10000; t += 1) { const draw = []; for (let i = 0; i < clusters.length; i += 1) draw.push(...clusters[Math.floor(random() * clusters.length)]); meds.push(median(draw)); }
  meds.sort(asc);
  return { interval: [round(Math.exp(pct(meds, 0.025))), round(Math.exp(pct(meds, 0.975)))], clusters: clusters.length };
};

const cells = [], perWindow = [], coverage = [];
for (const R of REGIMES) {
  const windows = windowsOf(R.group), flags = new Map(rowsIn(path.join(STORE, R.group)).map((r) => [r.key, r]));
  for (const w of windows) if (heldWindow(w)) throw new Error(`${w.key}: held`);
  const ffm = byKey(...R.ffm), ap = byKey(...R.ap);
  const run = windows.filter((w) => flags.has(w.key)), ok = run.filter((w) => flags.get(w.key).ok);
  coverage.push({ group: R.group, label: R.label, windows: windows.length, flown: run.length, ok: ok.length, failed: Object.entries(run.filter((w) => !flags.get(w.key).ok).reduce((m, w) => ({ ...m, [flags.get(w.key).error]: (m[flags.get(w.key).error] ?? 0) + 1 }), {})).map(([error, n]) => ({ error, n })) });
  const fits = [...new Set(windows.flatMap((w) => Object.keys(ffm.get(w.key)?.arms ?? {}).filter((a) => /^F\d+$/.test(a)).map((a) => Number(a.slice(1)))))].sort((a, b) => a - b);
  const diffs = new Map(ok.map((w) => { const r = flags.get(w.key); return [w.key, { d: revDifferences(r.flight, r.truth), p: periodOf(r.truth) }]; }));
  for (const w of windows) {
    const D0 = Date.parse(w.cutoff), x = diffs.get(w.key), r = flags.get(w.key);
    const at = {};
    for (const fit of fits) for (const day of DAYS) {
      const lead = Number(day) * 24, f = x ? revFlag(x.d, x.p, D0 - fit * HOUR, D0 + lead * HOUR) : null;
      const big = f ? f.changes.filter((s) => Math.abs(s.sizeM) >= PER_REV.jumpM) : [];
      at[`${fit}/${lead}`] = { before: before(w, fit, lead), after: !r ? 'not flown' : !f ? 'unchecked' : f.flagged ? 'flagged' : f.burnFree ? 'burnFree' : 'unchecked', inFit: big.some((s) => s.t <= D0), inForecast: big.some((s) => s.t > D0),
        largestM: f?.largest ? round(f.largest.sizeM, 2) : null, atHours: f?.largest ? round((f.largest.t - D0) / HOUR, 1) : null };
    }
    perWindow.push({ key: w.key, group: R.group, name: w.name, cutoff: w.cutoff.slice(0, 10), flown: r ? (r.ok ? 'ok' : r.error) : 'not flown', b: r?.ok ? round(r.b, 6) : null, stepS: r?.stepS ?? null, at });
  }
  for (const fit of fits) for (const day of DAYS) {
    const lead = Number(day) * 24, tag = `${fit}/${lead}`;
    const pairs = windows.map((w) => ({ name: w.name, cutoff: w.cutoff, key: w.key, f: e(ffm.get(w.key), `F${fit}`, day), a: e(ap.get(w.key), `AP${fit}`, day) })).filter((x) => [x.f, x.a].every((v) => Number.isFinite(v) && v > 0));
    if (!pairs.length) continue;
    const state = new Map(perWindow.filter((p) => p.group === R.group).map((p) => [p.key, p.at[tag]]));
    const count = (side, v) => pairs.filter((x) => state.get(x.key)[side] === v).length;
    const free = pairs.filter((x) => state.get(x.key).after === 'burnFree'), flagged = pairs.filter((x) => state.get(x.key).after === 'flagged');
    const ci = interval(`${R.group}|${fit}|${day}`, free), all = interval(`${R.group}|${fit}|${day}|all`, pairs);
    const cell = { group: R.group, regime: R.label, fit, lead, ffmBuild: R.ffmBuild, windows: pairs.length, satellites: new Set(pairs.map((x) => x.name)).size,
      before: { flagged: count('before', 'flagged'), burnFree: count('before', 'burnFree'), unchecked: count('before', 'unchecked'), noRecord: count('before', 'none') },
      after: { flagged: flagged.length, burnFree: free.length, unchecked: count('after', 'unchecked'), notFlown: count('after', 'not flown') },
      ratioAll: ratio(pairs), intervalAll: all.interval, ratioFlagged: ratio(flagged), ratioBurnFree: ratio(free), intervalBurnFree: ci.interval, clustersBurnFree: ci.clusters,
      ffmWorseBurnFree: free.length ? round(free.filter((x) => x.f > x.a).length / free.length) : null };
    if (R.decide) cell.verdict = !free.length ? (flagged.length && flagged.length === pairs.length - count('after', 'not flown') ? 'explained: every flown window holds a burn under the flag (no burn-free window)' : 'undecided: no burn-free window') :ci.interval[0] <= 1 ? (ci.interval[1] < 1 ? 'explained: FFM ahead of AP on the burn-free windows' : 'explained: parity on the burn-free windows (the interval holds 1)') : 'FFM defect: FFM worse than AP on the burn-free windows';
    if (R.quiet) cell.falseAlarms = { flagged: flagged.length, of: flagged.length + free.length + count('after', 'unchecked'), share: round(flagged.length / Math.max(1, pairs.length - count('after', 'not flown'))) };
    cells.push(cell);
  }
}

const doc = { rule: { ...PER_REV, span: SPAN, flag: 'FFM24 flight less the truth, mean semimajor axis per revolution; a drift-free change of 1 m or more in [cutoff - fit, cutoff + lead]' },
  builds: { ffm: { version: FFM_220.version, sha256: FFM_220.wasmSha256, modulesCommit: FFM_220.modulesCommit }, orbits: { version: ORBITS_010.version, sha256: ORBITS_010.wasmSha256 }, ap: 'sdn-ap 0.5.1 (ap/b051)' },
  statistic: 'exp(median by window of ln(FFM / AP)); 95 % interval over object-week clusters, 10,000 draws, seed SHA-256 of PERREV|<group>|<fit>|<day>',
  windowStores: WINDOW_STORES, coverage, cells, perWindow };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify(doc)}\n`);
const I = (v) => (v ? `[${v.join(', ')}]` : '-');
const md = ['# The per-revolution maneuver flag on every stored window', '',
  'Post hoc, `experiments/operator-theory/PER-REV-FLAG.md`: the rule was chosen after the Sentinel-1 analysis `S1-24H-DAY7.md`, and every window here was read before. `experiments/operator-theory/per-rev-flag.mjs` flies FFM24 (propagator/ffm ' + FFM_220.version + ') over [cutoff - 72 h, cutoff + 168 h] on each window; `per-rev-flag-table.mjs` writes `table.json` and this file from its rows. Strong drag (Swarm, GRACE-FO) is held and not flown.', '',
  '## Windows flown', '', '| Regime | Windows | Flown | FFM24 fitted and flown | Not flown, by reason |', '| --- | --- | --- | --- | --- |',
  ...coverage.map((c) => `| ${c.label} | ${c.windows} | ${c.flown} | ${c.ok} | ${c.failed.map((f) => `${f.error}: ${f.n}`).join('; ') || '-'} |`), '',
  '## FFM against AP, burn and burn-free on the new flag', '',
  'Before: the 8 m truth step (Sentinel-1, altimetry, WAAS), the geosynchronous burn record (GFZ geostationary) or TESS\'s perigee steps, flagged / burn-free / unchecked / no record. After: this rule, flagged / burn-free / unchecked / not flown. Ratios are exp(median ln(FFM / AP)) with 95 % object-week intervals.', '',
  '| Regime | Fit, h | Lead, h | FFM | Windows | Before | After | FFM/AP all | FFM/AP flagged | FFM/AP burn-free | Interval, burn-free | Verdict |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...cells.map((c) => `| ${c.regime} | ${c.fit} | ${c.lead} | ${c.ffmBuild} | ${c.windows} | ${c.before.flagged} / ${c.before.burnFree} / ${c.before.unchecked} / ${c.before.noRecord} | ${c.after.flagged} / ${c.after.burnFree} / ${c.after.unchecked} / ${c.after.notFlown} | ${c.ratioAll ?? '-'} | ${c.ratioFlagged ?? '-'} | ${c.ratioBurnFree ?? '-'} | ${I(c.intervalBurnFree)} | ${c.verdict ?? (c.falseAlarms ? `false alarms ${c.falseAlarms.flagged} (${c.falseAlarms.share})` : '-')} |`), ''];
fs.writeFileSync(path.join(OUT, 'README.md'), `${md.join('\n')}\n`);
console.log(md.join('\n'));
