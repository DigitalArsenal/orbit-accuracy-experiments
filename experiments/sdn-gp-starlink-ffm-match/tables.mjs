// Aggregation: the recorded window rows (statistics only) -> results/sdn-gp-starlink-ffm-match/tables.json and README.md.
// Everything in the committed tables is computed here from the rows; nothing is typed. Counting and ordering only.
//   node experiments/sdn-gp-starlink-ffm-match/tables.mjs [--check]   (--check recomputes and compares with the committed tables.json)
import fs from 'node:fs';
import path from 'node:path';
import { config, store, results, write, sha256, read } from './common.mjs';
import { quantile, mean } from './lib/windows.mjs';
import { source as licenseSource } from '../../harness/data-licenses.mjs';
import { builds as sdngpBuilds, buildRows, rowKey } from './lib/sdngp-rows.mjs';
import { eventsStudy, eventsMarkdown } from './lib/events-tables.mjs';

// SDN-AP (amendment A9b): rows are kept per build of the module; the tables use the newest build that ran every source (complete.json)
const SD_BUILDS = sdngpBuilds();
const SD_HEADLINE = SD_BUILDS.filter((x) => x.complete).at(-1) ?? null;

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
  { id: 'moon-lro-fit24', pack: true, label: 'Moon-centered, LRO (NAIF reconstruction, about 90 km), 24 h fit (the Moon-centered SDN-AP only: section 14)' },
  { id: 'moon-lro-fit72', pack: true, label: 'Moon-centered, LRO (NAIF reconstruction, about 90 km), 72 h fit' },
  { id: 'moon-danuri-fit24', pack: true, label: 'Moon-centered, Danuri (JPL Horizons, 130 km, perilune 60 km), 24 h fit' },
  { id: 'moon-danuri-fit72', pack: true, label: 'Moon-centered, Danuri (JPL Horizons, 130 km, perilune 60 km), 72 h fit' },
  // amendment A9h: the cislunar and heliocentric packs through the segment fits (section 15)
  { id: 'cislunar-artemis2', pack: true, label: 'Cislunar, Artemis II after the translunar burn (NAIF SPK, Earth-centered), 24 h fit (segment fits: section 15)' },
  { id: 'cislunar-artemis1-earth', pack: true, label: 'Cislunar, Artemis I outbound and return (JPL Horizons, Earth-centered), 24 h fit' },
  { id: 'cislunar-artemis1-moon', pack: true, label: 'Cislunar, Artemis I distant retrograde orbit (JPL Horizons, Moon-centered), 14 d fit' },
  { id: 'cislunar-capstone', pack: true, label: 'Cislunar, CAPSTONE near rectilinear halo orbit (JPL Horizons, Moon-centered), 14 d fit' },
  { id: 'helio-psyche', pack: true, label: 'Heliocentric, Psyche cruise (JPL Horizons, Sun-centered), 30 d fit' },
  { id: 'helio-lucy-rec', pack: true, label: 'Heliocentric, Lucy cruise, reconstruction (JPL Horizons), 30 d fit' },
  { id: 'helio-lucy-ref', pack: true, label: 'Heliocentric, Lucy cruise, flight project reference trajectory (a planning prediction), 30 d fit' },
  { id: 'helio-juno-cruise', pack: true, label: 'Heliocentric, Juno cruise 2012-10 to 2013-09 (JPL Horizons), 30 d fit' },
  { id: 'planet-juno-jupiter', pack: true, label: 'Jupiter-centered, Juno orbits (JPL Horizons), 66 d fit' },
  { id: 'heo-artemis2', label: 'HEO, Artemis II high-Earth-orbit checkout (one short arc: 8 h fit, 12.85 h held out as day 1)' },
];
// the truth packs the build fits as Moon-centered, cislunar or heliocentric sets (amendments A9f and A9h): the regime of a row, by pack and fit length
const PACK_REGIME = {
  'lro-lunar': (r) => `moon-lro-fit${r.fitHours}`, 'danuri-lunar': (r) => `moon-danuri-fit${r.fitHours}`,
  'artemis2-cislunar': () => 'cislunar-artemis2', 'artemis1-cislunar': () => 'cislunar-artemis1-earth', 'artemis1-lunar': () => 'cislunar-artemis1-moon', 'capstone-nrho': () => 'cislunar-capstone',
  'psyche-cruise': () => 'helio-psyche', 'lucy-cruise-rec': () => 'helio-lucy-rec', 'lucy-cruise-ref': () => 'helio-lucy-ref', 'juno-cruise': () => 'helio-juno-cruise', 'juno-jupiter': () => 'planet-juno-jupiter',
};
const PACK_SOURCES = new Set(Object.keys(PACK_REGIME));
const AWAITING = [ // regimes with truth in the archive that Earth-centered SGP4 and SGP4-XP do not describe: listed until the build scores them
  { id: 'cislunar', label: 'Cislunar, Earth-centered transfers (Artemis I, Artemis II) and Earth-Moon libration or distant-retrograde orbits (CAPSTONE, Artemis I)', mission: 'artemis2', packs: ['artemis2-cislunar', 'artemis1-cislunar', 'capstone-nrho', 'artemis1-lunar'], reason: 'the Moon dominates; NAIF SPK type 13 and JPL Horizons vector tables, readable' },
  { id: 'lunar', label: 'Lunar-centered (LRO, Danuri)', mission: 'lro', packs: ['lro-lunar', 'danuri-lunar'], reason: 'Moon-centered; NAIF SPK type 13 and JPL Horizons vector tables, readable' },
  { id: 'interplanetary', label: 'Interplanetary: Sun-centered cruise (Psyche, Lucy, Juno) and Jupiter-centered orbits (Juno)', mission: 'psyche', packs: ['psyche-cruise', 'lucy-cruise-rec', 'lucy-cruise-ref', 'juno-cruise', 'juno-jupiter'], reason: 'Sun- or Jupiter-centered; JPL Horizons vector tables (the NAIF kernels of these missions are SPK type 1, unreadable by files/orbit-products 0.1.4)' },
];
const DAYS = [1, 2, 3];
const kernelOf = (mission) => { // metadata of the NAIF kernel (results/kernels.json, written by inventory.mjs)
  const file = path.join(results, 'kernels.json');
  const k = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')).rows.find((r) => r.mission === mission && r.file.endsWith('.bsp')) : null;
  return k ? { file: k.file, span: k.span, types: k.types, centers: k.centers } : null;
};

const readJsonl = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse) : []);

const regimeWindowsFile = () => { const f = path.join(results, 'regime-windows.json'); return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null; };
const preparedOf = (names) => { // the truth packs and windows prepared for SDN-AP (regime-windows.mjs)
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
  if (SD_HEADLINE) { // the SDN-AP fits of the same windows (rows of the headline build)
    const byKey = new Map(buildRows(SD_HEADLINE.dir).filter((r) => r.sdngp && r.source && r.startUtc).map((r) => [rowKey(r), r.sdngp]));
    for (const w of windows) { const sd = byKey.get(rowKey(w)); if (sd) w.sdngp = sd; }
    const rows = buildRows(SD_HEADLINE.dir);
    // the module's default fit span on the same windows (amendment A9f): rows labeled <source>+default
    const dKey = new Map(rows.filter((r) => r.sdngp && /\+default$/.test(r.source ?? '') && !/^span-/.test(r.source)).map((r) => [rowKey({ ...r, source: r.source.replace(/\+default$/, '') }), r.sdngp]));
    for (const w of windows) { const d = dKey.get(rowKey(w)); if (d) w.sdngpDefault = d; }
    // the Moon-centered, cislunar and heliocentric windows (amendments A9f and A9h)
    for (const r of rows.filter((x) => x.sdngp && PACK_SOURCES.has(x.source ?? ''))) windows.push({ regime: PACK_REGIME[r.source](r), ...r, meta: {} });
  }
  return windows;
}

const spread = (values) => ({ n: values.length, median: quantile(values, 0.5), mean: mean(values), p90: quantile(values, 0.9) });
const comp = (list, i) => quantile(list.map((v) => v?.[i]).filter(Number.isFinite), 0.5);
export function armStats(ws, arm) {
  const ok = ws.filter((w) => w[arm]?.ok);
  const out = {
    attempted: arm === 'sdngp' ? ws.filter((w) => w.sdngp).length : ws.length, fitted: ok.length,
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

/** Windows two arms both fitted: ratio of the arms' medians by day (0 is the fit) and the share of windows where `a` is closer. */
export function pairedArms(ws, a, b) {
  const both = ws.filter((w) => w[a]?.ok && w[b]?.ok);
  const out = { windows: both.length, days: {} };
  for (const k of [0, ...DAYS]) {
    const pairs = both.map((w) => (k === 0 ? [w[a].fitRmsKm, w[b].fitRmsKm] : [w[a].days?.[k]?.rmsKm, w[b].days?.[k]?.rmsKm])).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
    out.days[k] = pairs.length ? { n: pairs.length, medianRatio: quantile(pairs.map(([x]) => x), 0.5) / quantile(pairs.map(([, y]) => y), 0.5), closer: pairs.filter(([x, y]) => x < y).length / pairs.length } : null;
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
    ...r, windows: ws.length, objects: new Set(ws.map((w) => w.id)).size, xp: armStats(ws, 'xp'), sgp4: armStats(ws, 'sgp4'), sdngp: armStats(ws, 'sdngp'), paired: paired(ws), pairedSdngp: { xp: pairedArms(ws, 'sdngp', 'xp'), sgp4: pairedArms(ws, 'sdngp', 'sgp4') },
    sdngpTerms: ws.some((w) => w.sdngp?.ok) ? Object.fromEntries(['bEff', 'bEffSigma', 'tauc', 'taus', 'agom'].map((k) => [k, quantile(ws.filter((w) => w.sdngp?.ok).map((w) => w.sdngp[k]), 0.5)])) : null,
    terms: ws.some((w) => w.xp?.ok) ? { bterm: quantile(ws.filter((w) => w.xp?.ok).map((w) => w.xp.bterm), 0.5), agom: quantile(ws.filter((w) => w.xp?.ok).map((w) => w.xp.agom), 0.5), agomShare: ws.filter((w) => w.xp?.ok).filter((w) => w.xp.agom !== 0).length / ws.filter((w) => w.xp?.ok).length, bstar: quantile(ws.filter((w) => w.sgp4?.ok).map((w) => w.sgp4.bstar), 0.5) } : null,
    comspoc: cs?.length ? { objects: cs.length, ageDays: spread(cs.map((c) => c.ageDays)), days: Object.fromEntries([0, ...DAYS].map((k) => [k, { ...spread(cs.filter((c) => c.days?.[k]).map((c) => c.days[k].rmsKm)), ric: [0, 1, 2].map((i) => comp(cs.filter((c) => c.days?.[k]).map((c) => c.days[k].ric), i)) }])) } : null,
  });
  for (const r of REGIMES) {
    const ws = windows.filter((w) => w.regime === r.id);
    const cs = comspoc.filter((c) => c.regime === r.id);
    regimes.push(statsOf(r, ws, cs.length ? null : null));
    if (r.pack) regimes.at(-1).sdngp.elementBytes = null; // the minimal-record size is defined for the Earth-centered set's parameters
    const ran = ws.filter((w) => w.sdngp); // SDN-AP ran on a strict subset (SpaceX files that had changed on the server are skipped): the same windows for all arms in the next row
    if (ran.length && ran.length < ws.length) regimes.push(statsOf({ id: `${r.id}-sdngp`, label: `${r.label}, the ${ran.length} windows SDN-AP ran on` }, ran, null));
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
  // does SDN-AP recover the drag term the FFM fit found? (Starlink, B_eff between 0 and 0.5 m2/kg, both fits' B_eff in m2/kg; SDN-AP's density is NRLMSISE-00 as FFM's)
  const bWs = windows.filter((w) => w.regime === 'leo-starlink-ffm-drag' && w.sdngp?.ok && w.meta.bEff > 0.001);
  const bEffRecovery = bWs.length ? { n: bWs.length, ratioQuantiles: [0.1, 0.5, 0.9].map((q) => quantile(bWs.map((w) => w.sdngp.bEff / w.meta.bEff), q)), ffmMedian: quantile(bWs.map((w) => w.meta.bEff), 0.5), sdngpMedian: quantile(bWs.map((w) => w.sdngp.bEff), 0.5) } : null;
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
    const sdFits = new Map((SD_HEADLINE ? buildRows(SD_HEADLINE.dir, 'fitlength') : []).map((r) => [r.norad, r.fits])); // amendment A9c: SDN-AP on the same satellites
    const okSd = ok.filter((r) => { const q = sdFits.get(r.norad)?.[h]?.sdngp; return q && [q.fitRmsKm, q.errorKm, q.day1Km].every(Number.isFinite); });
    const medSd = (key) => quantile(okSd.map((r) => sdFits.get(r.norad)[h].sdngp[key]), 0.5);
    return { fitHours: h, satellites: ok.length, xp: { fitRmsKm: med('xp', 'fitRmsKm'), errorKm: med('xp', 'errorKm'), day1Km: med('xp', 'day1Km') }, sgp4: { fitRmsKm: med('sgp4', 'fitRmsKm'), errorKm: med('sgp4', 'errorKm'), day1Km: med('sgp4', 'day1Km') },
      sdngp: okSd.length ? { satellites: okSd.length, fitRmsKm: medSd('fitRmsKm'), errorKm: medSd('errorKm'), day1Km: medSd('day1Km'), xpOnTheSame: { fitRmsKm: quantile(okSd.map((r) => r.fits[h].xp.fitRmsKm), 0.5), errorKm: quantile(okSd.map((r) => r.fits[h].xp.errorKm), 0.5), day1Km: quantile(okSd.map((r) => r.fits[h].xp.day1Km), 0.5) } } : null };
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
    arms: ['spacexOld', 'ffm', 'sdngp', 'xp', 'sgp4', 'comspoc'].map((arm) => {
      const list = rows.filter((r) => r.arms[arm] && r.arms[arm].ok !== false);
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

  // amendment A9e: the fit span against COMSPOC. Windows end at the epoch of each COMSPOC set of a laser-ranged object or a GNSS satellite; SDN-AP, SGP4-XP and SGP4 are fitted over 24, 48, 72 and 120 h
  // and scored on the three days after the epoch, COMSPOC's own error (days since its epoch) beside them over exactly the sets that have a window at that span
  const spanGroups = [['leo-sphere', 'LEO laser-ranged spheres'], ['meo-slr', 'LARES-2 (5,900 km)'], ['gnss-meo', 'GNSS MEO (GPS, GLONASS, Galileo, BeiDou MEO)'], ['gnss-igso', 'GNSS IGSO (BeiDou, QZSS)'], ['gnss-geo', 'GNSS GEO (BeiDou)']];
  const spanBase = ['span-slr', 'span-gnss'].flatMap((src) => readJsonl(path.join(store, 'rows', `${src}.jsonl`)));
  const spanSd = SD_HEADLINE ? new Map(buildRows(SD_HEADLINE.dir).filter((r) => r.sdngp && /^span-/.test(r.source ?? '')).map((r) => [rowKey(r), r.sdngp])) : new Map();
  const spanStudy = spanBase.length ? spanGroups.map(([group, label]) => ({ group, label, spans: [24, 48, 72, 120].map((hours) => {
    const ws = spanBase.filter((w) => w.group === group && w.spanHours === hours).map((w) => ({ ...w, sdngp: spanSd.get(rowKey(w)) }));
    if (!ws.length) return null;
    const norads = new Set(ws.map((w) => w.norad));
    const cs = preciseRows.filter((r) => norads.has(r.norad));
    const csDay = (k) => ({ n: cs.filter((r) => r.days[k - 1]).length, median: quantile(cs.filter((r) => r.days[k - 1]).map((r) => r.days[k - 1].rmsKm), 0.5) });
    return { hours, windows: ws.length, sdngp: armStats(ws, 'sdngp'), xp: armStats(ws, 'xp'), sgp4: armStats(ws, 'sgp4'), comspoc: { 1: csDay(1), 2: csDay(2), 3: csDay(3) } };
  }).filter(Boolean) })).filter((g) => g.spans.length) : null;

  // the builds of the SDN-AP module that were run: Starlink FFM-truth windows, on the satellites every substantial build fitted
  const starlinkOf = (x) => buildRows(x.dir, 'starlink').filter((r) => r.source === 'starlink-ffm' && r.sdngp?.ok);
  const substantial = SD_BUILDS.filter((x) => starlinkOf(x).length >= 100);
  const common = substantial.length ? substantial.map((x) => new Set(starlinkOf(x).map((r) => r.norad))).reduce((a, c) => new Set([...a].filter((n) => c.has(n)))) : new Set();
  const sdngpBuildInfo = SD_BUILDS.map((x) => {
    const rows = starlinkOf(x).filter((r) => (substantial.includes(x) ? common.has(r.norad) : true));
    return { build: x.build, wasmSha256: x.wasmSha256, sourceCommit: x.sourceCommit, sourceDirtyFiles: x.sourceDirtyFiles, firstUseUtc: x.firstUseUtc, builtSeenUtc: x.builtSeenUtc, complete: Boolean(x.complete),
      starlink: rows.length ? { fitted: rows.length, onCommonSet: substantial.includes(x), fit: quantile(rows.map((r) => r.sdngp.fitRmsKm), 0.5), days: Object.fromEntries(DAYS.map((k) => [k, quantile(rows.map((r) => r.sdngp.days?.[k]?.rmsKm), 0.5)])) } : null };
  });
  // amendment A9f: the module's default fit span (48 h, extended to 72 and 120 h while the fit RMS holds) on the same windows as the registered fits, SDN-AP only
  const defaultStudy = REGIMES.map((r) => {
    const ws = windows.filter((w) => w.regime === r.id && w.sdngpDefault);
    if (!ws.length) return null;
    const asDefault = ws.map((w) => ({ ...w, sdngp: w.sdngpDefault }));
    const longer = (w) => w.sdngpDefault.ok && w.sdngpDefault.spanHours > w.fitSeconds / 3600 + 0.5; // the module used more than the registered fit's span
    return { id: r.id, label: r.label, windows: ws.length,
      bySpan: { ...Object.fromEntries([24, 48, 72, 120].map((h) => [h, ws.filter((w) => w.sdngpDefault.ok && Math.round(w.sdngpDefault.spanHours) === h).length])), other: ws.filter((w) => w.sdngpDefault.ok && ![24, 48, 72, 120].includes(Math.round(w.sdngpDefault.spanHours))).length }, longer: ws.filter(longer).length,
      registered: armStats(ws, 'sdngp'), default: armStats(asDefault, 'sdngp'),
      onLonger: { registered: armStats(ws.filter(longer), 'sdngp'), default: armStats(asDefault.filter(longer), 'sdngp') } };
  }).filter(Boolean);
  // the COMSPOC-aligned windows with the module's rule (A9e windows, A9f rows): one extra row per group
  const spanDefaultRows = SD_HEADLINE ? buildRows(SD_HEADLINE.dir).filter((r) => r.sdngp && /^span-(slr|gnss)\+default$/.test(r.source ?? '')) : [];
  const spanDefault = spanDefaultRows.length ? spanGroups.map(([group, label]) => {
    const ws = spanDefaultRows.filter((r) => r.group === group);
    if (!ws.length) return null;
    const cs = preciseRows.filter((r) => new Set(ws.map((w) => w.norad)).has(r.norad));
    const csDay = (k) => quantile(cs.filter((r) => r.days[k - 1]).map((r) => r.days[k - 1].rmsKm), 0.5);
    return { group, label, windows: ws.length, bySpan: Object.fromEntries([24, 48, 72, 120].map((h) => [h, ws.filter((w) => w.sdngp.ok && Math.round(w.sdngp.spanHours) === h).length])), sdngp: armStats(ws, 'sdngp'), comspoc: { 1: csDay(1), 2: csDay(2), 3: csDay(3) } };
  }).filter(Boolean) : null;
  // amendment A9f and A9h: the Moon-centered windows by what the module did (the whole arc, a segment past a maneuver, a refusal by name), with the truth-side maneuver check (lunar-maneuvers.mjs)
  const completeBuilds = SD_BUILDS.filter((x) => x.complete), previous = completeBuilds.at(-2) ?? null;
  const treatmentOf = (sd) => (!sd?.ok ? (sd?.treatment === 'failed' ? 'failed' : sd?.error ? 'refused' : 'none') : sd.params?.SDNGP_MANEUVER_BEFORE_SECONDS !== undefined ? 'segment' : 'whole'); // the same for the rows of builds that did not write the field
  const nameOf = (sd) => (sd?.errorName ?? String(sd?.error ?? '').split(':')[0].trim()) || null; // a failure after the fit is named propagate:<name of the module's refusal>
  const numericCore = (sd) => JSON.stringify([sd?.ok, sd?.fitRmsKm, Object.fromEntries(Object.entries(sd?.days ?? {}).map(([k, d]) => [k, [d.rmsKm, d.n]]))]); // the numbers of a row: the scoring-check fields added since (directKm) are not part of it
  const manFile = path.join(results, 'lunar-maneuvers.json');
  const maneuvers = fs.existsSync(manFile) ? JSON.parse(fs.readFileSync(manFile, 'utf8')) : null;
  const dayMedian = (list, k) => quantile(list.filter((w) => w.sdngp?.ok && w.sdngp.days?.[k]).map((w) => w.sdngp.days[k].rmsKm), 0.5);
  const dayMax = (list, k) => quantile(list.filter((w) => w.sdngp?.ok && w.sdngp.days?.[k]).map((w) => w.sdngp.days[k].rmsKm), 1);
  const lunarGroup = (list) => ({ windows: list.length, fitted: list.filter((w) => w.sdngp?.ok).length, fitRms: quantile(list.filter((w) => w.sdngp?.ok).map((w) => w.sdngp.fitRmsKm), 0.5), days: Object.fromEntries([1, 2, 3].map((k) => [k, { median: dayMedian(list, k), max: dayMax(list, k), n: list.filter((w) => w.sdngp?.ok && w.sdngp.days?.[k]).length }])) });
  const prevLunar = previous ? new Map(buildRows(previous.dir, 'lunar').filter((r) => r.sdngp).map((r) => [rowKey(r), r.sdngp])) : new Map();
  const lunarStudy = maneuvers && windows.some((w) => /^moon-/.test(w.regime)) ? ['lro-lunar', 'danuri-lunar'].map((pack) => {
    const events = maneuvers.packs[pack].events.map((e) => ({ ...e, ms: Date.parse(e.epochUtc) }));
    const rows = windows.filter((w) => w.source === pack).map((w) => {
      const start = Date.parse(w.startUtc), fitEnd = start + w.fitHours * 3600e3, end = fitEnd + 3 * 86400e3;
      return { ...w, treatment: treatmentOf(w.sdngp), inFit: events.filter((e) => e.ms >= start && e.ms <= fitEnd), inHeld: events.filter((e) => e.ms > fitEnd && e.ms <= end) };
    });
    const worst = rows.filter((w) => w.sdngp?.ok && w.sdngp.days?.[3]).sort((a, c) => c.sdngp.days[3].rmsKm - a.sdngp.days[3].rmsKm).slice(0, 5)
      .map((w) => ({ startUtc: w.startUtc, fitHours: w.fitHours, treatment: w.treatment, fitRmsKm: w.sdngp.fitRmsKm, days: Object.fromEntries([1, 2, 3].map((k) => [k, w.sdngp.days[k]?.rmsKm ?? null])), maneuversInFit: w.inFit.map((e) => ({ epochUtc: e.epochUtc, deltaVCmPerS: e.deltaVCmPerS })), maneuversInHeldOut: w.inHeld.map((e) => ({ epochUtc: e.epochUtc, deltaVCmPerS: e.deltaVCmPerS })) }));
    const ranked = rows.filter((w) => w.sdngp?.ok && w.sdngp.days?.[3]).sort((a, c) => c.sdngp.days[3].rmsKm - a.sdngp.days[3].rmsKm);
    const worstTenth = ranked.slice(0, Math.max(1, Math.round(ranked.length / 10)));
    const refusals = {}; for (const w of rows.filter((x) => x.treatment === 'refused')) refusals[nameOf(w.sdngp)] = (refusals[nameOf(w.sdngp)] ?? 0) + 1;
    const vsPrevious = [24, 72].map((h) => {
      const list = rows.filter((w) => w.fitHours === h), before = list.map((w) => ({ ...w, sdngp: prevLunar.get(rowKey(w)) })).filter((w) => w.sdngp);
      const same = list.filter((w) => prevLunar.has(rowKey(w)) && numericCore(w.sdngp) === numericCore(prevLunar.get(rowKey(w)))).length;
      return { fitHours: h, windows: list.length, inPreviousBuild: before.length, identical: same, now: lunarGroup(list), before: lunarGroup(before) };
    });
    return { pack, events: maneuvers.packs[pack].events.length, threshold: maneuvers.packs[pack].stepStatistic, refusals,
      byFit: [24, 72].map((h) => ({ fitHours: h, ...lunarGroup(rows.filter((w) => w.fitHours === h)) })),
      byTreatment: ['whole', 'segment', 'refused'].map((tr) => ({ treatment: tr, ...lunarGroup(rows.filter((w) => w.treatment === tr)), byFit: [24, 72].map((h) => ({ fitHours: h, ...lunarGroup(rows.filter((w) => w.treatment === tr && w.fitHours === h)) })) })),
      refusedWindows: rows.filter((w) => w.treatment === 'refused').map((w) => ({ startUtc: w.startUtc, fitHours: w.fitHours, name: nameOf(w.sdngp), maneuversInFit: w.inFit.map((e) => e.epochUtc), maneuversInHeldOut: w.inHeld.map((e) => e.epochUtc) })),
      vsPrevious, previousBuild: previous?.build ?? null,
      withManeuver: lunarGroup(rows.filter((w) => w.inFit.length || w.inHeld.length)), withManeuverInFit: lunarGroup(rows.filter((w) => w.inFit.length)), withManeuverInHeldOut: lunarGroup(rows.filter((w) => w.inHeld.length && !w.inFit.length)), withoutManeuver: lunarGroup(rows.filter((w) => !w.inFit.length && !w.inHeld.length)),
      worst, worstTenth: { windows: worstTenth.length, withManeuver: worstTenth.filter((w) => w.inFit.length || w.inHeld.length).length }, allWindowsWithManeuver: rows.filter((w) => w.inFit.length || w.inHeld.length).length, allWindows: rows.length };
  }) : null;
  // amendment A9h: the cislunar and heliocentric packs through the segment fits, every held-out pack state scored; day lists as the packs' rules (regime-windows.mjs)
  const SEG_PACKS = [
    { pack: 'artemis2-cislunar', label: 'Artemis II after the translunar burn (NAIF SPK, Earth-centered, 24 h fits)', days: [1, 2, 3] },
    { pack: 'artemis1-cislunar', label: 'Artemis I outbound and return (JPL Horizons, Earth-centered, 24 h fits)', days: [1, 2, 3] },
    { pack: 'artemis1-lunar', label: 'Artemis I distant retrograde orbit (JPL Horizons, Moon-centered, 14 d fits)', days: [1, 2, 3, 4, 5, 6, 7] },
    { pack: 'capstone-nrho', label: 'CAPSTONE near rectilinear halo orbit (JPL Horizons, Moon-centered, 14 d fits)', days: [1, 2, 3, 4, 5, 6, 7] },
    { pack: 'psyche-cruise', label: 'Psyche cruise (JPL Horizons, Sun-centered, 30 d fits)', days: [1, 3, 7, 15] },
    { pack: 'lucy-cruise-rec', label: 'Lucy cruise, reconstruction (Sun-centered, 30 d fits)', days: [1, 3, 7, 15] },
    { pack: 'lucy-cruise-ref', label: 'Lucy cruise, flight project reference trajectory (a planning prediction; Sun-centered, 30 d fits)', days: [1, 3, 7, 15] },
    { pack: 'juno-cruise', label: 'Juno cruise 2012-10 to 2013-09 (Sun-centered, 30 d fits)', days: [1, 3, 7, 15] },
    { pack: 'juno-jupiter', label: 'Juno Jupiter orbits (Jupiter-centered, 66 d fits)', days: [1, 3, 7, 15, 33] },
  ];
  const rulesFile = regimeWindowsFile();
  const segmentStudy = windows.some((w) => /^(cislunar|helio|planet)-/.test(w.regime)) ? SEG_PACKS.map(({ pack, label, days }) => {
    const rows = windows.filter((w) => w.source === pack).map((w) => ({ ...w, treatment: treatmentOf(w.sdngp) }));
    const allDays = rulesFile?.windows?.[pack]?.rule?.leadDays ?? days;
    const dayStats = (list, ds) => Object.fromEntries(ds.map((k) => [k, { n: list.filter((w) => w.sdngp?.ok && w.sdngp.days?.[k]).length, median: dayMedian(list, k), mean: mean(list.filter((w) => w.sdngp?.ok && w.sdngp.days?.[k]).map((w) => w.sdngp.days[k].rmsKm)), p90: quantile(list.filter((w) => w.sdngp?.ok && w.sdngp.days?.[k]).map((w) => w.sdngp.days[k].rmsKm), 0.9), max: dayMax(list, k), ric: [0, 1, 2].map((i) => comp(list.filter((w) => w.sdngp?.ok && w.sdngp.days?.[k]).map((w) => w.sdngp.days[k].ric), i)) }]));
    const fitted = rows.filter((w) => w.sdngp?.ok);
    const ok = (list) => list.filter((w) => w.sdngp?.ok);
    const failures = {}; for (const w of rows.filter((x) => !x.sdngp?.ok)) { const k = `${w.treatment}: ${nameOf(w.sdngp)}`; failures[k] = (failures[k] ?? 0) + 1; }
    const lastDay = days.at(-1);
    const worst = fitted.filter((w) => w.sdngp.days?.[lastDay]).sort((a, c) => c.sdngp.days[lastDay].rmsKm - a.sdngp.days[lastDay].rmsKm).slice(0, 5)
      .map((w) => ({ startUtc: w.startUtc, fitHours: w.fitHours, treatment: w.treatment, fitRmsKm: w.sdngp.fitRmsKm, lastDay, lastDayKm: w.sdngp.days[lastDay].rmsKm, day1Km: w.sdngp.days[1]?.rmsKm ?? null, segmentStartsAtSeconds: w.sdngp.maneuverBeforeSeconds ?? null }));
    const sums = (key) => ok(rows).reduce((a, w) => a + (w.sdngp[key] ?? 0), 0);
    return { pack, label, regime: rows[0] ? PACK_REGIME[pack](rows[0]) : null, windows: rows.length, fitted: fitted.length, failures,
      treatments: Object.fromEntries(['whole', 'segment', 'refused', 'failed'].map((tr) => [tr, rows.filter((w) => w.treatment === tr || (tr === 'failed' && !w.sdngp?.ok && w.sdngp?.treatment === 'failed')).length])),
      fitRms: quantile(fitted.map((w) => w.sdngp.fitRmsKm), 0.5), regimes: Object.fromEntries([...new Set(fitted.map((w) => w.sdngp.regime ?? 'standard'))].map((rg) => [rg, fitted.filter((w) => (w.sdngp.regime ?? 'standard') === rg).length])),
      days: dayStats(fitted, allDays), keyDays: days,
      byTreatment: ['whole', 'segment'].map((tr) => ({ treatment: tr, windows: fitted.filter((w) => w.treatment === tr).length, fitRms: quantile(fitted.filter((w) => w.treatment === tr).map((w) => w.sdngp.fitRmsKm), 0.5), days: dayStats(fitted.filter((w) => w.treatment === tr), days) })),
      failedWindows: rows.filter((w) => w.treatment === 'failed').map((w) => ({ startUtc: w.startUtc, fitHours: w.fitHours, error: w.sdngp.error, fitRmsKm: w.sdngp.fitRmsKm ?? null })),
      scorerCheck: (() => { const ds = fitted.flatMap((w) => Object.values(w.sdngp.days ?? {})).filter((d) => Number.isFinite(d.directKm) && d.directKm > 0); return { days: ds.length, maxRelativeDifference: ds.length ? Math.max(...ds.map((d) => Math.abs(d.rmsKm - d.directKm) / d.directKm)) : null }; })(),
      accounting: { heldOutStatesPerWindow: quantile(rows.map((w) => w.heldOutStates), 0.5), requested: sums('requested'), returned: sums('returned'), matched: sums('matched'), unmatched: sums('unmatched'), heldOutTotal: ok(rows).reduce((a, w) => a + w.heldOutStates, 0), windowsWithShortfall: ok(rows).filter((w) => w.sdngp.matched !== w.heldOutStates || w.sdngp.unmatched !== 0 || w.sdngp.returned !== w.sdngp.requested).length },
      worst };
  }) : null;
  // the registered rows and the default-span rows of this build against the previous complete build, window by window (amendment A9f; A9h adds the default-span count)
  const earthIdentity = SD_HEADLINE && previous ? (() => {
    const pick = (b, wantDefault) => new Map(buildRows(b.dir).filter((r) => r.sdngp && r.source && r.startUtc && !PACK_SOURCES.has(r.source) && !/^starlink-ffm-(rule|free)$/.test(r.source) && (wantDefault ? /\+default$/.test(r.source) : !/\+default$/.test(r.source))).map((r) => [rowKey(r), { s: JSON.stringify([r.sdngp.ok, r.sdngp.fitRmsKm, r.sdngp.days]), ok: r.sdngp.ok, fit: r.sdngp.fitRmsKm, days: r.sdngp.days }]));
    const compare = (wantDefault) => {
      const now = pick(SD_HEADLINE, wantDefault), before = pick(previous, wantDefault);
      let both = 0, identical = 0; const differing = {}, largest = [];
      for (const [k, v] of now) {
        if (!before.has(k)) continue;
        both += 1; const o = before.get(k);
        if (o.s === v.s) identical += 1; else { const src = k.split('|')[0]; differing[src] = (differing[src] ?? 0) + 1; }
        if (o.ok && v.ok) largest.push(Math.max(Math.abs(o.fit - v.fit), ...Object.keys(v.days ?? {}).filter((d) => o.days?.[d]).map((d) => Math.abs(o.days[d].rmsKm - v.days[d].rmsKm)))); // the window's largest change of the fit RMS or of a held-out day (km)
      }
      const sorted = largest.filter(Number.isFinite).sort((a, c) => a - c);
      return { windowsInBoth: both, identical, differing, comparedBoth: sorted.length, largestChangeKm: { median: sorted[Math.floor(sorted.length / 2)] ?? null, p90: sorted[Math.floor(sorted.length * 0.9)] ?? null, max: sorted.at(-1) ?? null } };
    };
    return { previousBuild: previous.build, registered: compare(false), defaultSpan: compare(true) };
  })() : null;
  // amendment A10: the Moon-centered, cislunar and heliocentric windows of this build against the previous complete build, window by window, on the numbers of the rows (fit RMS, every day's RMS and count)
  const packIdentity = SD_HEADLINE && previous ? Object.keys(PACK_REGIME).map((pack) => {
    const pick = (b) => new Map(buildRows(b.dir).filter((r) => r.source === pack && r.sdngp).map((r) => [rowKey(r), r.sdngp]));
    const now = pick(SD_HEADLINE), before = pick(previous);
    let both = 0, identical = 0, treatmentChanged = 0, maxDay = 0; const differing = [];
    for (const [k, v] of now) {
      if (!before.has(k)) continue;
      both += 1;
      const w = before.get(k);
      if (numericCore(v) === numericCore(w)) identical += 1;
      else {
        differing.push(k.split('|')[2]);
        if (treatmentOf(v) !== treatmentOf(w)) treatmentChanged += 1;
        for (const d of Object.keys(v.days ?? {})) if (w.days?.[d] && Number.isFinite(v.days[d].rmsKm)) maxDay = Math.max(maxDay, Math.abs(v.days[d].rmsKm - w.days[d].rmsKm));
      }
    }
    return { pack, windowsNow: now.size, windowsInBoth: both, identical, differing: both - identical, treatmentChanged, maxDayDifferenceKm: maxDay };
  }) : null;
  // HEO TESS, the one Earth source the build moved to the segment side: SDN-AP rows of the previous complete build against this one (registered and default-span windows)
  const tessVsPrevious = SD_HEADLINE && previous ? ['heo-tess', 'heo-tess+default'].map((source) => [24, 72].map((h) => {
    const sel = (b) => buildRows(b.dir).filter((r) => r.sdngp && r.source === source && r.fitSeconds === h * 3600);
    const group = (rows) => ({ windows: rows.length, fitted: rows.filter((r) => r.sdngp.ok).length, fitRms: quantile(rows.filter((r) => r.sdngp.ok).map((r) => r.sdngp.fitRmsKm), 0.5), days: Object.fromEntries([1, 2, 3].map((k) => [k, { median: quantile(rows.filter((r) => r.sdngp.ok && r.sdngp.days?.[k]).map((r) => r.sdngp.days[k].rmsKm), 0.5), n: rows.filter((r) => r.sdngp.ok && r.sdngp.days?.[k]).length }])), regimes: Object.fromEntries([...new Set(rows.filter((r) => r.sdngp.ok).map((r) => r.sdngp.regime ?? 'standard'))].map((rg) => [rg, rows.filter((r) => r.sdngp.ok && (r.sdngp.regime ?? 'standard') === rg).length])) });
    return { source, fitHours: h, previousBuild: previous.build, before: group(sel(previous)), now: group(sel(SD_HEADLINE)) };
  })).flat().filter((x) => x.now.windows || x.before.windows) : null;

  // amendment A10: the HEO sources (the e > 0.5 span rule changed) and the fit-implausible refusals, this build against the previous complete build
  const heoVsPrevious = SD_HEADLINE && previous ? ['heo-themis', 'heo-chandra'].flatMap((base) => ['', '+default'].flatMap((suffix) => [24, 72].map((h) => {
    const source = base + suffix, sel = (b) => buildRows(b.dir).filter((r) => r.sdngp && r.source === source && r.fitSeconds === h * 3600);
    const group = (rows) => ({ windows: rows.length, fitted: rows.filter((r) => r.sdngp.ok).length, fitRms: quantile(rows.filter((r) => r.sdngp.ok).map((r) => r.sdngp.fitRmsKm), 0.5), spanHours: quantile(rows.filter((r) => r.sdngp.ok && Number.isFinite(r.sdngp.spanHours)).map((r) => r.sdngp.spanHours), 0.5),
      days: Object.fromEntries([1, 2, 3].map((k) => [k, quantile(rows.filter((r) => r.sdngp.ok && r.sdngp.days?.[k]).map((r) => r.sdngp.days[k].rmsKm), 0.5)])) });
    const key = (b) => new Map(sel(b).map((r) => [rowKey(r), r.sdngp]));
    const now = key(SD_HEADLINE), before = key(previous);
    return { source, fitHours: h, before: group(sel(previous)), now: group(sel(SD_HEADLINE)), identical: [...now].filter(([k, v]) => before.has(k) && numericCore(v) === numericCore(before.get(k))).length, inBoth: [...now].filter(([k]) => before.has(k)).length };
  }))).filter((x) => x.now.windows || x.before.windows) : null;
  const implausible = (b) => { const out = {}; for (const r of buildRows(b.dir)) if (r.sdngp && !r.sdngp.ok && /fit-implausible/.test(String(r.sdngp.error ?? ''))) out[r.source] = (out[r.source] ?? 0) + 1; return out; };
  const fitImplausible = SD_HEADLINE ? { now: implausible(SD_HEADLINE), before: previous ? implausible(previous) : null } : null;
  // amendment A9d: the Starlinks with B_eff above 0.5 m2/kg, fitted as the build ships (the rows of the headline), with the 2c.2 rule and with free B_eff
  const decayWs = windows.filter((w) => w.regime === 'leo-starlink-ffm-decay');
  const lowRows = SD_HEADLINE ? buildRows(SD_HEADLINE.dir, 'lowering').filter((r) => r.sdngp) : [];
  const lowering = lowRows.length && decayWs.length ? {
    windows: decayWs.length, xp: armStats(decayWs, 'xp'), sgp4: armStats(decayWs, 'sgp4'),
    variants: ['default', 'rule', 'free'].map((variant) => {
      const ws = decayWs.map((w) => ({ ...w, sdngp: variant === 'default' ? w.sdngp : lowRows.find((r) => r.variant === variant && r.norad === w.norad)?.sdngp })).filter((w) => w.sdngp);
      const ok = ws.filter((w) => w.sdngp.ok);
      return { variant, ...armStats(ws, 'sdngp'), loweringApplied: ok.filter((w) => w.sdngp.lowering === 1).length,
        bEffRatioMedian: variant === 'rule' ? null : quantile(ok.filter((w) => w.meta.bEff > 0).map((w) => w.sdngp.bEff / w.meta.bEff), 0.5), tau0Median: quantile(ok.map((w) => w.sdngp.tau0), 0.5) };
    }),
  } : null;
  // scoring check: the pair_statistics RMS of the three held-out days against the module's own held-out RMS (its COMMENT), windows with three comparable days
  const chk = windows.filter((w) => w.sdngp?.ok && Number.isFinite(w.sdngp.heldOutRmsKm) && w.sdngp.heldOutRmsKm > 0 && [1, 2, 3].every((k) => w.sdngp.days?.[k]) && Math.max(...[1, 2, 3].map((k) => w.sdngp.days[k].n)) <= 1.05 * Math.min(...[1, 2, 3].map((k) => w.sdngp.days[k].n)))
    .map((w) => Math.sqrt([1, 2, 3].reduce((a, k) => a + w.sdngp.days[k].rmsKm ** 2, 0) / 3) / w.sdngp.heldOutRmsKm);
  const sdngpCheck = chk.length ? { windows: chk.length, ratio: [0, 0.5, 1].map((q) => quantile(chk, q)) } : null;
  // SpaceX forecast files that could not be reproduced for SDN-AP because the server's copy had changed since the registered fit
  const spacexSkipped = SD_HEADLINE ? new Set(fs.readdirSync(SD_HEADLINE.dir).filter((n) => n.startsWith('starlink-skipped.')).flatMap((n) => readJsonl(path.join(SD_HEADLINE.dir, n))).filter((x) => /changed on the server/.test(x.reason)).map((x) => x.norad)).size : 0;
  return { generatedFrom: 'recorded window rows (statistics only)', earthIdentity, packIdentity, heoVsPrevious, fitImplausible, tessVsPrevious, defaultStudy, spanDefault, lunarStudy, segmentStudy, eventsStudy: SD_HEADLINE ? eventsStudy(SD_HEADLINE.dir, results, completeBuilds.filter((x) => x !== SD_HEADLINE).map((x) => x.dir)) : null, spanStudy, lowering, sdngpCheck, sdngpSpacexSkipped: spacexSkipped, bEffRecovery, sdngpHeadlineBuild: SD_HEADLINE?.build ?? null, sdngpBuilds: sdngpBuildInfo, ricConsistency, fitLength, realism, config: { fitHours: config.windows.fitHours, leadDays: config.windows.leadDays, minimumCoverage: config.windows.minimumCoverage }, regimes, awaiting: AWAITING.filter((a) => !windows.some((w) => a.packs.includes(w.source) && w.sdngp)).map((a) => ({ ...a, kernel: kernelOf(a.mission), prepared: preparedOf(a.packs) })), regimeWindows: windowsSummary(), byShell, truthSet, truthQuality, newer, comspocPrecise, packs, heoByObject, bench: bench?.rows ?? null };
}

// ---- markdown ----
const fx = (x) => (Number.isFinite(x) ? x.toExponential(2) : '');
const f = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '' : Math.abs(x) >= 100 ? x.toFixed(0) : Math.abs(x) >= 10 ? x.toFixed(1) : x.toFixed(d));
const arms = (r, k) => [r.xp.days[k]?.median, r.comspoc?.days?.[k]?.median, r.sgp4.days[k]?.median];
const cell = (vals) => `pending / ${vals.map((v) => (Number.isFinite(v) ? f(v) : '-')).join(' / ')}`;

function findings(t) {
  const main = t.regimes.filter((r) => !/-(aligned|drag|b0|decay|clean|72h|sdngp)$/.test(r.id) && r.id !== 'heo-artemis2' && r.xp.fitted);
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
  const sdMain = main.filter((r) => r.sdngp.fitted);
  if (sdMain.length) {
    const dayRows = (k) => sdMain.map((r) => [r.label, r.sdngp.days[k]?.median, r.xp.days[k]?.median]).filter(([, a, c]) => Number.isFinite(a) && Number.isFinite(c));
    const d3s = dayRows(3), d1s = dayRows(1);
    if (d3s.length) out.push(`- SDN-AP (side B's module, build ${t.sdngpHeadlineBuild ?? 'n/a'}) against best-case SGP4-XP on the same windows, held-out day 3, median km, SDN-AP / XP (ratio): ${d3s.map(([l, a, c]) => `${l} ${f(a)} / ${f(c)} (${f(a / c, 2)})`).join('; ')}.`);
    if (d1s.length) out.push(`- The same on held-out day 1: ${d1s.map(([l, a, c]) => `${l} ${f(a)} / ${f(c)} (${f(a / c, 2)})`).join('; ')}.`);
    const fitRows = sdMain.map((r) => [r.label, r.sdngp.fit.median, r.xp.fit.median]).filter(([, a, c]) => Number.isFinite(a) && Number.isFinite(c));
    if (fitRows.length) out.push(`- Fit RMS over the 24 h fit, SDN-AP / XP (ratio): ${fitRows.map(([l, a, c]) => `${l} ${f(a)} / ${f(c)} (${f(a / c, 2)})`).join('; ')}.`);
    const sdShares = sdMain.map((r) => [r, share(r.sdngp)]).filter(([, v]) => v !== null);
    if (sdShares.length) out.push(`- The in-track share of the day-3 squared error of SDN-AP: ${sdShares.map(([r, v]) => `${r.label} ${f(v, 1)} %`).join('; ')}.`);
  }
  if (t.bEffRecovery) out.push(`- SDN-AP\'s signed B_eff against the FFM fit\'s B_eff on the ${t.bEffRecovery.n} Starlinks with B_eff between 0 and 0.5 m2/kg: the ratio has a median of ${f(t.bEffRecovery.ratioQuantiles[1], 2)} (10th to 90th percentile ${f(t.bEffRecovery.ratioQuantiles[0], 2)} to ${f(t.bEffRecovery.ratioQuantiles[2], 2)}); medians ${fx(t.bEffRecovery.sdngpMedian)} against ${fx(t.bEffRecovery.ffmMedian)} m2/kg. Both fits use NRLMSISE-00 density, so the drag term is the same physical quantity.`);
  for (const [id, text] of [['leo-starlink-ffm-decay', 'B_eff above 0.5 m2/kg (more than ten times a physical value; section 2b gives the two settings of rule 2c.2)'], ['leo-starlink-ffm-b0', 'B_eff at the zero bound']]) {
    const r = get(id);
    if (r?.sdngp.fitted && r.xp.days[3]?.median) out.push(`- Starlinks with ${text}: ${r.sdngp.fitted} SDN-AP fits, day 1 / day 3 median ${f(r.sdngp.days[1]?.median)} / ${f(r.sdngp.days[3]?.median)} km against ${f(r.xp.days[1]?.median)} / ${f(r.xp.days[3]?.median)} km for SGP4-XP and ${f(r.sgp4.days[1]?.median)} / ${f(r.sgp4.days[3]?.median)} km for SGP4.`);
  }
  for (const [group, name] of [['leo-sphere', 'LEO laser-ranged spheres'], ['gnss-meo', 'GNSS MEO']]) {
    const g = t.spanStudy?.find((x) => x.group === group);
    if (!g) continue;
    const cell = (a, k) => f(a.days[k]?.median);
    out.push(`- Fit span, ${name} (windows ending at the epoch of each COMSPOC set, section 1c), held-out day 1 / day 3 median km, SDN-AP | SGP4-XP | SGP4 by span: ${g.spans.map((s) => `${s.hours} h (${s.windows} sets) ${cell(s.sdngp, 1)} / ${cell(s.sdngp, 3)} | ${cell(s.xp, 1)} / ${cell(s.xp, 3)} | ${cell(s.sgp4, 1)} / ${cell(s.sgp4, 3)}`).join('; ')}; COMSPOC XP on the sets of the 24 h row: ${f(g.spans[0].comspoc[1].median)} / ${f(g.spans[0].comspoc[3].median)}.`);
  }
  if (t.lunarStudy) {
    const nm = { 'lro-lunar': 'LRO', 'danuri-lunar': 'Danuri' };
    out.push(`- Moon-centered SDN-AP (section 14), held-out days 1 / 2 / 3, median km: ${t.lunarStudy.flatMap((b) => b.byFit.map((g) => `${nm[b.pack]} ${g.fitHours} h fits ${[1, 2, 3].map((k) => f(g.days[k].median)).join(' / ')} (${g.fitted} of ${g.windows} windows)`)).join('; ')}. The module fitted ${t.lunarStudy.map((b) => `${b.byTreatment.find((x) => x.treatment === 'segment')?.windows ?? 0} ${nm[b.pack]}`).join(' and ')} windows on a segment past a maneuver and refused ${t.lunarStudy.map((b) => `${b.byTreatment.find((x) => x.treatment === 'refused')?.windows ?? 0} ${nm[b.pack]}`).join(' and ')} by name.`);
  }
  if (t.segmentStudy) {
    const g = (pack) => t.segmentStudy.find((x) => x.pack === pack);
    const d = (x, ks) => ks.map((k) => f(x.days[k]?.median)).join(' / ');
    const art = [g('artemis2-cislunar'), g('artemis1-cislunar')].filter((x) => x?.fitted);
    if (art.length) out.push(`- Cislunar transfers through the segment fits (section 15), held-out days 1 / 2 / 3, median km: ${art.map((x) => `${x.label} ${d(x, [1, 2, 3])} (${x.fitted} of ${x.windows} windows fitted${Object.keys(x.failures).length ? `, the rest ${Object.entries(x.failures).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''})`).join('; ')}.`);
    const cap = g('capstone-nrho');
    if (cap?.fitted) out.push(`- CAPSTONE (${cap.fitted} of ${cap.windows} windows, 14 d fits, every held-out state scored: ${cap.accounting.matched} of ${cap.accounting.heldOutTotal} paired, ${cap.accounting.unmatched} unpaired), held-out days 1 / 3 / 7, median km: ${d(cap, [1, 3, 7])}; the module fitted ${cap.byTreatment.map((x) => `${x.windows} on ${x.treatment === 'segment' ? 'a segment' : 'the whole arc'} (day 7 ${f(x.days[7]?.median)})`).join(' and ')}.`);
    const helio = ['psyche-cruise', 'lucy-cruise-rec', 'lucy-cruise-ref', 'juno-cruise'].map(g).filter((x) => x?.fitted);
    if (helio.length) out.push(`- Heliocentric cruise (section 15), held-out days 1 / 3 / 7 / 15, median km: ${helio.map((x) => `${x.pack.replace('-cruise', '')} ${d(x, [1, 3, 7, 15])} (${x.fitted} of ${x.windows} windows)`).join('; ')}.`);
  }
  if (t.tessVsPrevious?.length) { const x = t.tessVsPrevious[0]; out.push(`- HEO TESS on the segment side (24 h fits, ${x.now.fitted} of ${x.now.windows} windows), held-out days 1 / 2 / 3, median km, build ${x.previousBuild} -> the headline build: ${[1, 2, 3].map((k) => `${f(x.before.days[k].median)} -> ${f(x.now.days[k].median)}`).join(' / ')}.`); }
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
  const ev = t.eventsStudy;
  if (ev?.m22) { // amendment A10, section 16
    const c = (id) => ev.m22.cases.find((x) => x.id === id), z = c('map0'), v1 = c('imp-V-1'), v10 = c('imp-V-10');
    out.push(`- Impulse map (section 16b; ${ev.m22.satellites} Starlinks, FFM-1 impulses planted at the fit end, days 1 / 2 / 3 against FFM-1): the control (no impulse) has a median RMS of ${[1, 2, 3].map((k) => f(ev.m22.control[k])).join(' / ')} km against ${[1, 2, 3].map((k) => f(ev.m22.noManeuverRows[k])).join(' / ')} km for the no-maneuver rows of the same satellites; the map applied with a zero delta-v leaves the day 3 RMS ${f(z.excess[3].p90)} km above the control at the 90th percentile and ${f(z.excess[3].max)} km at most; the response error (the maneuvered less the unmaneuvered SDN-AP trajectory, against the same difference of FFM-1; median) is ${[1, 2, 3].map((k) => f(v1.response[k].median)).join(' / ')} km for 1 m/s along V and ${[1, 2, 3].map((k) => f(v10.response[k].median)).join(' / ')} km for 10 m/s along V (the day 3 displacement is about 800 km and 7,400 km).`);
  }
  if (ev?.m23) {
    const bv = (d) => ev.m23.cases.find((x) => x.id === 'burn-V-' + d + 'm-1');
    const pair = (d, k, field) => f(bv(d).B[field][k].median) + ' and ' + f(bv(d).A[field][k].median);
    out.push('- Finite burns (section 16b; ' + ev.m23.satellites + ' Starlinks, 1 m/s along V): excess over the control on day 1 for a centroid impulse (no loss) and for the module\'s map with sinc(dL/2), km: ' + [15, 30, 60].map((d) => d + ' min ' + pair(d, 1, 'excess')).join('; ') + '; response error on day 3, median: ' + [15, 30, 60].map((d) => d + ' min ' + pair(d, 3, 'response')).join('; ') + ' km.');
  }
  if (ev?.m28) {
    const p = ev.m28.precedence, n = (o, k) => o[k] ?? 0;
    out.push(`- Hand-off (section 16b; ${ev.m28.cells.filter((x) => x.nodes).length} decays, ${ev.m28.rows} nodes): a criterion trips on the truth at a higher level than the one where the 0 to 3 h error first exceeds 1 km in ${n(p.any.error1km, 'before')} cells, at the same node in ${n(p.any.error1km, 'same')} and after it in ${n(p.any.error1km, 'after')} (10 km: ${n(p.any.error10km, 'before')} / ${n(p.any.error10km, 'same')} / ${n(p.any.error10km, 'after')}); the module's REENTRY_EPOCH (80 km) less FFM-1's stop at 100 km has a median of ${ev.m28.reentry.map((r) => `${f(r.errorHours.median, 2)} h (${r.lead})`).join(', ')}, T100 inside the module's window at ${ev.m28.reentry.reduce((a, r) => a + r.inWindow, 0)} of ${ev.m28.reentry.reduce((a, r) => a + r.windowKnown, 0)} nodes; \`reentry\` was refused at ${Object.values(ev.m28.reentryRefusals).reduce((a, v) => a + v, 0)} of ${ev.m28.rows} nodes (${Object.keys(ev.m28.reentryRefusals).join(', ') || 'none'}).`);
  }
  if (ev?.m24) {
    out.push(`- \`detect_maneuvers\` on burn-free arcs (section 16b): ${ev.m24.windowsWithDetection} of ${ev.m24.windows} ISS windows (NASA OEM files with no reboost)${ev.m24c ? ` and ${ev.m24c.windowsWithDetection} of ${ev.m24c.windows} windows of burn-free FFM-1 Starlink arcs` : ''} reported a burn (Lambda median ${f(ev.m24.lambda.median, 0)}${ev.m24c ? ` and ${f(ev.m24c.lambda.median, 0)}` : ''} against the threshold 20; delta-v median ${f(ev.m24.dvMS.median, 3)} m/s${ev.m24c ? ` and ${f(ev.m24c.dvMS.median, 3)} m/s` : ''}).`);
  }
  if (ev?.m24a) { // amendment A11, section 16b: NASA's ISS archive (planned values), beside the previous complete build where it has them
    const a = ev.m24a, pa = ev.previous?.m24a, pc = ev.previous?.m24c, c = ev.m24c;
    out.push(`- \`detect_maneuvers\` on NASA's ISS archive (section 16b; the headers' planned burns are planned values, not measurements; build ${ev.build}): of ${a.pre.windows} pre-burn windows ${a.pre.hits} report a burn within 92 min of the planned TIG (${a.pre.wrongEpoch} elsewhere, ${a.pre.none} none${a.pre.hits ? `; epoch error of the hits ${f(a.pre.epochErrorMin.median, 1)} min, |delta-v| over the planned value ${f(a.pre.dvRatio.median, 2)}` : ''}) and ${a.post.hits} of ${a.post.windows} post-burn windows; ${a.free.windowsWithDetection} of ${a.free.windows} burn-free windows report one, ${f(a.free.falseAlarmsPerObjectYear, 1)} false alarms per object-year over ${f(a.free.coverageYears, 2)} object-years${c ? `; burn-free FFM-1 Starlink arcs: ${c.windowsWithDetection} of ${c.windows} windows` : ''}.${pa ? ` Build ${ev.previous.build}: ${pa.pre.hits} of ${pa.pre.windows} pre-burn hits, ${pa.free.windowsWithDetection} of ${pa.free.windows} burn-free windows (${f(pa.free.falseAlarmsPerObjectYear, 1)} per object-year)${pc ? `, ${pc.windowsWithDetection} of ${pc.windows} Starlink arcs` : ''}.` : ''}`);
  }
  if (ev?.m24p) {
    const pl = (id) => ev.m24p.cases.find((x) => x.id === id), pp = (id) => ev.previous?.m24p?.cases.find((x) => x.id === id);
    out.push(`- Impulses planted in FFM-1 arcs at 24 h of 60 h (section 16b, amendment A11e; ${ev.m24p.arcs} arcs, build ${ev.build}): hits within 92 min of 48 arcs: radial 1 m/s ${pl('imp-U-1').hits}, cross-track 1 m/s ${pl('imp-W-1').hits}, in-track 0.1 / 1 / 10 m/s ${pl('imp-V-0.1').hits} / ${pl('imp-V-1').hits} / ${pl('imp-V-10').hits}; the control reports a burn in ${pl('ctl').detections} arcs.${ev.previous?.m24p ? ` Build ${ev.previous.build}: ${pp('imp-U-1').hits}, ${pp('imp-W-1').hits}, ${pp('imp-V-0.1').hits} / ${pp('imp-V-1').hits} / ${pp('imp-V-10').hits}; control ${pp('ctl').detections}.` : ''}`);
  }
  if (ev?.m29?.C?.scored || ev?.m29?.T?.scored) {
    const m = ev.m29, pc = (x) => (x === null || x === undefined ? '' : `${Math.round(x * 100)} %`);
    const part = (n, g) => (g.scored ? `${n}: ${g.scored} of ${g.predictions} predictions answered on ${g.objects} objects, within 1 sigma ${pc(g.all.within1)}, within 2 sigma ${pc(g.all.within2)}, median |error| ${f(g.all.absMedian, 1)} h` : '');
    out.push(`- Real reentries (section 16c; build ${m.build}; time to go is the truth less the prediction epoch, sigma is REENTRY_EPOCH_UNC): ${[part('CORDS observed reentries', m.C), part('Space-Track last-TIP reentries', m.T)].filter(Boolean).join('; ')}; against Aerospace's prediction at its own element-set epoch (${m.aerospace.objects} objects) the observed time lies inside Aerospace's stated window for ${m.aerospace.aerospaceInside} and inside SDN-AP's 2 sigma for ${m.aerospace.sdnapIn2} of ${m.aerospace.answered}.`);
  }
  if (ev?.m30) {
    const v = (name) => ev.m30.variants.find((x) => x.variant === name);
    out.push(`- Controlled deorbits (section 16c; ${ev.m30.satellites} lowering Starlinks, build ${ev.build}): \`reentry\` on the 24 h fit answered for ${v('default').reentryOk} (${Object.entries(v('default').refused).map(([k, c]) => `${k} ${c}`).join(', ') || 'none refused'}; predicted lifetime median ${f(v('default').lifetimeDays.median, 1)} days, ${f(v('default').lifetimeDays.min, 1)} to ${f(v('default').lifetimeDays.max, 1)}); the rule setting (B_eff replaced by tau0) is refused for ${Object.values(v('rule').refused).reduce((a, c) => a + c, 0)} of ${v('rule').rows} (${Object.keys(v('rule').refused).join(', ') || 'none'}); the free-B_eff setting gives the same epochs as the shipped one; as of the archive's newest snapshot ${ev.m30.objectsWithTip} have a TIP message and ${ev.m30.objectsWithDecay} a decay message, so none is scored yet.`);
  }
  if (ev?.m31captured) {
    const h = (n) => ev.m31captured.hours.find((x) => x.hours === n);
    out.push(`- First fits of the captured batch (section 16c; ${ev.m31captured.satellites} satellites, held-out days 1 / 2 / 3 inside the file, median km): SDN-AP ${[6, 12, 24].map((n) => `${n} h ${[1, 2, 3].map((k) => f(h(n)?.sdnap[k].median, 1)).join(' / ')}`).join('; ')}; SGP4-XP ${[6, 12, 24].map((n) => `${n} h ${[1, 2, 3].map((k) => f(h(n)?.xp[k].median, 1)).join(' / ')}`).join('; ')}; the SDN-AP B_eff at 6 h over its 24 h value has a median of ${f(h(6)?.bEffRatio24.median, 2)} (10th to 90th percentile ${f(h(6)?.bEffRatio24.p10, 2)} to ${f(h(6)?.bEffRatio24.p90, 2)}).`);
  }
  if (ev?.m32?.length) {
    out.push(`- Batch-joint fit against per-object fits on synthetic FFM-1 batches with an exact parent state (section 16c, amendment A12b; build ${ev.build}): ${ev.m32.map((g) => `separation sigma ${g.sigmaMS} m/s, ${g.objects} objects: ${g.hours.map((h) => `${h.hours} h joint ${[1, 2, 3].map((k) => f(h.joint.days[k].median, 1)).join(' / ')} against per-object ${[1, 2, 3].map((k) => f(h.sdnap[k].median, 1)).join(' / ')} km`).join('; ')}`).join('. ')}.`);
  }
  if (ev?.m25) {
    out.push(`- Moon-centered windows against the truth-side maneuver list (section 16b): ${ev.m25.map((b) => `${b.pack === 'lro-lunar' ? 'LRO' : 'Danuri'}: with a listed maneuver in the fit span ${b.inFitSpan.windows} windows (whole ${b.inFitSpan.whole}, segment ${b.inFitSpan.segment}, refused ${b.inFitSpan.refused}), none in the fit span ${b.heldOutOnly.windows + b.none.windows} (segment ${b.heldOutOnly.segment + b.none.segment}, refused ${b.heldOutOnly.refused + b.none.refused}); segment starts ${b.segmentStartsAfterLast} after and ${b.segmentStartsBeforeLast} before the last listed maneuver`).join('; ')}.`);
  }
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
  L.push('# G1: SDN-AP against FFM-propagated Starlink and precise orbits (baselines)', '');
  L.push('Generated by `experiments/sdn-gp-starlink-ffm-match/tables.mjs` from recorded window rows. Position errors are 3D RMS in km unless a column says otherwise; every cell is a median over windows. Fit interval 24 h; held-out day k is (24 h + (k-1) d, 24 h + k d].', '');
  L.push('**Name.** SDN-AP ("advanced propagator", owner, 2026-10-24) is the new name of the theory first called SDN-GP. The module\'s package, methods and parameters change with it (`sdn-gp-propagator` to `sdn-ap-propagator`, `fit_sdngp` to `fit_sdnap`, `SDNGP_*` to `SDNAP_*`); builds before the rename are described by the names they carry, and `lib/sdngp.mjs` reads the renamed ones back under the historical keys, which the rows, the paths (`rows/sdngp/<build>/`), the experiment directory and the graph task keep.', '');
  L.push('## Method in brief', '',
    '- **Truth.** Starlink: the satellite\'s SpaceX forecast is fitted over 0-48 h (never across the 48 h join) by `analysis/od fit_ffm` (FFM-1, NRLMSISE-00 drag with s = 0 because no $DCL is published yet, kappa x drag folded into B_eff, Cr*A/m locked), then FFM-1 propagates the fitted state for 96 h at 60 s. That trajectory is the truth of the `FFM-propagated truth` row; the `SpaceX forecast` row fits the same two theories to SpaceX\'s own states (24 h) and scores day 1 inside its span, strictly before the 48 h join. Precise orbits: ESA final GNSS, GFZ MGEX rapid GEO and IGSO satellites (2025), GFZ rapid GNSS orbits of 2026-10-11 to 10-22, ILRS combined weekly and NSGF arcs (the archive\'s and, for September and October 2026, those fetched from NASA CDDIS), NASA ISS OEM, windows as in the sgp4-xp measurement.',
    '- **Windows.** 24 h fit from the first state; SGP4 by `fit_elements` (six mean elements and B*), SGP4-XP by `propagator/sgp4-xp fit` (those and BTERM, AGOM). One window per Starlink; the other sources use the strides of `config.json`.',
    `- **SDN-AP.** Side B\'s module \`sdn-ap-propagator\` (theory 16; the package was \`sdn-gp-propagator\` through build 35cd83a2b714), used as built and by its published surfaces only: \`fit_sdnap\` (\`fit_sdngp\` through build 35cd83a2b714) fits the six elements, a signed effective ballistic term B_eff, AGOM and the two density time-variation terms to the same 24 h of truth (the truth as a plain $OEM naming its frame; the run\'s saved space-weather table; no density correction and no prior), and the batch entry \`sdngp_propagate_minutes_soa\` propagates the fitted set to the held-out epochs (TEME), which \`foundation/frames\` takes to the truth\'s axes before the same \`pair_statistics\` scoring as XP; the sets the build fits as Moon-centered or segment sets (sections 14 and 15, and HEO TESS) are propagated by \`propagate\` on a grid block that names the set\'s own center, one explicit epoch per scored state, in the ICRF axes the module answers in. The module is rebuilt in place by its author, so every row belongs to a build named by the SHA-256 of its wasm (section 2a)${SD_HEADLINE ? `; the cells above are build ${SD_HEADLINE.build}` : ''}.${t.sdngpCheck ? ` Scoring check: over the ${t.sdngpCheck.windows} windows with three comparable held-out days the pair_statistics RMS of the days agrees with the module\'s own held-out RMS (its COMMENT) to a ratio of ${f(t.sdngpCheck.ratio[0], 3)} to ${f(t.sdngpCheck.ratio[2], 3)} (median ${f(t.sdngpCheck.ratio[1], 3)}).` : ''}${t.sdngpSpacexSkipped ? ` SpaceX\'s own forecast could be fitted only for the same-day capture: the server\'s file had changed since the registered fit for ${t.sdngpSpacexSkipped} of the registered seats, and a changed file is not the file the truth was fitted to.` : ''}`,
    '- **RIC.** SGP4: `element_residuals` (RTN of the truth). SGP4-XP: the module\'s own fit split for the fit, and the fitted set propagated by the module and compared by `pair_statistics` for the held-out days (at most one state per 5 minutes). Components are the median over windows of each window\'s component RMS, so they do not sum exactly to the 3D median.',
    `- **RIC check.** Over all held-out days of all windows the three components recombine to the module\'s own 3D RMS to ${f(t.ricConsistency.xp.min, 4)} to ${f(t.ricConsistency.xp.max, 4)} for SGP4-XP (the thinning to one state per 5 minutes) and ${f(t.ricConsistency.sgp4.min, 4)} to ${f(t.ricConsistency.sgp4.max, 4)} for SGP4.`,
    '- **Environment.** Earth orientation: the local IERS daily finals of 2026-10-13. Space weather: the `data-source/space-weather` rows (GFZ, NOAA SWPC) through 2026-10-25, then NOAA SWPC 45-day daily Ap and F10.7 for the eight days after (Kp and the 81-day average held), because the module\'s rows end where its Kp forecast ends and the truth runs 96 h. Planetary kernel DE440s. Density correction s = 0 (no $DCL is published yet). Hashes are in `manifest.json`.',
    '- **COMSPOC XP (local scoring only).** Their published SGP4-XP sets, propagated through the black-box module and compared with the same-day truth; their set epochs are 1 to 5 days older than the truth, so their errors are at those ages, not at the 24 h of the fitted arms. Never fitted to, never an input; aggregates only.',
    '- **Plan.** `experiments/sdn-gp-starlink-ffm-match/PLAN.md`, frozen by its first commit, with amendments A1 (headline table), A2 (start states, weather extension, the COMSPOC scoring arm), A3 (fit length), A4 (GEO and IGSO windows from the GFZ MGEX set found after registration), A5 (spacecraft truth from NAIF: highly elliptical orbits scored; the cislunar, lunar and heliocentric packs prepared, and scored from A9f on) A6 (truth quality: the iteration cap and the zero bound) A7 to A7d (the LEO fit floor against zonal-only gravity, DESIGN.md M1 to M3: section 12) A8 to A8c (current GNSS truth from the GFZ rapid orbits, TESS from MAST, CAPSTONE, Artemis I and Danuri from JPL Horizons, windows prepared for SDN-AP: section 1 and section 13) and A9 to A9h (Psyche, Lucy and Juno from Horizons, current laser-ranging truth from the ILRS products on CDDIS, the SDN-AP arm and its rules, its fit-length arm, the lowering variants, the fit span against COMSPOC, the module\'s default fit span, the Moon-centered windows and the segment fits of the cislunar and heliocentric packs).',
    '- **Not measured here.** SDN-AP ' + (t.segmentStudy ? 'on Jupiter-centered orbits (the build documents no such path; every window is attempted and refused by name: section 15)' : t.lunarStudy ? 'on the cislunar and heliocentric truth (the lunar windows are scored in section 14; the other packs and windows are prepared, section 13)' : 'on the lunar, cislunar and heliocentric truth (the module\'s theory is Earth-centered; the packs and windows are prepared, section 13)') + '; SDN-AP\'s covariance (section 5); the NAIF kernels of Psyche, Lucy and Juno are SPK type 1, unreadable by `files/orbit-products` 0.1.4, so that truth comes from JPL Horizons vector tables; GEO operator ephemerides (SES, Intelsat) are not stored; the theory-term ranking (phase 3).', '');
  L.push('## 1. Headline: SDN-AP, best-case SGP4-XP, COMSPOC XP and SGP4, one row per regime', '');
  L.push(`Cells read \`SDN-AP / best-case XP / COMSPOC XP (local scoring only) / SGP4\`. SDN-AP is side B's module \`sdn-ap-propagator\` as built${SD_HEADLINE ? ` (build ${SD_HEADLINE.build}: source commit ${SD_HEADLINE.sourceCommit?.slice(0, 8)}, ${SD_HEADLINE.sourceDirtyFiles} uncommitted file(s); the newest build that ran every source, see section 2a)` : ''}, fitted by \`fit_sdnap\` to the same truth on the same windows; \`pending\` where it has not run. Best-case XP is \`propagator/sgp4-xp fit\` fitted to the same truth on the same windows. \`-\` is not scored. A COMSPOC value marked \`*\` is its median over the objects it could be scored on (same-day truth only); section 1b gives XP and SGP4 on exactly those objects. A COMSPOC value marked \`†\` (the GFZ rapid-orbit and laser-ranged regimes) is by days since the epoch of the set itself, day 1 being the first 24 h after it, against the rapid orbit; XP and SGP4 are by days since the end of their 24 h fit, so the ages are not the same (no COMSPOC fit span is known). For COMSPOC the Fit RMS cell is its error over the first 24 h of the truth: nothing is fitted to it.`, '');
  const isExtra = (r) => /-(aligned|drag|b0|decay|clean|72h|sdngp)$/.test(r.id) || r.id === 'heo-artemis2';
  const header = ['| Regime | Windows (SDN-AP fitted / XP fitted / SGP4 fitted / attempted) | Fit RMS | Day 1 | Day 2 | Day 3 | Day 3 in-track share (SDN-AP / XP / SGP4) | Bytes per object (SDN-AP / XP / SGP4) | us per state (XP / SGP4) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- |'];
  const comspocOf = (r) => (r.comspoc ? { c: r.comspoc, mark: r.comspoc.alignment === 'epoch' ? '†' : '' } : t.regimes.find((x) => x.id === `${r.id}-aligned`)?.comspoc ? { c: t.regimes.find((x) => x.id === `${r.id}-aligned`).comspoc, mark: '*' } : { c: null, mark: '' });
  const cellOf = (sdv, xpv, csv, sgv, mark, state = 'pending') => `${Number.isFinite(sdv) ? f(sdv) : state} / ${[xpv, csv, sgv].map((v, k) => (Number.isFinite(v) ? f(v) + (k === 1 ? mark : '') : '-')).join(' / ')}`;
  const sdState = (r) => (r.sdngp.fitted > 0 ? '-' : r.sdngp.attempted > 0 ? 'not fitted' : 'pending'); // '-' where SDN-AP ran but has no value for the cell
  const row = (r) => {
    const key = /^(geo|igso|heo)/.test(r.id) ? 'GEO' : r.id.startsWith('meo') ? 'MEO' : 'LEO';
    const b = t.bench && !r.pack ? { xp: t.bench.find((x) => x.theory === 'SGP4-XP' && x.regime.startsWith(key)), sg: t.bench.find((x) => x.theory === 'SGP4' && x.regime.startsWith(key)) } : null;
    const share = (a) => { const c = a.days[3]?.ric; if (!(c && c.every(Number.isFinite))) return ''; const q = (100 * c[1] ** 2) / (c[0] ** 2 + c[1] ** 2 + c[2] ** 2); return `${q >= 99.5 ? q.toFixed(1) : Math.round(q)} %`; };
    const { c, mark } = comspocOf(r);
    const day = (k) => cellOf(r.sdngp.days[k]?.median, r.xp.days[k]?.median, c?.days?.[k]?.median, r.sgp4.days[k]?.median, mark, sdState(r));
    return `| ${r.label} | ${r.sdngp.attempted ? r.sdngp.fitted : 'pending'} / ${r.xp.fitted} / ${r.sgp4.fitted} / ${r.windows} | ${cellOf(r.sdngp.fit.median, r.xp.fit.median, c?.days?.[0]?.median, r.sgp4.fit.median, mark, sdState(r))} | ${day(1)} | ${day(2)} | ${day(3)} | ${r.sdngp.fitted ? share(r.sdngp) : '-'} / ${share(r.xp)} / ${share(r.sgp4)} | ${r.sdngp.elementBytes ?? '-'} / ${r.xp.elementBytes ?? ''} / ${r.sgp4.elementBytes ?? ''} | ${b ? `${f(b.xp?.usPerState, 0)} / ${f(b.sg?.usPerState, 0)}` : ''} |`;
  };
  const spanOf = (a) => (a.prepared?.length ? a.prepared.map((p) => `${p.name.split('-')[0]} ${p.startUtc.slice(0, 10)} to ${p.stopUtc.slice(0, 10)}, ${p.windows.reduce((n, w) => n + w.count, 0)} windows`).join('; ') : a.kernel ? `${a.kernel.span.slice(0, 10)} to ${a.kernel.span.split(' to ')[1].slice(0, 10)}` : 'none');
  L.push(...header, ...t.regimes.filter((r) => !isExtra(r)).map(row), ...t.awaiting.map((a) => `| ${a.label} | truth ${spanOf(a)} | pending / awaiting SDN-AP | awaiting SDN-AP | awaiting SDN-AP | awaiting SDN-AP | | | |`));
  L.push('', ...t.awaiting.map((a) => `- ${a.label}: awaiting SDN-AP, SGP4 and SGP4-XP do not describe it (${a.reason}); ${a.prepared?.length ? `${a.prepared.length} truth pack(s) and ${a.prepared.reduce((n, p) => n + p.windows.reduce((m, w) => m + w.count, 0), 0)} windows prepared (section 13)` : 'no truth pack yet'}.`),
    ...(t.regimeWindows ? [`- Truth packs of the lunar, cislunar and heliocentric regimes (local; derived from public NAIF kernels by files/orbit-products and foundation/time, and from JPL Horizons vector tables; [unix ms, x, y, z, vx, vy, vz] per state in km and km/s, inertial axes, UTC; scored in sections 14 and 15): ${t.regimeWindows.packs.map((k) => `${k.name}, ${k.states} states, ${k.center}-centered, ${k.startUtc.slice(0, 10)} to ${k.stopUtc.slice(0, 10)}`).join('; ')}.`] : []),
    '- GEO operator ephemerides: none are stored locally (operator-capture holds Starlink only; SES, Intelsat, OneWeb and Kuiper exist as CelesTrak SupGP element sets, not ephemerides); the GEO rows are the GFZ MGEX BeiDou-2 and QZSS-3 orbits of 2025 and, for October 2026, the one GEO satellite in the GFZ rapid MGEX file (QZS-2G).',
    '- NAIF does not host TESS, CAPSTONE, Artemis I or Danuri kernels (checked 2026-10-23). With the approvals of 2026-10-24 TESS comes from STScI MAST (definitive ephemeris SPK) and CAPSTONE, Artemis I and Danuri from JPL Horizons (amendments A8 to A8c); THEMIS, Chandra and Artemis II stay as further HEO and cislunar truth.', '');
  L.push('### 1b. The same objects the COMSPOC sets were scored on, and the Starlink B_eff split', '', ...header, ...t.regimes.filter(isExtra).map(row), '');
  if (t.spanStudy) {
    L.push('### 1c. Fit span against COMSPOC: SDN-AP, SGP4-XP and SGP4 fitted over 24, 48, 72 and 120 h ending at the epoch of each COMSPOC set (amendment A9e)', '',
      'COMSPOC does not state the span its XP sets were fitted over, so the 24 h fits of the table above are not a fair partner for them. Here every row holds the sets of one group whose precise-orbit truth covers the fit span (90 %) and the days after it; the window of each set ends at that set\'s epoch (only the epoch is used, nothing of the set enters a fit), and day k is days k-1 to k since it, the days COMSPOC is scored on. Cells read `SDN-AP / best-case XP / COMSPOC XP (local scoring only) / SGP4`, medians in km over the sets of the row; the COMSPOC value is over the same sets. Sets: the number of windows at that span.', '',
      '| Group | Fit span | Sets (SDN-AP fitted / XP fitted / SGP4 fitted / attempted) | Fit RMS | Day 1 | Day 2 | Day 3 |', '| --- | --: | --- | --- | --- | --- | --- |');
    for (const g of t.spanStudy) for (const sp of g.spans) {
      const csv = (k) => sp.comspoc[k].median;
      const day = (k) => cellOf(sp.sdngp.days[k]?.median, sp.xp.days[k]?.median, csv(k), sp.sgp4.days[k]?.median, '', sp.sdngp.fitted > 0 ? '-' : 'pending');
      L.push(`| ${g.label} | ${sp.hours} h | ${sp.sdngp.fitted} / ${sp.xp.fitted} / ${sp.sgp4.fitted} / ${sp.windows} | ${cellOf(sp.sdngp.fit.median, sp.xp.fit.median, undefined, sp.sgp4.fit.median, '', sp.sdngp.fitted > 0 ? '-' : 'pending')} | ${day(1)} | ${day(2)} | ${day(3)} |`);
    }
    for (const g of t.spanDefault ?? []) { // the module's own span rule on the same group (SDN-AP only)
      const day = (k) => cellOf(g.sdngp.days[k]?.median, undefined, g.comspoc[k], undefined, '', g.sdngp.fitted > 0 ? '-' : 'pending');
      L.push(`| ${g.label} | module's rule (24 / 48 / 72 / 120 h chosen: ${[24, 48, 72, 120].map((h) => g.bySpan[h]).join(' / ')}) | ${g.sdngp.fitted} / - / - / ${g.windows} | ${cellOf(g.sdngp.fit.median, undefined, undefined, undefined, '', '-')} | ${day(1)} | ${day(2)} | ${day(3)} |`);
    }
    L.push('');
  }

  if (t.heoByObject.length) {
    L.push('### HEO by object (median km: fit / day 1 / day 3)', '', '| Object | Fit length | Windows | SGP4-XP | SGP4 |', '| --- | --: | --: | --- | --- |',
      ...t.heoByObject.map((o) => `| ${o.id} | ${o.fitHours} h | ${o.windows} | ${f(o.xp.fit.median)} / ${f(o.xp.days[1]?.median)} / ${f(o.xp.days[3]?.median)} (${o.xp.fitted} fitted) | ${f(o.sgp4.fit.median)} / ${f(o.sgp4.days[1]?.median)} / ${f(o.sgp4.days[3]?.median)} (${o.sgp4.fitted} fitted) |`), '');
  }

  L.push('### What the table says (generated from the numbers above)', '', ...findings(t), '');
  L.push('## 2. Held-out error by day: median, mean and 90th percentile (3D, km)', '', 'Each day is over the windows that have enough states in it (90 %): in the arcs of the laser-ranging orbits only the first window of an arc has day 3, so the day columns are over different window sets; n is the count behind a day. The paired tables below compare arms window by window.', '', '| Regime | Arm | n | Fit | Day 1 | Day 2 | Day 3 |', '| --- | --- | --: | --- | --- | --- | --- |');
  for (const r of t.regimes) for (const [name, a] of [['SDN-AP', r.sdngp], ['SGP4-XP', r.xp], ['SGP4', r.sgp4]]) {
    if (name === 'SDN-AP' && !a.attempted) continue;
    if (name !== 'SDN-AP' && r.pack) continue; // SGP4 and SGP4-XP describe Earth-centered orbits
    const s = (x, withN) => (x?.n ? `${f(x.median)} / ${f(x.mean)} / ${f(x.p90)}${withN ? ` (n ${x.n})` : ''}` : '');
    L.push(`| ${r.label} | ${name} | ${a.fitted} | ${s(a.fit)} | ${s(a.days[1], true)} | ${s(a.days[2], true)} | ${s(a.days[3], true)} |`);
  }
  L.push('', '### Paired, windows both fitters fitted: median XP / median SGP4 (share of windows where XP is closer)', '', '| Regime | Windows | Fit | Day 1 | Day 2 | Day 3 |', '| --- | --: | --- | --- | --- | --- |');
  for (const r of t.regimes.filter((x) => !x.pack)) { const p = (k) => (r.paired.days[k] ? `${f(r.paired.days[k].medianRatio, 2)} (${Math.round(100 * r.paired.days[k].xpCloser)} %, n ${r.paired.days[k].n})` : ''); L.push(`| ${r.label} | ${r.paired.windows} | ${p(0)} | ${p(1)} | ${p(2)} | ${p(3)} |`); }
  if (t.regimes.some((r) => r.sdngp.fitted)) {
    L.push('', '### Paired, windows SDN-AP and the other fitter both fitted: median SDN-AP / median other (share of windows where SDN-AP is closer)', '', '| Regime | Against | Windows | Fit | Day 1 | Day 2 | Day 3 |', '| --- | --- | --: | --- | --- | --- | --- |');
    for (const r of t.regimes) if (r.sdngp.fitted) for (const [name, key] of [['SGP4-XP', 'xp'], ['SGP4', 'sgp4']]) { const q = r.pairedSdngp[key]; const p = (k) => (q.days[k] ? `${f(q.days[k].medianRatio, 2)} (${Math.round(100 * q.days[k].closer)} %, n ${q.days[k].n})` : ''); L.push(`| ${r.label} | ${name} | ${q.windows} | ${p(0)} | ${p(1)} | ${p(2)} | ${p(3)} |`); }
  }
  if (t.sdngpBuilds.length) {
    L.push('', '### 2a. Builds of the SDN-AP module that were run (side B rebuilds `dist/` in place; every row is tied to a build)', '', 'Starlink, FFM-propagated truth, the windows each build fitted (median 3D km; fit RMS, then held-out days 1 / 2 / 3). `complete` marks the build that ran every source of section 1; the tables above use the newest complete one. The source commit is side B\'s; uncommitted files are counted because a build is made from the working tree.', '',
      '| Build (wasm SHA-256 prefix) | Side-B source commit | Uncommitted files | Build first seen (UTC) | Complete | Starlink windows fitted | Fit RMS | Day 1 | Day 2 | Day 3 |', '| --- | --- | --: | --- | --- | --: | --: | --: | --: | --: |',
      ...t.sdngpBuilds.map((x) => `| ${x.build} | ${x.sourceCommit?.slice(0, 8) ?? ''} | ${x.sourceDirtyFiles ?? ''} | ${(x.builtSeenUtc ?? x.firstUseUtc)?.slice(0, 16) ?? ''} | ${x.complete ? 'yes' : 'no'} | ${x.starlink?.fitted ?? 0}${x.starlink && !x.starlink.onCommonSet ? ' (partial run)' : ''} | ${f(x.starlink?.fit)} | ${f(x.starlink?.days[1])} | ${f(x.starlink?.days[2])} | ${f(x.starlink?.days[3])} |`),
      ...(t.earthIdentity ? ['', `The headline build against build ${t.earthIdentity.previousBuild}, window by window: of the registered windows both ran, ${t.earthIdentity.registered.identical} of ${t.earthIdentity.registered.windowsInBoth} are identical to the last digit (fit RMS and every held-out day)${Object.keys(t.earthIdentity.registered.differing).length ? `; the others, by source: ${Object.entries(t.earthIdentity.registered.differing).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}; of the default-span windows, ${t.earthIdentity.defaultSpan.identical} of ${t.earthIdentity.defaultSpan.windowsInBoth}${Object.keys(t.earthIdentity.defaultSpan.differing).length ? `; the others, by source: ${Object.entries(t.earthIdentity.defaultSpan.differing).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}.`] : []),
      ...(t.tessVsPrevious?.length ? ['', `HEO TESS, the Earth source the build moved to the segment side (its apocenter lies beyond 250,000 km), SDN-AP medians in km, build ${t.tessVsPrevious[0].previousBuild} -> the headline build:`, '',
        '| Windows | Fit | Fitted (before -> now) | Path now | Fit RMS | Day 1 | Day 2 | Day 3 |', '| --- | --: | --- | --- | --- | --- | --- | --- |',
        ...t.tessVsPrevious.map((x) => `| ${x.source === 'heo-tess' ? 'registered' : 'default span'} | ${x.fitHours} h | ${x.before.fitted} -> ${x.now.fitted} of ${x.now.windows} | ${Object.entries(x.now.regimes).map(([k, v]) => `${k} ${v}`).join(', ')} | ${f(x.before.fitRms)} -> ${f(x.now.fitRms)} | ${[1, 2, 3].map((k) => `${f(x.before.days[k].median)} -> ${f(x.now.days[k].median)}`).join(' | ')} |`)] : []));
  }
  if (t.lowering) {
    const lw = t.lowering;
    L.push('', `### 2b. The ${lw.windows} Starlinks with B_eff above 0.5 m2/kg (lowering or decaying objects), SDN-AP as the build ships and with the two settings of DESIGN 2c.2 (amendment A9d)`, '',
      'Median 3D km over the same satellites: fit, then held-out days 1 / 2 / 3. "As shipped" is the build\'s default in the rows of section 1; "rule" replaces a B_eff above 0.5 m2/kg by tau0 held after the arc (SDNGP_LOWERING = 1); "free" leaves B_eff free. The last two are set through the build\'s diagnostic export before each fit. B_eff ratio is SDN-AP\'s B_eff over the FFM fit\'s.', '',
      '| Fitter | Fitted | Rule applied | Fit RMS | Day 1 | Day 2 | Day 3 | B_eff ratio (median) |', '| --- | --: | --: | --: | --: | --: | --: | --: |',
      ...lw.variants.map((v) => `| SDN-AP ${{ default: 'as shipped', rule: 'rule', free: 'free B_eff' }[v.variant]} | ${v.fitted} of ${v.attempted} | ${v.loweringApplied} | ${f(v.fit.median)} | ${f(v.days[1]?.median)} | ${f(v.days[2]?.median)} | ${f(v.days[3]?.median)} | ${v.bEffRatioMedian === null ? '' : f(v.bEffRatioMedian, 2)} |`),
      `| SGP4-XP | ${lw.xp.fitted} of ${lw.windows} | | ${f(lw.xp.fit.median)} | ${f(lw.xp.days[1]?.median)} | ${f(lw.xp.days[2]?.median)} | ${f(lw.xp.days[3]?.median)} | |`,
      `| SGP4 | ${lw.sgp4.fitted} of ${lw.windows} | | ${f(lw.sgp4.fit.median)} | ${f(lw.sgp4.days[1]?.median)} | ${f(lw.sgp4.days[2]?.median)} | ${f(lw.sgp4.days[3]?.median)} | |`);
  }
  if (t.defaultStudy?.length) {
    L.push('', '### 2c. The module\'s default fit span against the registered fit, same windows (amendment A9f)', '',
      'The block holds the truth from 120 h before the fit end and declares only the end of the fit; the module chooses the span (its rule: the latest 48 h, extended to 72 and then 120 h while the fit RMS holds; the whole interval when the truth is shorter). Held-out days as before. SDN-AP only: medians in km over the windows both ran, day 1 / 2 / 3 as `registered fit -> default span`; the last two columns are days 1 and 3 on the windows where the module used more than the registered span (where an arc ends before day 3 the cell is empty).', '',
      '| Regime | Windows | Span chosen: 24 / 48 / 72 / 120 h / other | Day 1 | Day 2 | Day 3 | Windows with a longer span: day 1 | day 3 |', '| --- | --: | --- | --- | --- | --- | --- | --- |');
    for (const d of t.defaultStudy) {
      const pair = (k) => `${f(d.registered.days[k]?.median)} -> ${f(d.default.days[k]?.median)}`;
      L.push(`| ${d.label} | ${d.windows} | ${[24, 48, 72, 120, 'other'].map((h) => d.bySpan[h]).join(' / ')} | ${pair(1)} | ${pair(2)} | ${pair(3)} | ${d.longer ? `${d.longer}: ${f(d.onLonger.registered.days[1]?.median)} -> ${f(d.onLonger.default.days[1]?.median)}` : '0'} | ${d.longer ? `${f(d.onLonger.registered.days[3]?.median)} -> ${f(d.onLonger.default.days[3]?.median)}` : ''} |`);
    }
  }
  L.push('', '## 3. Radial / in-track / cross-track split (km, median of per-window component RMS)', '', '| Regime | Arm | Fit R / I / C | Day 1 R / I / C | Day 3 R / I / C |', '| --- | --- | --- | --- | --- |');
  const ric = (c) => (c && c.some(Number.isFinite) ? c.map((v) => f(v)).join(' / ') : '');
  for (const r of t.regimes) {
    for (const [name, a] of [['SDN-AP', r.sdngp], ['SGP4-XP', r.xp], ['SGP4', r.sgp4]]) if ((name !== 'SDN-AP' || a.fitted) && (name === 'SDN-AP' || !r.pack)) L.push(`| ${r.label} | ${name} | ${ric(a.fitRic)} | ${ric(a.days[1]?.ric)} | ${ric(a.days[3]?.ric)} |`);
    if (r.comspoc) L.push(`| ${r.label} | COMSPOC XP (local scoring only) | | ${ric(r.comspoc.days[1]?.ric)} | ${ric(r.comspoc.days[3]?.ric)} |`);
  }
  L.push('', '## 4. Cost per object', '', '| Regime | Arm | Parameters | Element bytes | Record bytes as returned | Fit time, median ms |', '| --- | --- | --: | --: | --: | --: |');
  for (const r of t.regimes) for (const [name, a] of [['SDN-AP', r.sdngp], ['SGP4-XP', r.xp], ['SGP4', r.sgp4]]) if ((name !== 'SDN-AP' || a.fitted) && (name === 'SDN-AP' || !r.pack)) L.push(`| ${r.label} | ${name} | ${a.parameters ?? ''} | ${a.elementBytes ?? ''} | ${a.recordBytes ?? ''} | ${f(a.fitMsMedian, 0)} |`);
  L.push('', 'Element bytes are the size-prefixed `$OMM` record holding only the mean elements and the drag (and solar) terms of the set; the record as returned carries the fit statistics too. A two-line text set (the format COMSPOC publishes its XP sets in) is 138 characters.');
  if (t.bench) { L.push('', 'One propagated state, microseconds (one `propagate` call over 5761 states, four days at 60 s, median of repeats, harness overhead included):', '', '| Regime | Theory | us per state | Element bytes |', '| --- | --- | --: | --: |', ...t.bench.map((x) => `| ${x.regime} | ${x.theory} | ${f(x.usPerState, 0)} | ${x.elementBytes} |`)); }
  L.push('', 'Fitted terms (medians over windows): the two extra terms of SGP4-XP against the single B* of SGP4. AGOM is the solar-radiation term; a zero median means the fit left it at zero in most windows.', '', '| Regime | XP BTERM | XP AGOM | XP windows with AGOM != 0 | SGP4 B* |', '| --- | --: | --: | --: | --: |');
  for (const r of t.regimes) if (r.terms) L.push(`| ${r.label} | ${fx(r.terms.bterm)} | ${fx(r.terms.agom)} | ${r.terms.agomShare === null ? '' : `${Math.round(100 * r.terms.agomShare)} %`} | ${fx(r.terms.bstar)} |`);
  if (t.regimes.some((r) => r.sdngpTerms && Number.isFinite(r.sdngpTerms.bEff))) {
    L.push('', 'SDN-AP fitted terms (medians over windows): the signed effective ballistic term B_eff (m2/kg) and its standard deviation from the fit\'s normal matrix, the two time-variation terms of the density model (tau_c, tau_s), and the solar-radiation term AGOM.', '', '| Regime | B_eff | sigma(B_eff) | tau_c | tau_s | AGOM |', '| --- | --: | --: | --: | --: | --: |');
    for (const r of t.regimes) if (r.sdngpTerms && Number.isFinite(r.sdngpTerms.bEff)) L.push(`| ${r.label} | ${fx(r.sdngpTerms.bEff)} | ${fx(r.sdngpTerms.bEffSigma)} | ${fx(r.sdngpTerms.tauc)} | ${fx(r.sdngpTerms.taus)} | ${fx(r.sdngpTerms.agom)} |`);
  }
  L.push('', '## 5. Covariance realism against the FFM truth of the same-day Starlinks', '', 'd^2 is the position Mahalanobis distance of the error against each source\'s own covariance (gp-error-model `pair_statistics`); a realistic covariance has mean d^2/3 in [0.8, 1.25] and 95 % coverage in [0.93, 0.97] (the V1c2 rule). Age is in days since the source\'s own epoch: ScenarioEpoch for SynCoPate, the fit epoch for ours.', '', '| Covariance | Age (days) | Objects | Samples | Mean d^2/3 | 95 % coverage | Median object error, km |', '| --- | --- | --: | --: | --: | --: | --: |');
  const names = { 'comspoc-syncopate': 'COMSPOC SynCoPate (local scoring only), with the XP trajectory', 's3kc-sgp4': 'Ours: E14 S3-KC population covariance on SGP4 fitted to the truth', 'sdn-gp': 'SDN-AP' };
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
    if (t.fitLength.some((x) => x.sdngp)) {
      L.push('', 'SDN-AP on the same satellites (amendment A9c; the XP columns here are the medians over exactly the satellites SDN-AP fitted):', '', '| Fit length | Satellites | SDN-AP fit RMS | SDN-AP error, 72-96 h | SDN-AP error, first day after the fit | XP fit RMS | XP error, 72-96 h | XP error, first day after the fit |', '| --- | --: | --: | --: | --: | --: | --: | --: |');
      for (const x of t.fitLength) if (x.sdngp) L.push(`| ${x.fitHours} h | ${x.sdngp.satellites} | ${f(x.sdngp.fitRmsKm)} | ${f(x.sdngp.errorKm)} | ${f(x.sdngp.day1Km)} | ${f(x.sdngp.xpOnTheSame.fitRmsKm)} | ${f(x.sdngp.xpOnTheSame.errorKm)} | ${f(x.sdngp.xpOnTheSame.day1Km)} |`);
    }
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
    const armName = (a) => (a === 'comspoc' ? 'COMSPOC Spacebook XP (local scoring only)' : a === 'spacexOld' ? 'SpaceX earlier forecast' : a === 'ffm' ? 'FFM-1 from the registered fit' : a === 'sdngp' ? 'SDN-AP fitted to the FFM truth' : a === 'xp' ? 'SGP4-XP fitted to the FFM truth' : 'SGP4 fitted to the FFM truth');
    L.push('## 10. Held out against the first hours of newer SpaceX files', '',
      `${nw.satellites} fitted Starlinks (${nw.rows} scorings), each scored against the first three hours (every ten minutes) of a file SpaceX served after the file of the registered fit; the newest starts ${nw.newestFileStart.slice(0, 16)}Z. The horizon from the start of the registered fit to those hours is ${f(nw.horizonHours.min, 1)} to ${f(nw.horizonHours.max, 1)} h; the scoring is re-run with \`newer.mjs\` as files arrive (the registered V2 prospective files start 2026-10-24 08:00Z, a horizon of about 20 h), and each pass is reported at its own horizon. Arms: SpaceX's own earlier forecast (where its epochs coincide with the newer file's), FFM-1 from the registered fit, SGP4, SGP4-XP and SDN-AP (the newest build that ran every source, section 2a; \`newer.mjs\` uses it when one exists) fitted to the first 24 h of the FFM truth, and COMSPOC's XP set (same-day objects, local scoring only).`, '');
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
        `The error does not grow over the days after the epoch and is mostly in-track (components above): a set that sits off the orbit by a near-constant amount, not one that drifts. That is the form of the fit floor of section 12 (the tesseral in-track variation a mean-element set cannot follow); the best-case XP fit RMS of the LEO sphere row of section 1 is ${f(t.regimes.find((x) => x.id === 'leo-slr-current')?.xp.fit.median)} km.`, '');
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
      '- `files/orbit-products` 0.1.4 reads SPK types 8, 9 and 13 only: the JPL navigation kernels of Psyche, Lucy and Juno are type 1 (`unsupported-variant`), the Juno merge also holds type 2 (`unsupported-spk-materialization`), TDRSS is type 10 (generated from two-line elements). Its epochs are TDB, so every caller needs `foundation/time` (done here, one call per epoch).',
      ...(SD_HEADLINE ? [
        `- \`sdn-gp-propagator\` (side B), found by using it. Fixed in later builds: the invoke \`propagate\` once stopped one day after a set\'s epoch, and \`fit_sdngp\` once read a block that named GCRF only through the enumeration as TEME, silently (30 to 40 km errors); frames are now read or refused by name and \`propagate\` takes a grid. Still true of the headline build: (a) the build is rebuilt in place from a working tree, so a result is reproducible only with the copy of the wasm it ran (section 2a); (b) \`ingest_omm\` and the batch entry refuse a segment set (\`unsupported-theory\`, documented), so a consumer reaches it only through \`propagate\` on a grid; (c) the COMMENT of a segment set says \`N states fitted from X h\`, where X is the offset of the segment within the arc (the epoch carried past a maneuver), which reads like a length${(() => { const a2 = t.segmentStudy?.find((x) => x.pack === 'artemis2-cislunar'); const w = a2?.failedWindows?.[0]; return w ? `; (d) a block the reach rule leaves on the standard Earth path but whose arc cannot be fitted there (Artemis II ${w.startUtc.slice(0, 16)}, before the translunar burn: an apocenter under 250,000 km, a 24 h arc and three days across the burn) comes back as a set with a fit RMS of ${f(w.fitRmsKm, 0)} km, and \`propagate\` then fails (${w.error.replace(/ \(code \d+\)\.?$/, '').replace(/NORAD 0 /, '')}) instead of the block being refused` : ''; })()}.`,
        ...(() => { const r = (id) => t.regimes.find((x) => x.id === id); const dec = r('leo-starlink-ffm-decay'), gnss = r('meo-gnss-rapid'), fails = t.regimes.filter((x) => !/-(aligned|drag|b0|decay|clean|72h|sdngp)$/.test(x.id) && x.sdngp.attempted && x.sdngp.attempted > x.sdngp.fitted).map((x) => `${x.label}: ${x.sdngp.attempted - x.sdngp.fitted} of ${x.sdngp.attempted}`);
          return [
            ...(t.lowering ? (() => { const v = (name) => t.lowering.variants.find((x) => x.variant === name); const row = (x) => `day 1 / day 3 median ${f(x.days[1]?.median, 1)} / ${f(x.days[3]?.median, 1)} km`; return [`- \`fit_sdngp\` rule 2c.2 (a B_eff above 0.5 m2/kg is replaced by tau0, held after the arc) on the ${t.lowering.windows} Starlinks with such a B_eff (section 2b): the rule gives ${row(v('rule'))}, free B_eff ${row(v('free'))}, SGP4-XP ${row(t.lowering.xp)}, SGP4 ${row(t.lowering.sgp4)}; the build as shipped gave ${row(v('default'))} (rule applied to ${v('default').loweringApplied} of ${v('default').fitted}).`]; })() : dec?.sdngp.fitted && dec.xp.days[3]?.median ? [`- \`fit_sdngp\` on the ${dec.sdngp.fitted} Starlinks with B_eff above 0.5 m2/kg: day 1 / day 3 median ${f(dec.sdngp.days[1]?.median, 1)} / ${f(dec.sdngp.days[3]?.median, 0)} km, against ${f(dec.xp.days[1]?.median, 1)} / ${f(dec.xp.days[3]?.median, 1)} km for SGP4-XP.`] : []),
            ...(gnss?.sdngp.fitted && gnss.xp.days[3]?.median ? [`- GNSS MEO (GFZ rapid), held-out day 3 median: SDN-AP ${f(gnss.sdngp.days[3]?.median)} km, SGP4-XP ${f(gnss.xp.days[3]?.median)} km (fit RMS ${f(gnss.sdngp.fit.median)} against ${f(gnss.xp.fit.median)} km): SDN-AP is ${gnss.sdngp.days[3]?.median > gnss.xp.days[3]?.median ? 'behind' : 'ahead of'} XP in extrapolation at this altitude${gnss.sdngp.fit.median < gnss.xp.fit.median ? ' although it fits tighter' : ''}.`] : []),
            ...(fails.length ? [`- \`fit_sdngp\` fits that did not converge or were refused, by regime: ${fails.join('; ')}.`] : []),
          ]; })(),
      ] : []), '');
  }

  const m123File = path.join(results, 'm123.md');
  if (fs.existsSync(m123File)) L.push(fs.readFileSync(m123File, 'utf8').trimEnd(), ''); // section 12, written by m123-report.mjs
  if (t.regimeWindows) {
    L.push('## 13. Truth packs and windows of the lunar, cislunar and heliocentric regimes (amendments A8 and A9)', '',
      'Truth packs (local: `<store>/pack/`, states in km and km/s, inertial axes of the source, UTC) and the window lists (`regime-windows.json`: window starts and counts, no states) for the regimes SGP4 and SGP4-XP do not describe; the build scores them in sections 14 and 15. A window needs 90 % of its states in the fit span and in each held-out day. `regime-windows.mjs --export <pack> --start <ISO> --fit-hours <h> --out <file.oem>` writes a window\'s fit span as a $OEM (center and frame named); `score-pack.mjs --pack <pack> --start <ISO> --fit-hours <h> --predicted <states.oem>` scores predicted states against the held-out days of that window (radial / in-track / cross-track RMS by day, in the pack\'s center, through gp-error-model `pair_statistics`).', '',
      '| Pack | Regime | Center, axes | Source | States (step) | Span | Windows by fit length (held-out days) |', '| --- | --- | --- | --- | --- | --- | --- |',
      ...t.regimeWindows.packs.map((p) => `| ${p.name} | ${p.regime ?? ''} | ${p.center}, ${p.frame} | ${p.source ?? ''} | ${p.states} (${p.windows[0]?.stepSeconds ?? ''} s) | ${p.startUtc.slice(0, 10)} to ${p.stopUtc.slice(0, 10)} | ${p.windows.map((w) => `${w.fitHours} h: ${w.count}`).join('; ')}${p.rule ? ` (days ${p.rule.leadDays[0]} to ${p.rule.leadDays.at(-1)}, every ${p.rule.strideHours} h)` : ''} |`), '',
      `Heliocentric cruise (fit 30 d, held-out days 1 to 15, every 15 d) and Jupiter-centered orbits (fit 66 d, held-out days 1 to 33, every 33 d): ${t.regimeWindows.heliocentric.packs}.`, '');
  }
  if (t.lunarStudy) {
    const bodyName = { 'lro-lunar': 'LRO', 'danuri-lunar': 'Danuri' };
    const treatmentName = { whole: 'the whole arc', segment: 'a segment past a maneuver', refused: 'refused' };
    L.push('## 14. The Moon-centered SDN-AP on the LRO and Danuri windows (amendments A9f to A9h)', '',
      `The build\'s Moon-centered path (\`fit_sdngp\` and \`propagate\` for CENTER_NAME MOON, as the module documents it: GRGM660PRIM averaged to degree 70 with short-periodics to degree 8 in the DE440 lunar principal-axis frame, solar pressure with the Moon\'s shadow, a maneuver rule that fits the longest latest segment of an arc whose halves disagree, or refuses the block by name) on every window of the LRO pack (NAIF reconstruction) and the Danuri pack (JPL Horizons) listed in section 13: fits of 24 h and 72 h every 48 h, held-out days 1 to 3, the held-out states at 5 minutes, scored by \`score-pack.mjs\` (gp-error-model \`pair_statistics\` in the Moon-centered axes of the pack; the radial / in-track / cross-track split is in \`tables.json\`). Medians in km; SGP4 and SGP4-XP describe Earth-centered orbits and have no row here.`, '',
      '| Body | Fit | Windows fitted / listed | Fit RMS | Day 1 median (max) | Day 2 median (max) | Day 3 median (max) |', '| --- | --: | --: | --: | --- | --- | --- |',
      ...t.lunarStudy.flatMap((b) => b.byFit.map((g) => `| ${bodyName[b.pack]} | ${g.fitHours} h | ${g.fitted} / ${g.windows} | ${f(g.fitRms)} | ${[1, 2, 3].map((k) => `${f(g.days[k].median)} (${f(g.days[k].max)})`).join(' | ')} |`)), '',
      'By what the module did with the arc (the set carries USER_DEFINED_SDNGP_MANEUVER_BEFORE_SECONDS when its epoch was carried past a maneuver; a refusal is by name):', '',
      '| Body | The module fitted | Windows | Fit RMS | Day 1 | Day 2 | Day 3 | Day 3 max |', '| --- | --- | --: | --: | --: | --: | --: | --: |',
      ...t.lunarStudy.flatMap((b) => b.byTreatment.filter((g) => g.windows).map((g) => `| ${bodyName[b.pack]} | ${treatmentName[g.treatment]} | ${g.windows} | ${g.fitted ? f(g.fitRms) : ''} | ${[1, 2, 3].map((k) => (g.fitted ? f(g.days[k].median) : '')).join(' | ')} | ${g.fitted ? f(g.days[3].max) : ''} |`)),
      ...t.lunarStudy.flatMap((b) => (b.refusedWindows.length ? ['', `${bodyName[b.pack]} windows refused by name: ${b.refusedWindows.map((w) => `${w.startUtc.slice(0, 16)} (${w.fitHours} h fit) ${w.name}${w.maneuversInFit.length ? `, a maneuver in the fit span at ${w.maneuversInFit.map((e) => e.slice(0, 16)).join(', ')}` : ''}${w.maneuversInHeldOut.length ? `, in the held-out days at ${w.maneuversInHeldOut.map((e) => e.slice(0, 16)).join(', ')}` : ''}`).join('; ')}.`] : [])), '',
      t.lunarStudy[0].previousBuild ? `Against build ${t.lunarStudy[0].previousBuild}, window by window (medians of days 1 / 2 / 3, km, previous -> now):` : '', '',
      ...(t.lunarStudy[0].previousBuild ? ['| Body | Fit | Windows | Identical to the last digit | Day 1 | Day 2 | Day 3 |', '| --- | --: | --: | --: | --: | --: | --: |',
        ...t.lunarStudy.flatMap((b) => b.vsPrevious.map((g) => `| ${bodyName[b.pack]} | ${g.fitHours} h | ${g.windows} | ${g.identical} of ${g.inPreviousBuild} | ${[1, 2, 3].map((k) => `${f(g.before.days[k].median)} -> ${f(g.now.days[k].median)}`).join(' | ')} |`)), ''] : []),
      `Maneuvers in the truth (\`lunar-maneuvers.mjs\`, from the truth alone: the osculating semi-major axis from \`foundation/orbits\` averaged over one period, a step of more than the median plus six robust sigmas between consecutive periods marks a maneuver; the list is in \`lunar-maneuvers.json\`): ${t.lunarStudy.map((b) => `${bodyName[b.pack]} ${b.events} (threshold ${f(b.threshold.thresholdKm * 1000, 1)} m of orbit-averaged semi-major axis)`).join('; ')}. A window contains a maneuver when one falls between its start and the end of its third held-out day.`, '',
      '| Body | Windows | Fitted | Fit RMS | Day 1 | Day 2 | Day 3 |', '| --- | --: | --: | --: | --: | --: | --: |',
      ...t.lunarStudy.flatMap((b) => [['no maneuver', b.withoutManeuver], ['a maneuver in the fit span', b.withManeuverInFit], ['a maneuver only in the held-out days', b.withManeuverInHeldOut]].map(([name, g]) => `| ${bodyName[b.pack]}, ${name} | ${g.windows} | ${g.fitted} | ${f(g.fitRms)} | ${[1, 2, 3].map((k) => f(g.days[k].median)).join(' | ')} |`)), '',
      `Of the ${t.lunarStudy.map((b) => `${b.allWindows} ${bodyName[b.pack]}`).join(' and ')} windows, ${t.lunarStudy.map((b) => `${b.allWindowsWithManeuver} (${bodyName[b.pack]})`).join(' and ')} contain a maneuver; of the worst tenth by day-3 error, ${t.lunarStudy.map((b) => `${b.worstTenth.withManeuver} of ${b.worstTenth.windows} (${bodyName[b.pack]})`).join(' and ')} do.`, '',
      'The five worst windows of each body by day-3 error:', '',
      '| Body | Start (UTC) | Fit | The module fitted | Fit RMS | Day 1 / 2 / 3 | Maneuvers in the fit span | Maneuvers in the held-out days |', '| --- | --- | --: | --- | --: | --- | --- | --- |',
      ...t.lunarStudy.flatMap((b) => b.worst.map((w) => `| ${bodyName[b.pack]} | ${w.startUtc.slice(0, 16)} | ${w.fitHours} h | ${treatmentName[w.treatment]} | ${f(w.fitRmsKm)} | ${[1, 2, 3].map((k) => f(w.days[k])).join(' / ')} | ${w.maneuversInFit.map((e) => `${e.epochUtc.slice(0, 16)} (${f(e.deltaVCmPerS, 2)} cm/s)`).join('; ') || '-'} | ${w.maneuversInHeldOut.map((e) => `${e.epochUtc.slice(0, 16)} (${f(e.deltaVCmPerS, 2)} cm/s)`).join('; ') || '-'} |`)), '');
  }
  if (t.segmentStudy) {
    const S = t.segmentStudy, trName = { whole: 'the whole arc', segment: 'a segment (epoch carried past a maneuver or a sphere-of-influence passage)' };
    const cislunar = S.filter((x) => x.pack !== 'juno-jupiter' && /cislunar|capstone|artemis/.test(x.pack)), helio = S.filter((x) => /cruise/.test(x.pack)), jupiter = S.find((x) => x.pack === 'juno-jupiter');
    const dayCell = (x, k) => (x.days[k]?.n ? f(x.days[k].median) : '');
    L.push('## 15. The cislunar and heliocentric packs through the segment fits (amendment A9h)', '',
      `The build\'s segment fits, reached through the same methods (\`fit_sdngp\` routes Sun-centered blocks, Moon-centered blocks whose first state\'s apocenter lies beyond 10,000 km and Earth-centered blocks whose apocenter lies beyond 250,000 km to a segment fit; \`propagate\` writes the set on a grid whose center is the set\'s own): every window of the cislunar and heliocentric packs listed in section 13 (${S.reduce((a, x) => a + x.windows, 0)} windows). One $OEM block per window with the fit span and the held-out days (the fit span declared as the useable interval), no environment, no prior; the set is propagated to every held-out state of the pack, none thinned or dropped (the packs carry 1 ms time-stamp jitter, so states are paired by epoch within 5 ms), and scored by \`score-pack.mjs\` (gp-error-model \`pair_statistics\` in the pack\'s axes). Medians over the fitted windows, km; held-out day k is (fit end + (k-1) d, fit end + k d]. The radial / in-track / cross-track split is in \`tables.json\`.`, '',
      'Cislunar (median 3D error by held-out day):', '',
      '| Pack | Windows fitted / listed | Fit RMS | Day 1 | Day 2 | Day 3 | Day 4 | Day 5 | Day 6 | Day 7 |', '| --- | --: | --: | --: | --: | --: | --: | --: | --: | --: |',
      ...cislunar.map((x) => `| ${x.label} | ${x.fitted} / ${x.windows} | ${f(x.fitRms)} | ${[1, 2, 3, 4, 5, 6, 7].map((k) => dayCell(x, k)).join(' | ')} |`), '',
      'Heliocentric (median 3D error by held-out day):', '',
      '| Pack | Windows fitted / listed | Fit RMS | Day 1 | Day 3 | Day 7 | Day 15 | Day 15 max |', '| --- | --: | --: | --: | --: | --: | --: | --: |',
      ...helio.map((x) => `| ${x.label} | ${x.fitted} / ${x.windows} | ${f(x.fitRms)} | ${[1, 3, 7, 15].map((k) => dayCell(x, k)).join(' | ')} | ${f(x.days[15]?.max)} |`), '',
      'By what the module did with the arc (medians of the last key day and of day 1; refusals and failures by name):', '',
      '| Pack | The module fitted | Windows | Fit RMS | Day 1 | Last key day | Last key day max |', '| --- | --- | --: | --: | --: | --: | --: |',
      ...S.filter((x) => x.pack !== 'juno-jupiter').flatMap((x) => x.byTreatment.filter((g) => g.windows).map((g) => { const last = x.keyDays.at(-1); return `| ${x.label} | ${trName[g.treatment]} | ${g.windows} | ${f(g.fitRms)} | ${f(g.days[1]?.median)} | ${f(g.days[last]?.median)} (day ${last}) | ${f(g.days[last]?.max)} |`; })), '',
      `Refusals and failures, by name (windows): ${S.map((x) => `${x.pack} ${Object.keys(x.failures).length ? Object.entries(x.failures).map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}`).join('; ')}.`, '',
      ...(jupiter ? [`Juno\'s Jupiter orbits (Jupiter-centered, ${jupiter.windows} windows, 66 d fits): the build documents no Jupiter-centered path; ${jupiter.fitted} of ${jupiter.windows} fitted, the rest refused by name (${Object.entries(jupiter.failures).map(([k, v]) => `${k} ${v}`).join(', ') || 'none'}).`, ''] : []),
      'The five worst windows of each pack by its last key day:', '',
      '| Pack | Start (UTC) | The module fitted | Fit RMS | Day 1 | Last key day |', '| --- | --- | --- | --: | --: | --: |',
      ...S.filter((x) => x.fitted).flatMap((x) => x.worst.map((w) => `| ${x.pack} | ${w.startUtc.slice(0, 16)} | ${w.treatment === 'segment' ? 'a segment' : 'the whole arc'} | ${f(w.fitRmsKm)} | ${f(w.day1Km)} | ${f(w.lastDayKm)} (day ${w.lastDay}) |`)), '',
      `Every held-out state is scored (the accounting of each pack: held-out pack states of the fitted windows, states requested of the module, states it returned, states paired with a truth state, states left unpaired): ${S.filter((x) => x.fitted).map((x) => `${x.pack} ${x.accounting.heldOutTotal} / ${x.accounting.requested} / ${x.accounting.returned} / ${x.accounting.matched} / ${x.accounting.unmatched} (${x.accounting.windowsWithShortfall} windows with a shortfall)`).join('; ')}.`,
      `Scoring check without the module: the day RMS from \`pair_statistics\` against the root mean square of the plain 3D difference of the same pairs agree to a relative difference of at most ${S.filter((x) => x.scorerCheck.days).map((x) => `${fx(x.scorerCheck.maxRelativeDifference)} (${x.pack}, ${x.scorerCheck.days} pack-days)`).join(', ')}.`, '');
  }
  if (t.earthIdentity && t.packIdentity && SD_HEADLINE) {
    const fmt = (c) => `${c.identical} of ${c.windowsInBoth}`;
    L.push('## 16. Build ' + SD_HEADLINE.build + ' against the previous complete build, and the maneuver, hand-off and detection measurements (amendment A10)', '',
      `### 16a. Re-score of build ${SD_HEADLINE.build} against ${t.earthIdentity.previousBuild}`, '',
      `Earth windows, window by window, identical to the last digit (fit RMS and every held-out day): registered rows ${fmt(t.earthIdentity.registered)}; default-span rows ${fmt(t.earthIdentity.defaultSpan)}; the largest change of a window's fit RMS or held-out day, km (median, 90th percentile, maximum over the ${t.earthIdentity.registered.comparedBoth} registered and ${t.earthIdentity.defaultSpan.comparedBoth} default-span windows both builds fitted): registered ${['median', 'p90', 'max'].map((k) => t.earthIdentity.registered.largestChangeKm[k]?.toExponential(1)).join(', ')}, default-span ${['median', 'p90', 'max'].map((k) => t.earthIdentity.defaultSpan.largestChangeKm[k]?.toExponential(1)).join(', ')}${Object.keys(t.earthIdentity.defaultSpan.differing).length ? `; the sources that differ: ${Object.entries(t.earthIdentity.defaultSpan.differing).map(([k, v]) => `${k} ${v}`).join(', ')}` : ''}. Moon-centered, cislunar and heliocentric windows: ${t.packIdentity.map((x) => `${x.pack} ${fmt(x)}`).join(', ')}${t.packIdentity.some((x) => x.differing) ? ` (the differing windows: ${t.packIdentity.filter((x) => x.differing).map((x) => `${x.pack} ${x.differing}, treatment changed ${x.treatmentChanged}`).join('; ')})` : ''}.`, '',
      'HEO sources, medians over the windows of the build (fit span in hours, 3D RMS in km by held-out day), previous -> now:', '',
      '| Source | Fit | Windows (identical) | Fitted | Fit span | Day 1 | Day 2 | Day 3 |', '| --- | --: | --: | --: | --: | --: | --: | --: |',
      ...(t.heoVsPrevious ?? []).map((x) => `| ${x.source} | ${x.fitHours} h | ${x.now.windows} (${x.identical} of ${x.inBoth}) | ${x.before.fitted} -> ${x.now.fitted} | ${f(x.before.spanHours, 1)} -> ${f(x.now.spanHours, 1)} | ${[1, 2, 3].map((k) => `${f(x.before.days[k])} -> ${f(x.now.days[k])}`).join(' | ')} |`), '',
      `Fits refused as fit-implausible (an Earth fit above 100 km RMS), by source: ${t.fitImplausible && Object.keys(t.fitImplausible.now).length ? Object.entries(t.fitImplausible.now).map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}${t.fitImplausible?.before ? `; the previous build: ${Object.keys(t.fitImplausible.before).length ? Object.entries(t.fitImplausible.before).map(([k, v]) => `${k} ${v}`).join(', ') : 'none'}` : ''}.`, '');
  }
  L.push(...eventsMarkdown(t.eventsStudy));
  const CREDITED = ['spacex-starlink', 'nasa-iss-oem', 'esa-navigation-office', 'nasa-cddis', 'gfz-rapid-gnss', 'ilrs', 'ilrs-nsgf', 'ilrs-cddis', 'gfz-kp', 'noaa-swpc', 'iers', 'jpl-de440', 'jpl-horizons', 'stsci-mast-tess', 'nrlmsise00', 'egm', 'fes2004'];
  L.push('## Credits and terms', '', ...CREDITED.map((id) => `- ${licenseSource(id).credit}`), '- COMSPOC Spacebook (XP sets and SynCoPate trajectories with covariance, captured locally 2026-10-23): scored locally only, never fitted to or used as an input; terms: no commercial use, no redistribution, no derivative works. Only aggregate statistics are published here.', '', 'Every other source and its terms: [docs/data-licenses.md](../../docs/data-licenses.md).', '');
  L.push('## Reproduce, resume, extend', '',
    '- Steps (each reads only the frozen plan and the local archive): `population.mjs`, `truth.mjs --workers N` (resumable: a satellite with a row is skipped; stop with `touch <store>/truth.stop`), `baselines.mjs`, `fetch-kernels.mjs` (paced NAIF fetcher) with `spk-windows.mjs`, `bench.mjs`, `comspoc.mjs`, `covariance.mjs`, `fitlength.mjs`, `refit.mjs`, `newer.mjs` (re-run as newer SpaceX files arrive; `--truth refit30` scores the refitted truth), `m123.mjs --workers N` with `m123-report.mjs` (section 12), `fetch-horizons.mjs`, `fetch-mast-tess.mjs` (needs `NODE_EXTRA_CA_CERTS`, see its header), `fetch-gnss-rapid.mjs`, `fetch-slr.mjs` (needs the Earthdata token in the environment file `lib/cddis.mjs` names, never printed) with `gnss-rapid-convert.mjs` and `slr-convert.mjs` (the public sources approved on 2026-10-24, stored in the archive with provenance rows), `sdngp-run.mjs`, `span-windows.mjs` (the SGP4 and XP rows of section 1c), `horizons-packs.mjs`, `regime-windows.mjs` and `score-pack.mjs` (section 13), `watch-newer.mjs` (waits for the next SpaceX batch, runs `newer.mjs`, regenerates the tables, commits nothing), `inventory.mjs`, `tables.mjs`, `manifest.mjs`; the E2E is `node experiments/sdn-gp-starlink-ffm-match/run.mjs --check`. Setup: `npm ci --prefix experiments/sdn-gp-starlink-ffm-match`; a modules checkout at commit 118de023 (sparse is enough: propagator/sgp4-xp without third_party, propagator/ffm, analysis/od, analysis/gp-error-model, foundation, data-source/space-weather, data) named by `SDN_MODULES_ROOT`, with its `node_modules` linked to the experiment\'s.',
    '- Local store (not committed): `/opt/data/sdn-archive/sdn-gp-starlink-ffm-match/` holds the derived FFM trajectories (`truth/`), the saved environment (EOP, space weather with its extension) and the window rows.',
    '- SDN-AP: `lib/sdngp.mjs` runs side B\'s `sdn-ap-propagator` (named `sdn-gp-propagator` through build 35cd83a2b714; a copy of its built wasm, named by SHA-256 prefix, in `<store>/sdngp-snapshot/`), `lib/baselines.mjs` `fitSdngp` is the third fitter beside `fitXp` and `fitSgp4`, and `sdngp-run.mjs` runs it over every source on one build (`baselines.mjs --arm sdngp`, `spk-windows.mjs --arm sdngp`, `starlink-sdngp.mjs`, `starlink-lowering.mjs`, `fitlength.mjs --arm sdngp`, `span-windows.mjs --arm sdngp`; `newer.mjs` carries the arm when a complete build exists), rows in `<store>/rows/sdngp/<build>/`; a new build of the module is one more `sdngp-run.mjs`, and section 2a lists the builds. The last row of section 5 stays `pending`. For the regimes awaiting SDN-AP, `pack-truth.mjs` writes the truth packs and `compareStates` (gp-error-model `pair_statistics`) scores any predicted states against them in radial / in-track / cross-track axes whatever the center. The arms 3-6 of the task (term ranking, Chebyshev residual bytes, analytic STM) follow in phases 3-4.',
    '- Maneuvers, hand-off and detection (amendment A10): `events-truth.mjs --kind m22,m23,m28 --shard k/n` makes the FFM-1 truths (impulses and finite burns planted in its typed request; synthetic decays to its stop at 100 km) under `<store>/events/`, independent of the build; `sdngp-run.mjs --pin <build> --only m22,m23,m28,m24` scores them with that build of the module (rows `m22`, `m23`, `m28`, `m24` in `rows/sdngp/<build>/`); `lib/sdngp-events.mjs` is the module\'s `maneuver`, `detect_maneuvers` and `reentry` surfaces, `lib/ffm-events.mjs` and `lib/decay.mjs` are FFM-1\'s.',
    '- NASA ISS archive, reentries and first sets (amendments A11 to A12b): `fetch-iss-oem.mjs` fetches NASA\'s public ISS OEM archive (748 files, 2 s apart, nothing committed) and `iss-burns.mjs` writes `iss-burns.json` from the headers alone; `m29-extract.mjs` and `m29-extract-cords.mjs` cut the element-set histories of the reentered objects from the local Space-Track archive and the CORDS spreadsheet (kept in the archive, never committed); `m30-truth.mjs` writes `m30-truth.json` (re-run it, then `tables.mjs`, as TIP and decay messages arrive: the frozen reentry predictions of the lowering Starlinks are then scored); `m31-capture.mjs` processes the current files of a new batch into derived trajectories (`--summary` writes `m31-capture.json`); `m32-truth.mjs` makes the synthetic batches\' FFM-1 truths; `sdngp-run.mjs --pin <build> --only m24a,m24p,m29,m30,m31,m32` scores them with a build of the module.',
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
