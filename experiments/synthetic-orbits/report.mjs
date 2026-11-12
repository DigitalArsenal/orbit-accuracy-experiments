// The result file and the maps of a synthetic-orbit run (run.mjs --report): one JSON (schema sdn-ap-synthetic/3) and one Markdown page,
// for one build, one force mode, one fit way and one truth start (the file's name, title and command carry all four).
// The bar (stack #503): AP's forecast never more than 100 m from the numerical propagator at any time from 0 to 5 days. D is the
// largest 3D distance between AP's forecast and the truth over 0 to 120 h at the truth's own 300 s epochs; a case is within the bar
// when D <= 100 m over the whole 0 to 120 h. The page: the band table (k of n within 100 m, with every case that has a truth past the
// cutoff in n, and the cases that are not within for another reason counted beside), the perigee by eccentricity maps, the cases above
// 100 m worst first, the cases whose truth ends before 120 h with their span, the cases that decay by the cutoff or have no truth with
// their reason, the named edge cases, and what the run does not cover. No pass rate is printed: the grid and the named cases are lists of cases, not a sample.
import fs from 'node:fs';
import path from 'node:path';
import { GRID, BANDS, AM, bandOf, BAR_BANDS, barBandOf, labelOf } from './cases.mjs';
import { FITS, ARC72_TEXT } from './fits.mjs';

const PASS_M = 100, BAR_H = 120;
const MODE_TEXT = {
  full: 'All forces on both sides.',
  'no-drag': 'Without drag on both sides: the truth is the full setting without drag on every orbit, and AP fits without its atmosphere.',
  'no-drag-no-radiation': 'Gravity, the solid tide, relativity and the Sun and Moon only: the truth without drag or radiation pressure, AP without its atmosphere and with its radiation term held at 0.',
};
const TOLERANCE = 'A drag case\'s truth is flown at tolerance 1e-10 (the L70S setting of headline-loop/lib/settings.mjs), which that file records as meters to tens of meters from the converged orbit with drag.';
const statisticOf = (fit, truthStartH) => [
  'Each orbit is made up (cases.mjs, seeded).',
  `Its state at the truth's start, ${truthStartH} h before the cutoff, is made from the case's mean elements (the record seed.mjs writes) by one reference build, sdn-ap 0.6.26 (modules 7ed7cf88), whatever build is scored, so every build is scored against the same truth; each row names its truth's hash.`,
  'The truth is the numerical propagator, FFM 2.2.0 (pinned by hash in headline-loop/lib/ffm.mjs), flown from that state on a 300 s grid to 7 days past the cutoff.',
  `Fit way ${fit}: ${fit === 'arc72' ? ARC72_TEXT : FITS[fit].text}`,
  `D is the largest 3D distance between AP's forecast and the truth over 0 to ${BAR_H} h after the cutoff, at the truth's own 300 s epochs. A case is within the bar when D is at most ${PASS_M} m over the whole 0 to ${BAR_H} h; a truth that ends before ${BAR_H} h is never within.`,
  'The daily figures are the root mean square of the 3D distance over the 24 h ending at each day.',
  'Both sides see the same space weather: the weather known at the cutoff (GFZ observed, then the NOAA forecast issued before it) drives the truth\'s drag and AP\'s.',
  ...(fit === 'arc72' ? ['SGP4-XP is flown as it is in every force mode.'] : []),
  TOLERANCE,
].join(' ');
const TRUTH = {
  L70S: 'FFM 2.2.0: Earth gravity to degree and order 70, NRLMSISE-00 drag on the weather known at the cutoff, sphere radiation pressure with conical shadow, the Sun and Moon, solid Earth tides, general relativity; RK78 at 1e-10 with steps up to 120 s. For orbits with perigee under 2,500 km, all forces on.',
  Ffull: 'FFM 2.2.0: as L70S without drag.',
  'Ffull without radiation pressure': 'FFM 2.2.0: as L70S without drag or radiation pressure.',
};
const regimeOf = (c) => (c.e >= 0.3 ? 'highly elliptical (e 0.3 and above)' : c.n >= 6.4 ? 'low orbit (period under 225 min)' : c.n >= 1.2033 ? 'medium Earth orbit' : c.n >= 0.8022 ? 'geosynchronous (0.8 to 1.2 rev/day)' : 'beyond geosynchronous');
const fmt = (x) => (x == null ? '-' : x >= 10000 ? `${Math.round(x / 1000).toLocaleString('en-US')} km` : x >= 1000 ? `${(x / 1000).toFixed(1)} km` : `${Math.round(x)} m`);
const median = (v) => { const s = v.filter(Number.isFinite).sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };

/**
 * What became of a case in this run, from its row (run.mjs flyCase):
 * - outside n: not-flown (no row); no-truth (it failed before its truth existed: the weather, the seed record or the reference
 *   flight; or the numerical flight failed before the cutoff for another reason than a decay); decayed (the orbit decays below 100 km
 *   at or before the cutoff, so there is no forecast to score: the numerical flight stopped there, as FFM stops at a reentry, or ran
 *   through it);
 * - in n: within or over (D over the whole 0 to 120 h), short (the truth ends before 120 h, a decay after the cutoff among them:
 *   never within, D over its span where one was scored), refused (AP's fit refused), flight-failed (AP's flight failed), failed
 *   (another error after the truth existed).
 */
const REENTRY = /descends below 100 km/;
function statusOf(r, ap) {
  if (!r) return { status: 'not-flown', reason: 'not flown in this run' };
  const t = r.truth;
  if (!t) return { status: 'no-truth', reason: `failed before its truth existed: ${r.error ?? 'no truth'}` };
  if (t.decayedAtH != null && t.decayedAtH <= 0) return { status: 'decayed', reason: `decays below 100 km at ${t.decayedAtH} h, at or before the cutoff: no forecast to score` };
  if (t.error && t.flownToDay == null) {
    return REENTRY.test(t.error) ? { status: 'decayed', reason: `decays below 100 km before the cutoff, where the numerical flight stops: no forecast to score (${t.error})` }
      : { status: 'no-truth', reason: `the numerical flight failed before the cutoff: ${t.error}` };
  }
  const shortSpan = () => {
    if (t.decayedAtH != null) return { spanH: t.decayedAtH, why: `decays below 100 km at ${t.decayedAtH} h` };
    if (t.flownToDay != null) return { spanH: t.flownToDay * 24, why: `the numerical flight ends at day ${t.flownToDay}${t.error ? ` (${t.error})` : ''}` };
    return null;
  };
  if (!ap) {
    const s = shortSpan();
    if (s) return { status: 'short', spanH: s.spanH, reason: s.why };
    return { status: 'failed', reason: `failed after its truth existed: ${r.error ?? 'no result'}` };
  }
  if (ap.error) return /^fit\b/.test(ap.error) ? { status: 'refused', reason: `AP's fit refused: ${ap.error}` } : { status: 'flight-failed', reason: `AP's fit or flight failed: ${ap.error}` };
  const md = ap.maxDistance;
  if (md.spanH < BAR_H) { const s = shortSpan(); return { status: 'short', spanH: md.spanH, reason: s?.why ?? `the truth ends at ${md.spanH} h` }; }
  return { status: md.maxM <= PASS_M ? 'within' : 'over' };
}
const IN_N = new Set(['within', 'over', 'short', 'refused', 'flight-failed', 'failed']);
const NOT_WITHIN_MARK = new Set(['short', 'refused', 'flight-failed', 'failed', 'no-truth', 'decayed']);

export async function report(ctx, args) {
  const { commit, version, wasmSha, rowsFile, seed, gridStep, all, mode, guard, fit, truthStartH } = ctx;
  const out = args.out;
  if (!out) throw new Error('--report needs --out <dir>');
  // the rows of this build flown from the reference state (truth.hash), and the rows of cases that failed before their truth existed
  const byHash = new Map((fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : []).filter((r) => r.wasmSha256 === wasmSha && (r.truth?.hash || !r.truth)).map((r) => [r.caseHash, r]));
  const { createHash } = await import('node:crypto');
  const hashOf = (c) => createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0, 16);
  const rows = all.cases.map((c) => ({ c, r: byHash.get(hashOf(c)) ?? null }));
  const harnesses = [...new Set(rows.filter((x) => x.r).map((x) => x.r.harness))];
  const theory = (r, t) => (r?.[t] ? { pcf: r[t].pcf, fitRmsM: r[t].fitRmsM ?? null, maxDistance: r[t].maxDistance ?? null, days: r[t].days ?? null, error: r[t].error ?? null } : null);
  const items = rows.map(({ c, r }) => {
    const ap = theory(r, 'ap'), xp = theory(r, 'xp'), st = statusOf(r, ap), full = st.status === 'within' || st.status === 'over';
    const D = ap?.maxDistance?.maxM ?? null, X = xp?.maxDistance?.maxM ?? null, xpFull = xp?.maxDistance && xp.maxDistance.spanH >= BAR_H;
    return { id: c.id, kind: c.kind, name: c.name ?? null, label: labelOf(c), band: barBandOf(c), regime: regimeOf(c), am: c.am, elements: r?.elements ?? { n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma, hpKm: c.hpKm, haKm: c.haKm, cutoff: c.cutoff },
      truth: r?.truth ?? null, flown: !!r, error: r?.error ?? null, status: st.status, reason: st.reason ?? null, spanH: st.spanH ?? (ap?.maxDistance?.spanH ?? null), ap, xp,
      D, fullD: full ? D : null, within: st.status === 'within', xpD: X, xpWithin: IN_N.has(st.status) && xpFull ? X <= PASS_M : false,
      xpOverAp: full && D && X && xpFull ? Math.round((X / D) * 100) / 100 : null, costUsPerState: r?.costUsPerState ?? null };
  });
  const count = (xs, s) => xs.filter((x) => x.status === s).length;
  const bandRow = (xs) => {
    const inN = xs.filter((x) => IN_N.has(x.status)), full = inN.filter((x) => x.fullD != null), xpFull = inN.filter((x) => x.xp?.maxDistance && x.xp.maxDistance.spanH >= BAR_H);
    return { cases: xs.length, n: inN.length, within: count(xs, 'within'), over: count(xs, 'over'), short: count(xs, 'short'), refused: count(xs, 'refused'), flightFailed: count(xs, 'flight-failed'), failed: count(xs, 'failed'),
      decayed: count(xs, 'decayed'), noTruth: count(xs, 'no-truth'), notFlown: count(xs, 'not-flown'),
      scored: full.length, medianDM: median(full.map((x) => x.fullD)), worstDM: full.length ? Math.max(...full.map((x) => x.fullD)) : null,
      medianFirstOver100mH: median(full.map((x) => x.ap.maxDistance.firstOver100mH).filter((v) => v != null)),
      xpWithin: inN.filter((x) => x.xpWithin).length, xpScored: xpFull.length, xpMedianDM: median(xpFull.map((x) => x.xpD)) };
  };
  const bands = Object.fromEntries(BAR_BANDS.map((b) => [b, bandRow(items.filter((x) => x.band === b))]));
  const failing = items.filter((x) => x.status === 'over').sort((a, b) => b.D - a.D).map((x) => ({ id: x.id, kind: x.kind, label: x.label, band: x.band, hpKm: x.elements.hpKm, e: x.elements.e, i: x.elements.i, am: x.am, apDM: x.D, apAtH: x.ap.maxDistance.atH, apFirstOver100mH: x.ap.maxDistance.firstOver100mH, xpDM: x.xpD, apFitRmsM: x.ap.fitRmsM, truth: x.truth?.setting }));
  const short = items.filter((x) => x.status === 'short').map((x) => ({ id: x.id, label: x.label, band: x.band, spanH: x.spanH, reason: x.reason, apDM: x.D }));
  const without = items.filter((x) => ['refused', 'flight-failed', 'failed', 'decayed', 'no-truth', 'not-flown'].includes(x.status)).map((x) => ({ id: x.id, label: x.label, band: x.band, status: x.status, reason: x.reason }));
  const wall = rows.filter((x) => x.r).map((x) => x.r.wallS).filter(Number.isFinite);
  const command = `node experiments/synthetic-orbits/run.mjs --modules-commit ${commit} --modules-root <modules clone> --seed ${seed} --grid-step ${gridStep}${guard ? ' --guard' : ''}${mode === 'no-drag' ? ' --no-drag' : mode === 'no-drag-no-radiation' ? ' --no-drag --no-radiation' : ''} --fit ${fit} --truth-start-h ${truthStartH}`;
  const doc = {
    schema: 'sdn-ap-synthetic/3', measured: new Date().toISOString().slice(0, 10), mode, modeText: MODE_TEXT[mode], guard, fit, truthStartH, fitText: fit === 'arc72' ? ARC72_TEXT : FITS[fit].text, fitAfterCutoff: fit === 'arc72' ? false : FITS[fit].after,
    module: { version, modulesCommit: commit, wasmSha256: wasmSha }, harness: { repo: 'orbit-accuracy-experiments', commits: harnesses, command },
    seed, gridStep, statistic: statisticOf(fit, truthStartH), truthSettings: TRUTH, areaToMass: Object.fromEntries(Object.entries(AM).map(([k, v]) => [k, { areaOverMassM2Kg: v, dragTerm: 2.2 * v, radiationTerm: 1.2 * v }])),
    grid: GRID, inclinationBands: BANDS, cost: { orbitsFlown: wall.length, wallSecondsSum: Math.round(wall.reduce((s, x) => s + x, 0)), medianWallS: median(wall) },
    bands, failing, short, without, cases: items, notCovered: notCoveredOf(all),
  };
  fs.mkdirSync(out, { recursive: true });
  const base = path.join(out, `synthetic-${version}-seed${seed}-${mode}-fit-${fit}-ts${truthStartH}${guard ? '-guard' : ''}`);
  fs.writeFileSync(`${base}.json`, `${JSON.stringify(doc, null, 1)}\n`);
  fs.writeFileSync(`${base}.md`, page(doc, items));
  const all0 = bandRow(items);
  console.error(`report: ${base}.json and .md; ${all0.within} of ${all0.n} with a truth within 100 m (${all0.over} over, ${all0.short} short of 120 h, ${all0.refused} refused, ${all0.flightFailed} flight failed, ${all0.failed} other); ${all0.decayed} decayed by the cutoff, ${all0.noTruth} without a truth, ${all0.notFlown} not flown`);
  for (const [b, x] of Object.entries(bands)) console.error(`  ${b}: ${x.within} of ${x.n} within 100 m; median D ${fmt(x.medianDM)}, worst ${fmt(x.worstDM)} over ${x.scored} scored`);
  process.exit(0);
}

function notCoveredOf(all) {
  const left = all.notCovered.map((x) => (x.edge ? `${x.edge}: ${x.why}` : `grid cell perigee ${x.hpKm} km, e ${x.e}, i ${x.i}: ${x.why}`));
  return [
    'One cutoff and one draw of the other angles per grid cell: the Sun\'s and Moon\'s geometry is sampled across the grid, not swept within a cell.',
    'The grid is a typical satellite (A/m 0.01 m2/kg); the dense sphere and light debris fly only on the area-to-mass subset (72 orbits) and the named edge cases.',
    'The truth has no ocean tides, Earth radiation pressure, attitude or maneuvers; the weather is the as-issued weather of the cutoff on both sides, so the weather forecast\'s own error is not in these figures.',
    'Apogees beyond the Moon\'s distance (384,400 km) are not flown.',
    ...left,
  ];
}

function page(doc, items) {
  const L = [];
  L.push(`# Synthetic orbits: sdn-ap ${doc.module.version} against the numerical propagator, ${doc.mode}, fit ${doc.fit}, truth from ${doc.truthStartH} h before the cutoff${doc.guard ? ' (guard set)' : ''}`, '');
  L.push(`Modules ${doc.module.modulesCommit.slice(0, 12)} (wasm ${doc.module.wasmSha256.slice(0, 12)}), seed ${doc.seed}, grid step ${doc.gridStep}, fit way ${doc.fit}, truth start ${doc.truthStartH} h before the cutoff; ${doc.cost.orbitsFlown} orbits with a row, ${Math.round((doc.cost.wallSecondsSum / 3600) * 10) / 10} worker-hours. ${doc.modeText}`, '');
  L.push(`Command: \`${doc.harness.command}\``, '');
  L.push(doc.statistic, '');
  L.push('The grid and the named cases are lists of cases to work on, not a sample: the figures below are counts, and carry no pass rate.', '');
  L.push(`## The bar by band (D: the largest distance to the truth over 0 to ${BAR_H} h; within at ${PASS_M} m)`, '',
    'n counts every case that has a truth past the cutoff. A case whose truth ends before 120 h (a decay after the cutoff among them), whose fit was refused or whose flight failed is in n and is not within; each is counted beside. An orbit that decays at or before the cutoff has no forecast to score and is not in n, whether the numerical flight stopped there or ran through it; nor are the cases without a truth and those not flown. Median and worst D are over the scored cases, those with a D over the whole 0 to 120 h.', '',
    '| Band | Cases | Within 100 m (k of n) | Over 100 m | Truth short of 120 h | Refused fit | Failed flight | Other failure | Decayed by the cutoff | Without a truth | Not flown | Median D (scored) | Worst D (scored) | Median first hour above 100 m | SGP4-XP within (of n) | SGP4-XP median D |',
    '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|');
  for (const [b, x] of Object.entries(doc.bands)) L.push(`| ${b} | ${x.cases} | ${x.within} of ${x.n} | ${x.over} | ${x.short} | ${x.refused} | ${x.flightFailed} | ${x.failed} | ${x.decayed} | ${x.noTruth} | ${x.notFlown} | ${fmt(x.medianDM)} (${x.scored}) | ${fmt(x.worstDM)} | ${x.medianFirstOver100mH ?? '-'} | ${doc.fit === 'arc72' ? `${x.xpWithin} of ${x.n}` : '-'} | ${doc.fit === 'arc72' ? `${fmt(x.xpMedianDM)} (${x.xpScored})` : '-'} |`);
  L.push('');
  // the maps: every grid case with a row is an orbit of its cell; a cell holding a case that is not within for another reason is marked
  const grid = items.filter((x) => x.kind === 'grid');
  L.push('In the maps a cell gives the worst D over its scored orbits and (orbits within 100 m / orbits with a row); * marks a cell holding an orbit whose truth ends before 120 h, whose fit was refused, whose flight failed, that decays by the cutoff or that has no truth; "not flown" a cell whose orbits have no row; an empty cell holds no case of this run.', '');
  const table = (title, xs, cell) => {
    L.push(title, '', `| Perigee \\ e | ${doc.grid.eccentricity.join(' | ')} |`, `|---|${doc.grid.eccentricity.map(() => '---').join('|')}|`);
    for (const hp of doc.grid.perigeeKm) L.push(`| ${hp.toLocaleString('en-US')} km | ${doc.grid.eccentricity.map((e) => { const ys = xs.filter((x) => x.elements.hpKm === hp && x.elements.e === e); return ys.length ? cell(ys) : ' '; }).join(' | ')} |`);
    L.push('');
  };
  const worst = (ys) => {
    const flown = ys.filter((x) => x.status !== 'not-flown');
    if (!flown.length) return 'not flown';
    const scored = flown.filter((x) => x.fullD != null), mark = flown.some((x) => NOT_WITHIN_MARK.has(x.status)) ? ' *' : '';
    return `${scored.length ? fmt(Math.max(...scored.map((x) => x.fullD))) : 'no D'} (${flown.filter((x) => x.within).length}/${flown.length})${mark}`;
  };
  table('## Perigee by eccentricity, every inclination: AP\'s worst D (within 100 m / orbits)', grid, worst);
  for (const [b, [lo, hi]] of doc.inclinationBands.entries()) {
    const inBand = grid.filter((x) => bandOf(x.elements.i) === b);
    if (!inBand.length) continue;
    const incs = [...new Set(inBand.map((x) => x.elements.i))].sort((p, q) => p - q).join(', ');
    table(`## Inclination ${lo} to ${Math.round(hi)} deg (${incs}): AP's worst D (within 100 m / orbits)`, inBand, worst);
    if (doc.fit === 'arc72') table(`## Inclination ${lo} to ${Math.round(hi)} deg: SGP4-XP's D over AP's, the median over the orbits both scored (above 1: AP is closer)`, inBand, (ys) => { const v = median(ys.map((x) => x.xpOverAp)); return v == null ? '-' : String(v); });
  }
  L.push('## Above 100 m over the whole 0 to 120 h, worst first', '', '| Orbit | Band | Perigee | e | i | A/m | AP D | At hour | First above 100 m | SGP4-XP D | AP fit RMS |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const f of doc.failing.slice(0, 60)) L.push(`| ${f.label} | ${f.band} | ${f.hpKm.toLocaleString('en-US')} km | ${f.e} | ${f.i} | ${f.am} | ${fmt(f.apDM)} | ${f.apAtH} | ${f.apFirstOver100mH ?? '-'} | ${fmt(f.xpDM)} | ${fmt(f.apFitRmsM)} |`);
  if (doc.failing.length > 60) L.push('', `${doc.failing.length - 60} more in the result file.`);
  L.push('', '## Truth shorter than 120 h (never within; D over the span the truth reaches)', '', '| Orbit | Band | Span (h) | Why | AP D over the span |', '|---|---|---:|---|---|');
  for (const s of doc.short) L.push(`| ${s.label} | ${s.band} | ${s.spanH} | ${s.reason} | ${fmt(s.apDM)} |`);
  if (!doc.short.length) L.push('| none | | | | |');
  L.push('', '## Refused, failed, decayed by the cutoff, without a truth or not flown', '', '| Orbit | Band | What became of it |', '|---|---|---|');
  for (const w of doc.without) L.push(`| ${w.label} | ${w.band} | ${w.reason} |`);
  if (!doc.without.length) L.push('| none | | |');
  L.push('', '## The named edge cases', '', `| Case | AP D | First above 100 m | AP day 1 / 3 / 5 / 7 | ${doc.fit === 'arc72' ? 'SGP4-XP D | ' : ''}Within |`, `|---|---|---|---|${doc.fit === 'arc72' ? '---|' : ''}---|`);
  for (const x of items.filter((y) => y.kind === 'edge')) {
    const days = x.ap?.days ? ['1', '3', '5', '7'].map((d) => fmt(x.ap.days[d])).join(' / ') : x.reason ?? '-';
    const within = x.status === 'within' ? 'yes' : x.status === 'over' ? 'no' : x.status === 'short' ? `no (truth to ${x.spanH} h)` : IN_N.has(x.status) ? 'no' : '-';
    L.push(`| ${x.label} | ${fmt(x.D)}${x.status === 'short' && x.D != null ? ` (to ${x.spanH} h)` : ''} | ${x.ap?.maxDistance?.firstOver100mH ?? '-'} | ${days} | ${doc.fit === 'arc72' ? `${fmt(x.xpD)} | ` : ''}${within} |`);
  }
  L.push('', '## Not covered', '', ...doc.notCovered.map((x) => `- ${x}`), '');
  return L.join('\n');
}
