// The result file and the maps of a synthetic-orbit run (run.mjs --report): one JSON (schema sdn-ap-synthetic/3) and one Markdown page,
// for one build, one force mode, one fit way and one truth start (the file's name, title and command carry all four).
// The bar (stack #503): AP's forecast never more than 100 m from the numerical propagator at any time from 0 to 5 days. D is the
// largest 3D distance between AP's forecast and the truth over 0 to 120 h at the truth's own 300 s epochs; a case is within the bar
// when D <= 100 m over the whole 0 to 120 h. The page: the band table (k of n within 100 m, with every case that has a truth past the
// cutoff in n, and the cases that are not within for another reason counted beside), the perigee by eccentricity maps, the cases above
// 100 m worst first, the cases whose truth ends before 120 h with their span, the cases that decay by the cutoff or have no truth with
// their reason, the named edge cases, the cases whose drag truth is not converged to a tenth of the bar (CONVERGENCE, marked beside their
// rows wherever they appear), and what the run does not cover; with --perigee-scan, the scanned cases whose scan reads a state more than
// 100 m off or could not run (AP's and SGP4-XP's figures beside their D on the grid; the two counted apart). No pass rate is printed: the
// grid and the named cases are lists of cases, not a sample.
import fs from 'node:fs';
import path from 'node:path';
import { GRID, BANDS, AM, bandOf, BAR_BANDS, barBandOf, labelOf } from './cases.mjs';
import { FITS, ARC72_TEXT, RUNGS, xpTextOf, NO_XP_TEXT, XP_WEATHER_TEXT, SCAN, SCAN_MIN_E } from './fits.mjs';

const PASS_M = 100, BAR_H = 120;
/** The force mode, said of what the slot flies: AP's settings, a rung's settings, or (rung xp) SGP4-XP's record. */
const modeTextOf = (mode, rung) => {
  const noDrag = rung === 'xp' ? 'the slot\'s SGP4-XP record flies its own Jacchia 1970 atmosphere on its own flux model, as it does everywhere'
    : `${rung ? 'the slot\'s settings name the theory\'s' : 'AP\'s settings name its own'} Jacchia 1970 atmosphere and solve a drag term under the default prior`;
  if (mode === 'full') return `All forces on both sides, drag where the perigee is under 2,500 km. At or above 2,500 km the truth has no drag, and ${noDrag}.`;
  if (mode === 'no-drag') return `Without drag in the truth: the truth is the full setting without drag on every orbit; ${noDrag}.`;
  return `Gravity, the solid tide, relativity and the Sun and Moon only: the truth without drag or radiation pressure; ${noDrag}${rung === 'xp' ? '' : ', and the radiation term is held at 0'}.`;
};
const DEGREES_TEXT = 'AP\'s record states tesseral degree 31 and, from sdn-ap 0.6.42, zonal degree 70 on a case in the class of the low table (e at or below 0.05 and the perigee under 2,500 km: sdn-ap SPEC 16.11 and 12.5), the degrees of AP_Z70_TIDES, and zonal degree 20 on every other case; each row\'s pcf label names the degrees it used, and a row flown before this rule keeps the degrees it was flown at.';
const DRAG_TERM_TEXT ='Each row records AP\'s fitted drag term (bterm), so a fit where the truth has no drag can be read with the term it solved.';
/**
 * A drag truth not converged to a tenth of the bar (stack #520): its lowest altitude over the bar's span (row.truth.minAltitudeSpanKm,
 * its lowest perigee there) is under underKm. At 1e-13 such a truth still moves 15 to 34 m on a tenfold tighter flight; every other low
 * case measured moves at most 3.2 m. `measured`: each low case's truth flown again at 1e-12 and 1e-13 (thirteen low drag cases, run.mjs's
 * truth request flown at 1e-10, 1e-11, 1e-12 and 1e-13, stack #520), the largest distance between the two over 0 to 120 h. A row without minAltitudeSpanKm (flown
 * before rows held it) is marked from its truth's lowest altitude over the whole flight (minAltitudeKm), and says so.
 */
const CONVERGENCE = {
  underKm: 150,
  measured: { 'grid-hp200-e0.9-i130': 34, 'grid-hp200-e0.9-i20': 22, 'edge-heo-perigee-150': 15.5, 'grid-hp200-e0.7-i130': 3.2, 'grid-hp400-e0.5-i55': 2.2, 'grid-hp300-e0.9-i165': 2,
    'grid-hp200-e0.9-i98': 1.7, 'grid-hp200-e0.5-i98': 1.3, 'grid-hp300-e0.5-i165': 0.8, 'grid-hp300-e0.9-i20': 0.5, 'grid-hp300-e0.3-i130': 0.5, 'grid-hp200-e0.5-i130': 0.3, 'grid-hp200-e0.9-i55': 0 },
  text: 'A case whose drag truth falls under 150 km over 0 to 120 h is marked "truth not converged": at 1e-13 such a truth still moves 15 to 34 m between 1e-12 and 1e-13, a tenth to a third of the bar, where every other low case measured moves at most 3.2 m. Each marked case gives its lowest altitude and, where it was measured, that step.',
};
const convergenceOf = (truth, id) => {
  if (!truth?.dragAreaOverMass) return null;
  const lowKm = truth.minAltitudeSpanKm ?? truth.minAltitudeKm ?? null, over = truth.minAltitudeSpanKm != null ? 'span' : 'flight';
  return lowKm == null ? null : { lowestKm: lowKm, over, notConverged: lowKm < CONVERGENCE.underKm, step12to13M: CONVERGENCE.measured[id] ?? null };
};
const TOLERANCE = 'A drag case\'s truth is flown at tolerance 1e-13 (the L70S13 setting of headline-loop/lib/settings.mjs). At 1e-10 the integration after each change of the weather rows leaves a drag truth meters to hundreds of meters from the converged orbit; at 1e-13 a tenfold tighter flight moves it under 4 m, except where the perigee falls under 150 km (15 to 34 m). A truth without drag is flown at 1e-10, exact there to the meter. A drag case is read only from rows on the 1e-13 truth. The real rows\' table states each row\'s numerical tolerance in its method line: a row is at 1e-13 where every one of its windows has been fitted and flown at that setting, and at 1e-10 otherwise. In the 0.6.42 table, strong drag 2025 is at 1e-13 and every other row at 1e-10. Every made-up truth with drag is at 1e-13, since each is one flight from a known state.';
const fitTextOf = (fit, withXp) => (fit === 'arc72' ? ARC72_TEXT : `${FITS[fit].text} ${withXp ? xpTextOf(fit) : NO_XP_TEXT}`);
/** What the slot holds: AP's headline record, or one rung's record (a rung-xp slot holds SGP4-XP's record). */
const slotOf = (rung) => (!rung ? { name: 'AP', short: 'AP' } : rung === 'xp' ? { name: 'the slot\'s SGP4-XP record (rung xp)', short: 'SGP4-XP (rung xp)' } : { name: `the slot (rung ${rung})`, short: `Slot (rung ${rung})` });
const WEATHER = 'the weather known at the cutoff (GFZ observed, then the NOAA forecast issued before it)';
const statisticOf = (fit, truthStartH, rung = null, withXp = false, perigeeScan = false, scanDigest = null, scanMinE = null) => [
  'Each orbit is made up (cases.mjs, seeded).',
  `Its state at the truth's start, ${truthStartH} h before the cutoff, is made from the case's mean elements (the record seed.mjs writes) by one reference build, sdn-ap 0.6.26 (modules 7ed7cf88), whatever build is scored, so every build is scored against the same truth; each row names its truth's hash.`,
  'The truth is the numerical propagator, FFM 2.2.0 (pinned by hash in headline-loop/lib/ffm.mjs), flown from that state on a 300 s grid to 7 days past the cutoff.',
  `Fit way ${fit}: ${fitTextOf(fit, withXp)}`,
  ...(rung ? [`Rung ${rung}, one of the rungs between SGP4-XP's record and AP's headline record: ${RUNGS[rung].text} Each row names the THEORY field and the forces of the $PCF its record was fitted with.`] : []),
  `D is the largest 3D distance between the forecast of ${slotOf(rung).name} and the truth over 0 to ${BAR_H} h after the cutoff, at the truth's own 300 s epochs. A case is within the bar when D is at most ${PASS_M} m over the whole 0 to ${BAR_H} h; a truth that ends before ${BAR_H} h is never within.`,
  'The daily figures are the root mean square of the 3D distance over the 24 h ending at each day.',
  rung === 'xp' ? `The truth's drag flies NRLMSISE-00 on ${WEATHER}; the slot's SGP4-XP record flies its own Jacchia 1970 atmosphere on its own flux model, with no space weather.`
    : rung ? `Where the truth has drag, ${WEATHER} drives the truth's NRLMSISE-00 and the slot's (its settings name NRLMSISE-00 there).`
      : `Both sides see the same space weather: ${WEATHER} drives the truth's drag and AP's.`,
  ...(fit === 'arc72' || withXp ? [`SGP4-XP is flown as it is in every force mode. ${XP_WEATHER_TEXT}`] : []),
  ...(perigeeScan ? [`${SCAN.text}${scanMinE != null && scanMinE !== SCAN_MIN_E ? ` This run widens the scan to every case at e ${scanMinE} and above.` : ''} The scan's definition is ${scanDigest}; rows flown under another definition are not read.`] : []),
  ...(!rung ? [DEGREES_TEXT] : []),
  DRAG_TERM_TEXT,
  TOLERANCE,
].join(' ');
const TRUTH = {
  L70S13: 'FFM 2.2.0: Earth gravity to degree and order 70, NRLMSISE-00 drag on the weather known at the cutoff, sphere radiation pressure with conical shadow, the Sun and Moon, solid Earth tides, general relativity; RK78 at 1e-13 with steps up to 120 s. For orbits with perigee under 2,500 km, all forces on.',
  Ffull: 'FFM 2.2.0: as L70S13 without drag, RK78 at 1e-10 with steps up to 120 s.',
  'Ffull without radiation pressure': 'FFM 2.2.0: as Ffull without radiation pressure.',
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
 *   (another error after the truth existed); with the perigee scan, a case within on the 300 s grid is scan (its scan reads a state
 *   more than 100 m off by either measure) or scan-not-run (its scan could not run: its flight refused or short; with the reason), both
 *   not within and each counted apart. A scanned case with no perigee passage in the span is counted as the grid counts it.
 * SGP4-XP's within takes the same rules (scanFails).
 */
const scanFails = (t) => !!(t?.perigeeScan && (t.perigeeScan.error || t.perigeeScan.fails));
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
  // within on the 300 s grid, but the perigee scan (run.mjs --perigee-scan) could not run, or reads a state more than 100 m off its curve
  if (md.maxM <= PASS_M && ap.perigeeScan?.error) return { status: 'scan-not-run', reason: `within on the 300 s grid (D ${md.maxM} m); the perigee scan could not run: ${ap.perigeeScan.error}` };
  if (md.maxM <= PASS_M && ap.perigeeScan?.fails) return { status: 'scan', reason: `within on the 300 s grid (D ${md.maxM} m); the perigee scan finds a state ${ap.perigeeScan.largestM} m off the record's own curve at ${ap.perigeeScan.atH} h` };
  return { status: md.maxM <= PASS_M ? 'within' : 'over' };
}
const IN_N = new Set(['within', 'over', 'scan', 'scan-not-run', 'short', 'refused', 'flight-failed', 'failed']);
const NOT_WITHIN_MARK = new Set(['scan', 'scan-not-run', 'short', 'refused', 'flight-failed', 'failed', 'no-truth', 'decayed']);

export async function report(ctx, args) {
  const { commit, version, wasmSha, rowsFile, seed, gridStep, all, mode, guard, fit, truthStartH, rung = null, withXp = false, perigeeScan = false, scanDigest = null, scanMinE = null } = ctx;
  const out = args.out;
  if (!out) throw new Error('--report needs --out <dir>');
  // the rows of this build flown from the reference state (truth.hash), and the rows of cases that failed before their truth existed;
  // with the perigee scan, only rows of this scan definition (scanDigest), so rows flown under another are not reported as this one's
  // (stack #520: a row whose truth has drag is read only on the drag truth at 1e-13, L70S13; rows on the 1e-10 drag truth are not
  // comparable with it, and a case with no such row is reported as not covered, never read from the older truth)
  const allRows = fs.existsSync(rowsFile) ? fs.readFileSync(rowsFile, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  const ofBuild = allRows.filter((r) => r.wasmSha256 === wasmSha && (!r.truth || (r.truth.hash && (!r.truth.dragAreaOverMass || r.truth.setting === 'L70S13'))));
  const kept = perigeeScan ? ofBuild.filter((r) => r.scanDigest === scanDigest) : ofBuild;
  const otherDefinitions = perigeeScan ? [...new Set(ofBuild.filter((r) => r.scanDigest !== scanDigest).map((r) => r.scanDigest ?? 'none recorded'))] : [];
  const byHash = new Map(kept.map((r) => [r.caseHash, r]));
  const { createHash } = await import('node:crypto');
  const hashOf = (c) => createHash('sha256').update(JSON.stringify(c)).digest('hex').slice(0, 16);
  const rows = all.cases.map((c) => ({ c, r: byHash.get(hashOf(c)) ?? null }));
  const harnesses = [...new Set(rows.filter((x) => x.r).map((x) => x.r.harness))];
  const theory = (r, t) => (r?.[t] ? { pcf: r[t].pcf, settings: r[t].settings ?? null, fitNote: r[t].fitNote ?? null, fitRmsM: r[t].fitRmsM ?? null, bterm: r[t].bterm ?? null, maxDistance: r[t].maxDistance ?? null, days: r[t].days ?? null, perigeeScan: r[t].perigeeScan ?? null, kepler: r[t].kepler ?? null, error: r[t].error ?? null } : null);
  const items = rows.map(({ c, r }) => {
    const ap = theory(r, 'ap'), xp = theory(r, 'xp'), st = statusOf(r, ap), full = ['within', 'over', 'scan', 'scan-not-run'].includes(st.status);
    const D = ap?.maxDistance?.maxM ?? null, X = xp?.maxDistance?.maxM ?? null, xpFull = xp?.maxDistance && xp.maxDistance.spanH >= BAR_H;
    return { id: c.id, kind: c.kind, name: c.name ?? null, label: labelOf(c), band: barBandOf(c), regime: regimeOf(c), am: c.am, elements: r?.elements ?? { n: c.n, e: c.e, i: c.i, raan: c.raan, argp: c.argp, ma: c.ma, hpKm: c.hpKm, haKm: c.haKm, cutoff: c.cutoff },
      truth: r?.truth ?? null, flown: !!r, error: r?.error ?? null, status: st.status, reason: st.reason ?? null, spanH: st.spanH ?? (ap?.maxDistance?.spanH ?? null), ap, xp,
      D, fullD: full ? D : null, within: st.status === 'within', xpD: X, xpWithin: IN_N.has(st.status) && xpFull ? X <= PASS_M && !scanFails(xp) : false,
      xpOverAp: full && D && X && xpFull ? Math.round((X / D) * 100) / 100 : null, costUsPerState: r?.costUsPerState ?? null, truthConvergence: convergenceOf(r?.truth, c.id) };
  });
  // the cases whose drag truth is not converged to a tenth of the bar (CONVERGENCE), marked beside their rows wherever they appear
  const unconverged = items.filter((x) => x.truthConvergence?.notConverged).map((x) => ({ id: x.id, label: x.label, band: x.band, status: x.status, apDM: x.D, xpDM: x.xpD, ...x.truthConvergence }));
  const count = (xs, s) => xs.filter((x) => x.status === s).length;
  const bandRow = (xs) => {
    const inN = xs.filter((x) => IN_N.has(x.status)), full = inN.filter((x) => x.fullD != null), xpFull = inN.filter((x) => x.xp?.maxDistance && x.xp.maxDistance.spanH >= BAR_H);
    return { cases: xs.length, n: inN.length, within: count(xs, 'within'), over: count(xs, 'over'), scanOver: count(xs, 'scan'), scanNotRun: count(xs, 'scan-not-run'), short: count(xs, 'short'), refused: count(xs, 'refused'), flightFailed: count(xs, 'flight-failed'), failed: count(xs, 'failed'),
      decayed: count(xs, 'decayed'), noTruth: count(xs, 'no-truth'), notFlown: count(xs, 'not-flown'),
      scored: full.length, medianDM: median(full.map((x) => x.fullD)), worstDM: full.length ? Math.max(...full.map((x) => x.fullD)) : null,
      medianFirstOver100mH: median(full.map((x) => x.ap.maxDistance.firstOver100mH).filter((v) => v != null)),
      xpWithin: inN.filter((x) => x.xpWithin).length, xpScored: xpFull.length, xpMedianDM: median(xpFull.map((x) => x.xpD)) };
  };
  const bands = Object.fromEntries(BAR_BANDS.map((b) => [b, bandRow(items.filter((x) => x.band === b))]));
  const failing = items.filter((x) => x.status === 'over').sort((a, b) => b.D - a.D).map((x) => ({ id: x.id, kind: x.kind, label: x.label, band: x.band, hpKm: x.elements.hpKm, e: x.elements.e, i: x.elements.i, am: x.am, apDM: x.D, apAtH: x.ap.maxDistance.atH, apFirstOver100mH: x.ap.maxDistance.firstOver100mH, xpDM: x.xpD, apFitRmsM: x.ap.fitRmsM, truth: x.truth?.setting }));
  const short = items.filter((x) => x.status === 'short').map((x) => ({ id: x.id, label: x.label, band: x.band, spanH: x.spanH, reason: x.reason, apDM: x.D }));
  // the perigee scan: every scanned case, AP's and SGP4-XP's D on the grid beside each one's largest distance off the record's own curve
  const scanOf = (t) => {
    const s = t?.perigeeScan;
    if (!s) return null;
    if (s.error) return { notRun: true, error: s.error };
    if (s.noPassage) return { noPassage: true };
    return { largestM: s.largestM, atH: s.atH, offsetS: s.offsetS, curve: s.curve, neighbors: s.neighbors, passages: s.passages, over: s.over, fails: s.fails, clipped: s.clipped ?? 0 };
  };
  const scans = items.filter((x) => x.ap?.perigeeScan || x.xp?.perigeeScan).map((x) => ({ id: x.id, label: x.label, band: x.band, status: x.status, apDM: x.D, ap: scanOf(x.ap), xpDM: x.xpD, xp: scanOf(x.xp) }));
  // the scans by what they read, whatever the case's status on the grid: a reading over 100 m, or a scan that could not run (with its
  // reason) — never one count for both
  const scanCounts = Object.fromEntries(['ap', 'xp'].map((t) => {
    const of = scans.filter((s) => s[t]);
    return [t, { scanned: of.length, readOver: of.filter((s) => s[t].fails).map((s) => ({ id: s.id, largestM: s[t].largestM, atH: s[t].atH, dM: t === 'ap' ? s.apDM : s.xpDM })),
      notRun: of.filter((s) => s[t].notRun).map((s) => ({ id: s.id, reason: s[t].error, dM: t === 'ap' ? s.apDM : s.xpDM })), noPassage: of.filter((s) => s[t].noPassage).length, clipped: of.filter((s) => s[t].clipped).length }];
  }));
  const without = items.filter((x) => ['refused', 'flight-failed', 'failed', 'decayed', 'no-truth', 'not-flown'].includes(x.status)).map((x) => ({ id: x.id, label: x.label, band: x.band, status: x.status, reason: x.reason }));
  const wall = rows.filter((x) => x.r).map((x) => x.r.wallS).filter(Number.isFinite);
  const command = `node experiments/synthetic-orbits/run.mjs --modules-commit ${commit} --modules-root <modules clone> --seed ${seed} --grid-step ${gridStep}${guard ? ' --guard' : ''}${mode === 'no-drag' ? ' --no-drag' : mode === 'no-drag-no-radiation' ? ' --no-drag --no-radiation' : ''} --fit ${fit} --truth-start-h ${truthStartH}${rung ? ` --rung ${rung}` : ''}${withXp ? ' --xp' : ''}${perigeeScan ? ' --perigee-scan' : ''}`;
  const doc = {
    schema: 'sdn-ap-synthetic/3', measured: new Date().toISOString().slice(0, 10), mode, modeText: modeTextOf(mode, rung), guard, fit, truthStartH, rung, withXp, xpFlown: fit === 'arc72' || withXp, fitText: fitTextOf(fit, withXp), fitAfterCutoff: fit === 'arc72' ? false : FITS[fit].after,
    module: { version, modulesCommit: commit, wasmSha256: wasmSha }, harness: { repo: 'orbit-accuracy-experiments', commits: harnesses, command },
    perigeeScan, scanSettings: perigeeScan ? SCAN : null, scanDigest, scanMinE, ...(perigeeScan ? { scanCounts } : {}), rowsOfOtherScanDefinitions: perigeeScan ? { count: ofBuild.length - kept.length, definitions: otherDefinitions } : null,
    slot: slotOf(rung), seed, gridStep, statistic: statisticOf(fit, truthStartH, rung, withXp, perigeeScan, scanDigest, scanMinE), truthSettings: TRUTH, areaToMass: Object.fromEntries(Object.entries(AM).map(([k, v]) => [k, { areaOverMassM2Kg: v, dragTerm: 2.2 * v, radiationTerm: 1.2 * v }])),
    grid: GRID, inclinationBands: BANDS, cost: { orbitsFlown: wall.length, wallSecondsSum: Math.round(wall.reduce((s, x) => s + x, 0)), medianWallS: median(wall) },
    bands, failing, short, without, ...(perigeeScan ? { scans } : {}), truthNotConverged: { underKm: CONVERGENCE.underKm, text: CONVERGENCE.text, cases: unconverged }, cases: items, notCovered: notCoveredOf(all),
  };
  fs.mkdirSync(out, { recursive: true });
  const base = path.join(out, `synthetic-${version}-seed${seed}-${mode}-fit-${fit}-ts${truthStartH}${rung ? `-rung-${rung}` : ''}${withXp ? '-xp' : ''}${perigeeScan ? '-pscan' : ''}${guard ? '-guard' : ''}`);
  fs.writeFileSync(`${base}.json`, `${JSON.stringify(doc, null, 1)}\n`);
  fs.writeFileSync(`${base}.md`, page(doc, items));
  const all0 = bandRow(items);
  console.error(`report: ${base}.json and .md; ${all0.within} of ${all0.n} with a truth within 100 m (${all0.over} over${perigeeScan ? `, ${all0.scanOver} over in the perigee scan, ${all0.scanNotRun} whose perigee scan could not run` : ''}, ${all0.short} short of 120 h, ${all0.refused} refused, ${all0.flightFailed} flight failed, ${all0.failed} other); ${all0.decayed} decayed by the cutoff, ${all0.noTruth} without a truth, ${all0.notFlown} not flown${perigeeScan && ofBuild.length > kept.length ? `; ${ofBuild.length - kept.length} rows of another scan definition not read` : ''}`);
  if (perigeeScan) for (const t of ['ap', 'xp']) { const k = scanCounts[t]; if (k.scanned) console.error(`  ${t === 'ap' ? 'AP' : 'SGP4-XP'}'s perigee scan, every scanned case: ${k.scanned} scanned; read over 100 m ${k.readOver.length}${k.readOver.length ? ` (${k.readOver.map((y) => y.id).join(' ')})` : ''}; could not run ${k.notRun.length}${k.notRun.length ? ` (${k.notRun.map((y) => `${y.id}: ${y.reason.slice(0, 80)}`).join('; ')})` : ''}; clipped at the cutoff ${k.clipped}; no passage ${k.noPassage}`); }
  if (unconverged.length) console.error(`  truth not converged to a tenth of the bar (under ${CONVERGENCE.underKm} km over 0 to 120 h): ${unconverged.map((x) => `${x.id} (${x.lowestKm} km${x.step12to13M != null ? `, ${x.step12to13M} m from 1e-12 to 1e-13` : ''})`).join('; ')}`);
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
  const L = [], S = doc.slot, poss = S.short === 'AP' ? 'AP\'s' : `${S.short}:`;
  // the cases whose drag truth is not converged to a tenth of the bar, marked beside their rows (CONVERGENCE)
  const nc = new Map(doc.truthNotConverged.cases.map((x) => [x.id, x])), ncMark = (id) => (nc.has(id) ? ' (truth not converged)' : '');
  L.push(`# Synthetic orbits: sdn-ap ${doc.module.version} against the numerical propagator, ${doc.mode}, fit ${doc.fit}${doc.rung ? `, rung ${doc.rung}` : ''}${doc.withXp ? ', SGP4-XP beside AP' : ''}, truth from ${doc.truthStartH} h before the cutoff${doc.perigeeScan ? `, with the perigee scan (definition ${doc.scanDigest})` : ''}${doc.guard ? ' (guard set)' : ''}`, '');
  L.push(`Modules ${doc.module.modulesCommit.slice(0, 12)} (wasm ${doc.module.wasmSha256.slice(0, 12)}), seed ${doc.seed}, grid step ${doc.gridStep}, fit way ${doc.fit}, truth start ${doc.truthStartH} h before the cutoff; ${doc.cost.orbitsFlown} orbits with a row, ${Math.round((doc.cost.wallSecondsSum / 3600) * 10) / 10} worker-hours. ${doc.modeText}`, '');
  L.push(`Command: \`${doc.harness.command}\``, '');
  L.push(doc.statistic, '');
  L.push('The grid and the named cases are lists of cases to work on, not a sample: the figures below are counts, and carry no pass rate.', '');
  L.push(`## The bar by band (D: the largest distance to the truth over 0 to ${BAR_H} h; within at ${PASS_M} m)`, '',
    'n counts every case that has a truth past the cutoff. A case whose truth ends before 120 h (a decay after the cutoff among them), whose fit was refused or whose flight failed is in n and is not within; each is counted beside. An orbit that decays at or before the cutoff has no forecast to score and is not in n, whether the numerical flight stopped there or ran through it; nor are the cases without a truth and those not flown. Median and worst D are over the scored cases, those with a D over the whole 0 to 120 h.', '',
    ...(doc.perigeeScan ? ['A case within 100 m on the 300 s grid whose perigee scan finds a state more than 100 m off the record\'s own curve, by either measure, is in n and is not within ("over in the perigee scan"); one whose scan could not run (its flight refused or short) is in n and is not within, counted apart with its reason ("scan could not run"); a scanned case with no perigee passage in the span is counted as the grid counts it. SGP4-XP is counted the same way.', ''] : []),
    `| Band | Cases | Within 100 m (k of n) | Over 100 m |${doc.perigeeScan ? ' Over in the perigee scan | Scan could not run |' : ''} Truth short of 120 h | Refused fit | Failed flight | Other failure | Decayed by the cutoff | Without a truth | Not flown | Median D (scored) | Worst D (scored) | Median first hour above 100 m | SGP4-XP within (of n) | SGP4-XP median D |`,
    `|---|---:|---:|---:|${doc.perigeeScan ? '---:|---:|' : ''}---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|`);
  for (const [b, x] of Object.entries(doc.bands)) L.push(`| ${b} | ${x.cases} | ${x.within} of ${x.n} | ${x.over} |${doc.perigeeScan ? ` ${x.scanOver} | ${x.scanNotRun} |` : ''} ${x.short} | ${x.refused} | ${x.flightFailed} | ${x.failed} | ${x.decayed} | ${x.noTruth} | ${x.notFlown} | ${fmt(x.medianDM)} (${x.scored}) | ${fmt(x.worstDM)} | ${x.medianFirstOver100mH ?? '-'} | ${doc.xpFlown ? `${x.xpWithin} of ${x.n}` : '-'} | ${doc.xpFlown ? `${fmt(x.xpMedianDM)} (${x.xpScored})` : '-'} |`);
  L.push('');
  // the maps: every grid case with a row is an orbit of its cell; a cell holding a case that is not within for another reason is marked
  const grid = items.filter((x) => x.kind === 'grid');
  L.push(`In the maps a cell gives the worst D over its scored orbits and (orbits within 100 m / orbits with a row); * marks a cell holding an orbit whose truth ends before 120 h, whose fit was refused, whose flight failed, that decays by the cutoff or that has no truth${doc.perigeeScan ? ', or that is within 100 m on the grid but over in the perigee scan or whose scan could not run' : ''}; "not flown" a cell whose orbits have no row; an empty cell holds no case of this run.`, '');
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
  table(`## Perigee by eccentricity, every inclination: ${poss} worst D (within 100 m / orbits)`, grid, worst);
  for (const [b, [lo, hi]] of doc.inclinationBands.entries()) {
    const inBand = grid.filter((x) => bandOf(x.elements.i) === b);
    if (!inBand.length) continue;
    const incs = [...new Set(inBand.map((x) => x.elements.i))].sort((p, q) => p - q).join(', ');
    table(`## Inclination ${lo} to ${Math.round(hi)} deg (${incs}): ${poss} worst D (within 100 m / orbits)`, inBand, worst);
    if (doc.xpFlown) table(`## Inclination ${lo} to ${Math.round(hi)} deg: SGP4-XP's D over the D of ${S.name}, the median over the orbits both scored (above 1: ${S.short} is closer)`, inBand, (ys) => { const v = median(ys.map((x) => x.xpOverAp)); return v == null ? '-' : String(v); });
  }
  L.push('## Above 100 m over the whole 0 to 120 h, worst first', '', `| Orbit | Band | Perigee | e | i | A/m | ${S.short} D | At hour | First above 100 m | SGP4-XP D | ${S.short} fit RMS |`, '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const f of doc.failing.slice(0, 60)) L.push(`| ${f.label}${ncMark(f.id)} | ${f.band} | ${f.hpKm.toLocaleString('en-US')} km | ${f.e} | ${f.i} | ${f.am} | ${fmt(f.apDM)} | ${f.apAtH} | ${f.apFirstOver100mH ?? '-'} | ${fmt(f.xpDM)} | ${fmt(f.apFitRmsM)} |`);
  if (doc.failing.length > 60) L.push('', `${doc.failing.length - 60} more in the result file.`);
  if (doc.perigeeScan) {
    // every scanned case where a scan reads a state more than 100 m off, could not run, or had no passage in the span: both theories' figures
    const sf = (s) => (!s ? '-' : s.notRun ? `scan could not run: ${s.error.slice(0, 80)}` : s.noPassage ? 'no passage in the span'
      : `${fmt(s.largestM)} at ${s.atH} h, ${s.offsetS} s from the passage (${s.curve ? `passage curve ${fmt(s.curve.largestM)}${s.curve.reliable === false ? ', not a displacement: a block edge reaches the states it is drawn through' : ''}` : 'no passage curve'}; neighbors' curve ${fmt(s.neighbors.largestM)}${s.clipped ? `; ${s.clipped} passage${s.clipped > 1 ? 's' : ''} clipped at the cutoff` : ''}); ${s.over} of ${s.passages} passages above 100 m`);
    const shown = doc.scans.filter((s) => s.ap?.fails || s.xp?.fails || s.ap?.notRun || s.xp?.notRun || s.ap?.noPassage || s.xp?.noPassage);
    const k = doc.scanCounts, kl = (t) => `${k[t].readOver.length} read over 100 m and ${k[t].notRun.length} could not run of ${k[t].scanned} scanned`;
    L.push('', `## The perigee scan: ${doc.scans.length} cases scanned, ${shown.length} with a state more than 100 m off, a scan that could not run or no passage in the span`, '',
      `Over every scanned case, whatever its status on the grid: ${S.short}'s scan ${kl('ap')}${k.xp.scanned ? `; SGP4-XP's ${kl('xp')}` : ''}. A reading over 100 m and a scan that could not run are never counted together.`, '',
      `| Orbit | Band | ${S.short} D (300 s grid) | ${S.short}: largest distance off the record's own curve (not a distance to the truth) | SGP4-XP D (300 s grid) | SGP4-XP: largest distance off the record's own curve (not a distance to the truth) |`, '|---|---|---|---|---|---|');
    for (const s of shown.slice(0, 80)) L.push(`| ${s.label}${ncMark(s.id)} | ${s.band} | ${fmt(s.apDM)} | ${sf(s.ap)} | ${fmt(s.xpDM)} | ${sf(s.xp)} |`);
    if (shown.length > 80) L.push('', `${shown.length - 80} more in the result file.`);
    if (!shown.length) L.push('| none | | | | | |');
  }
  L.push('', '## Truth shorter than 120 h (never within; D over the span the truth reaches)', '', `| Orbit | Band | Span (h) | Why | ${S.short} D over the span |`, '|---|---|---:|---|---|');
  for (const s of doc.short) L.push(`| ${s.label}${ncMark(s.id)} | ${s.band} | ${s.spanH} | ${s.reason} | ${fmt(s.apDM)} |`);
  if (!doc.short.length) L.push('| none | | | | |');
  L.push('', '## Refused, failed, decayed by the cutoff, without a truth or not flown', '', '| Orbit | Band | What became of it |', '|---|---|---|');
  for (const w of doc.without) L.push(`| ${w.label}${ncMark(w.id)} | ${w.band} | ${w.reason} |`);
  if (!doc.without.length) L.push('| none | | |');
  L.push('', '## The named edge cases', '', `| Case | ${S.short} D | First above 100 m | ${S.short} day 1 / 3 / 5 / 7 | ${doc.xpFlown ? 'SGP4-XP D | ' : ''}Within |`, `|---|---|---|---|${doc.xpFlown ? '---|' : ''}---|`);
  for (const x of items.filter((y) => y.kind === 'edge')) {
    const days = x.ap?.days ? ['1', '3', '5', '7'].map((d) => fmt(x.ap.days[d])).join(' / ') : x.reason ?? '-';
    const within = x.status === 'within' ? 'yes' : x.status === 'over' ? 'no' : x.status === 'short' ? `no (truth to ${x.spanH} h)`
      : x.status === 'scan' ? `no (perigee scan: ${fmt(x.ap.perigeeScan.largestM)} off the record's own curve at ${x.ap.perigeeScan.atH} h)` : x.status === 'scan-not-run' ? 'no (the perigee scan could not run)' : IN_N.has(x.status) ? 'no' : '-';
    L.push(`| ${x.label}${ncMark(x.id)} | ${fmt(x.D)}${x.status === 'short' && x.D != null ? ` (to ${x.spanH} h)` : ''} | ${x.ap?.maxDistance?.firstOver100mH ?? '-'} | ${days} | ${doc.xpFlown ? `${fmt(x.xpD)} | ` : ''}${within} |`);
  }
  L.push('', `## Truth not converged to a tenth of the bar (lowest altitude under ${doc.truthNotConverged.underKm} km over 0 to 120 h)`, '', doc.truthNotConverged.text, '',
    `| Orbit | Band | Status | Lowest altitude | Its truth moved, 1e-12 to 1e-13 | ${S.short} D | SGP4-XP D |`, '|---|---|---|---|---|---|---|');
  for (const x of doc.truthNotConverged.cases) L.push(`| ${x.label} | ${x.band} | ${x.status} | ${x.lowestKm} km${x.over === 'flight' ? ' (over the whole flight: the row predates the span\'s figure)' : ''} | ${x.step12to13M != null ? `${x.step12to13M} m` : 'not measured'} | ${fmt(x.apDM)} | ${fmt(x.xpDM)} |`);
  if (!doc.truthNotConverged.cases.length) L.push('| none | | | | | | |');
  L.push('', '## Not covered', '', ...doc.notCovered.map((x) => `- ${x}`), '');
  return L.join('\n');
}
