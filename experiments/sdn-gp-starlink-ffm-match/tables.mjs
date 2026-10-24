// Aggregation: the recorded window rows (statistics only) -> results/sdn-gp-starlink-ffm-match/tables.json and README.md.
// Everything in the committed tables is computed here from the rows; nothing is typed. Counting and ordering only.
//   node experiments/sdn-gp-starlink-ffm-match/tables.mjs [--check]   (--check recomputes and compares with the committed tables.json)
import fs from 'node:fs';
import path from 'node:path';
import { config, store, results, write, sha256, read } from './common.mjs';
import { quantile, mean } from './lib/windows.mjs';
import { source as licenceSource } from '../../harness/data-licenses.mjs';

const REGIMES = [
  { id: 'leo-starlink-ffm', label: 'LEO, Starlink, FFM-propagated truth' },
  { id: 'leo-starlink-ffm-clean', label: 'LEO, Starlink, FFM truth, clean: fit converged and B_eff between 0 and 0.5 m2/kg' },
  { id: 'leo-starlink-ffm-drag', label: 'LEO, Starlink, FFM truth, B_eff between 0 and 0.5 m2/kg (drag acts)' },
  { id: 'leo-starlink-ffm-decay', label: 'LEO, Starlink, FFM truth, B_eff above 0.5 m2/kg (more than ten times a physical value: lowering or decaying objects)' },
  { id: 'leo-starlink-ffm-b0', label: 'LEO, Starlink, FFM truth, B_eff at the zero bound (net thrust not representable)' },
  { id: 'leo-starlink-spacex', label: 'LEO, Starlink, SpaceX forecast (inside the span, day 1)' },
  { id: 'leo-iss', label: 'LEO, ISS (NASA OEM of 2026-10-07)' },
  { id: 'leo-iss-daily', label: 'LEO, ISS (NASA OEM of 2026-10-21, one window from its start)' },
  { id: 'leo-slr', label: 'LEO, laser-ranged (ILRS NSGF)' },
  { id: 'meo-gnss', label: 'MEO, GPS / GLONASS / Galileo (ESA final)' },
  { id: 'meo-slr', label: 'MEO, laser-ranged (LAGEOS, Etalon, LARES-2)' },
  { id: 'leo-slr-current', label: 'LEO, laser-ranged spheres (ILRS NSGF rapid orbits of 2026-10-08 to 10-23, via CDDIS)' },
  { id: 'meo-slr-current', label: 'MEO, laser-ranged (LARES-2 NSGF rapid orbits of 2026-10; LAGEOS and Etalon ILRS combined weekly orbits of 2026-09, via CDDIS)' },
  { id: 'igso-gnss', label: 'IGSO, BeiDou-2 and QZSS-2 (GFZ MGEX rapid)' },
  { id: 'geo-gnss', label: 'GEO, BeiDou-2 and QZSS-3 (GFZ MGEX rapid)' },
  { id: 'heo-gp', label: 'HEO, THEMIS A, D, E and Chandra (NAIF SPK), 24 h fit' },
  { id: 'heo-gp-72h', label: 'HEO, THEMIS A, D, E and Chandra (NAIF SPK), 72 h fit' },
  { id: 'heo-tess', label: 'HEO, TESS (13.7 day orbit; MAST definitive ephemeris), 24 h fit' },
  { id: 'heo-tess-72h', label: 'HEO, TESS (13.7 day orbit; MAST definitive ephemeris), 72 h fit' },
  { id: 'meo-gnss-rapid', label: 'MEO, GPS / GLONASS / Galileo / BeiDou (GFZ rapid, 2026-10-11 to 2026-10-22)' },
  { id: 'igso-gnss-rapid', label: 'IGSO, BeiDou and QZSS (GFZ rapid, 2026-10-11 to 2026-10-22)' },
  { id: 'geo-gnss-rapid', label: 'GEO, BeiDou (GFZ rapid, 2026-10-11 to 2026-10-22)' },
  { id: 'heo-artemis2', label: 'HEO, Artemis II high-Earth-orbit checkout (one short arc: 8 h fit, 12.85 h held out as day 1)' },
];
const AWAITING = [ // regimes with truth in the archive that Earth-centred SGP4 and SGP4-XP do not describe: awaiting SDN-GP
  { id: 'cislunar', label: 'Cislunar, Earth-centred transfers (Artemis I, Artemis II) and Earth-Moon libration or distant-retrograde orbits (CAPSTONE, Artemis I)', mission: 'artemis2', packs: ['artemis2-cislunar', 'artemis1-cislunar', 'capstone-nrho', 'artemis1-lunar'], reason: 'the Moon dominates; NAIF SPK type 13 and JPL Horizons vector tables, readable' },
  { id: 'lunar', label: 'Lunar-centred (LRO, Danuri)', mission: 'lro', packs: ['lro-lunar', 'danuri-lunar'], reason: 'Moon-centred; NAIF SPK type 13 and JPL Horizons vector tables, readable' },
  { id: 'interplanetary', label: 'Interplanetary: Sun-centred cruise (Psyche, Lucy, Juno) and Jupiter-centred orbits (Juno)', mission: 'psyche', packs: ['psyche-cruise', 'lucy-cruise-rec', 'lucy-cruise-ref', 'juno-cruise', 'juno-jupiter'], reason: 'Sun- or Jupiter-centred; JPL Horizons vector tables (the NAIF kernels of these missions are SPK type 1, unreadable by files/orbit-products 0.1.4)' },
];
const DAYS = [1, 2, 3];
const kernelOf = (mission) => { // metadata of the NAIF kernel (results/kernels.json, written by inventory.mjs)
  const file = path.join(results, 'kernels.json');
  const k = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).rows.find((r) => r.mission === mission && r.file.endsWith('.bsp')) : null;
  return k ? { file: k.file, span: k.span, types: k.types, centers: k.centers } : null;
};

const readJsonl = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : []);

const regimeWindowsFile = () => { const f = path.join(results, 'regime-windows.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
const preparedOf = (names) => { // the truth packs and windows prepared for SDN-GP (regime-windows.mjs)
  const rw = regimeWindowsFile();
  return (names ?? []).map((n) => { const p = rw?.packs.find((x) => x.name === n); const w = rw?.windows[n]; return p ? { name: n, center: p.center, source: p.source, startUtc: p.startUtc, stopUtc: p.stopUtc, states: p.states, windows: w ? Object.entries(w.byFit).map(([fit, x]) => ({ fitHours: Number(fit), count: x.count })) : [] } : null; }).filter(Boolean);
};
const windowsSummary = () => { const rw = regimeWindowsFile(); return rw ? { packs: rw.packs.map((p) => ({ name: p.name, regime: p.regime, center: p.center, frame: p.frameLabel, source: p.source, states: p.states, startUtc: p.startUtc, stopUtc: p.stopUtc, sha256: p.sha256, windows: rw.windows[p.name] ? Object.entries(rw.windows[p.name].byFit).map(([fit, x]) => ({ fitHours: Number(fit), stepSeconds: x.stepSeconds, count: x.count })) : [], rule: rw.windows[p.name]?.rule ?? null })), heliocentric: rw.heliocentric } : null; };

export function collect() {
  const windows = [];
  const dir = path.join(store, 'rows/starlink');
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir).filter((n) => /^\d+\.json$/.test(n)).sort()) {
      const r = JSON.parse(fs.readFileSync(path.join(dir, f)));
      const meta = { norad: r.norad, population: r.population, stratum: r.stratum, tercile: r.tercile, bEff: r.fit?.bEffM2Kg, bEffAtZeroBound: r.fit?.bEffAtZeroBound };
      if (r.ffm) { windows.push({ regime: 'leo-starlink-ffm', ...r.ffm, meta }); windows.push({ regime: meta.bEffAtZeroBound ? 'leo-starlink-ffm-b0' : meta.bEff > 0.5 ? 'leo-starlink-ffm-decay' : 'leo-starlink-ffm-drag', ...r.ffm, meta }); if (r.fit?.convergence === 'converged' && !meta.bEffAtZeroBound && meta.bEff <= 0.5) windows.push({ regime: 'leo-starlink-ffm-clean', ...r.ffm, meta }); }
      if (r.spacex) windows.push({ regime: 'leo-starlink-spacex', ...r.spacex, meta });
    }
  }
  for (const [source, map] of [['iss', () => 'leo-iss'], ['iss-daily', () => 'leo-iss-daily'], ['gnss', () => 'meo-gnss'], ['slr-high', () => 'meo-slr'], ['mgex-geo', () => 'geo-gnss'], ['mgex-igso', () => 'igso-gnss'], ['slr-low', (w) => (/LARES-?2/i.test(w.id) ? 'meo-slr' : 'leo-slr')], ['slr-low-current', (w) => (/LARES-?2/i.test(w.id) ? 'meo-slr-current' : 'leo-slr-current')], ['slr-high-current', () => 'meo-slr-current'], ['heo-themis', (w) => (w.fitSeconds === 86400 ? 'heo-gp' : 'heo-gp-72h')], ['heo-chandra', (w) => (w.fitSeconds === 86400 ? 'heo-gp' : 'heo-gp-72h')], ['heo-artemis2', () => 'heo-artemis2'], ['heo-tess', (w) => (w.fitSeconds === 86400 ? 'heo-tess' : 'heo-tess-72h')], ['gnss-rapid', () => 'meo-gnss-rapid'], ['mgex-igso-rapid', () => 'igso-gnss-rapid'], ['mgex-geo-rapid', () => 'geo-gnss-rapid']]) {
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


// The same satellites fitted twice (beforeDir, afterDir each hold truth/<norad>.{json,f64} and rows/starlink/<norad>.json): how far the truth moves.
function refitCompare(beforeDir, afterDir, { onlyCapped }) {
  if (!fs.existsSync(path.join(afterDir, 'truth')) || !fs.existsSync(path.join(beforeDir, 'truth'))) return null;
  const out = [];
  for (const n of fs.readdirSync(path.join(afterDir, 'truth')).filter((x) => /^\d+\.json$/.test(x)).sort()) {
    if (!fs.existsSync(path.join(beforeDir, 'truth', n))) continue;
    const after = read(path.join(afterDir, 'truth', n)), before = read(path.join(beforeDir, 'truth', n));
    if (before.truth.epochUtc !== after.truth.epochUtc || (onlyCapped && before.fit.convergence === 'converged')) continue;
    const a = new Float64Array(fs.readFileSync(path.join(beforeDir, 'truth', n.replace('.json', '.f64'))).buffer.slice(0));
    const c = new Float64Array(fs.readFileSync(path.join(afterDir, 'truth', n.replace('.json', '.f64'))).buffer.slice(0));
    const gap = (h) => { const i = h * 60 * 6; return Math.hypot(a[i] - c[i], a[i + 1] - c[i + 1], a[i + 2] - c[i + 2]); };
    const rowBefore = read(path.join(beforeDir, 'rows/starlink', n)), rowAfter = read(path.join(afterDir, 'rows/starlink', n));
    out.push({ norad: before.norad, converged: after.fit.convergence === 'converged', iterations: after.fit.iterations, bBefore: before.fit.bEffM2Kg, bAfter: after.fit.bEffM2Kg, rmsBefore: before.fit.rmsKm, rmsAfter: after.fit.rmsKm,
      gapKm: [24, 48, 72, 96].map(gap), xpDay3Before: rowBefore.ffm?.xp?.days?.[3]?.rmsKm, xpDay3After: rowAfter.ffm?.xp?.days?.[3]?.rmsKm, boundBefore: before.fit.bEffAtZeroBound, boundAfter: after.fit.bEffAtZeroBound });
  }
  if (!out.length) return null;
  const good = out.filter((x) => x.rmsBefore < 2); // fits that reproduce SpaceX to 2 km (the others are the high-B_eff group, poor with either cap)
  return {
    n: out.length, converged: out.filter((x) => x.converged).length, iterationsMedian: quantile(out.map((x) => x.iterations), 0.5),
    gapKm: [24, 48, 72, 96].map((h, i) => ({ hours: h, median: quantile(out.map((x) => x.gapKm[i]), 0.5), max: quantile(out.map((x) => x.gapKm[i]), 1), maxWhereFitIsGood: quantile(good.map((x) => x.gapKm[i]), 1) })),
    moved: out.filter((x) => x.gapKm[3] > 0.1).map((x) => ({ norad: x.norad, rmsBefore: x.rmsBefore, gap96: x.gapKm[3] })),
    fitsWithRmsUnder2Km: good.length,
    bEffRelativeChangeMedian: quantile(out.map((x) => Math.abs(x.bAfter - x.bBefore) / Math.max(1e-3, x.bBefore)), 0.5),
    rmsBefore: quantile(out.map((x) => x.rmsBefore), 0.5), rmsAfter: quantile(out.map((x) => x.rmsAfter), 0.5),
    xpDay3Before: quantile(out.map((x) => x.xpDay3Before), 0.5), xpDay3After: quantile(out.map((x) => x.xpDay3After), 0.5),
    leavingTheBound: out.filter((x) => x.boundBefore && !x.boundAfter).length, enteringTheBound: out.filter((x) => !x.boundBefore && x.boundAfter).length,
  };
}

export function build() {
  const windows = collect();
  const comspoc = readJsonl(path.join(store, 'rows/comspoc.jsonl'));
  const bench = fs.existsSync(path.join(results, 'bench.json')) ? JSON.parse(fs.readFileSync(path.join(results, 'bench.json'))) : null;
  const regimes = [];
  const statsOf = (r, ws, cs) => ({
    ...r, windows: ws.length, objects: new Set(ws.map((w) => w.id)).size, xp: armStats(ws, 'xp'), sgp4: armStats(ws, 'sgp4'), paired: paired(ws),
    terms: ws.some((w) => w.xp?.ok) ? { bterm: quantile(ws.filter((w) => w.xp?.ok).map((w) => w.xp.bterm), 0.5), agom: quantile(ws.filter((w) => w.xp?.ok).map((w) => w.xp.agom), 0.5), agomShare: ws.filter((w) => w.xp?.ok).filter((w) => w.xp.agom !== 0).length / ws.filter((w) => w.xp?.ok).length, bstar: quantile(ws.filter((w) => w.sgp4?.ok).map((w) => w.sgp4.bstar), 0.5) } : null,
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
    seatsAllocated: fs.existsSync(path.join(results, 'population.json')) ? JSON.parse(fs.readFileSync(path.join(results, 'population.json'))).seatsByStratum : null,
    seatsFittedByStratum: Object.fromEntries([...new Set(fitted.filter((f) => f.population === 'seat').map((f) => f.stratum))].sort().map((s) => [s, fitted.filter((f) => f.population === 'seat' && f.stratum === s).length])),
    fitVsSpaceXKm: spread(fitted.map((f) => f.fit.rmsKm)), bEffZeroBound: fitted.filter((f) => f.fit.bEffAtZeroBound).length,
    notConverged: fitted.filter((f) => f.fit.convergence !== 'converged').length, withManeuverEvents: fitted.filter((f) => f.fit.events > 0).length,
    fitCpuSecondsMedian: quantile(fitted.map((f) => f.fit.cpuSeconds), 0.5),
    xpUnconverged: { ffm: fitted.filter((f) => f.ffm?.xp?.ok && f.ffm.xp.converged === false).length, spacex: fitted.filter((f) => f.spacex?.xp?.ok && f.spacex.xp.converged === false).length },
  };
  const ratios = { xp: [], sgp4: [] };
  for (const w of windows) for (const arm of ['xp', 'sgp4']) for (const d of Object.values(w[arm]?.days ?? {})) if (d.ric?.every(Number.isFinite) && d.rmsKm > 0) ratios[arm].push(Math.hypot(...d.ric) / d.rmsKm);
  const ricConsistency = Object.fromEntries(Object.entries(ratios).map(([arm, list]) => [arm, { n: list.length, min: quantile(list, 0), median: quantile(list, 0.5), max: quantile(list, 1) }]));
  const fl = readJsonl(path.join(store, 'rows/fitlength.jsonl'));
  const fitLength = [24, 48, 72].map((h) => {
    const ok = fl.filter((r) => r.fits?.[h]?.xp && r.fits?.[h]?.sgp4 && [r.fits[h].xp.errorKm, r.fits[h].sgp4.errorKm, r.fits[h].xp.day1Km, r.fits[h].sgp4.day1Km].every(Number.isFinite));
    const med = (arm, key) => quantile(ok.map((r) => r.fits[h][arm][key]), 0.5);
    return { fitHours: h, satellites: ok.length, xp: { fitRmsKm: med('xp', 'fitRmsKm'), errorKm: med('xp', 'errorKm'), day1Km: med('xp', 'day1Km') }, sgp4: { fitRmsKm: med('sgp4', 'fitRmsKm'), errorKm: med('sgp4', 'errorKm'), day1Km: med('sgp4', 'day1Km') } };
  });
  const covRows = readJsonl(path.join(store, 'rows/covariance.jsonl'));
  const realism = ['comspoc-syncopate', 's3kc-sgp4'].map((source) => {
    const rows = covRows.filter((c) => c.source === source && c.n);
    const pool = (list) => ({ objects: new Set(list.map((c) => c.norad)).size, samples: list.reduce((a, c) => a + c.n, 0), meanD2Over3: list.reduce((a, c) => a + c.sumD2, 0) / (3 * Math.max(1, list.reduce((a, c) => a + c.n, 0))), coverage95: list.reduce((a, c) => a + c.within95, 0) / Math.max(1, list.reduce((a, c) => a + c.n, 0)), medianObjectError: quantile(list.map((c) => c.errorKmMedian), 0.5) });
    return { source, refused: covRows.filter((c) => c.source === source && c.refused).length, all: rows.length ? pool(rows) : null, byAgeDay: [...new Set(rows.map((c) => c.ageDay))].sort((a, b) => a - b).map((d) => ({ ageDay: d, ...pool(rows.filter((c) => c.ageDay === d)) })) };
  });

  // truth quality (amendment A6): the fits by convergence and B_eff group, and the refit of the iteration-limit fits
  const groupName = (r) => `${r.fit.convergence === 'converged' ? 'converged' : 'at the 12-iteration cap'}; ${r.fit.bEffAtZeroBound ? 'B_eff at zero' : r.fit.bEffM2Kg > 0.5 ? 'B_eff above 0.5' : 'B_eff 0 to 0.5'}`;
  const byGroup = {};
  for (const r of fitted) (byGroup[groupName(r)] ??= []).push(r);
  const truthQuality = {
    groups: Object.entries(byGroup).sort(([a], [b]) => (a < b ? -1 : 1)).map(([name, list]) => ({
      name, n: list.length, fitRmsKm: { median: quantile(list.map((r) => r.fit.rmsKm), 0.5), p90: quantile(list.map((r) => r.fit.rmsKm), 0.9), max: quantile(list.map((r) => r.fit.rmsKm), 1) },
      bEffMedian: quantile(list.map((r) => r.fit.bEffM2Kg), 0.5), xpDay3: quantile(list.map((r) => r.ffm?.xp?.days?.[3]?.rmsKm), 0.5), sgp4Day3: quantile(list.map((r) => r.ffm?.sgp4?.days?.[3]?.rmsKm), 0.5),
    })),
    refit: null,
  };
  truthQuality.refit = refitCompare(store, path.join(store, 'refit30'), { onlyCapped: false });
  truthQuality.refitPair = refitCompare(path.join(store, 'refitpair/cap12'), path.join(store, 'refitpair/cap30'), { onlyCapped: true });
  if (truthQuality.refit) truthQuality.refit.skippedBecauseTheFileChanged = readJsonl(path.join(store, 'refit30', 'skipped.jsonl')).length;

  // held out against the first hours of newer SpaceX files (newer.mjs)
  const newerRows = readJsonl(path.join(store, 'rows/newer.jsonl'));
  const summarizeNewer = (rows) => ({
    rows: rows.length, satellites: new Set(rows.map((r) => r.norad)).size,
    horizonHours: { min: quantile(rows.map((r) => r.horizonHours), 0), median: quantile(rows.map((r) => r.horizonHours), 0.5), max: quantile(rows.map((r) => r.horizonHours), 1) },
    newestFileStart: rows.map((r) => r.newerStartUtc).sort().at(-1),
    arms: ['spacexOld', 'ffm', 'xp', 'sgp4', 'comspoc'].map((arm) => {
      const list = rows.filter((r) => r.arms[arm]);
      return { arm, n: list.length, median: quantile(list.map((r) => r.arms[arm].rmsKm), 0.5), p90: quantile(list.map((r) => r.arms[arm].rmsKm), 0.9), inTrackShare: quantile(list.map((r) => (r.arms[arm].ric[1] ** 2) / (r.arms[arm].ric.reduce((a, x) => a + x * x, 0) || 1)), 0.5) };
    }),
    ffmByGroup: ['clean', 'bound', 'decay', 'capped'].map((g) => {
      const pick = (r) => (r.bEffAtZeroBound ? 'bound' : r.bEff > 0.5 ? 'decay' : r.converged ? 'clean' : 'capped');
      const list = rows.filter((r) => pick(r) === g);
      return { group: g, n: list.length, median: quantile(list.map((r) => r.arms.ffm.rmsKm), 0.5), p90: quantile(list.map((r) => r.arms.ffm.rmsKm), 0.9), spacexOldMedian: quantile(list.filter((r) => r.arms.spacexOld).map((r) => r.arms.spacexOld.rmsKm), 0.5) };
    }),
  });
  // one block per 8 h of horizon (the files SpaceX serves are a few hours apart, so a re-run adds a later horizon)
  const newerBin = (r) => Math.floor(r.horizonHours / 8) * 8;
  const newer = newerRows.length ? { ...summarizeNewer(newerRows), bins: [...new Set(newerRows.map(newerBin))].sort((a, c) => a - c).map((lo) => ({ lo, hi: lo + 8, ...summarizeNewer(newerRows.filter((r) => newerBin(r) === lo)) })) } : null;


  const packDir = path.join(store, 'pack');
  const packs = fs.existsSync(packDir) ? fs.readdirSync(packDir).filter((n) => n.endsWith('.json')).sort().map((n) => read(path.join(packDir, n))).map((m) => ({ name: m.name, states: m.states, center: m.center, startUtc: m.startUtc, stopUtc: m.stopUtc, sha256: m.sha256 })) : [];

  const heoByObject = [...new Set(windows.filter((w) => w.regime.startsWith('heo-gp')).map((w) => w.id))].sort().flatMap((id) => [86400, 259200].map((fit) => {
    const ws = windows.filter((w) => w.id === id && w.regime.startsWith('heo-gp') && w.fitSeconds === fit);
    return ws.length ? { id, fitHours: fit / 3600, windows: ws.length, xp: armStats(ws, 'xp'), sgp4: armStats(ws, 'sgp4') } : null;
  })).filter(Boolean);

  // COMSPOC XP sets of the GPS and laser-ranged objects: scored once precise products after the set epoch exist (comspoc-precise.mjs)
  const preciseStatusFile = path.join(store, 'rows/comspoc-precise-status.json');
  const preciseRows = readJsonl(path.join(store, 'rows/comspoc-precise.jsonl')).filter((r) => r.days && Object.keys(r.days).length);
  const comspocPrecise = fs.existsSync(preciseStatusFile) ? {
    ...JSON.parse(fs.readFileSync(preciseStatusFile, 'utf8')),
    byKind: ['gnss', 'laser-ranged'].map((kind) => ({ kind, n: preciseRows.filter((r) => r.kind === kind).length, days: [0, 1, 2, 3].map((k) => quantile(preciseRows.filter((r) => r.kind === kind && r.days[k]).map((r) => r.days[k].rmsKm), 0.5)) })),
    gnssByDay: [0, 1, 2, 3].map((k) => { const rs = preciseRows.filter((r) => r.kind === 'gnss' && r.days[k]); return { k, n: rs.length, median: quantile(rs.map((r) => r.days[k].rmsKm), 0.5), p90: quantile(rs.map((r) => r.days[k].rmsKm), 0.9), ric: [0, 1, 2].map((i) => comp(rs.map((r) => r.days[k].ric), i)) }; }),
    slrByDay: [0, 1, 2, 3].map((k) => { const rs = preciseRows.filter((r) => r.kind === 'laser-ranged' && r.days[k]); return { k, n: rs.length, median: quantile(rs.map((r) => r.days[k].rmsKm), 0.5), max: quantile(rs.map((r) => r.days[k].rmsKm), 1), ric: [0, 1, 2].map((i) => comp(rs.map((r) => r.days[k].ric), i)) }; }),
    gnssOutliers: preciseRows.filter((r) => r.kind === 'gnss' && r.days[0]?.rmsKm > 5).map((r) => ({ norad: r.norad, setEpochUtc: r.setEpochUtc, day0Km: r.days[0].rmsKm })),
    gnssEpochs: (() => { const e = preciseRows.filter((r) => r.kind === 'gnss').map((r) => r.setEpochUtc.slice(0, 10)).sort(); return { first: e[0], last: e.at(-1) }; })(),
  } : null;

  // COMSPOC XP sets scored against the GFZ rapid orbits: by days since the set's epoch (day 1 = the first 24 h after it), attached to the rapid-orbit regime of the same class
  for (const [id, kind, klass] of [['meo-gnss-rapid', 'gnss', 'meo'], ['igso-gnss-rapid', 'gnss', 'igso'], ['geo-gnss-rapid', 'gnss', 'geo'], ['leo-slr-current', 'laser-ranged', 'leo'], ['meo-slr-current', 'laser-ranged', 'meo']]) {
    const rs = preciseRows.filter((r) => r.kind === kind && (kind === 'gnss' ? r.gnssClass : r.slrClass) === klass);
    const regime = regimes.find((x) => x.id === id);
    if (!regime || !rs.length) continue;
    const day = (k) => ({ ...spread(rs.filter((r) => r.days[k]).map((r) => r.days[k].rmsKm)), ric: [0, 1, 2].map((i) => comp(rs.filter((r) => r.days[k]).map((r) => r.days[k].ric), i)) });
    regime.comspoc = { alignment: 'epoch', objects: rs.length, days: { 1: day(0), 2: day(1), 3: day(2) } };
  }

  return { generatedFrom: 'recorded window rows (statistics only)', ricConsistency, fitLength, realism, config: { fitHours: config.windows.fitHours, leadDays: config.windows.leadDays, minimumCoverage: config.windows.minimumCoverage }, regimes, awaiting: AWAITING.map((a) => ({ ...a, kernel: kernelOf(a.mission), prepared: preparedOf(a.packs) })), regimeWindows: windowsSummary(), byShell, truthSet, truthQuality, newer, comspocPrecise, packs, heoByObject, bench: bench?.rows ?? null };
}

// ---- markdown ----
const fx = (x) => (Number.isFinite(x) ? x.toExponential(2) : '');
const f = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(d));
const arms = (r, k) => [r.xp.days[k]?.median, r.comspoc?.days?.[k]?.median, r.sgp4.days[k]?.median];
const cell = (vals) => `pending / ${vals.map((v) => (Number.isFinite(v) ? f(v) : '-')).join(' / ')}`;

function findings(t) {
  const main = t.regimes.filter((r) => !/-(aligned|drag|b0|decay|clean|72h)$/.test(r.id) && r.id !== 'heo-artemis2' && r.xp.fitted);
  const get = (id) => t.regimes.find((r) => r.id === id);
  const out = [];
  const share = (a) => { const c = a.days[3]?.ric; return c && c.every(Number.isFinite) ? (100 * c[1] ** 2) / (c[0] ** 2 + c[1] ** 2 + c[2] ** 2) : null; };
  const shares = main.map((r) => [r, share(r.xp)]).filter(([, v]) => v !== null);
  const leo = shares.filter(([r]) => r.id.startsWith('leo')), meo = shares.filter(([r]) => r.id.startsWith('meo'));
  const geo = shares.filter(([r]) => /^(igso|geo)/.test(r.id));
  const range = (list) => `${f(Math.min(...list.map(([, v]) => v)), 1)} to ${f(Math.max(...list.map(([, v]) => v)), 1)} %`;
  if (leo.length && meo.length) out.push(`- The in-track component carries ${range(leo)} of the day-3 squared error of SGP4-XP in the LEO regimes, ${range(meo)} in MEO${geo.length ? ` and ${range(geo)} in IGSO and GEO` : ''}: the terms that can buy accuracy are the along-track ones (drag and thrust, secular rate, time variation of density).`);
  const fitRatio = main.map((r) => r.paired.days[0]?.medianRatio).filter(Number.isFinite);
  const leoFit = main.filter((r) => r.id.startsWith('leo')).map((r) => r.paired.days[0]?.medianRatio).filter(Number.isFinite);
  const tight = main.filter((r) => r.paired.days[0] && r.paired.days[0].medianRatio < 0.5);
  if (leoFit.length && tight.length) out.push(`- The fit itself: in LEO XP and SGP4 fit alike (median RMS ratio ${f(Math.min(...leoFit), 2)} to ${f(Math.max(...leoFit), 2)}, about ${f(get('leo-starlink-ffm')?.xp.fit.median, 2)} km, a common floor, which points at short-period terms that both theories leave out); where the orbit is high XP fits much tighter than SGP4: ${tight.map((r) => `${r.label} ${f(1 / r.paired.days[0].medianRatio, 1)} times (${f(r.xp.fit.median, 3)} against ${f(r.sgp4.fit.median, 3)} km)`).join('; ')}.`);
  const d3 = main.map((r) => [r.label, r.paired.days[3]?.medianRatio]).filter(([, v]) => Number.isFinite(v));
  if (d3.length) out.push(`- Held-out day 3, median XP / median SGP4: ${d3.map(([l, v]) => `${l} ${f(v, 2)}`).join('; ')}.`);
  const alignedFfm = get('leo-starlink-ffm-aligned');
  if (alignedFfm?.comspoc?.days?.[1]?.n) out.push(`- COMSPOC XP sets, scored on the ${alignedFfm.comspoc.objects} same-day Starlinks at an age of ${f(alignedFfm.comspoc.ageDays.median, 1)} days (median) at the start of the truth: median 3D error ${f(alignedFfm.comspoc.days[1].median, 1)} / ${f(alignedFfm.comspoc.days[2]?.median, 1)} / ${f(alignedFfm.comspoc.days[3]?.median, 1)} km on days 1 / 2 / 3, against ${f(alignedFfm.xp.days[1].median, 1)} / ${f(alignedFfm.xp.days[2].median, 1)} / ${f(alignedFfm.xp.days[3].median, 1)} km for XP fitted to the truth. The ages differ, so this is a scoreboard, not a like-for-like comparison.`);
  if (alignedFfm?.comspoc?.days?.[0]?.n && alignedFfm.xp.days[3]?.n) out.push(`- At a matched age (the set\'s epoch plus about 3 to 4 days) the COMSPOC XP error is ${f(alignedFfm.comspoc.days[0].median, 1)} km (its first truth day, median age at the start ${f(alignedFfm.comspoc.ageDays.median, 1)} days) against ${f(alignedFfm.xp.days[3].median, 1)} km for XP fitted to the truth (held-out day 3, age 3 to 4 days from the fit epoch) and ${f(alignedFfm.sgp4.days[3].median, 1)} km for SGP4, on the same ${alignedFfm.comspoc.objects} Starlinks.`);
  const m123File = path.join(results, 'm123.json');
  if (fs.existsSync(m123File)) { // section 12: the fit floor against zonal-only gravity
    const m = JSON.parse(fs.readFileSync(m123File, 'utf8')), g = (n) => m.summaries.find((x) => x.group === n);
    const a = g('starlink-inc1'), i = g('iss'), l = g('lageos1');
    if (a && i && l) out.push(`- The LEO fit floor is tesseral gravity (section 12, FFM-1 re-propagated with the same force model and the field cut to zonals): the in-track fit RMS of SGP4-XP falls from ${f(a.floor.xp.full.median, 0)} to ${f(a.floor.xp.zonal.median, 0)} m on the 53 degree Starlink shell (predicted floor 384 m), ${f(i.floor.xp.full.median, 0)} to ${f(i.floor.xp.zonal.median, 0)} m on the ISS (394 m) and ${f(l.floor.xp.full.median, 0)} to ${f(l.floor.xp.zonal.median, 0)} m on LAGEOS-1 (110 m), and the held-out day-3 error from ${f(a.days.xp.full[3].median, 1)} to ${f(a.days.xp.zonal[3].median, 1)} km, ${f(i.days.xp.full[3].median, 1)} to ${f(i.days.xp.zonal[3].median, 1)} km and ${f(l.days.xp.full[3].median, 2)} to ${f(l.days.xp.zonal[3].median, 2)} km.`);
  }
  const syn = t.realism.find((r) => r.source === 'comspoc-syncopate')?.all, ours = t.realism.find((r) => r.source === 's3kc-sgp4')?.all;
  if (syn && ours) out.push(`- Covariance realism against the FFM truth (target mean d^2/3 in [0.8, 1.25], coverage in [0.93, 0.97]): SynCoPate ${f(syn.meanD2Over3, 1)} and ${f(syn.coverage95, 2)}; ours (E14 S3-KC on SGP4) ${f(ours.meanD2Over3, 1)} and ${f(ours.coverage95, 2)}. Both are overconfident against this truth.`);
  return out;
}


function refitSentence(tq) {
  const parts = [tq.refit, tq.refitPair].filter(Boolean);
  if (!parts.length) return '';
  const n = parts.reduce((a, r) => a + r.n, 0), good = parts.reduce((a, r) => a + r.fitsWithRmsUnder2Km, 0);
  const maxGood = Math.max(...parts.map((r) => r.gapKm[3].maxWhereFitIsGood));
  const median = Math.max(...parts.map((r) => r.gapKm[3].median));
  return `; refitted with a cap of 30 on ${n} of them (${parts.map((r) => `${r.converged} of ${r.n} converge`).join(' and ')}, about ${f(Math.max(...parts.map((r) => r.iterationsMedian)), 0)} iterations), the truth moves by a median of at most ${f(median)} km at 96 h and, for the ${good} fits that reproduce SpaceX to 2 km, by at most ${f(maxGood)} km`;
}

export function markdown(t) {
  const L = [];
  L.push('# G1: SDN-GP against FFM-propagated Starlink and precise orbits (baselines)', '');
  L.push('Generated by `experiments/sdn-gp-starlink-ffm-match/tables.mjs` from recorded window rows. Position errors are 3D RMS in km unless a column says otherwise; every cell is a median over windows. Fit interval 24 h; held-out day k is (24 h + (k-1) d, 24 h + k d].', '');
  L.push('## Method in brief', '',
    '- **Truth.** Starlink: the satellite\'s SpaceX forecast is fitted over 0-48 h (never across the 48 h join) by `analysis/od fit_ffm` (FFM-1, NRLMSISE-00 drag with s = 0 because no $DCL is published yet, kappa x drag folded into B_eff, Cr*A/m locked), then FFM-1 propagates the fitted state for 96 h at 60 s. That trajectory is the truth of the `FFM-propagated truth` row; the `SpaceX forecast` row fits the same two theories to SpaceX\'s own states (24 h) and scores day 1 inside its span, strictly before the 48 h join. Precise orbits: ESA final GNSS, GFZ MGEX rapid GEO and IGSO satellites, ILRS combined weekly and NSGF arcs, NASA ISS OEM, windows as in the sgp4-xp measurement.',
    '- **Windows.** 24 h fit from the first state; SGP4 by `fit_elements` (six mean elements and B*), SGP4-XP by `propagator/sgp4-xp fit` (those and BTERM, AGOM). One window per Starlink; the other sources use the strides of `config.json`.',
    '- **RIC.** SGP4: `element_residuals` (RTN of the truth). SGP4-XP: the module\'s own fit split for the fit, and the fitted set propagated by the module and compared by `pair_statistics` for the held-out days (at most one state per 5 minutes). Components are the median over windows of each window\'s component RMS, so they do not sum exactly to the 3D median.',
    `- **RIC check.** Over all held-out days of all windows the three components recombine to the module\'s own 3D RMS to ${f(t.ricConsistency.xp.min, 4)} to ${f(t.ricConsistency.xp.max, 4)} for SGP4-XP (the thinning to one state per 5 minutes) and ${f(t.ricConsistency.sgp4.min, 4)} to ${f(t.ricConsistency.sgp4.max, 4)} for SGP4.`,
    '- **Environment.** Earth orientation: the local IERS daily finals of 2026-10-13. Space weather: the `data-source/space-weather` rows (GFZ, NOAA SWPC) through 2026-10-25, then NOAA SWPC 45-day daily Ap and F10.7 for the eight days after (Kp and the 81-day average held), because the module\'s rows end where its Kp forecast ends and the truth runs 96 h. Planetary kernel DE440s. Density correction s = 0 (no $DCL is published yet). Hashes are in `manifest.json`.',
    '- **COMSPOC XP (local scoring only).** Their published SGP4-XP sets, propagated through the black-box module and compared with the same-day truth; their set epochs are 1 to 5 days older than the truth, so their errors are at those ages, not at the 24 h of the fitted arms. Never fitted to, never an input; aggregates only.',
    '- **Plan.** `experiments/sdn-gp-starlink-ffm-match/PLAN.md`, frozen by its first commit, with amendments A1 (headline table), A2 (start states, weather extension, the COMSPOC scoring arm), A3 (fit length), A4 (GEO and IGSO windows from the GFZ MGEX set found after registration), A5 (spacecraft truth from NAIF: highly elliptical orbits scored, cislunar, lunar and heliocentric awaiting SDN-GP) A6 (truth quality: the iteration cap and the zero bound) A7 to A7d (the LEO fit floor against zonal-only gravity, DESIGN.md M1 to M3: section 12) and A8 to A8c (current GNSS truth from the GFZ rapid orbits, TESS from MAST, CAPSTONE, Artemis I and Danuri from JPL Horizons, windows prepared for SDN-GP: section 1 and section 13).',
    '- **Not measured here.** SDN-GP (not landed); interplanetary truth (the Psyche, Lucy and Juno kernels are SPK type 1, unreadable by `files/orbit-products` 0.1.4); GEO operator ephemerides (SES, Intelsat) are not stored; the theory-term ranking (phase 3). Lunar and cislunar truth is prepared for SDN-GP (section 13), not scored.', '');
  L.push('## 1. Headline: SDN-GP, best-case SGP4-XP, COMSPOC XP and SGP4, one row per regime', '');
  L.push('Cells read `SDN-GP / best-case XP / COMSPOC XP (local scoring only) / SGP4`. SDN-GP is `pending` until the module lands. Best-case XP is `propagator/sgp4-xp fit` fitted to the same truth on the same windows. `-` is not scored. A COMSPOC value marked `*` is its median over the objects it could be scored on (same-day truth only); section 1b gives XP and SGP4 on exactly those objects. A COMSPOC value marked `†` (the GFZ rapid-orbit regimes) is by days since the epoch of the set itself, day 1 being the first 24 h after it, against the rapid orbit; XP and SGP4 are by days since the end of their 24 h fit, so the ages are not the same (no COMSPOC fit span is known). For COMSPOC the Fit RMS cell is its error over the first 24 h of the truth: nothing is fitted to it.', '');
  const isExtra = (r) => /-(aligned|drag|b0|decay|clean|72h)$/.test(r.id) || r.id === 'heo-artemis2';
  const header = ['| Regime | Windows (XP fitted / SGP4 fitted / attempted) | Fit RMS | Day 1 | Day 2 | Day 3 | Day 3 in-track share (XP / SGP4) | Bytes per object (XP / SGP4) | us per state (XP / SGP4) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  const comspocOf = (r) => (r.comspoc ? { c: r.comspoc, mark: r.comspoc.alignment === 'epoch' ? '†' : '' } : t.regimes.find((x) => x.id === `${r.id}-aligned`)?.comspoc ? { c: t.regimes.find((x) => x.id === `${r.id}-aligned`).comspoc, mark: '*' } : { c: null, mark: '' });
  const cellOf = (xpv, csv, sgv, mark) => `pending / ${[xpv, csv, sgv].map((v, k) => (Number.isFinite(v) ? f(v) + (k === 1 ? mark : '') : '-')).join(' / ')}`;
  const row = (r) => {
    const key = /^(geo|igso|heo)/.test(r.id) ? 'GEO' : r.id.startsWith('meo') ? 'MEO' : 'LEO';
    const b = t.bench ? { xp: t.bench.find((x) => x.theory === 'SGP4-XP' && x.regime.startsWith(key)), sg: t.bench.find((x) => x.theory === 'SGP4' && x.regime.startsWith(key)) } : null;
    const share = (a) => { const c = a.days[3]?.ric; if (!(c && c.every(Number.isFinite))) return ''; const q = (100 * c[1] ** 2) / (c[0] ** 2 + c[1] ** 2 + c[2] ** 2); return `${q >= 99.5 ? q.toFixed(1) : Math.round(q)} %`; };
    const { c, mark } = comspocOf(r);
    const day = (k) => cellOf(r.xp.days[k]?.median, c?.days?.[k]?.median, r.sgp4.days[k]?.median, mark);
    return `| ${r.label} | ${r.xp.fitted} / ${r.sgp4.fitted} / ${r.windows} | ${cellOf(r.xp.fit.median, c?.days?.[0]?.median, r.sgp4.fit.median, mark)} | ${day(1)} | ${day(2)} | ${day(3)} | ${share(r.xp)} / ${share(r.sgp4)} | ${r.xp.elementBytes ?? ''} / ${r.sgp4.elementBytes ?? ''} | ${b ? `${f(b.xp?.usPerState, 0)} / ${f(b.sg?.usPerState, 0)}` : ''} |`;
  };
  const spanOf = (a) => (a.prepared?.length ? a.prepared.map((p) => `${p.name.split('-')[0]} ${p.startUtc.slice(0, 10)} to ${p.stopUtc.slice(0, 10)}, ${p.windows.reduce((n, w) => n + w.count, 0)} windows`).join('; ') : a.kernel ? `${a.kernel.span.slice(0, 10)} to ${a.kernel.span.split(' to ')[1].slice(0, 10)}` : 'none');
  L.push(...header, ...t.regimes.filter((r) => !isExtra(r)).map(row), ...t.awaiting.map((a) => `| ${a.label} | truth ${spanOf(a)} | pending / awaiting SDN-GP | awaiting SDN-GP | awaiting SDN-GP | awaiting SDN-GP | | | |`));
  L.push('', ...t.awaiting.map((a) => `- ${a.label}: awaiting SDN-GP, SGP4 and SGP4-XP do not describe it (${a.reason}); ${a.prepared?.length ? `${a.prepared.length} truth pack(s) and ${a.prepared.reduce((n, p) => n + p.windows.reduce((m, w) => m + w.count, 0), 0)} windows prepared (section 13)` : 'no truth pack yet'}.`),
    ...(t.regimeWindows ? [`- Truth packs for these regimes, ready for SDN-GP (local; derived from public NAIF kernels by files/orbit-products and foundation/time, and from JPL Horizons vector tables; [unix ms, x, y, z, vx, vy, vz] per state in km and km/s, inertial axes, UTC): ${t.regimeWindows.packs.map((k) => `${k.name}, ${k.states} states, ${k.center}-centred, ${k.startUtc.slice(0, 10)} to ${k.stopUtc.slice(0, 10)}`).join('; ')}.`] : []),
    '- GEO operator ephemerides: none are stored locally (operator-capture holds Starlink only; SES, Intelsat, OneWeb and Kuiper exist as CelesTrak SupGP element sets, not ephemerides); the GEO rows are the GFZ MGEX BeiDou-2 and QZSS-3 orbits of 2025 and, for October 2026, the one GEO satellite in the GFZ rapid MGEX file (QZS-2G).',
    '- NAIF does not host TESS, CAPSTONE, Artemis I or Danuri kernels (checked 2026-10-23). With the approvals of 2026-10-24 TESS comes from STScI MAST (definitive ephemeris SPK) and CAPSTONE, Artemis I and Danuri from JPL Horizons (amendments A8 to A8c); THEMIS, Chandra and Artemis II stay as further HEO and cislunar truth.', '');
  L.push('### 1b. The same objects the COMSPOC sets were scored on, and the Starlink B_eff split', '', ...header, ...t.regimes.filter(isExtra).map(row), '');

  if (t.heoByObject.length) {
    L.push('### HEO by object (median km: fit / day 1 / day 3)', '', '| Object | Fit length | Windows | SGP4-XP | SGP4 |', '| --- | --: | --: | --- | --- |',
      ...t.heoByObject.map((o) => `| ${o.id} | ${o.fitHours} h | ${o.windows} | ${f(o.xp.fit.median)} / ${f(o.xp.days[1]?.median)} / ${f(o.xp.days[3]?.median)} (${o.xp.fitted} fitted) | ${f(o.sgp4.fit.median)} / ${f(o.sgp4.days[1]?.median)} / ${f(o.sgp4.days[3]?.median)} (${o.sgp4.fitted} fitted) |`), '');
  }

  L.push('### What the table says (generated from the numbers above)', '', ...findings(t), '');
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
  L.push('', 'Element bytes are the size-prefixed `$OMM` record holding only the mean elements and the drag (and solar) terms of the set; the record as returned carries the fit statistics too. A two-line text set (the format COMSPOC publishes its XP sets in) is 138 characters.');
  if (t.bench) { L.push('', 'One propagated state, microseconds (one `propagate` call over 5761 states, four days at 60 s, median of repeats, harness overhead included):', '', '| Regime | Theory | us per state | Element bytes |', '| --- | --- | --: | --: |', ...t.bench.map((x) => `| ${x.regime} | ${x.theory} | ${f(x.usPerState, 0)} | ${x.elementBytes} |`)); }
  L.push('', 'Fitted terms (medians over windows): the two extra terms of SGP4-XP against the single B* of SGP4. AGOM is the solar-radiation term; a zero median means the fit left it at zero in most windows.', '', '| Regime | XP BTERM | XP AGOM | XP windows with AGOM != 0 | SGP4 B* |', '| --- | --: | --: | --: | --: |');
  for (const r of t.regimes) if (r.terms) L.push(`| ${r.label} | ${fx(r.terms.bterm)} | ${fx(r.terms.agom)} | ${r.terms.agomShare === null ? '' : `${Math.round(100 * r.terms.agomShare)} %`} | ${fx(r.terms.bstar)} |`);
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
  L.push('', '## 7. The Starlink truth set', '', `Fitted ${ts.fitted} satellites (${ts.seatsFitted} registered seats, ${ts.dailyFitted} from the same-day local capture); ${ts.failed} failures. fit_ffm against SpaceX over 0-48 h: RMS median ${f(ts.fitVsSpaceXKm.median)} km, mean ${f(ts.fitVsSpaceXKm.mean)}, 90th percentile ${f(ts.fitVsSpaceXKm.p90)}. B_eff at the zero bound: ${ts.bEffZeroBound}; not converged: ${ts.notConverged}; with detected maneuver events: ${ts.withManeuverEvents}. Median fit CPU ${f(ts.fitCpuSecondsMedian, 0)} s. SGP4-XP fits the module flags as not converged are kept in the tables: ${ts.xpUnconverged.ffm} of ${ts.fitted} on the FFM truth, ${ts.xpUnconverged.spacex} of ${ts.fitted} on the SpaceX states.`, '');
  L.push('Fitted by stratum, all populations: ' + Object.entries(ts.byStratum).map(([k, v]) => `${k}: ${v}`).join(', ') + '.', '');
  if (ts.seatsAllocated) L.push('Registered seats fitted / allocated by stratum: ' + Object.keys(ts.seatsAllocated).sort().map((k) => `${k}: ${ts.seatsFittedByStratum[k] ?? 0} / ${ts.seatsAllocated[k]}`).join(', ') + '. The seats were drawn round-robin over the strata and drag terciles, so a partial run covers every stratum before it deepens any.', '');
  if (Object.keys(ts.failureReasons).length) L.push('Failures: ' + Object.entries(ts.failureReasons).map(([k, v]) => `${v} x ${k}`).join('; ') + '.', '');
  L.push('Truth inventory by regime: [inventory.md](inventory.md).', '');
  if (t.fitLength.some((x) => x.satellites)) {
    L.push('## 8. Fit length on the FFM truth (arm 6, amendment A3)', '', 'Each fitted Starlink fitted over 24, 48 and 72 h, scored on (a) one common interval, 72 to 96 h after the truth start (the lead behind the fit end is then 48, 24 and 0 h), and (b) the first day after each fit (a fixed lead of 0 to 24 h). Medians over the same satellites, km.', '', '| Fit length | Satellites | XP fit RMS | XP error, 72-96 h | XP error, first day after the fit | SGP4 fit RMS | SGP4 error, 72-96 h | SGP4 error, first day after the fit |', '| --- | --: | --: | --: | --: | --: | --: | --: |');
    for (const x of t.fitLength) if (x.satellites) L.push(`| ${x.fitHours} h | ${x.satellites} | ${f(x.xp.fitRmsKm)} | ${f(x.xp.errorKm)} | ${f(x.xp.day1Km)} | ${f(x.sgp4.fitRmsKm)} | ${f(x.sgp4.errorKm)} | ${f(x.sgp4.day1Km)} |`);
    L.push('');
  }

  const tq = t.truthQuality;
  L.push('## 9. Does the zero bound or the iteration cap bias the FFM-Starlink truth? (amendment A6)', '',
    'Fit RMS is the fit of FFM-1 to SpaceX\'s own forecast over 0-48 h, the measure of how well the truth reproduces the operator. The XP and SGP4 columns are the median day-3 errors against that truth (km).', '',
    '| Group | Fits | B_eff median (m2/kg) | Fit RMS vs SpaceX: median / 90th / max (km) | XP day 3 | SGP4 day 3 |', '| --- | --: | --: | --- | --: | --: |',
    ...tq.groups.map((g) => `| ${g.name} | ${g.n} | ${f(g.bEffMedian, 4)} | ${f(g.fitRmsKm.median)} / ${f(g.fitRmsKm.p90)} / ${f(g.fitRmsKm.max)} | ${f(g.xpDay3)} | ${f(g.sgp4Day3)} |`), '');
  const refitText = (r, what) => `${what}: ${r.n} satellites; ${r.converged} of ${r.n} converge within 30 iterations (median ${r.iterationsMedian}). The truth moves by (median / maximum, km): ${r.gapKm.map((g) => `${f(g.median)} / ${f(g.max)} at ${g.hours} h`).join(', ')}. ${r.moved.length ? `Moved by more than 0.1 km at 96 h: ${r.moved.map((x) => `${x.norad} (fit RMS ${f(x.rmsBefore, 1)} km, moved ${f(x.gap96, 1)} km)`).join(', ')}. ` : 'None moves by more than 0.1 km at 96 h. '}B_eff changes by a median ${f(100 * r.bEffRelativeChangeMedian, 1)} %; the fit RMS against SpaceX goes from ${f(r.rmsBefore)} to ${f(r.rmsAfter)} km (median); the median XP day-3 error against the truth goes from ${f(r.xpDay3Before)} to ${f(r.xpDay3After)} km; ${r.leavingTheBound} left the zero bound and ${r.enteringTheBound} entered it.`;
  if (tq.refit) L.push(refitText(tq.refit, `Refit of the fits that stopped at the registered 12 iterations, on the same SpaceX file (SHA-256 checked), cap 30 (${tq.refit.skippedBecauseTheFileChanged} seat files had changed on SpaceX's server and are in the next paragraph)`), '');
  if (tq.refitPair) L.push(refitText(tq.refitPair, 'Seats whose file had changed: cap 12 and cap 30 both run on the file served now, only the pairs where the cap-12 fit did not converge'), '');
  const pooled = t.regimes.find((r) => r.id === 'leo-starlink-ffm'), clean = t.regimes.find((r) => r.id === 'leo-starlink-ffm-clean'), bound = t.regimes.find((r) => r.id === 'leo-starlink-ffm-b0'), decay = t.regimes.find((r) => r.id === 'leo-starlink-ffm-decay');
  if (pooled && clean && bound && decay) {
    const d = (r, k) => r.xp.days[k];
    L.push(`Effect on the tables (SGP4-XP, day 1 / day 3, median and 90th percentile, km): all ${pooled.windows} truths ${f(d(pooled, 1).median)} / ${f(d(pooled, 3).median)} and ${f(d(pooled, 1).p90)} / ${f(d(pooled, 3).p90)}; the ${clean.windows} clean ones ${f(d(clean, 1).median)} / ${f(d(clean, 3).median)} and ${f(d(clean, 1).p90)} / ${f(d(clean, 3).p90)}; the ${bound.windows} at the zero bound ${f(d(bound, 1).median)} / ${f(d(bound, 3).median)}; the ${decay.windows} above 0.5 m2/kg ${f(d(decay, 1).median)} / ${f(d(decay, 3).median)}. The two limits pull in opposite directions (drag-free truths are easy, decaying ones are hard), so the pooled median moves little while the spread does.`, '');
  }
  L.push('How to read it, in numbers: the registered rows keep the 12-iteration truth. The `clean` row of section 1b (converged, B_eff between 0 and 0.5) is the population on which the tables are least affected by the two limits; compare its day-1 and day-3 medians with the pooled Starlink row. The zero bound is a contract of the T1a module (`analysis/od fit_ffm`, B_eff >= 0): a satellite whose forecast contains net thrust beyond its drag gets a drag-free trajectory, so its truth is easy to match (lower XP and SGP4 errors) and does not follow the operator; those 52 fits are reported apart, not corrected here.', '');
  const nw = t.newer;
  if (nw) {
    const armName = (a) => (a === 'comspoc' ? 'COMSPOC Spacebook XP (local scoring only)' : a === 'spacexOld' ? 'SpaceX earlier forecast' : a === 'ffm' ? 'FFM-1 from the registered fit' : a === 'xp' ? 'SGP4-XP fitted to the FFM truth' : 'SGP4 fitted to the FFM truth');
    L.push('## 10. Held out against the first hours of newer SpaceX files', '',
      `${nw.satellites} fitted Starlinks (${nw.rows} scorings), each scored against the first three hours (every ten minutes) of a file SpaceX served after the file of the registered fit; the newest starts ${nw.newestFileStart.slice(0, 16)}Z. The horizon from the start of the registered fit to those hours is ${f(nw.horizonHours.min, 1)} to ${f(nw.horizonHours.max, 1)} h; the scoring is re-run with \`newer.mjs\` as files arrive (the registered V2 prospective files start 2026-10-24 08:00Z, a horizon of about 20 h), and each pass is reported at its own horizon. Arms: SpaceX's own earlier forecast (where its epochs coincide with the newer file's), FFM-1 from the registered fit, SGP4 and SGP4-XP fitted to the first 24 h of the FFM truth, and COMSPOC's XP set (same-day objects, local scoring only).`, '');
    for (const bin of nw.bins) {
      L.push(`### Horizon ${bin.lo} to ${bin.hi} h (${bin.satellites} Starlinks, median ${f(bin.horizonHours.median, 1)} h)`, '',
        '| Arm | Satellites | Median 3D RMS (km) | 90th percentile | In-track share of the squared error (median) |', '| --- | --: | --: | --: | --: |',
        ...bin.arms.map((a) => `| ${armName(a.arm)} | ${a.n} | ${f(a.median)} | ${f(a.p90)} | ${a.n ? f(a.inTrackShare, 2) : ''} |`), '',
        'FFM-1 against the newer file by truth-quality group (median / 90th percentile, km; SpaceX\'s earlier forecast median beside it):', '',
        '| Group | Satellites | FFM-1 | SpaceX earlier forecast |', '| --- | --: | --- | --: |',
        ...bin.ffmByGroup.filter((g) => g.n).map((g) => `| ${g.group} | ${g.n} | ${f(g.median)} / ${f(g.p90)} | ${f(g.spacexOldMedian)} |`), '');
    }
  } else L.push('## 10. Held out against the first hours of newer SpaceX files', '', 'No newer file scored yet; run `newer.mjs` (re-run after 2026-10-24 08:00Z for the registered prospective files).', '');


  const cp = t.comspocPrecise;
  if (cp) {
    const gnssN = cp.byKind.find((k) => k.kind === 'gnss')?.n ?? 0, slrN = cp.byKind.find((k) => k.kind === 'laser-ranged')?.n ?? 0;
    L.push('### COMSPOC XP sets of the GNSS and laser-ranged objects against precise orbits (local scoring only)', '',
      `${cp.xpSets} COMSPOC XP sets are in the local capture of ${cp.capturedUtc}; ${cp.objectsWithPreciseProducts} of those objects have precise-orbit products in the archive (${cp.gnss} GNSS, ${cp.laserRanged} laser-ranged). **GNSS:** ${gnssN} sets (epochs ${cp.gnssEpochs?.first} to ${cp.gnssEpochs?.last}) are scored against the GFZ rapid orbits of 2026-10-11 to ${cp.newestProductDay.gfzRapid ?? '-'} (amendment A8; the days from ${cp.eopPredictedFromUtc?.slice(0, 10) ?? '-'} use Bulletin A predicted Earth orientation, under 0.15 m). **Laser-ranged:** ${slrN} of the ${cp.laserRanged} sets are scored against the NSGF rapid orbits of the LEO spheres fetched from NASA CDDIS (daily files to ${cp.newestProductDay.nsgfCurrent ?? '-'}; amendments A9 and A9b)${cp.pendingLaserRanged?.length ? `; ${cp.pendingLaserRanged.length} wait (NORAD ${cp.pendingLaserRanged.map((g) => `${g.norad}, epoch ${g.setEpochUtc.slice(0, 10)}`).join('; ')}) because the newest ILRS combined weekly orbits on CDDIS end 2026-10-03` : ''}.${cp.pendingGnss?.length ? ` ${cp.pendingGnss.length} GNSS set(s) wait (${cp.pendingGnss.map((g) => `NORAD ${g.norad}, epoch ${g.setEpochUtc.slice(0, 10)}, ${g.inRapidProducts ? 'in the rapid products but no state after the epoch' : 'not in the rapid products'}`).join('; ')}).` : ''} Re-run \`comspoc-precise.mjs\` as products appear. The ESA final orbits end ${cp.newestProductDay.esa}.`, '');
    const slrRows = (cp.slrByDay ?? []).filter((d) => d.n);
    if (slrRows.length) {
      L.push('Laser-ranged: error of COMSPOC\'s XP set against the NSGF rapid orbit, by days since the set\'s own epoch (median over the sets that have the day; km):', '',
        '| Days after the epoch | Sets | Median 3D | Maximum | Median radial / in-track / cross-track |', '| --- | --: | --: | --: | --- |',
        ...slrRows.map((d) => `| ${d.k} to ${d.k + 1} | ${d.n} | ${f(d.median, 3)} | ${f(d.max, 3)} | ${d.ric.map((v) => f(v, 3)).join(' / ')} |`), '',
        `The error does not grow over the days after the epoch and is almost all in-track: a set that sits off the orbit by a near-constant amount, not one that drifts. That is the form of the fit floor of section 12 (the tesseral in-track variation a mean-element set cannot follow); the best-case XP fit RMS of the LEO sphere row of section 1 is ${f(t.regimes.find((x) => x.id === 'leo-slr-current')?.xp.fit.median)} km.`, '');
    }
    if (cp.gnssByDay) {
      L.push('GNSS: error of COMSPOC\'s XP set against the rapid orbit, by days since the set\'s own epoch (median over the sets that have the day; km):', '',
        '| Days after the epoch | Sets | Median 3D | 90th percentile | Median radial / in-track / cross-track |', '| --- | --: | --: | --: | --- |',
        ...cp.gnssByDay.filter((d) => d.n).map((d) => `| ${d.k} to ${d.k + 1} | ${d.n} | ${f(d.median, 3)} | ${f(d.p90, 3)} | ${d.ric.map((v) => f(v, 3)).join(' / ')} |`), '',
        `${cp.gnssOutliers?.length ? `${cp.gnssOutliers.length} set(s) are far from the rapid orbit on every day (${cp.gnssOutliers.map((o) => `NORAD ${o.norad}, epoch ${o.setEpochUtc.slice(0, 10)}, ${f(o.day0Km, 0)} km in the first day`).join('; ')}): the set describes another orbit than the product does (a satellite being repositioned, or a stale set). The medians are over all sets and are not moved by it. ` : ''}The median error does not rise over the first three days after the epoch; the best-case XP of the headline rows is fitted to the 24 h of the rapid orbit just before the days it is scored on, so the two are not like for like.`, '');
    }
  }


  {
    const ts2 = t.truthSet, tq2 = t.truthQuality;
    const g = (name) => tq2.groups.find((x) => x.name === name);
    const decayMedian = [g('converged; B_eff above 0.5'), g('at the 12-iteration cap; B_eff above 0.5')].filter(Boolean);
    L.push('## 11. Notes for the modules (found here, not changed here)', '',
      `- \`analysis/od fit_ffm\` (T1a): (a) B_eff >= 0 leaves ${ts2.bEffZeroBound} of ${ts2.fitted} fits at the zero bound (orbit raising and other net thrust cannot be represented; their truth is a drag-free trajectory); (b) ${ts2.notConverged} of ${ts2.fitted} fits stop at the 12-iteration default${refitSentence(tq2)}, so the stopping rule or the default cap is too strict; (c) ${decayMedian.reduce((a, x) => a + x.n, 0)} objects need B_eff above 0.5 m2/kg, more than ten times a physical value (continuous lowering or decay, no discrete event detected): they fit SpaceX to a median of 2 to 11 km and are 2 km (median) from a newer file's first hours; a single B_eff cannot represent them.`,
      '- `data-source/space-weather` rows end where the Kp forecast ends (about two days ahead) and `propagator/ffm` refuses any arc past them (`space-weather-out-of-range`); this experiment appended NOAA SWPC 45-day Ap and F10.7 itself (amendment A2).',
      '- `files/orbit-products` 0.1.4 reads SPK types 8, 9 and 13 only: the JPL navigation kernels of Psyche, Lucy and Juno are type 1 (`unsupported-variant`), the Juno merge also holds type 2 (`unsupported-spk-materialization`), TDRSS is type 10 (generated from two-line elements). Its epochs are TDB, so every caller needs `foundation/time` (done here, one call per epoch).', '');
  }

  const m123File = path.join(results, 'm123.md');
  if (fs.existsSync(m123File)) L.push(fs.readFileSync(m123File, 'utf8').trimEnd(), ''); // section 12, written by m123-report.mjs
  if (t.regimeWindows) {
    L.push('## 13. Windows prepared for SDN-GP: lunar, cislunar and heliocentric truth (amendment A8)', '',
      'Truth packs (local: `<store>/pack/`, states in km and km/s, inertial axes of the source, UTC) and the window lists (`regime-windows.json`: window starts and counts, no states) for the regimes SGP4 and SGP4-XP do not describe, so that they score as soon as side B\'s regime extensions exist. A window needs 90 % of its states in the fit span and in each held-out day. `regime-windows.mjs --export <pack> --start <ISO> --fit-hours <h> --out <file.oem>` writes a window\'s fit span as a $OEM (centre and frame named) for SDN-GP to fit; `score-pack.mjs --pack <pack> --start <ISO> --fit-hours <h> --predicted <states.oem>` scores SDN-GP\'s predicted states against the held-out days of that window (radial / in-track / cross-track RMS by day, in the pack\'s centre, through gp-error-model `pair_statistics`).', '',
      '| Pack | Regime | Centre, axes | Source | States (step) | Span | Windows by fit length (held-out days) |', '| --- | --- | --- | --- | --- | --- | --- |',
      ...t.regimeWindows.packs.map((p) => `| ${p.name} | ${p.regime ?? ''} | ${p.center}, ${p.frame} | ${p.source ?? ''} | ${p.states} (${p.windows[0]?.stepSeconds ?? ''} s) | ${p.startUtc.slice(0, 10)} to ${p.stopUtc.slice(0, 10)} | ${p.windows.map((w) => `${w.fitHours} h: ${w.count}`).join('; ')}${p.rule ? ` (days ${p.rule.leadDays[0]} to ${p.rule.leadDays.at(-1)}, every ${p.rule.strideHours} h)` : ''} |`), '',
      `Heliocentric cruise (fit 30 d, held-out days 1 to 15, every 15 d) and Jupiter-centred orbits (fit 66 d, held-out days 1 to 33, every 33 d): ${t.regimeWindows.heliocentric.packs}.`, '');
  }
  const CREDITED = ['spacex-starlink', 'nasa-iss-oem', 'esa-navigation-office', 'nasa-cddis', 'gfz-rapid-gnss', 'ilrs', 'ilrs-nsgf', 'ilrs-cddis', 'gfz-kp', 'noaa-swpc', 'iers', 'jpl-de440', 'jpl-horizons', 'stsci-mast-tess', 'nrlmsise00', 'egm', 'fes2004'];
  L.push('## Credits and terms', '', ...CREDITED.map((id) => `- ${licenceSource(id).credit}`), '- COMSPOC Spacebook (XP sets and SynCoPate trajectories with covariance, captured locally 2026-10-23): scored locally only, never fitted to or used as an input; terms: no commercial use, no redistribution, no derivative works. Only aggregate statistics are published here.', '', 'Every other source and its terms: [docs/data-licenses.md](../../docs/data-licenses.md).', '');
  L.push('## Reproduce, resume, extend', '',
    '- Steps (each reads only the frozen plan and the local archive): `population.mjs`, `truth.mjs --workers N` (resumable: a satellite with a row is skipped; stop with `touch <store>/truth.stop`), `baselines.mjs`, `fetch-kernels.mjs` (paced NAIF fetcher) with `spk-windows.mjs`, `bench.mjs`, `comspoc.mjs`, `covariance.mjs`, `fitlength.mjs`, `refit.mjs`, `newer.mjs` (re-run as newer SpaceX files arrive; `--truth refit30` scores the refitted truth), `m123.mjs --workers N` with `m123-report.mjs` (section 12), `fetch-horizons.mjs`, `fetch-mast-tess.mjs` (needs `NODE_EXTRA_CA_CERTS`, see its header), `fetch-gnss-rapid.mjs` and `gnss-rapid-convert.mjs` (the public sources approved on 2026-10-24, stored in the archive with provenance rows), `horizons-packs.mjs`, `regime-windows.mjs` and `score-pack.mjs` (section 13), `watch-newer.mjs` (waits for the next SpaceX batch, runs `newer.mjs`, regenerates the tables, commits nothing), `inventory.mjs`, `tables.mjs`, `manifest.mjs`; the E2E is `node experiments/sdn-gp-starlink-ffm-match/run.mjs --check`. Setup: `npm ci --prefix experiments/sdn-gp-starlink-ffm-match`; a modules checkout at commit 118de023 (sparse is enough: propagator/sgp4-xp without third_party, propagator/ffm, analysis/od, analysis/gp-error-model, foundation, data-source/space-weather, data) named by `SDN_MODULES_ROOT`, with its `node_modules` linked to the experiment\'s.',
    '- Local store (not committed): `/opt/data/sdn-archive/sdn-gp-starlink-ffm-match/` holds the derived FFM trajectories (`truth/`), the saved environment (EOP, space weather with its extension) and the window rows.',
    '- SDN-GP: when the module lands, `lib/baselines.mjs` gets a third fitter beside `fitXp` and `fitSgp4`, and the `pending` cells of section 1 and the last row of section 5 fill from it. For the regimes awaiting SDN-GP, `pack-truth.mjs` writes the truth packs and `compareStates` (gp-error-model `pair_statistics`) scores any predicted states against them in radial / in-track / cross-track axes whatever the centre. The arms 3-6 of the task (term ranking, Chebyshev residual bytes, analytic STM) follow in phases 3-4.',
    '- Newer-file truth: `newer.mjs` scores against the first hours of any SpaceX file created after the registered fit (section 10); re-run it after 2026-10-24 08:00Z for the registered prospective files, and `comspoc.mjs` against the same-day truth files. GPS and laser-ranged objects of the COMSPOC capture need the ESA and ILRS products for 2026-10-23 and later (ESA finals lag about two weeks); `inventory.mjs` shows the newest product dates.', '');
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
