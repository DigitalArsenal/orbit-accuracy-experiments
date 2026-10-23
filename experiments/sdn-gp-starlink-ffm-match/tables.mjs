// Aggregation: the recorded window rows (statistics only) -> results/sdn-gp-starlink-ffm-match/tables.json and README.md.
// Everything in the committed tables is computed here from the rows; nothing is typed. Counting and ordering only.
//   node experiments/sdn-gp-starlink-ffm-match/tables.mjs [--check]   (--check recomputes and compares with the committed tables.json)
import fs from 'node:fs';
import path from 'node:path';
import { config, store, results, write, sha256 } from './common.mjs';
import { quantile, mean } from './lib/windows.mjs';

const REGIMES = [
  { id: 'leo-starlink-ffm', label: 'LEO, Starlink, FFM-propagated truth' },
  { id: 'leo-starlink-ffm-drag', label: 'LEO, Starlink, FFM truth, B_eff above zero (drag acts)' },
  { id: 'leo-starlink-ffm-b0', label: 'LEO, Starlink, FFM truth, B_eff at the zero bound (net thrust not representable)' },
  { id: 'leo-starlink-spacex', label: 'LEO, Starlink, SpaceX forecast (inside the span, day 1)' },
  { id: 'leo-iss', label: 'LEO, ISS (NASA OEM of 2026-10-07)' },
  { id: 'leo-iss-daily', label: 'LEO, ISS (NASA OEM of 2026-10-21, one window from its start)' },
  { id: 'leo-slr', label: 'LEO, laser-ranged (ILRS NSGF)' },
  { id: 'meo-gnss', label: 'MEO, GPS / GLONASS / Galileo (ESA final)' },
  { id: 'meo-slr', label: 'MEO, laser-ranged (LAGEOS, Etalon, LARES-2)' },
];
const MISSING = [
  { id: 'geo', label: 'GEO', reason: 'no truth in the archive (no BeiDou GEO, no operator ephemerides)' },
  { id: 'heo', label: 'HEO', reason: 'no truth in the archive' },
  { id: 'cislunar', label: 'Cislunar, lunar, interplanetary', reason: 'no spacecraft kernels in the archive (planetary ephemerides only); SGP4 does not apply' },
];
const DAYS = [1, 2, 3];

const readJsonl = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : []);

export function collect() {
  const windows = [];
  const dir = path.join(store, 'rows/starlink');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)).sort()) {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f)));
      const meta = { norad: r.norad, population: r.population, stratum: r.stratum, tercile: r.tercile, bEff: r.fit?.bEffM2Kg, bEffAtZeroBound: r.fit?.bEffAtZeroBound };
      if (r.ffm) { windows.push({ regime: 'leo-starlink-ffm', ...r.ffm, meta }); windows.push({ regime: meta.bEffAtZeroBound ? 'leo-starlink-ffm-b0' : 'leo-starlink-ffm-drag', ...r.ffm, meta }); }
      if (r.spacex) windows.push({ regime: 'leo-starlink-spacex', ...r.spacex, meta });
    }
  }
  for (const [source, map] of [['iss', () => 'leo-iss'], ['iss-daily', () => 'leo-iss-daily'], ['gnss', () => 'meo-gnss'], ['slr-high', () => 'meo-slr'], ['slr-low', (w) => (/LARES-?2/i.test(w.id) ? 'meo-slr' : 'leo-slr')]]) {
    for (const w of readJsonl(path.join(store, 'rows', `${source}.jsonl`))) windows.push({ regime: map(w), ...w, meta: {} });
  }
  return windows;
}

const spread = (values) => ({ n: values.length, median: quantile(values, 0.5), mean: mean(values), p90: quantile(values, 0.9) });
const comp = (list, i) => quantile(list.map((v) => v?.[i]).filter(Number.isFinite), 0.5);
export function armStats(ws, arm) {
  const ok = ws.filter((w) => w[arm]?.ok);
  const out = {
    attempted: ws.length, fitted: ok.length,
    fit: spread(ok.map((w) => w[arm].fitRmsKm)),
    fitRic: [0, 1, 2].map((i) => comp(ok.map((w) => w[arm].fitRic), i)),
    fitMsMedian: quantile(ok.map((w) => w[arm].fitMs), 0.5),
    elementBytes: quantile(ok.map((w) => w[arm].elementBytes), 0.5), recordBytes: quantile(ok.map((w) => w[arm].recordBytes), 0.5), parameters: ok[0]?.[arm].parameters ?? null,
    days: {},
  };
  for (const k of DAYS) {
    const withDay = ok.filter((w) => w[arm].days?.[k]);
    out.days[k] = { ...spread(withDay.map((w) => w[arm].days[k].rmsKm)), ric: [0, 1, 2].map((i) => comp(withDay.map((w) => w[arm].days[k].ric), i)) };
  }
  return out;
}
export function paired(ws) {
  const both = ws.filter((w) => w.xp?.ok && w.sgp4?.ok);
  const out = { windows: both.length, days: {} };
  for (const k of [0, ...DAYS]) {
    const pairs = both.map((w) => (k === 0 ? [w.xp.fitRmsKm, w.sgp4.fitRmsKm] : [w.xp.days?.[k]?.rmsKm, w.sgp4.days?.[k]?.rmsKm])).filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b));
    out.days[k] = pairs.length ? { n: pairs.length, medianRatio: quantile(pairs.map(([a]) => a), 0.5) / quantile(pairs.map(([, b]) => b), 0.5), xpCloser: pairs.filter(([a, b]) => a < b).length / pairs.length } : null;
  }
  return out;
}

export function build() {
  const windows = collect();
  const comspoc = readJsonl(path.join(store, 'rows/comspoc.jsonl'));
  const bench = fs.existsSync(path.join(results, 'bench.json')) ? JSON.parse(fs.readFileSync(path.join(results, 'bench.json'))) : null;
  const regimes = [];
  const statsOf = (r, ws, cs) => ({
    ...r, windows: ws.length, objects: new Set(ws.map((w) => w.id)).size, xp: armStats(ws, 'xp'), sgp4: armStats(ws, 'sgp4'), paired: paired(ws),
    comspoc: cs?.length ? { objects: cs.length, ageDays: spread(cs.map((c) => c.ageDays)), days: Object.fromEntries([0, ...DAYS].map((k) => [k, { ...spread(cs.filter((c) => c.days?.[k]).map((c) => c.days[k].rmsKm)), ric: [0, 1, 2].map((i) => comp(cs.filter((c) => c.days?.[k]).map((c) => c.days[k].ric), i)) }])) } : null,
  });
  for (const r of REGIMES) {
    const ws = windows.filter((w) => w.regime === r.id);
    const cs = comspoc.filter((c) => c.regime === r.id);
    regimes.push(statsOf(r, ws, cs.length ? null : null));
    if (cs.length) { // the same objects, so the COMSPOC arm is compared like with like
      const ids = new Set(cs.map((c) => c.norad));
      regimes.push(statsOf({ id: `${r.id}-aligned`, label: `${r.label}, the ${ids.size} object(s) scored for COMSPOC` }, ws.filter((w) => ids.has(w.norad)), cs));
    }
  }
  // Starlink FFM by shell stratum and drag tercile
  const shells = {};
  for (const w of windows.filter((x) => x.regime === 'leo-starlink-ffm')) {
    const key = `${w.meta.stratum ?? 'none'}/t${w.meta.tercile ?? '-'}`;
    (shells[key] ??= []).push(w);
  }
  const byShell = Object.entries(shells).sort(([a], [b]) => (a < b ? -1 : 1)).map(([key, ws]) => ({
    cell: key, windows: ws.length, bEffMedian: quantile(ws.map((w) => w.meta.bEff), 0.5), bEffAtZeroBound: ws.filter((w) => w.meta.bEffAtZeroBound).length,
    xp: { fit: quantile(ws.filter((w) => w.xp?.ok).map((w) => w.xp.fitRmsKm), 0.5), day1: quantile(ws.filter((w) => w.xp?.days?.[1]).map((w) => w.xp.days[1].rmsKm), 0.5), day3: quantile(ws.filter((w) => w.xp?.days?.[3]).map((w) => w.xp.days[3].rmsKm), 0.5) },
    sgp4: { fit: quantile(ws.filter((w) => w.sgp4?.ok).map((w) => w.sgp4.fitRmsKm), 0.5), day1: quantile(ws.filter((w) => w.sgp4?.days?.[1]).map((w) => w.sgp4.days[1].rmsKm), 0.5), day3: quantile(ws.filter((w) => w.sgp4?.days?.[3]).map((w) => w.sgp4.days[3].rmsKm), 0.5) },
  }));
  // accounting of the Starlink truth set
  const dir = path.join(store, 'rows/starlink');
  const names = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
  const fitted = names.filter((n) => /^\d+\.json$/.test(n)).map((n) => JSON.parse(fs.readFileSync(path.join(dir, n))));
  const fittedIds = new Set(fitted.map((x) => x.norad));
  const failed = names.filter((n) => n.endsWith('.failed.json')).map((n) => JSON.parse(fs.readFileSync(path.join(dir, n)))).filter((x) => !fittedIds.has(x.norad));
  const reasons = {};
  for (const f of failed) { const key = f.reason.replace(/\d+/g, '#').slice(0, 90); reasons[key] = (reasons[key] ?? 0) + 1; }
  const truthSet = {
    fitted: fitted.length, seatsFitted: fitted.filter((f) => f.population === 'seat').length, dailyFitted: fitted.filter((f) => f.population === 'daily').length, failed: failed.length, failureReasons: reasons,
    byStratum: Object.fromEntries([...new Set(fitted.map((f) => f.stratum))].sort().map((s) => [s, fitted.filter((f) => f.stratum === s).length])),
    fitVsSpaceXKm: spread(fitted.map((f) => f.fit.rmsKm)), bEffZeroBound: fitted.filter((f) => f.fit.bEffAtZeroBound).length,
    notConverged: fitted.filter((f) => f.fit.convergence !== 'converged').length, withManeuverEvents: fitted.filter((f) => f.fit.events > 0).length,
    fitCpuSecondsMedian: quantile(fitted.map((f) => f.fit.cpuSeconds), 0.5),
  };
  const covRows = readJsonl(path.join(store, 'rows/covariance.jsonl'));
  const realism = ['comspoc-syncopate', 's3kc-sgp4'].map((source) => {
    const rows = covRows.filter((c) => c.source === source && c.n);
    const pool = (list) => ({ objects: new Set(list.map((c) => c.norad)).size, samples: list.reduce((a, c) => a + c.n, 0), meanD2Over3: list.reduce((a, c) => a + c.sumD2, 0) / (3 * Math.max(1, list.reduce((a, c) => a + c.n, 0))), coverage95: list.reduce((a, c) => a + c.within95, 0) / Math.max(1, list.reduce((a, c) => a + c.n, 0)), medianObjectError: quantile(list.map((c) => c.errorKmMedian), 0.5) });
    return { source, refused: covRows.filter((c) => c.source === source && c.refused).length, all: rows.length ? pool(rows) : null, byAgeDay: [...new Set(rows.map((c) => c.ageDay))].sort((a, b) => a - b).map((d) => ({ ageDay: d, ...pool(rows.filter((c) => c.ageDay === d)) })) };
  });
  return { generatedFrom: 'recorded window rows (statistics only)', realism, config: { fitHours: config.windows.fitHours, leadDays: config.windows.leadDays, minimumCoverage: config.windows.minimumCoverage }, regimes, missing: MISSING, byShell, truthSet, bench: bench?.rows ?? null };
}

// ---- markdown ----
const f = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(d));
const arms = (r, k) => [r.xp.days[k]?.median, r.comspoc?.days?.[k]?.median, r.sgp4.days[k]?.median];
const cell = (vals) => `pending / ${vals.map((v) => (Number.isFinite(v) ? f(v) : '-')).join(' / ')}`;
export function markdown(t) {
  const L = [];
  L.push('# G1: SDN-GP against FFM-propagated Starlink and precise orbits (baselines)', '');
  L.push('Generated by `experiments/sdn-gp-starlink-ffm-match/tables.mjs` from recorded window rows. Position errors are 3D RMS in km unless a column says otherwise; every cell is a median over windows. Fit interval 24 h; held-out day k is (24 h + (k-1) d, 24 h + k d].', '');
  L.push('## Method in brief', '',
    '- **Truth.** Starlink: the satellite\'s SpaceX forecast is fitted over 0-48 h (never across the 48 h join) by `analysis/od fit_ffm` (FFM-1, NRLMSISE-00 drag with s = 0 because no $DCL is published yet, kappa x drag folded into B_eff, Cr*A/m locked), then FFM-1 propagates the fitted state for 96 h at 60 s. That trajectory is the truth of the `FFM-propagated truth` row; the `SpaceX forecast` row scores the same fits against SpaceX\'s own states inside its span. Precise orbits: ESA final GNSS, ILRS combined weekly and NSGF arcs, NASA ISS OEM, windows as in the sgp4-xp measurement.',
    '- **Windows.** 24 h fit from the first state; SGP4 by `fit_elements` (six mean elements and B*), SGP4-XP by `propagator/sgp4-xp fit` (those and BTERM, AGOM). One window per Starlink; the other sources use the strides of `config.json`.',
    '- **RIC.** SGP4: `element_residuals` (RTN of the truth). SGP4-XP: the module\'s own fit split for the fit, and the fitted set propagated by the module and compared by `pair_statistics` for the held-out days (at most one state per 5 minutes). Components are the median over windows of each window\'s component RMS, so they do not sum exactly to the 3D median.',
    '- **COMSPOC XP (local scoring only).** Their published SGP4-XP sets, propagated through the black-box module and compared with the same-day truth; their set epochs are 1 to 5 days older than the truth, so their errors are at those ages, not at the 24 h of the fitted arms. Never fitted to, never an input; aggregates only.',
    '- **Not measured here.** SDN-GP (not landed), GEO / HEO / cislunar / interplanetary truth (none in the archive), the theory-term ranking (phase 3).', '');
  L.push('## 1. Headline: SDN-GP, best-case SGP4-XP, COMSPOC XP and SGP4, one row per regime', '');
  L.push('Cells read `SDN-GP / best-case XP / COMSPOC XP (local scoring only) / SGP4`. SDN-GP is `pending` until the module lands. Best-case XP is `propagator/sgp4-xp fit` fitted to the same truth on the same windows. A `-` is not scored (COMSPOC needs same-day truth for its set; it is scored only where that exists).', '');
  L.push('| Regime | Windows (XP fitted / SGP4 fitted / attempted) | Fit RMS | Day 1 | Day 2 | Day 3 | Day 3 in-track share (XP / SGP4) | Bytes per object (XP / SGP4) | us per state (XP / SGP4) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const r of t.regimes) {
    const b = t.bench ? { xp: t.bench.find((x) => x.theory === 'SGP4-XP' && (r.id.startsWith('meo') ? x.regime.startsWith('MEO') : x.regime.startsWith('LEO'))), sg: t.bench.find((x) => x.theory === 'SGP4' && (r.id.startsWith('meo') ? x.regime.startsWith('MEO') : x.regime.startsWith('LEO'))) } : null;
    const share = (a) => { const c = a.days[3]?.ric; if (!(c && c.every(Number.isFinite))) return ''; const q = (100 * c[1] ** 2) / (c[0] ** 2 + c[1] ** 2 + c[2] ** 2); return `${q >= 99.5 ? q.toFixed(1) : Math.round(q)} %`; };
    L.push(`| ${r.label} | ${r.xp.fitted} / ${r.sgp4.fitted} / ${r.windows} | ${cell([r.xp.fit.median, r.comspoc?.days?.[0]?.median, r.sgp4.fit.median])} | ${cell(arms(r, 1))} | ${cell(arms(r, 2))} | ${cell(arms(r, 3))} | ${share(r.xp)} / ${share(r.sgp4)} | ${r.xp.elementBytes ?? ''} / ${r.sgp4.elementBytes ?? ''} | ${b ? `${f(b.xp?.usPerState, 0)} / ${f(b.sg?.usPerState, 0)}` : ''} |`);
  }
  for (const m of t.missing) L.push(`| ${m.label} | none | pending / - / - / - | - | - | - | | | |`);
  L.push('', ...t.missing.map((m) => `- ${m.label}: ${m.reason}.`), '');
  L.push('## 2. Held-out error by day: median, mean and 90th percentile (3D, km)', '', '| Regime | Arm | n | Fit | Day 1 | Day 2 | Day 3 |', '| --- | --- | --: | --- | --- | --- | --- |');
  for (const r of t.regimes) for (const [name, a] of [['SGP4-XP', r.xp], ['SGP4', r.sgp4]]) {
    const s = (x) => (x?.n ? `${f(x.median)} / ${f(x.mean)} / ${f(x.p90)}` : '');
    L.push(`| ${r.label} | ${name} | ${a.fitted} | ${s(a.fit)} | ${s(a.days[1])} | ${s(a.days[2])} | ${s(a.days[3])} |`);
  }
  L.push('', '### Paired, windows both fitters fitted: median XP / median SGP4 (share of windows where XP is closer)', '', '| Regime | Windows | Fit | Day 1 | Day 2 | Day 3 |', '| --- | --: | --- | --- | --- | --- |');
  for (const r of t.regimes) { const p = (k) => (r.paired.days[k] ? `${f(r.paired.days[k].medianRatio, 2)} (${Math.round(100 * r.paired.days[k].xpCloser)} %)` : ''); L.push(`| ${r.label} | ${r.paired.windows} | ${p(0)} | ${p(1)} | ${p(2)} | ${p(3)} |`); }
  L.push('', '## 3. Radial / in-track / cross-track split (km, median of per-window component RMS)', '', '| Regime | Arm | Fit R / I / C | Day 1 R / I / C | Day 3 R / I / C |', '| --- | --- | --- | --- | --- |');
  const ric = (c) => (c && c.some(Number.isFinite) ? c.map((v) => f(v)).join(' / ') : '');
  for (const r of t.regimes) {
    for (const [name, a] of [['SGP4-XP', r.xp], ['SGP4', r.sgp4]]) L.push(`| ${r.label} | ${name} | ${ric(a.fitRic)} | ${ric(a.days[1]?.ric)} | ${ric(a.days[3]?.ric)} |`);
    if (r.comspoc) L.push(`| ${r.label} | COMSPOC XP (local scoring only) | | ${ric(r.comspoc.days[1]?.ric)} | ${ric(r.comspoc.days[3]?.ric)} |`);
  }
  L.push('', '## 4. Cost per object', '', '| Regime | Arm | Parameters | Element bytes | Record bytes as returned | Fit time, median ms |', '| --- | --- | --: | --: | --: | --: |');
  for (const r of t.regimes) for (const [name, a] of [['SGP4-XP', r.xp], ['SGP4', r.sgp4]]) L.push(`| ${r.label} | ${name} | ${a.parameters ?? ''} | ${a.elementBytes ?? ''} | ${a.recordBytes ?? ''} | ${f(a.fitMsMedian, 0)} |`);
  if (t.bench) { L.push('', 'One propagated state, microseconds (one `propagate` call over 1441 states, median of repeats, harness overhead included):', '', '| Regime | Theory | us per state | Element bytes |', '| --- | --- | --: | --: |', ...t.bench.map((x) => `| ${x.regime} | ${x.theory} | ${f(x.usPerState, 0)} | ${x.elementBytes} |`)); }
  L.push('', '## 5. Covariance realism against the FFM truth of the same-day Starlinks', '', 'd^2 is the position Mahalanobis distance of the error against each source\'s own covariance (gp-error-model `pair_statistics`); a realistic covariance has mean d^2/3 in [0.8, 1.25] and 95 % coverage in [0.93, 0.97] (the V1c2 rule). Age is in days since the source\'s own epoch: ScenarioEpoch for SynCoPate, the fit epoch for ours.', '', '| Covariance | Age (days) | Objects | Samples | Mean d^2/3 | 95 % coverage | Median object error, km |', '| --- | --- | --: | --: | --: | --: | --: |');
  const names = { 'comspoc-syncopate': 'COMSPOC SynCoPate (local scoring only), with the XP trajectory', 's3kc-sgp4': 'Ours: E14 S3-KC population covariance on SGP4 fitted to the truth', 'sdn-gp': 'SDN-GP' };
  for (const r of t.realism) {
    if (r.all) L.push(`| ${names[r.source]} | all | ${r.all.objects} | ${r.all.samples} | ${f(r.all.meanD2Over3, 2)} | ${f(r.all.coverage95, 2)} | ${f(r.all.medianObjectError)} |`);
    for (const a of r.byAgeDay) L.push(`| ${names[r.source]} | ${a.ageDay}-${a.ageDay + 1} | ${a.objects} | ${a.samples} | ${f(a.meanD2Over3, 2)} | ${f(a.coverage95, 2)} | ${f(a.medianObjectError)} |`);
    if (r.refused) L.push(`| ${names[r.source]} | refused | ${r.refused} | | | | |`);
  }
  L.push(`| ${names['sdn-gp']} | | pending | | | | |`);
  L.push('', '## 6. Starlink against FFM truth by shell stratum and drag tercile', '', 'Stratum `altA-incB`: mean-altitude band A (0: under 420 km, 1: 420-475, 2: 475-520, 3: 520 km and above) and inclination group B (0: under 48 degrees, 1: under 60, 2: under 85, 3: 85 and above). Tercile 0 is the lowest drag exposure. Median RMS in km.', '', '| Cell | Windows | B_eff median (m2/kg) | B_eff at zero | XP fit / day 1 / day 3 | SGP4 fit / day 1 / day 3 |', '| --- | --: | --: | --: | --- | --- |');
  for (const s of t.byShell) L.push(`| ${s.cell} | ${s.windows} | ${f(s.bEffMedian, 4)} | ${s.bEffAtZeroBound} | ${f(s.xp.fit)} / ${f(s.xp.day1)} / ${f(s.xp.day3)} | ${f(s.sgp4.fit)} / ${f(s.sgp4.day1)} / ${f(s.sgp4.day3)} |`);
  const ts = t.truthSet;
  L.push('', '## 7. The Starlink truth set', '', `Fitted ${ts.fitted} satellites (${ts.seatsFitted} registered seats, ${ts.dailyFitted} from the same-day local capture); ${ts.failed} failures. fit_ffm against SpaceX over 0-48 h: RMS median ${f(ts.fitVsSpaceXKm.median)} km, mean ${f(ts.fitVsSpaceXKm.mean)}, 90th percentile ${f(ts.fitVsSpaceXKm.p90)}. B_eff at the zero bound: ${ts.bEffZeroBound}; not converged: ${ts.notConverged}; with detected maneuver events: ${ts.withManeuverEvents}. Median fit CPU ${f(ts.fitCpuSecondsMedian, 0)} s.`, '');
  L.push('By stratum: ' + Object.entries(ts.byStratum).map(([k, v]) => `${k}: ${v}`).join(', ') + '.', '');
  if (Object.keys(ts.failureReasons).length) L.push('Failures: ' + Object.entries(ts.failureReasons).map(([k, v]) => `${v} x ${k}`).join('; ') + '.', '');
  L.push('Truth inventory by regime: [inventory.md](inventory.md).', '');
  return L.join('\n');
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const t = build();
  const file = path.join(results, 'tables.json');
  if (process.argv.includes('--check')) {
    const committed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const same = JSON.stringify(committed) === JSON.stringify(JSON.parse(JSON.stringify(t)));
    console.log(same ? 'tables.json reproduced' : 'tables.json DIFFERS from the recorded rows');
    process.exit(same ? 0 : 1);
  }
  write(file, t);
  fs.writeFileSync(path.join(results, 'README.md'), `${markdown(t)}\n`);
  console.log(`tables written; starlink fitted ${t.truthSet.fitted}; windows ${t.regimes.map((r) => `${r.id}:${r.windows}`).join(' ')}`);
}
