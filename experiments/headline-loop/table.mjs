// The site's one table for a released sdn-ap version (owner, 2026-11-10: "True is ALWAYS measured honestly against a properly configured
// numerical propagator"; the pass line "within 100 meters 5 days out"; "beat [XP] at a large enough margin to make our propagator the one
// to use for conjunction assessment"). AP of the given modules commit, and SGP4-XP of the same module (THEORY SGP4XP, the same fit call), are
// fitted and flown on every window of the first pass, and of a regime's second pass (the windows touching March to May 2026) once its
// numerical rows are all in the store, in the module's own GCRF output, and scored against truth in meters. The numerical propagator's
// errors on the same windows are read from the store: it was flown once (FFM, fitted by analysis/estimation) and does not change with AP's
// version. Writes one JSON (schema sdn-ap-scoreboard/2) and nothing else. The theory alone: no record that carries a forecast.
//
//   node experiments/headline-loop/table.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 14] [--groups GD,IG]
//     [--previous <the previous release table>: the method line names the rows that gained windows since it]
//     [--burn-flags <dir of the burn lane's flags-*.json>: each flagged row's pass line split by burns (burnSplit), and under Near 700 km the
//      altimetry row's line at the same altitudes (sameAltitudes); stack issue 462]
//     [--burns <dir of the burn detector's lists (stack issue 462), <group>/<name>.burns.json>: from MANEUVER72_SINCE, AP's 72 h fit of a maneuvering
//      object takes the arc after its last burn known at the cutoff (lib/arms.mjs MANEUVER72; stack issue 489); each such row says so. The
//      numerical arm, in a regime refitted by refly.mjs --after-burns, takes the refit on the same arc (lib/arms.mjs numericalArc), and the
//      commercial geostationary row gets an arm on the windows whose arcs it frees of known burns; each such row says so (ffmFitProcess). On
//      a row whose satellites all have lists, each lead's AP, numerical and SGP4-XP figures are also given over the windows with no burn from
//      the cutoff to that lead (cleanToLead), and the row reads its later burns (laterBurns) and, on the strong-drag rows, its burn-free
//      windows (burnFreeScatter); nothing is removed]
//     [--carry-from <wasm sha12 of an earlier build's store folder>: a row and theory (AP, our SGP4-XP) whose windows flown on both builds,
//      CARRY_SAMPLE at least, have the same figures to the bit takes that build's rows on the windows this build did not fly; every row
//      counts its carried, flown and compared window-arcs (carried)]
//   node experiments/headline-loop/table.mjs --check
//
// The build is read by git show at the commit (propagator/sdn-ap/dist/isomorphic/module.wasm and its package.json), never from a working tree.
// AP's and our XP's rows go to <store>/table/<wasm sha12>/rows.jsonl (theory AP or SGP4XP), the Space Force XP's and SGP4's to
// <store>/outside/<their builds>/rows.jsonl, flown once for every AP build; a row already there is not flown again. The harness's working tree must be clean
// (the file names the harness commit). The numerical arm of a regime and fit length is its fullest stored setting, fixed by name and never
// chosen on the outcome: Fbest where it is stored, else the full setting, else the configured, else the reduced (PREFER).
// It is null ("being measured") while the store lacks a numerical row for any window of that row, and null where no stored arm is
// properly configured for the truth (NOT_CONFIGURED). A drag row whose every window with a numerical arm by the rule has its 1e-13 row
// (lib/arms.mjs NUMERICAL_TIGHT, stack issue 520) is scored on those, every window at 1e-13; no row mixes the two tolerances.
// A window stays in AP's columns whenever AP has a figure for it; the numerical column and the pass line are over the windows where
// both have one, and withoutNumericalFigure counts the others by reason, judged at the row's tolerance.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { fork, execFileSync } from 'node:child_process';
import { REPO, usePackages, envRecord } from './lib/env.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const SELF = new URL(import.meta.url).pathname;
const ALL = ['LS', 'DO', 'S1', 'P', 'T', 'GD', 'GN', 'GN_GAL', 'IG', 'GE', 'WA', 'HE72', 'HE', 'HX'];
// the order windows are handed out: the slowest first (long eccentric arcs), so the last ones to finish are short
const HEAVY = ['HE', 'HE72', 'HX', 'DO', 'S1', 'P', 'T', 'WA', 'LS', 'GN_GAL', 'GN', 'GE', 'IG', 'GD'];
const LEADS = [[24, 1], [72, 3], [120, 5], [168, 7]];
// --carry-from (a cut on a build that moves AP on some rows only): the windows of a row flown on both builds before the row carries the
// other build's rows, the fields compared, and the method line's sentence
const CARRY_SAMPLE = 4, CARRY_FIELDS = ['pcf', 'fitProcess', 'fitArcHours', 'error', 'apError', 'days', 'fitRmsKm', 'fit'];
const CARRY_TEXT = (b) => ` Rows carried from sdn-ap ${b.version} (wasm ${b.wasmSha256.slice(0, 12)}): on a row and theory (AP, our SGP4-XP) where at least ${CARRY_SAMPLE} of its windows, every satellite of the row among them, were flown on both builds with figures on both (a row that recorded an error compares nothing), and on every one of them the two have the same figures to the bit (the forces, the fit and each lead's error), and no window has figures on one build and an error on the other, the windows this build did not fly take that build's rows; a row and theory with one that differs, or with fewer compared, is flown on this build in full. carried gives on every row the window-arcs listed for it (listed: the row's windows are those AP scored among them) and, per theory, the window-arcs carried, the window-arcs flown on this build, and the windows compared where it carries (null where it does not).`;
// AP and SGP4XP are the released module's; USSFXP (the Space Force's XP, propagator/sgp4-xp) and SGP4 (analysis/gp-error-model's fit,
// propagator/sgp4's flight) are outside builds, pinned (lib/arms.mjs OUTSIDE). --theories limits the ones flown in a run.
const THEORIES = ['AP', 'SGP4XP', 'USSFXP', 'SGP4'];
// the owner's pass line (2026-11-10): AP within 100 m of the numerical propagator 5 days out
const PASS_LEAD_DAY = 5, PASS_M = 100;
const passes = (p) => p.a - p.f < PASS_M;
// --burn-flags: under each Near 700 km row, the altimetry row's pass line on its satellites at the same altitudes (stack issue 462); a
// satellite's altitude is its mean geocentric distance less the equatorial radius over the truth's 3 h before its first scored cutoff
const SAME_ALTITUDES = { row: 'S1', from: 'DO', fromKm: 600, toKm: 850, label: 'the same altitudes on satellites that seldom burn' };
const EQUATOR_KM = 6378.137;
// --burns (stack issue 462): the rows whose burn-free windows get burnFreeScatter, and the method line's sentence for the burn-clean figures
const STRONG_DRAG = new Set(['T', 'P']);
const CLEAN_TEXT = ' cleanToLead, on the rows whose satellites all have burn lists (the burn detector), gives each lead\'s AP, numerical and SGP4-XP figures again over the windows with no burn in the truth between the cutoff and that lead (any burn of the lists, known at the cutoff or not), with their count; the figures over all windows stand beside them and no window leaves any count. laterBurns says how many windows on the pass line hold a burn between the cutoff and day 5, by whether it raises or lowers the orbit, and how AP and the numerical propagator compare on each kind; those windows stay on the pass line and in every figure taken over all windows, though a forecast across a later maneuver measures the maneuver as much as the propagator. burnFreeScatter, on the strong-drag rows, says how many of the windows where AP is more than 100 m closer a burn explains, and how the two compare on the burn-free windows.';
const EITHER_WAY_TEXT = ' within100mEitherWay counts, at the 120 hour lead on the same windows as within100mOfFfm, the windows where AP\'s error and the numerical propagator\'s are within 100 m of each other either way (a window where AP is more than 100 m closer to the truth than the numerical propagator does not count), and within100mEitherWayBurnSplit splits that count by the burn flags into the four parts of burnSplit.';
const STATISTIC = [
  'For each window (one satellite, one cutoff) and lead, the root mean square of the 3D position error against the truth over the 24 hours that end at the lead, on the truth\'s 300 s grid (a day counts when the truth covers 90 % of it). The median and the 95th percentile (linear interpolation) of each column are taken over the lead\'s windows where that column has a figure: a lead\'s windows are those where AP was scored, AP\'s column is over all of them, the numerical propagator\'s over those of them where it was scored too (with its own windows where the two differ), and each other theory\'s as stated below.',
  'xp is SGP4-XP, our clean-room build in the same module as AP (THEORY SGP4XP), fitted to the same arc by the same fit call and flown in the module\'s own GCRF output. xpUssf is the Space Force\'s SGP4-XP (propagator/sgp4-xp 0.2.1, its library the unmodified Sgp4Prop 9.1.1.0 XP build), fitted to the same arc by that module\'s own fitter, which searches two-line-element digits with every evaluation running the library, and flown by its propagate in its own GCRF output. sgp4 is SGP4 fitted to the same arc by analysis/gp-error-model (its own SGP4 in improved mode, B* fitted) and flown by propagator/sgp4 (AFSPC mode), its TEME output turned to GCRF by foundation/frames, the path its fit uses. Each is null until it has a row on every window of the row; a window where its fit or flight failed counts as flown. Its median and 95th percentile are taken over the lead\'s windows where it was scored (windows); failed counts the lead\'s windows where its fit or flight failed, so a figure with failed above 0 is over the scored windows alone (a file without windows and failed does not state them, and its readers must not take failed as 0). apBeatsXp and apBeatsXpUssf count the lead\'s windows where that XP was scored (windows), the ones where AP\'s error is below that XP\'s (apBetter), and give the median over them of AP\'s error divided by that XP\'s (medianApOverXp); a window where that XP failed is left out of the pair count, never counted as AP closer.',
  'From sdn-ap 0.6.15 the two medium Earth orbit rows of navigation satellites (GN and Galileo), and from sdn-ap 0.6.19 the geostationary, inclined geosynchronous and commercial geostationary rows (the commercial row with the vacuum $PCF), fit AP with $PCF FORCES.ECOM2 on fits of 72 h or more, which also solves the ECOM2 Y0 radiation term (SDN-AP SPEC 16.13); from sdn-ap 0.6.26 a 24 h fit of those rows carries the terms of its 72 h fit where that record\'s regime is above the drag, Y0 among them where the record states one; every other row, and every row of an older build, fits AP with the same $PCF as before. From sdn-ap 0.6.20 every row\'s AP fit also states the solid Earth tide ($PCF FORCES.SOLID_TIDES IERS 2010), which that build flies only where it is stated. apForces states each row\'s forces and fitted terms.',
  'within100mOfFfm counts, at the 120 hour lead and over the windows where AP and the numerical propagator both have a figure, the windows where AP\'s error is less than 100 m above the numerical propagator\'s (AP better than it counts as met); share is met over windows. apFfmRank is Spearman\'s rank correlation (average ranks for ties) of AP\'s and the numerical propagator\'s errors over the lead\'s windows where both have a figure (null without a numerical propagator or under 10 such windows); near 1, the two order the windows alike, as when both are limited by the same density forecast.',
].join(' ');
// linear interpolation between order statistics (R type 7)
const quantile = (sorted, p) => { if (!sorted.length) return null; const x = p * (sorted.length - 1), i = Math.floor(x), f = x - i; return i + 1 < sorted.length ? sorted[i] + f * (sorted[i + 1] - sorted[i]) : sorted[i]; };
// commercial geostationary: the truth holds station-keeping burns and every stored arm fits through them (fit RMS 88 m at 24 h, 1.5 km at 72 h
// against a truth good to 2 m), so none is a properly configured propagator for it
const NOT_CONFIGURED = new Set(['WA']);
const PREFER = ['FFMbest', 'FFMq', 'FFMc', 'FFMr'];
const FFM_SELECTION = 'Each row\'s numerical propagator is its fullest stored FFM setting, named in the row\'s configuration sentence and not chosen on the outcome: on the laser geodetic spheres the full setting with ocean tides and Earth radiation pressure, else the full setting (degree and order 70, solid tides, relativity, RK78 at 1e-10, or with drag at 1e-13 on a row where every window with a numerical arm by the rule has a 1e-13 row (its fit, its failed fit, or its record of no truth or coverage), the row\'s stored arm is that setting on every such window, and no window is a refit on the arc after a burn or, in a regime with after-burn rows, lacks its decision row), else the setting the row has. The configuration sentence states each row\'s tolerance, and no row mixes two. The other stored settings (the configured and the reduced) are kept and are not scored against.';
// stack issue 520: with drag the integration restarts at each change of the weather rows, and at 1e-10 the flight after a restart is
// meters to tens of meters from the converged orbit; the drag setting fitted and flown again at 1e-13 (lib/arms.mjs NUMERICAL_TIGHT)
const TIGHT_TEXT = (rows) => ` The numerical arm is fitted and flown at a tolerance of 1e-13 on these rows: ${rows.join(', ')}. On each of them every window with a numerical arm by the rule has a 1e-13 row (its fit, its failed fit, or its record of no truth or coverage), and the window's figure, or the reason it has none, is that row's. The reason: with drag, at 1e-10 the integration after each change of the space weather input leaves the flight meters to tens of meters from the converged orbit. Every other row's numerical arm is at the tolerance its configuration sentence states.`;
// a drag row whose 1e-13 rows are all in but stays at 1e-10, and why: the 1e-13 rows are of the full arc, so a row with a window refitted
// on the arc after a burn, or a window of an after-burn regime without its decision row, keeps every window at 1e-10
const TIGHT_HELD_TEXT = (rows) => ` These drag rows have a 1e-13 row for every window and stay at 1e-10: ${rows.join('; ')}. The 1e-13 rows are of the full fit arc.`;
// The long-period rows' references in their files' own words (stack #479): what each is, and how the row reads it (no figure of the data:
// those are the rows' own, cleanToLead and laterBurns among them), by regime and fit arc (<group>:<arc> where a regime's rows differ)
const TRUTH_NOTE = {
  HE72: 'TESS\'s definitive ephemeris files as MAST names them (TESS_EPH_DEF, archive.stsci.edu/missions/tess/models), each one 14-day solution; each window of this row is read from the newest one file that covers its fit arc and 7 days, so no join of two solutions falls inside it.',
  HE: 'TESS\'s definitive ephemeris files as MAST names them (TESS_EPH_DEF), each one 14-day solution; this row\'s windows (a 336 h arc and 7 days) are longer than any one file, so they read the files merged, each epoch from the newest file. A join of two solutions after the cutoff is flagged at the leads it falls in; the joins inside the 336 h fit arc are neither cut nor flagged.',
  'HX:168': 'Chandra: the merged file JPL\'s Solar System Dynamics Group provided for Horizons (chandra_merged.bsp, "the historical Chandra trajectory ... with the trajectory data being supplied by CFA"), solutions joined one to the next; the 168 h fit arc is not cut, so the joins inside it are neither cut nor flagged, and a join after the cutoff is flagged at the leads it falls in.',
  HX: 'Chandra: the merged file JPL\'s Solar System Dynamics Group provided for Horizons (chandra_merged.bsp, "the historical Chandra trajectory ... with the trajectory data being supplied by CFA"), solutions joined one to the next; a 72 h fit arc starts after the last join known at the cutoff (9 h at least), and a join after the cutoff is flagged at the leads it falls in. THEMIS A, D and E: the kernels as the mission\'s flight dynamics wrote them (PRODUCER_ID \'UCB SSL\'), on the first day of their 16-day span, so every window is scored against the operator\'s prediction.',
};
// the long-period rule in the method line (with --burns, from MANEUVER72_SINCE): the 72 h fits only, as the code does it
const LONG_PERIOD_TEXT = ' On the 72 h fits of the long-period rows (the highly elliptical ones) the arc after a burn is at least 9 h and at most 70 h, on AP and on the numerical arm alike; a burn ending less than 9 h before the cutoff stays inside that 9 h arc, and the window keeps both arms. On every other row AP\'s 72 h arc after a burn is at least 24 h. On the THEMIS and Chandra row a join of Chandra\'s solutions known at the cutoff moves the 72 h arc as a burn does; on the 336 h TESS row a join after the cutoff is flagged only (laterBurns, cleanToLead), and the 72 h TESS row, read from one file per window, holds none. On the 336 h and 168 h fits of these rows the arc is set the same way over the fit\'s own arc: a firing (on Chandra, a join) known at the cutoff that ends inside it starts the arc, at least 9 h, with no other cap, on both arms, so the hours in those rows\' names are the longest arc allowed, not the arc used, and each row counts its arcs by length; their figures in tables before this rule are of the full arcs and are not comparable with these.';
// a window stays in AP's columns whenever AP has a figure for it (it leaves only where AP has none: no truth or coverage); the numerical
// column, apFfmRank and the pass line are over the windows where both have a figure, and withoutNumericalFigure counts the others by reason
const PERIGEE_SCAN_TEXT = ' perigeeScan, on the long-period rows: AP\'s record flown at 1 s for 2 minutes either side of each perigee passage in the 120 h after the cutoff (the passages found as the minima of the record\'s radius on a 60 s grid), each state\'s displacement off the curve of its neighbors (the degree-5 polynomial through the three states either side of it); per row the windows scanned, the passages, the largest displacement (largestM) and the median of each window\'s largest (medianM, over the windows with a passage), in meters. A smooth record holds each state to a millimeter or less of that curve; a block of displaced states shows at its edges, where the measure reads a fraction of the block\'s displacement (largestM is a reading, not a displacement), so a block longer than the 4 minutes scanned around a passage, with no edge inside them, reads nothing.';
const NO_FIGURE_TEXT = ' A window stays in AP\'s, SGP4-XP\'s and the other theories\' columns, and in the row\'s windows and satellites, whenever AP has a figure for it; it leaves them only where AP has none (no truth or coverage). withoutNumericalFigure counts the row\'s windows that AP scored and the numerical arm scored at no lead, with their satellites, by reason at the row\'s tolerance: ruleLeavesNoArm (the rule gives no numerical arm: an orbit not ballistic between impulses, or a burn known at the cutoff in every arc the rule allows), fitFailed (the numerical fit or flight failed, or gave no figure at any lead where AP has one) and noTruthOrCoverage (the numerical row records no truth or coverage); on a 72 h row, armsOnDifferentArcs where it has any (AP\'s arc and the numerical arm\'s differ: the window keeps AP\'s figure and has no numerical one). A row with a window that has no stored numerical row has no numerical column (null).';
// The measured spread of the numerical figure itself (stack issue 396): two flights of the same FFM fit that differ only in the integrator's
// step sequence (the scored epochs against a 60 s trajectory), from the carried-record rows of 2026-11-10 (store 1104598edeeb-apc), by row
// and setting; appended to that row's configuration sentence. Measured on the full setting; elsewhere it is at most 2 mm, or under 5 % of FFM's own error.
const SPREAD = { 'LS|24|L70S': ' Two flights of this same fit that differ only in the integrator\'s step sequence part by up to 0.9 m at 24 h, 2.8 m at 72 h and 8.4 m at 168 h (40, 33 and 38 windows).' };
const sha256 = (b) => crypto.createHash('sha256').update(b).digest('hex');
const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { maxBuffer: 1 << 28 });

if (args.check) await check();
else if (args.worker) await worker();
else await main();

/** A forked worker: opens the module once, then flies each window it is sent (the theories and fit arcs asked), answering with its rows. */
async function worker() {
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const groups = args.groups.split(',');
  const all = W.windowsOf(groups);
  const winOf = new Map([...all.windows, ...all.second].map((w) => [w.key, w]));
  const want = args.theories.split(',');
  const arms = await A.openArms({ apWasm: args.wasm, ussf: want.includes('USSFXP'), sgp4: want.includes('SGP4') });
  const build = { version: args['ap-version'], sha256: args.sha256 }, env = envRecord();
  const listShaOf = (g, n) => (args.burns ? A.listSha(args.burns, g, n) : null);
  const fly = async (w, need) => {
    // a 24 h fit that carries the 72 h fit's terms (A.carry24) reads the 72 h before the cutoff even where the window lists no 72 h arc
    const carrying = A.carry24(build.version) && w.arcs.includes(24);
    const D0 = w.cutoffMs, G = W.GROUPS[w.group], maxArc = Math.max(...w.arcs, carrying ? 72 : 0), t0 = performance.now();
    let ctx;
    try {
      const truth = await W.truthOf(w, D0 - maxArc * W.HOUR - W.HOUR, D0 + 7 * W.DAY + W.HOUR, arms.axes);
      const sc = W.scoredOf(truth.lines.filter((l) => W.ms(l.epoch) > D0), D0);
      if (!sc.entered.length) throw new Error('no lead bin');
      ctx = { truth, sc, wx: G.vacuum ? null : W.weatherAt(D0), object: { name: w.name, id: truth.objectId ?? '', norad: truth.norad ?? w.norad ?? 0 } };
    } catch (e) { ctx = { error: String(e?.message ?? e).slice(0, 200) }; }
    const truthS = (performance.now() - t0) / 1000, rows = [];
    for (const [theory, arc] of need) {
      const row = { key: w.key, group: w.group, name: w.name, arcH: arc, theory, ...(A.OUTSIDE[theory] ? { builds: A.OUTSIDE[theory].builds } : { ap: build }), env, truthS, ...(ctx.truth?.file ? { truthFile: ctx.truth.file } : {}) };
      if (ctx.error) row.error = ctx.error;
      else {
        // stack issue 489: AP's 72 h fit of a maneuvering object takes the arc after its last burn known at the cutoff (arms.mjs MANEUVER72)
        let from = D0 - arc * W.HOUR, hours = arc;
        const lastBeforeCutoff = ctx.truth.lines.filter((l) => W.ms(l.epoch) <= D0).at(-1);
        // (a truth with no state before the cutoff has no arc either: the coverage error below)
        // the object's maneuvering state at the cutoff (arms.mjs MANEUVER72): the 72 h fit's arc, and whether a 24 h fit carries
        let m = null, perigeeKm = null;
        if (theory === 'AP') ({ m, perigeeKm } = A.maneuverState({ burns: args.burns, group: w.group, name: w.name, D0, last: lastBeforeCutoff, version: build.version }));
        // the arc the rule gives this fit (lib/arms.mjs arcRuleApplies: the 72 h fits, and the long-period rows' longer fits over their own arc)
        const ma = m && A.arcRuleApplies(w.group, arc) ? (arc === 72 ? m : A.maneuverArc(A.arcBreaks(args.burns, w.group, w.name, D0), D0, perigeeKm, undefined, A.minHoursOf(w.group), arc)) : null;
        if (ma) {
          row.fitProcess = ma.maneuvering ? 'maneuvering: the arc after its last burn' : 'the full arc';
          if (ma.maneuvering) { from = ma.startMs; hours = (D0 - from) / W.HOUR; row.fitArcHours = Math.round(hours * 10) / 10; row.fitArcStart = W.iso(from); if (ma.burnInArc) row.burnInArc = true; }
          // the list that decided the arc (the first 12 hex of its sha256), so a row made on other lists is flown again (main: needOf)
          row.burnList = listShaOf(w.group, w.name);
          // its perigee at the cutoff (km), so the re-fly rule can tell an object under the floor from the row (main: staleList)
          row.perigeeKm = perigeeKm;
        } else if (m && theory === 'AP') {
          // a fit the rule does not move (a 24 h fit) still notes whether the object was maneuvering (its carry): the list and the perigee that
          // decided the note, so the note can be checked against today's lists (main: staleList)
          row.burnList = listShaOf(w.group, w.name);
          row.perigeeKm = perigeeKm;
        }
        let thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= from && t <= D0; }), hours);
        // the arc after the burn short of coverage: the full arc, so no window leaves the row
        if (!thin && hours !== arc) {
          thin = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - arc * W.HOUR && t <= D0; }), arc);
          row.fitProcess = 'maneuvering, the arc after its last burn short of coverage: the full arc'; delete row.fitArcHours; delete row.fitArcStart;
        }
        if (!thin) row.error = 'coverage';
        else {
          try {
            const choice = A.apPcfFor(w.group, build.version, G.vacuum, arc);
            const pcf = theory === 'SGP4XP' ? A.PCF.XP : choice.pcf, spw = theory === 'SGP4XP' ? undefined : ctx.wx?.spw;
            if (theory === 'AP') row.pcf = choice.label;
            const base = { thin, D0, sc: ctx.sc, object: ctx.object };
            // AP's record on the long-period rows: its perigee scan too (lib/arms.mjs PERIGEE_SCAN)
            const scan = theory === 'AP' && A.LONG_PERIOD.groups.includes(w.group);
            let x = theory === 'USSFXP' ? await arms.ussf(base) : theory === 'SGP4' ? await arms.sgp4(base) : await arms.ap({ ...base, pcf, spw, scan });
            // stack issue 496: the 24 h fit's carried terms (arms.mjs, CARRY24_SINCE); fitProcess names what the row's fit did
            if (theory === 'AP' && arc === 24 && carrying) {
              const thin72 = W.arcOf(ctx.truth.lines.filter((l) => { const t = W.ms(l.epoch); return t >= D0 - 72 * W.HOUR && t <= D0; }), 72);
              // the terms come from the fit of the full 72 h arc, a maneuvering object's too (not its 72 h record, the arc after its burn);
              // lib/arms.mjs carry24Fit, the function the covariance coverage flight calls too
              const fitOnce = ({ thin: t = thin, pcf: p, record }) => (record ? arms.ap({ ...base, thin: t, pcf: p, spw, record: true }) : arms.ap({ ...base, thin: t, pcf: p, spw, scan }));
              const kept = await A.carry24Fit({ x, fitOnce, thin72, pcf, pcf72: A.apPcfFor(w.group, build.version, G.vacuum, 72).pcf, version: build.version, maneuvering: !!m?.maneuvering });
              x = kept.x; row.fitProcess = kept.fitProcess;
            }
            Object.assign(row, { days: x.days, fitRmsKm: x.rms, fit: x.fit, s: x.s, ...(x.perigeeScan ? { perigeeScan: x.perigeeScan } : {}) });
          } catch (e) { row.apError = String(e?.message ?? e).slice(0, 200); }
        }
      }
      rows.push(row);
    }
    return rows;
  };
  process.on('message', async (m) => {
    if (m.stop) { await arms.close(); process.exit(0); }
    const w = winOf.get(m.key);
    process.send({ key: m.key, rows: w ? await fly(w, m.need) : [{ key: m.key, error: 'not a listed window' }] });
  });
  process.send({ ready: true });
}

async function main() {
  const t0 = Date.now();
  const root = args['modules-root'], want = args['modules-commit'], out = args.out, jobs = Number(args.jobs ?? 14);
  if (!root || !want || !out) throw new Error('usage: table.mjs --modules-commit <sha> --modules-root <modules checkout> --out <file> [--jobs 14] [--groups GD,IG]');
  const dirty = git(REPO, 'status', '--porcelain', '--', 'experiments').toString().trim();
  if (dirty) throw new Error(`refused: the harness's working tree differs from its commit (the file names the commit):\n${dirty}`);
  const harnessCommit = git(REPO, 'rev-parse', 'HEAD').toString().trim();
  const commit = git(root, 'rev-parse', '--verify', `${want}^{commit}`).toString().trim();
  const wasm = git(root, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`);
  const version = JSON.parse(git(root, 'show', `${commit}:propagator/sdn-ap/package.json`).toString()).version;
  const wasmSha = sha256(wasm);
  usePackages();
  const W = await import('./lib/windows.mjs');
  const A = await import('./lib/arms.mjs');
  const N = await import('./lib/numerical.mjs');
  const { SETTINGS } = await import('./lib/settings.mjs');
  const { FFM_220 } = await import(path.join(REPO, 'experiments/operator-theory/lib/build.mjs'));
  // a store named by HEADLINE_LOOP_STORE (a check's, or a snapshot for a measurement) writes the rows it flies into its own table folder,
  // never into the store it copies: a table folder that is a link is refused
  if (process.env.HEADLINE_LOOP_STORE && fs.existsSync(path.join(A.STORE_ROOT, 'table')) && fs.lstatSync(path.join(A.STORE_ROOT, 'table')).isSymbolicLink()) throw new Error(`refused: ${path.join(A.STORE_ROOT, 'table')} is a link; a snapshot store needs a table folder of its own (a copy)`);
  const dir = path.join(A.STORE_ROOT, 'table', wasmSha.slice(0, 12));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'module.wasm');
  if (!fs.existsSync(file) || sha256(fs.readFileSync(file)) !== wasmSha) fs.writeFileSync(file, wasm);
  const groups = args.groups ? args.groups.split(',') : ALL;
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const readRows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean) : []);
  // the numerical propagator's rows (refly.mjs, both passes)
  const baseDir = path.join(A.STORE_ROOT, A.NUMERICAL_STORE);
  // a row that flew wins over a row that recorded an error for the same window and arc (a window flown again after its truth was found)
  const base = new Map();
  for (const r of fs.readdirSync(baseDir).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => readRows(path.join(baseDir, f)))) { const k = `${r.key}|${r.arcH}`; if (A.laterWins(base.get(k), r, W.GROUPS[r.group]?.oneFile)) base.set(k, r); }
  // --burns (stack issues 462 and 489): the numerical arm's fit of a maneuvering object on the arc after its last burn known at the cutoff
  // (refly.mjs --after-burns, lib/arms.mjs numericalArc), stored apart. A regime with such rows takes, window by window, the refit where the
  // rule moved the arc and the stored fit where it did not; a window of it without a decision row leaves the row's arm being measured.
  // --after-burn-store <folder>: the refits made on the lists given (refly.mjs --after-burn-store), one folder per set of lists, read as bar.mjs
  // and trajectories.mjs read them (lib/numerical.mjs readAfterBurn): each refit row names its satellite's list (burnList); a row made on a
  // list that is not the one --burns gives for that satellite, or a row a burn moved or withheld without a list, is refused, so refits of
  // other lists never stand in for this table's. A folder that is not in the store is read as none here: --burns also sets AP's 72 h rule,
  // which runs where no refit was made, and the file names the folder it read (burnLists.afterBurnStore, null where none)
  const ab = N.readAfterBurn({ burns: args.burns, store: args['after-burn-store'], readRows, required: false });
  const { afterBurn, afterBurnGroups } = ab, afterBurnStore = ab.abStore ?? args['after-burn-store'] ?? A.NUMERICAL_AFTER_BURN.store;
  // stack issue 520: the drag setting fitted and flown again at 1e-13 (lib/arms.mjs NUMERICAL_TIGHT), stored apart; a row takes them only
  // when every window of it with a numerical arm by the rule has one (below)
  const tight = new Map(), tightDir = path.join(A.STORE_ROOT, A.NUMERICAL_TIGHT.store);
  // (refly.mjs --tight: one row per window and fit arc whatever the outcome; of two for one window, a fit over a failure over no truth)
  const tightRank = (r) => (r.error ? 0 : r.arms?.FFMq?.ok ? 2 : 1);
  for (const r of fs.existsSync(tightDir) ? fs.readdirSync(tightDir).filter((f) => /^rows-.*\.jsonl$/.test(f)).flatMap((f) => readRows(path.join(tightDir, f))) : []) {
    if (!r.error && r.arms?.FFMq?.arm !== A.NUMERICAL_TIGHT.to) throw new Error(`${A.NUMERICAL_TIGHT.store}: ${r.key} ${r.arcH} h is not of ${A.NUMERICAL_TIGHT.to}`);
    const k = `${r.key}|${r.arcH}`;
    if (!tight.has(k) || tightRank(r) > tightRank(tight.get(k))) tight.set(k, r);
  }
  const tightRows = [], tightHeld = [];
  const REFIT = 'maneuvering: the arc after its last burn';
  /** A window's numerical row: the stored one, or under --burns in a regime with after-burn rows, the refit where the rule moved the arc. On
   *  the commercial geostationary row (NOT_CONFIGURED) a window whose arc still holds a known burn has no numerical arm. */
  const numericalOf = (w, arc) => N.numericalOf({ w, arc, base, afterBurn, afterBurnGroups });
  // the windows: the first pass, and a regime's second pass (the windows touching 2026-03..05) once its numerical rows are all in the store
  const all = W.windowsOf(groups);
  const secondIn = new Set(groups.filter((g) => { const sec = all.second.filter((w) => w.group === g); return sec.length && sec.every((w) => w.arcs.every((a) => base.has(`${w.key}|${a}`))); }));
  const only = args['keys-file'] ? new Set(fs.readFileSync(args['keys-file'], 'utf8').split('\n').filter(Boolean)) : null;
  const listed = [...all.windows, ...all.second.filter((w) => secondIn.has(w.group))].filter((w) => !only || only.has(w.key));
  const notYet = all.second.filter((w) => !secondIn.has(w.group));
  // the windows placed after a firing (lib/arms.mjs firingCutoffs, stack #479): with the lists, the store's cutoffs (added-windows.json,
  // windows.mjs placedAfterFiring) must be those the rule gives from the row's list less the cutoffs the row already has, or the run is
  // refused; each such row says how many of its windows the rule placed
  const placed = new Map();
  if (args.burns) for (const g of groups.filter((x) => W.GROUPS[x].from)) {
    const every = Object.values(W.windowsOf([g])).flat(), dayOf = (w) => new Date(w.cutoffMs).toISOString().slice(0, 10);
    const have = new Set(every.filter((w) => !w.placedAfterFiring).map(dayOf)), rule = [...new Set(every.map((w) => w.name))].flatMap((n) => A.firingCutoffs(args.burns, g, n));
    const want = [...new Set(rule)].filter((c) => !have.has(c)).sort(), stored = [...new Set(every.filter((w) => w.placedAfterFiring).map(dayOf))].sort();
    if (JSON.stringify(want) !== JSON.stringify(stored)) throw new Error(`refused: the windows placed after a firing on ${W.GROUPS[g].label} (${g}) are at ${stored.join(', ') || 'no cutoff'}, the rule gives ${want.join(', ') || 'no cutoff'} (lib/arms.mjs firingCutoffs; the store's added-windows.json)`);
    placed.set(g, { firings: rule.length, cutoffs: new Set(rule).size, already: new Set(rule).size - want.length });
  }
  const day = (t) => new Date(t).toISOString().slice(0, 10), count = (n) => n.toLocaleString('en-US');
  const cutoffs = listed.map((w) => w.cutoffMs);
  const secondText = [...secondIn].filter((g) => !only || listed.some((w) => w.group === g && all.second.includes(w))).map((g) => `${W.GROUPS[g].label} (${count(all.second.filter((w) => w.group === g).length)} windows)`);
  // (one satellite and one cutoff each, counted once: the 72 h TESS row has its own keys over the 336 h row's cutoffs)
  const windowsText = `The table holds ${count(new Set(listed.map((w) => `${w.name}|${w.cutoffMs}`)).size)} windows (one satellite and one cutoff each), cutoffs from ${day(Math.min(...cutoffs))} to ${day(Math.max(...cutoffs))}`
    + (notYet.length && secondText.length ? `; the second pass (the windows whose fit arc or 7-day forecast touches March to May 2026) is in for ${secondText.join(', ')}, and its ${count(notYet.length)} windows of the other rows are not in this table (a regime's second pass is in this table where its numerical rows are all in the store)`
      : notYet.length ? `; the ${count(notYet.length)} windows whose fit arc or 7-day forecast touches March to May 2026 (the second pass) are not in this table (a regime's second pass is in this table where its numerical rows are all in the store)` : all.second.length ? ', the windows touching March to May 2026 (the second pass) among them' : '')
    + (all.after.length ? `; ${count(all.after.length)} windows reaching past 2026-11-10 are not read` : '') + '.';
  const rowsFile = path.join(dir, 'rows.jsonl');
  // a row without a theory is AP's (the version-1 rows)
  // AP's and our XP's rows under the AP build's folder; the Space Force XP's and SGP4's under their own builds' (lib/arms.mjs OUTSIDE), flown
  // once and read by every later run
  const fileOf = (t) => (A.OUTSIDE[t] ? path.join(A.STORE_ROOT, 'outside', A.OUTSIDE[t].key, 'rows.jsonl') : rowsFile);
  for (const t of Object.keys(A.OUTSIDE)) fs.mkdirSync(path.dirname(fileOf(t)), { recursive: true });
  const flownRows = new Map([
    ...readRows(rowsFile).filter((r) => r.ap?.sha256 === wasmSha && !A.OUTSIDE[r.theory ?? 'AP']),
    ...Object.keys(A.OUTSIDE).flatMap((t) => readRows(fileOf(t)).filter((r) => r.theory === t)),
  ].map((r) => [`${r.theory ?? 'AP'}|${r.key}|${r.arcH}`, r]));
  const rowOf = (theory, w, arc) => flownRows.get(`${theory}|${w.key}|${arc}`);
  // --carry-from <sha12>: on a row and theory (AP, our SGP4-XP) where at least CARRY_SAMPLE windows, every satellite of the row among them,
  // were flown on both this build and the build of that store folder with figures on both, and every one of them has the same figures to
  // the bit (CARRY_FIELDS: the forces, the fit and each lead's error; never the build, the packages or the timings), and no window has
  // figures on one build and an error on the other, the row's other windows take that build's rows. A row and theory with fewer on
  // both, or with one that differs, is flown on this build. Each row says what it carried (carried), and the method line names the build
  let carry = null;
  if (args['carry-from']) {
    const from = args['carry-from'], old = readRows(path.join(A.STORE_ROOT, 'table', from, 'rows.jsonl')).filter((r) => r.ap?.sha256?.startsWith(from) && !A.OUTSIDE[r.theory ?? 'AP']);
    if (!/^[0-9a-f]{12}$/.test(from) || !old.length) throw new Error(`--carry-from ${from}: no rows of that build in the store`);
    if (wasmSha.startsWith(from)) throw new Error(`--carry-from ${from} is this build`);
    // a row and theory not carried is flown on this build in full, so every theory flies: a subset (--theories) is refused
    if (args.theories) throw new Error('--carry-from flies every theory where a row does not carry: refused with --theories');
    const oldOf = new Map(old.map((r) => [`${r.theory ?? 'AP'}|${r.key}|${r.arcH}`, r])), figures = (r) => JSON.stringify(CARRY_FIELDS.map((k) => r[k] ?? null));
    carry = { build: { version: old[0].ap.version, wasmSha256: old[0].ap.sha256 }, compared: new Map() };
    for (const g of groups) {
      const mine = listed.filter((w) => w.group === g);
      for (const arc of [...new Set(mine.flatMap((w) => w.arcs))]) for (const t of ['AP', 'SGP4XP']) {
        const k = (w) => `${t}|${w.key}|${arc}`, ws = mine.filter((w) => w.arcs.includes(arc));
        // compared: the windows where both builds' rows have figures (an error row compares nothing); every satellite of the row among them
        const both = ws.filter((w) => flownRows.get(k(w))?.days && oldOf.get(k(w))?.days), seen = new Set(both.map((w) => w.name));
        const oneSided = ws.some((w) => flownRows.has(k(w)) && oldOf.has(k(w)) && !flownRows.get(k(w)).days !== !oldOf.get(k(w)).days);
        if (both.length < CARRY_SAMPLE || oneSided || ws.some((w) => !seen.has(w.name)) || both.some((w) => figures(flownRows.get(k(w))) !== figures(oldOf.get(k(w))))) continue;
        for (const w of ws.filter((x) => !flownRows.has(k(x)) && oldOf.has(k(x)))) flownRows.set(k(w), oldOf.get(k(w)));
        carry.compared.set(`${g}|${arc}|${t}`, both.length);
      }
    }
    // said up front: a row carries only where windows of this build are already flown in the store to compare with the other build's
    if (!carry.compared.size) console.error(`table: --carry-from ${from}: nothing can be carried (${flownRows.size} rows of this build are in the store, fewer than ${CARRY_SAMPLE} compared windows on every row and theory), so every window is flown`);
  }
  // --retry-errors: a window whose row recorded an error (no truth, coverage, a failed fit or flight) is flown again; the later row is read in
  // its place
  const flying = args.theories ? args.theories.split(',') : THEORIES, retry = !!args['retry-errors'];
  // an AP 72 h row whose arc a burn list decides (from MANEUVER72_SINCE, with --burns) is the same fit only on the same arc. A row made on
  // another list of its satellite, or before the rows named their list, is flown again unless the arc today's list gives is the row's own:
  // the full arc where the list holds no burn (on SEAMS_BREAK_ARC rows no join) known at the cutoff in the days the rule reads, the same
  // arc after the burn, to the millisecond, where the row recorded its start (fitArcStart). The rule reads the perigee the row recorded (perigeeKm); a row that recorded none (flown
  // before it did) is taken as above the floor, so where only its perigee could tell it is flown again: a row is flown again where the arc
  // moves or cannot be told from the row.
  const listNow = new Map(), staleList = (t, w, a) => {
    // a 24 h fit carries its 72 h fit's terms and notes whether the object was maneuvering at the cutoff (the rule's, on the lists): a row whose
    // note is not what today's lists give (a burn or a break test event added or withdrawn) is flown again
    if (t === 'AP' && a === 24 && args.burns && A.maneuver72(version) && A.carry24(version)) {
      const r = rowOf(t, w, a);
      if (!r || r.error || r.fitProcess == null || r.perigeeKm == null) return false; // a row that recorded no perigee cannot be told from today's lists
      const m = A.maneuverArc(A.arcBreaks(args.burns, w.group, w.name, w.cutoffMs), w.cutoffMs, r.perigeeKm, undefined, A.minHoursOf(w.group));
      return !!m.maneuvering !== /, maneuvering$/.test(r.fitProcess);
    }
    if (t !== 'AP' || !A.arcRuleApplies(w.group, a) || !args.burns || !A.maneuver72(version)) return false;
    const s = `${w.group}|${w.name}`;
    if (!listNow.has(s)) listNow.set(s, A.listSha(args.burns, w.group, w.name));
    const r = rowOf(t, w, a);
    if (!r || r.error) return false;
    // a long-period row's longer fit flown before the rule set its arc (no fitProcess): flown again
    if (a > 72 && r.fitProcess == null) return true;
    // on the same list: a row that recorded its arc's start, or is on the full arc, is the rule's; one that recorded only its hours (made
    // before rows recorded the start) is checked against the rule below by its hours
    const same = (r.burnList ?? null) === listNow.get(s);
    if (same && (r.fitArcStart || r.fitArcHours == null)) return false;
    // the row's own perigee where it recorded one (rows that recorded it), else none known: the arc as for an object above the floor
    const m = A.maneuverArc(A.arcBreaks(args.burns, w.group, w.name, w.cutoffMs), w.cutoffMs, r.perigeeKm ?? Infinity, undefined, A.minHoursOf(w.group), a);
    // the same list, hours only: flown again where the rule's arc is not those hours (to the tenth, as the row records them)
    if (same) return !(m.maneuvering && r.fitArcHours === Math.round(((w.cutoffMs - m.startMs) / W.HOUR) * 10) / 10);
    // another list: an arc after a burn is the row's only where the row recorded its start and that start is the rule's to the millisecond
    return m.maneuvering ? !(r.fitArcStart && Date.parse(r.fitArcStart) === m.startMs) : r.fitArcHours != null;
  };
  // a one-file window's row (windows.mjs oneFile) that names no reference file (truthFile) was made before the rows named it: flown again
  const noFile = (t, w, a) => !!W.GROUPS[w.group].oneFile && !!rowOf(t, w, a) && !rowOf(t, w, a).error && !rowOf(t, w, a).truthFile;
  // an AP row of a long-period row without its perigee scan (perigeeScan; flown before rows held it, or carried from a build whose rows do
  // not): flown again
  const noScan = (t, w, a) => t === 'AP' && A.LONG_PERIOD.groups.includes(w.group) && !!rowOf(t, w, a) && !rowOf(t, w, a).error && !rowOf(t, w, a).apError && !rowOf(t, w, a).perigeeScan;
  const needOf = (w) => flying.flatMap((t) => w.arcs.filter((a) => !rowOf(t, w, a) || staleList(t, w, a) || noFile(t, w, a) || noScan(t, w, a) || (retry && (rowOf(t, w, a).error || rowOf(t, w, a).apError))).map((a) => [t, a]));
  // AP left out of the theories flown (--theories): its 72 h rows that the re-fly rule would fly again are of another arc than the lists
  // give, so neither its figures nor the two arms' arcs can be read on these lists: refused
  if (!flying.includes('AP')) {
    const staleAp = listed.filter((w) => w.arcs.includes(72) && staleList('AP', w, 72));
    if (staleAp.length) throw new Error(`refused: AP is not flown (--theories), and ${staleAp.length} windows' AP 72 h rows are of another arc than the lists --burns gives (${staleAp.slice(0, 3).map((w) => w.key).join(', ')}); fly AP too`);
  }
  const todo = listed.filter((w) => needOf(w).length)
    .sort((a, b) => HEAVY.indexOf(a.group) - HEAVY.indexOf(b.group) || Math.max(...b.arcs) - Math.max(...a.arcs) || a.key.localeCompare(b.key));
  console.error(`table: sdn-ap ${version} (${wasmSha.slice(0, 12)}) at ${commit.slice(0, 12)}; ${listed.length} windows (${all.windows.length} first pass, ${listed.length - all.windows.length} second), ${todo.length} to fly on ${Math.min(jobs, todo.length)} jobs`);

  // fly: each worker takes the next window as it finishes one
  let next = 0, flown = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, todo.length) }, () => new Promise((resolve, reject) => {
    const child = fork(SELF, ['--worker', '--wasm', file, '--ap-version', version, '--sha256', wasmSha, '--groups', groups.join(','), '--theories', flying.join(','), ...(args.burns ? ['--burns', args.burns] : [])], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] });
    const give = () => { if (next < todo.length) { const w = todo[next++]; child.send({ key: w.key, need: needOf(w) }); } else child.send({ stop: true }); };
    child.on('message', (m) => {
      if (m.rows) {
        for (const r of m.rows) { fs.appendFileSync(fileOf(r.theory ?? 'AP'), `${JSON.stringify(r)}\n`); flownRows.set(`${r.theory ?? 'AP'}|${r.key}|${r.arcH}`, r); }
        flown += 1;
        if (flown % 50 === 0 || flown === todo.length) console.error(`  ${flown}/${todo.length} windows, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
      }
      give();
    });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`))));
  })));

  const meters = (row, arm, day) => { const e = arm ? row?.arms?.[arm]?.ok && row.arms[arm].days?.[day]?.e : row?.days?.[day]?.e; return Number.isFinite(e) ? e * 1000 : null; };
  const stats = (v) => { const s = v.slice().sort((a, b) => a - b); return { medianM: round(quantile(s, 0.5)), p95M: round(quantile(s, 0.95)) }; };
  const median = (v) => quantile(v.slice().sort((a, b) => a - b), 0.5);
  const truthName = (g, ws) => [...new Set(ws.map((w) => W.providerOf(g, w.name)))].join('; ');
  // the fullest stored setting by name (owner's rule, a properly configured numerical propagator; 2026-11-11): never chosen on the outcome,
  // so a row's arm does not change from one table to the next with the errors
  const chooseArm = (g, bs) => {
    // the commercial geostationary row has an arm where its fits are on arcs after the last burn (--burns with its after-burn rows)
    if (NOT_CONFIGURED.has(g) && !afterBurnGroups.has(g)) return null;
    return PREFER.find((a) => bs.some((b) => b.arms?.[a]?.ok)) ?? null;
  };
  const rows = [], ecom2Rows = [], tideRows = [], tally = {}, passOf = [];
  let windowArcs = 0;
  // --burn-flags <dir>: the burn lane's flags (its flags-*.json, kept outside this repository; stack issue 462)
  const flags = readBurnFlags(args['burn-flags']);
  for (const g of ALL.filter((x) => groups.includes(x))) {
    for (const arc of [...new Set(listed.filter((w) => w.group === g).flatMap((w) => w.arcs))].sort((a, b) => a - b)) {
      const ws = listed.filter((w) => w.group === g && w.arcs.includes(arc));
      let bs = ws.map((w) => numericalOf(w, arc));
      const complete = bs.every(Boolean);
      const label = complete ? chooseArm(g, bs) : null;
      // stack issue 520: the row at 1e-13 where every window the rule gives a numerical arm has its 1e-13 row (whatever its outcome), no
      // window is a refit on the arc after a burn (the 1e-13 rows are of the full arc) and every stored arm of the row is the full drag
      // setting. Then every such window takes its 1e-13 row: its figure, or the reason it has none, is the 1e-13 fit's. Else all at 1e-10.
      // In a regime with after-burn rows (--burns) every window must have its decision row: numericalOf returns a stored error row
      // without one, and the 1e-13 row of such a window was fitted on the full arc without the burn rule
      if (label) {
        const tightOf = (b) => tight.get(`${b.key}|${b.arcH}`), armed = bs.filter((b) => !b.burnInArc);
        if (armed.length && armed.every((b) => tightOf(b))) {
          const notDrag = armed.filter((b) => !b.error && b.arms?.[label]?.arm !== A.NUMERICAL_TIGHT.from).length;
          const refit = bs.filter((b) => b.fitProcess === REFIT).length, undecided = afterBurnGroups.has(g) ? armed.filter((b) => !b.fitProcess).length : 0;
          if (notDrag || refit || undecided) tightHeld.push(`${W.GROUPS[g].label} (${arc} h fit), ${[notDrag ? `${notDrag} windows whose stored arm is not the full drag setting` : null, refit ? `${refit} windows refitted on the arc after a burn` : null, undecided ? `${undecided} windows without the after-burn decision` : null].filter(Boolean).join(' and ')}`);
          else {
            const lift = (b) => { const t = tightOf(b), { error, ...rest } = b; return t.error ? { ...rest, env: t.env, arms: {}, error: t.error } : { ...rest, env: t.env, arms: { ...b.arms, [label]: t.arms.FFMq } }; };
            bs = bs.map((b) => (b.burnInArc ? b : lift(b)));
            tightRows.push(`${W.GROUPS[g].label} (${arc} h fit)`);
          }
        }
      }
      // why a window has no numerical figure (with an arm on the row), at the row's tolerance: the rule gives it none (numericalOf:
      // burnInArc), its numerical row records no truth or coverage, or the fit or flight failed (or gave no figure at a lead AP has)
      // why a window has no numerical figure by the rule (lib/numerical.mjs noArmWhy, the reason the bar counts too): no truth or coverage,
      // the rule gives no arm (burnInArc), or on a 72 h row its numerical arc starts elsewhere than AP's (to the millisecond: the window keeps
      // AP's figure and has no numerical one); a window that has an arm and no figure is fitFailed
      const whys = ws.map((w, i) => (label ? N.noArmWhy({ w, arc, ap: rowOf('AP', w, arc), nr: bs[i], lists: args.burns }) : null));
      bs = bs.map((b, i) => (whys[i] === 'armsOnDifferentArcs' ? { ...b, arms: {}, armsOnDifferentArcs: true } : b));
      // a one-file row (windows.mjs oneFile): both arms of a window name the same reference file (truthFile), or the run is refused
      if (W.GROUPS[g].oneFile) {
        const apart = ws.filter((w, i) => { const ap = rowOf('AP', w, arc), b = bs[i]; return ap && !ap.error && b && !b.error && (!ap.truthFile || ap.truthFile !== b.truthFile); });
        if (apart.length) throw new Error(`refused: on ${W.GROUPS[g].label} (${arc} h fit) ${apart.length} windows whose AP and numerical rows do not name the same reference file (truthFile): ${apart.slice(0, 3).map((w) => w.key).join(', ')}`);
      }
      const noFigureWhy = (i) => (!label ? null : whys[i] ?? 'fitFailed');
      let ffm = null;
      if (label && bs.some((b) => b?.arms?.[label]?.ok)) {
        const used = bs.filter((b) => b?.arms?.[label]?.ok);
        const builds = [...new Set(used.map((b) => JSON.stringify(b.env?.ffm?.ffm ?? null)))];
        const settings = [...new Set(used.map((b) => b.arms[label].arm))];
        if (builds.length !== 1 || settings.length !== 1) throw new Error(`${g} ${arc} h: the stored ${label} rows mix FFM builds or settings (${builds.join(', ')}; ${settings.join(', ')})`);
        const b = JSON.parse(builds[0]);
        if (b?.sha256 !== FFM_220.wasmSha256) throw new Error(`${g} ${arc} h: FFM ${b?.version} ${b?.sha256} is not a build this file knows the commit of`);
        ffm = { version: b.version, wasmSha256: b.sha256, modulesCommit: FFM_220.modulesCommit, configuration: describe(SETTINGS[settings[0]]) + (SPREAD[`${g}|${arc}|${settings[0]}`] ?? '') };
      }
      // per lead: the windows where AP and (where it is measured) the numerical propagator were scored; XP on those of them where it was too
      // an outside theory's column stands only once that theory has a row (flown or failed) on every window of the row
      const flownAll = (t) => ws.every((w) => rowOf(t, w, arc));
      const failedOn = (t, w) => !!rowOf(t, w, arc)?.apError;
      const pairsAt = (day) => ws.map((w, i) => ({ w, a: meters(rowOf('AP', w, arc), null, day), f: label ? meters(bs[i], label, day) : null, x: meters(rowOf('SGP4XP', w, arc), null, day), u: meters(rowOf('USSFXP', w, arc), null, day), s: meters(rowOf('SGP4', w, arc), null, day), xF: failedOn('SGP4XP', w), uF: failedOn('USSFXP', w), sF: failedOn('SGP4', w) })).filter((p) => p.a != null);
      // --burns (stack issue 462): the burns in the truth, every one of the burn detector's lists that it does not reject, known at the cutoff
      // or not. On a row whose satellites all have lists, each lead's AP, numerical and SGP4-XP figures are also given over the windows with no
      // burn between the cutoff and that lead (cleanToLead), beside the figures over all windows; no window leaves any count
      const listsOf = new Map(args.burns ? ws.map((w) => [w.name, A.listedBurns(args.burns, w.group, w.name)]) : []);
      const withLists = !!args.burns && ws.length > 0 && ws.every((w) => listsOf.get(w.name));
      const burnsIn = (w, fromMs, toMs) => listsOf.get(w.name).filter((b) => b.t > fromMs && b.t <= toMs);
      // the joins of the truth's solutions the lists find (seams, stack #479): flagged as later burns are, never dropped; a row read from one
      // file per window (the 72 h TESS row: windows.mjs oneFile) holds none
      const seamsOf = new Map(args.burns && !W.GROUPS[g].oneFile ? ws.map((w) => [w.name, A.listedBurns(args.burns, w.group, w.name, 'seams') ?? []]) : []);
      const joinsIn = (w, fromMs, toMs) => (seamsOf.get(w.name) ?? []).filter((b) => b.t > fromMs && b.t <= toMs);
      const leads = LEADS.map(([hours, day]) => {
        const pairs = pairsAt(day), withXp = pairs.filter((p) => p.x != null), withU = pairs.filter((p) => p.u != null), withS = pairs.filter((p) => p.s != null);
        // the lead's windows with a numerical figure too (all of them on a row where the numerical arm scored every window AP did)
        const armed = pairs.filter((p) => p.f != null);
        // a theory's figure over its scored windows, with the count of those and of the lead's windows where its fit or flight failed
        const column = (scored, values, failed) => (scored.length || failed ? { ...stats(values), windows: scored.length, failed } : null);
        const lead = {
          hours, windows: pairs.length,
          ap: pairs.length ? stats(pairs.map((p) => p.a)) : null,
          ffm: label ? (armed.length ? { ...stats(armed.map((p) => p.f)), ...(armed.length !== pairs.length ? { windows: armed.length } : {}) } : null) : null,
          xp: column(withXp, withXp.map((p) => p.x), pairs.filter((p) => p.xF).length),
          xpUssf: flownAll('USSFXP') ? column(withU, withU.map((p) => p.u), pairs.filter((p) => p.uF).length) : null,
          sgp4: flownAll('SGP4') ? column(withS, withS.map((p) => p.s), pairs.filter((p) => p.sF).length) : null,
          apBeatsXp: withXp.length ? { windows: withXp.length, apBetter: withXp.filter((p) => p.a < p.x).length, medianApOverXp: round3(median(withXp.map((p) => p.a / p.x))) } : null,
          apBeatsXpUssf: flownAll('USSFXP') && withU.length ? { windows: withU.length, apBetter: withU.filter((p) => p.a < p.u).length, medianApOverXp: round3(median(withU.map((p) => p.a / p.u))) } : null,
          apFfmRank: label && armed.length >= 10 ? { windows: armed.length, rho: round3(spearman(armed.map((p) => p.a), armed.map((p) => p.f))) } : null,
        };
        if (withLists) {
          const clean = pairs.filter((p) => !burnsIn(p.w, p.w.cutoffMs, p.w.cutoffMs + hours * W.HOUR).length && !joinsIn(p.w, p.w.cutoffMs, p.w.cutoffMs + hours * W.HOUR).length);
          const fig = (v) => ({ windows: v.length, ...stats(v) });
          if (lead.ap) lead.ap.cleanToLead = fig(clean.map((p) => p.a));
          if (lead.ffm) lead.ffm.cleanToLead = fig(clean.filter((p) => p.f != null).map((p) => p.f));
          if (lead.xp) lead.xp.cleanToLead = fig(clean.filter((p) => p.x != null).map((p) => p.x));
        }
        return lead;
      });
      const pass = label ? pairsAt(PASS_LEAD_DAY).filter((p) => p.f != null) : [];
      const met = pass.filter(passes).length;
      // windows: those with a numerical forecast and AP's figure at the lead; rowWindows: all the row's windows (those AP scored), the others being
      // the row's withoutNumericalFigure by cause. shareOfWindowsWithForecast (= share) is the propagator's measure: there is no forecast to be within
      // 100 m of otherwise; shareOfAllWindows is what a user is served: met over every window of the row
      const within100mOfFfm = label && pass.length ? { windows: pass.length, met, share: round3(met / pass.length) } : null;
      const burnSplit = within100mOfFfm ? splitByBurns(flags, pass, arc) : null;
      // --burns: the row's later burns in words (laterBurns), and on the strong-drag rows its burn-free windows (burnFreeScatter), on the pass
      // line's windows at day 5 (stack issue 462)
      let laterBurns = null, burnFreeScatter = null;
      if (withLists && label && pass.length) {
        const after = (p) => burnsIn(p.w, p.w.cutoffMs, p.w.cutoffMs + PASS_LEAD_DAY * W.DAY);
        // a burn raises or lowers the orbit where its along-track part is at least half its size; else it is mainly out of the orbit's plane or radial
        const kind = (x) => (Math.abs(x.alongTrackMmS) < 0.5 * x.sizeMmS ? 'cross' : x.alongTrackMmS > 0 ? 'raise' : 'lower');
        const classOf = (p) => { const k = [...new Set(after(p).map(kind))]; return !k.length ? 'none' : k.length > 1 ? 'mixed' : k[0]; };
        const of = (c) => pass.filter((p) => classOf(p) === c);
        const apBelow = (s) => s.filter((p) => p.a < p.f - PASS_M).length, ffmBelow = (s) => s.filter((p) => p.f < p.a - PASS_M).length;
        const [up, down, cross, mixed, none] = ['raise', 'lower', 'cross', 'mixed', 'none'].map(of), later = pass.length - none.length;
        if (later) laterBurns = `Between the cutoff and day 5 a burn falls in ${later} of the ${pass.length} windows on the pass line (in ${up.length} every such burn raises the orbit, in ${down.length} every one lowers it, in ${cross.length} every one is mainly out of the orbit's plane, in ${mixed.length} a mix). These windows stay on the pass line and in every figure taken over all windows, though a forecast across a later maneuver measures the maneuver as much as the propagator. AP's error is more than 100 m below the numerical propagator's in ${apBelow(up)} of the ${up.length} windows whose later burns all raise the orbit, ${apBelow(down)} of the ${down.length} whose later burns all lower it, ${apBelow(cross)} of the ${cross.length} whose later burns are mainly out of the plane, ${apBelow(mixed)} of the ${mixed.length} with a mix, and ${apBelow(none)} of the ${none.length} with no later burn, where the numerical propagator's is more than 100 m below AP's in ${ffmBelow(none)}.`;
        // a join of the truth's solutions between the cutoff and day 5 (the lists' seams), said the same way
        const joined = pass.filter((p) => joinsIn(p.w, p.w.cutoffMs, p.w.cutoffMs + PASS_LEAD_DAY * W.DAY).length).length;
        if (joined) laterBurns = `${laterBurns ? `${laterBurns} ` : ''}Between the cutoff and day 5 a join of the truth's solutions (where the reference passes from one solution to the next) falls in ${joined} of the ${pass.length} windows on the pass line. These windows stay on the pass line and in every figure taken over all windows, though across a join the error measures the reference as much as the propagators.`;
        if (STRONG_DRAG.has(g)) {
          const inArc = (p) => burnsIn(p.w, p.w.cutoffMs - arc * W.HOUR, p.w.cutoffMs).length > 0;
          const closer = pass.filter((p) => p.a < p.f - PASS_M), explained = closer.filter((p) => inArc(p) || classOf(p) !== 'none'), free = pass.filter((p) => !inArc(p) && classOf(p) === 'none');
          burnFreeScatter = `The burn lists explain ${explained.length} of the ${closer.length} windows where AP's error is more than 100 m below the numerical propagator's at day 5 (a burn in the fit arc or between the cutoff and day 5). On the ${free.length} burn-free windows AP is the closer one by more than 100 m in ${apBelow(free)} and the numerical propagator in ${ffmBelow(free)}: two fits of the drag term scattering about each other under a density forecast ${(Math.round(median(free.map((p) => p.f)) / 100) / 10).toLocaleString('en-US')} km off at day 5 (the numerical propagator's median there), not a difference in accuracy.`;
        }
      }
      // the row's windows: every one AP scored at one lead at least; of them, those the numerical arm scored at none, by reason
      const scored = ws.filter((w) => LEADS.some(([, day]) => meters(rowOf('AP', w, arc), null, day) != null));
      if (within100mOfFfm) Object.assign(within100mOfFfm, { rowWindows: scored.length, shareOfWindowsWithForecast: within100mOfFfm.share, shareOfAllWindows: scored.length ? round3(within100mOfFfm.met / scored.length) : null });
      const unscored = label ? scored.filter((w) => { const i = ws.indexOf(w); return !LEADS.some(([, day]) => meters(bs[i], label, day) != null); }) : [];
      const byReason = (why) => unscored.filter((w) => noFigureWhy(ws.indexOf(w)) === why).length;
      const withoutNumericalFigure = unscored.length ? { windows: unscored.length, satellites: new Set(unscored.map((w) => w.name)).size, ruleLeavesNoArm: byReason('ruleLeavesNoArm'), fitFailed: byReason('fitFailed'), noTruthOrCoverage: byReason('noTruthOrCoverage'), ...(byReason('armsOnDifferentArcs') ? { armsOnDifferentArcs: byReason('armsOnDifferentArcs') } : {}) } : null;
      const pcfLabel = A.apPcfFor(g, version, !!W.GROUPS[g].vacuum, arc).label;
      const stated = [...new Set(ws.map((w) => rowOf('AP', w, arc)?.pcf).filter(Boolean))];
      if (stated.some((x) => x !== pcfLabel)) throw new Error(`${g} ${arc} h: stored AP rows name $PCF ${stated.join(', ')}, the rule gives ${pcfLabel}`);
      // each row states its fit process in plain words, with the windows each way: a 24 h row from CARRY24_SINCE (stack issue 496), a
      // 72 h row flown with the burn lists (--burns) from MANEUVER72_SINCE (stack issue 489)
      const processCount = (p) => scored.filter((w) => rowOf('AP', w, arc)?.fitProcess === p).length;
      const maneuvering = processCount('maneuvering: the arc after its last burn');
      // a 24 h row's process with or without the maneuvering object's mark
      const carryCount = (p) => scored.filter((w) => (rowOf('AP', w, arc)?.fitProcess ?? '').replace(/, maneuvering$/, '') === p).length;
      const carryManeuvering = scored.filter((w) => /, maneuvering$/.test(rowOf('AP', w, arc)?.fitProcess ?? '')).length;
      // the reference's word (none of the long-period references is a precise orbit, nor the commercial geostationary row's WAAS broadcasts)
      const refWord = A.LONG_PERIOD.groups.includes(g) || NOT_CONFIGURED.has(g) ? 'reference' : 'precise orbit', seamRow = A.SEAMS_BREAK_ARC.includes(g);
      // each window on the arc after a burn, from its list and the rule (never a flag a stored or carried row may lack): whether a join set
      // the arc's start, and whether the burn or join lies inside the arc
      const afterOf = (w) => {
        const m = A.maneuverArc(A.arcBreaks(args.burns, w.group, w.name, w.cutoffMs), w.cutoffMs, Infinity, undefined, A.minHoursOf(w.group), arc);
        const byJoin = seamRow && !A.knownBurns(args.burns, w.group, w.name, w.cutoffMs).some((b) => A.burnEndMs(b) === m.lastBurnMs);
        return { join: m.maneuvering && byJoin, inside: m.maneuvering && m.burnInArc };
      };
      // (without the lists, what the rows state: the windows on the arc after a burn and their burnInArc, burns and joins not told apart)
      const afterArcs = scored.filter((w) => rowOf('AP', w, arc)?.fitProcess === 'maneuvering: the arc after its last burn').map((w) => (args.burns ? afterOf(w) : { join: false, inside: !!rowOf('AP', w, arc)?.burnInArc }));
      // a longer fit's arcs as counts: how many windows at each length (h), how many of them with the firing inside the shortest arc
      const lengths = new Map(); for (const w of scored) { const r = rowOf('AP', w, arc), h = r?.fitArcHours ?? arc; if (r?.fitProcess) lengths.set(h, (lengths.get(h) ?? { n: 0, inside: 0 })); const x = lengths.get(h); if (x) { x.n += 1; if (r.burnInArc) x.inside += 1; } }
      const arcCounts = [...lengths].sort(([p], [q]) => q - p).map(([h, x]) => `${x.n} of ${h.toLocaleString('en-US')} h${x.inside ? ` (${x.inside} with the ${seamRow ? 'firing or join' : 'firing'} inside the arc)` : ''}`).join(', ');
      const fitProcess = arc === 24 && A.carry24(version)
        ? `Each 24 h fit first fits the same window's 72 h arc, which ends at the same cutoff, and carries its terms: above the drag the radiation terms (AGOM with its uncertainty, and ECOM2's Y0 where that fit solved it); under the drag the drag term with its uncertainty, only where the 24 h arc alone leaves it undetermined (a stated sigma of ln BTERM of ${A.carry24Gate(version, false)} or more${A.carry24Gate(version, false) === A.carry24Gate(version, true) ? '' : `, ${A.carry24Gate(version, true)} or more for an object that is maneuvering at the cutoff`}). That 72 h fit is of the full arc, for an object that maneuvers (the 72 h rule below) too, not its 72 h record. Windows: ${carryCount('radiation carried from 72 h')} radiation carried, ${carryCount('drag carried from 72 h')} drag carried, ${carryCount('plain')} fitted as before, ${processCount('plain, no 72 h arc')} without a 72 h arc in the truth (fitted as before); ${carryManeuvering} of the first three are of a maneuvering object.`
        : arc > 72 && A.arcRuleApplies(g, arc) && A.maneuver72(version) && scored.some((w) => rowOf('AP', w, arc)?.fitProcess)
          ? `The ${arc} h of this row is the longest arc allowed, not the arc used: a firing${seamRow ? ' or join of the truth\'s solutions' : ''} known at the cutoff that ends inside the ${arc} h starts the fit\'s arc, at least ${A.minHoursOf(g)} h (one ending less than ${A.minHoursOf(g)} h before the cutoff stays inside that ${A.minHoursOf(g)} h arc, never dropped), with no other cap, on AP and on the numerical arm alike. Arcs fitted: ${arcCounts}. SGP4-XP, the Space Force XP and SGP4 are fitted on the full ${arc} h on every window, through the ${seamRow ? 'firing or join' : 'firing'} where AP\'s arc starts after it.`
        : arc === 72 && A.maneuver72(version) && scored.some((w) => rowOf('AP', w, arc)?.fitProcess)
          ? `An object${A.perigeeClause(A.MANEUVER72.perigeeMinKm)} whose ${refWord} holds a burn known at the cutoff, ending within ${A.MANEUVER72.historyDays} days before it, is fitted on the arc after its last such burn${A.SEAMS_BREAK_ARC.includes(g) ? " or join of the truth's solutions" : ""} (${A.minHoursOf(g)} to ${A.MANEUVER72.capHours} h; the module fits it under its short-arc rule; a burn ending less than ${A.minHoursOf(g)} h before the cutoff stays inside the arc, never dropped); every other window on the full 72 h. Windows: ${!args.burns && seamRow ? `${afterArcs.length} on the arc after a burn or join` : `${afterArcs.filter((x) => !x.join).length} on the arc after a burn${seamRow ? `, ${afterArcs.filter((x) => x.join).length} on the arc after a join` : ''}`} (${afterArcs.filter((x) => x.inside).length} of them with the ${seamRow ? 'burn or join' : 'burn'} inside the arc), ${scored.length - maneuvering} on the full arc. SGP4-XP, the Space Force XP and SGP4 are fitted on the full 72 h on every window, through the burn where AP's arc starts after it.`
          : null;
      // --burns with after-burn rows: the numerical arm's fit process in one sentence, with the windows each way (stack issues 462 and 489)
      const apart = bs.filter((b) => b?.armsOnDifferentArcs).length, apartText = apart ? `, ${apart} with no numerical figure because its arc starts elsewhere than AP's (armsOnDifferentArcs)` : '';
      const ffmRefit = bs.filter((b) => b?.fitProcess === REFIT && !b.burnInArc && !b.armsOnDifferentArcs).length, ffmNone = bs.filter((b) => b?.burnInArc).length;
      const ffmFull = bs.filter((b) => b?.fitProcess && b.fitProcess !== REFIT && !b.burnInArc && !b.armsOnDifferentArcs).length;
      // of those without an arm: the objects whose orbit is not ballistic between impulses (their burn lists' notBallistic), and the rest
      const thrusting = ws.filter((w, i) => bs[i]?.burnInArc && /^not ballistic/.test(bs[i].fitProcess ?? ''));
      const thrustingSats = new Set(thrusting.map((w) => w.name)).size, burnLeft = ffmNone - thrusting.length;
      const noneText = [thrusting.length ? `${thrusting.length} on the ${thrustingSats === 1 ? 'satellite' : `${thrustingSats} satellites`} whose orbit is not ballistic between impulses (flown from the truth's positions alone, the numerical setting closes above 100 m over the burn detector's pieces, as under continuous low thrust), left without an arm` : null,
        burnLeft ? `${burnLeft} where a burn known at the cutoff remains in every arc the rule allows` : null].filter(Boolean).join(', and ') + (ffmNone ? ' (those AP scored stay in AP\'s and the other theories\' columns, counted in withoutNumericalFigure)' : '');
      // on the Chandra row, the refits after a join apart from those after a burn (from the lists and the rule, as AP's sentence counts them)
      const ffmJoin = seamRow && args.burns ? ws.filter((w, i) => bs[i]?.fitProcess === REFIT && !bs[i].burnInArc && !bs[i].armsOnDifferentArcs && afterOf(w).join).length : 0;
      // the listed windows each sentence leaves without a numerical fit (no truth or coverage): those of no other count
      const noFit = ws.length - ffmRefit - ffmFull - ffmNone - apart;
      const ffmFitProcess = label && afterBurnGroups.has(g) && arc !== 24 && !A.arcRuleApplies(g, arc) ? `The numerical arm's ${arc} h fit is the stored full-arc fit on every window that has one: the rule moves the 24 h and 72 h fits only, and the long-period rows' longer ones. Of the row's ${ws.length} listed windows: ${ffmFull} on the full arc${noFit ? `, ${noFit} without a numerical fit (no truth or coverage)` : ''}.`
        : label && afterBurnGroups.has(g)
        ? `The numerical arm's fit of an object${A.perigeeClause(A.NUMERICAL_AFTER_BURN.perigeeMinKm)} whose ${refWord} holds a burn${seamRow ? ' or join of the truth\'s solutions' : ''} known at the cutoff is on the arc after its last such burn${seamRow ? ' or join' : ''}${arc !== 24 ? `, by AP's rule (on every window with figures on both arms, AP's ${arc} h fit is on the same arc)` : ` where that burn ends inside the 24 h arc and the arc after it is at least ${A.NUMERICAL_AFTER_BURN.minHours24} h, while AP's 24 h fit is on the full 24 h, so on those windows the two arms are fitted on different arcs`}; every other window is on the full arc (the stored fit, or, for an object weighed at its own sigma or on the row that takes the prior, that fit made again). Of the row's ${ws.length} listed windows: ${ffmRefit - ffmJoin} refitted on the arc after a burn${seamRow ? `, ${ffmJoin} on the arc after a join` : ''}, ${ffmFull} on the full arc${apartText}${ffmNone ? `, ${ffmNone} without a numerical arm: ${noneText}` : ''}${noFit ? `, ${noFit} without a numerical fit (no truth or coverage)` : ''}.`
        : label && apart ? `The numerical arm's fit is the stored full-arc fit; this row has no refits after a burn, so the ${apart} windows whose AP arc starts after a burn have no numerical figure (armsOnDifferentArcs).`
        : null;
      // --carry-from: on every row, per theory, the window-arcs whose row is the other build's (carried), those flown on this build (flown),
      // and the windows the two builds were compared on where the row carries (compared; null where it does not)
      const countOf = (t, sha) => ws.filter((w) => rowOf(t, w, arc)?.ap?.sha256 === sha).length;
      const carried = carry ? { from: carry.build.version, listed: ws.length, ...Object.fromEntries([['AP', 'ap'], ['SGP4XP', 'xp']].map(([t, name]) => [name, { carried: countOf(t, carry.build.wasmSha256), flown: countOf(t, wasmSha), compared: carry.compared.get(`${g}|${arc}|${t}`) ?? null }])) } : null;
      // the long-period rows: the perigee scan of AP's records over the row's windows (lib/arms.mjs PERIGEE_SCAN): the windows scanned, the
      // passages, the largest displacement and the median of each window's largest, m
      const scans = A.LONG_PERIOD.groups.includes(g) ? scored.map((w) => rowOf('AP', w, arc)?.perigeeScan).filter(Boolean) : [], passed = scans.filter((x) => x.largestM != null);
      const perigeeScan = scans.length ? { windows: scans.length, passages: scans.reduce((n, x) => n + x.passages.length, 0), largestM: passed.length ? Math.max(...passed.map((x) => x.largestM)) : null, medianM: passed.length ? round3(median(passed.map((x) => x.largestM))) : null } : null;
      rows.push({ regime: W.GROUPS[g].label, truth: truthName(g, ws), ...(TRUTH_NOTE[`${g}:${arc}`] ?? TRUTH_NOTE[g] ? { truthNote: TRUTH_NOTE[`${g}:${arc}`] ?? TRUTH_NOTE[g] } : {}), fitData: `the truth's states over the ${arc} h before the cutoff, one every 300 s (GCRF)`, fitHours: arc, satellites: new Set(scored.map((w) => w.name)).size, windows: scored.length, ...(withoutNumericalFigure ? { withoutNumericalFigure } : {}), apForces: A.AP_FORCES_TEXT[pcfLabel], ...(fitProcess ? { fitProcess } : {}), ffm, ...(ffmFitProcess ? { ffmFitProcess } : {}), ...(placed.has(g) && ws.some((w) => w.placedAfterFiring) ? { placedAfterFiring: `${ws.filter((w) => w.placedAfterFiring).length} of the row's ${ws.length} windows are placed after a firing by the rule: each cutoff at the first midnight at least ${A.LONG_PERIOD.minHours} h after the firing's report time. The rule gives ${placed.get(g).cutoffs} cutoffs for the list's ${placed.get(g).firings} firings; ${placed.get(g).already} of them are cutoffs the row already has, not added again.` } : {}), within100mOfFfm, leads, ...(burnSplit ? { burnSplit } : {}), ...(perigeeScan ? { perigeeScan } : {}), ...(carried ? { carried } : {}) });
      passOf.push({ g, arc, row: rows.at(-1), pass: within100mOfFfm ? pass : [], laterBurns, burnFreeScatter });
      if (/ECOM2/.test(pcfLabel)) ecom2Rows.push(`${W.GROUPS[g].label} (${arc} h fit)`);
      if (/_TIDES$/.test(pcfLabel)) tideRows.push(`${W.GROUPS[g].label} (${arc} h fit)`);
      for (const w of ws) for (const t of THEORIES) { const r = rowOf(t, w, arc), c = (tally[t] ??= { scored: 0, failed: 0, windowError: 0, none: 0 }); if (!r) c.none += 1; else if (r.error) c.windowError += 1; else if (r.apError) c.failed += 1; else c.scored += 1; }
      windowArcs += ws.length;
      const failed = (t) => ws.filter((w) => rowOf(t, w, arc)?.apError).length;
      console.error(`  ${g} ${arc} h: ${scored.length} of ${ws.length} windows scored${THEORIES.map((t) => (failed(t) ? `, ${t} failed on ${failed(t)}` : '')).join('')}; numerical arm ${label && ffm ? `${label} (${ffm.configuration.split(';')[0]})` : label ? `${label}, with a figure on no window` : complete ? 'none properly configured' : 'being measured'}`);
    }
  }
  // --burn-flags: under each Near 700 km row, the altimetry row's pass line at the same fit length on those of its satellites at the same
  // altitudes, with its own split; the windows are the altimetry row's own, none taken from or added to either row
  const altitudeOf = new Map();
  if (flags) for (const m of passOf.filter((x) => x.g === SAME_ALTITUDES.row && x.pass.length)) {
    const from = passOf.find((x) => x.g === SAME_ALTITUDES.from && x.arc === m.arc && x.pass.length);
    if (!from) continue;
    for (const p of from.pass.slice().sort((x, y) => x.w.cutoffMs - y.w.cutoffMs)) {
      if (altitudeOf.has(p.w.name)) continue;
      const r = (await W.truthOf(p.w, p.w.cutoffMs - 3 * W.HOUR, p.w.cutoffMs, null)).lines.map((l) => Math.hypot(...l.r));
      altitudeOf.set(p.w.name, r.length ? r.reduce((s, x) => s + x, 0) / r.length - EQUATOR_KM : null);
    }
    const inBand = (n) => altitudeOf.get(n) >= SAME_ALTITUDES.fromKm && altitudeOf.get(n) <= SAME_ALTITUDES.toKm;
    const sub = from.pass.filter((p) => inBand(p.w.name)), met = sub.filter(passes).length, split = splitByBurns(flags, sub, m.arc);
    m.row.sameAltitudes = { label: SAME_ALTITUDES.label, regime: W.GROUPS[SAME_ALTITUDES.from].label, fitHours: m.arc, altitudeKm: { from: SAME_ALTITUDES.fromKm, to: SAME_ALTITUDES.toKm },
      satellites: [...new Set(from.pass.map((p) => p.w.name))].filter(inBand).sort().map((name) => ({ name, altitudeKm: Math.round(altitudeOf.get(name)) })),
      within100mOfFfm: sub.length ? { windows: sub.length, met, share: round3(met / sub.length) } : null, ...(split ? { burnSplit: split } : {}) };
  }
  // the pass line two-sided (owner, 2026-11-11: "It does not make sense that we can be more accurate than FFM"): a window counts where AP's
  // error and the numerical propagator's are within 100 m of each other either way, on the pass line's own windows; split by the burn flags
  // as burnSplit is. Written after every other field of the row.
  const eitherWay = (p) => Math.abs(p.a - p.f) <= PASS_M;
  for (const m of passOf.filter((x) => x.pass.length)) {
    const met = m.pass.filter(eitherWay).length;
    m.row.within100mEitherWay = { windows: m.pass.length, met, share: round3(met / m.pass.length) };
    if (m.row.burnSplit) m.row.within100mEitherWayBurnSplit = partsByBurns(flags, m.pass, m.arc, eitherWay);
    // --burns: the row's reading of its later burns and, on the strong-drag rows, of its burn-free windows, last
    if (m.laterBurns) m.row.laterBurns = m.laterBurns;
    if (m.burnFreeScatter) m.row.burnFreeScatter = m.burnFreeScatter;
  }
  for (const r of rows.filter((x) => x.burnSplit || x.sameAltitudes)) console.error(`  ${r.regime} ${r.fitHours} h: ${r.burnSplit?.label ?? 'no burn flags'}${r.sameAltitudes ? ` ${r.sameAltitudes.label}: ${r.sameAltitudes.within100mOfFfm?.met} of ${r.sameAltitudes.within100mOfFfm?.windows}; ${r.sameAltitudes.burnSplit?.label ?? 'no burn flags'}` : ''}`);
  const burnText = !flags ? '' : ` burnSplit, on the rows with burn flags, splits the windows of the pass line (within100mOfFfm) by the burns that a detector reading the truth alone finds: velocity steps that the full numerical setting, flown from the truth's own states, does not explain, localized by halving (planted steps found down to 0.5 mm/s at 700 km; on the altimetry satellites, every burn of the IDS maneuver lists that falls where the truth covers it, and none that is not listed). burnInFitArc holds the windows with a burn in the fit arc; burnCutoffToDay5Only those with none there and one between the cutoff and day 5; noBurn those with neither; unflagged those the detector did not run on. The four are a partition: their windows and met add up to the pass line's. partlyCovered counts the windows where a span counted without a burn has hours without truth, which the detector cannot see; label states the counts in words. Neither fit solves a delta-v (the numerical fit has no such term), so a burn after the cutoff is missed by both and one in the fit arc is taken up by each fit's other terms.${rows.some((r) => r.sameAltitudes) ? ` sameAltitudes, under the ${W.GROUPS[SAME_ALTITUDES.row].label} rows, is the ${W.GROUPS[SAME_ALTITUDES.from].label} row's pass line at the same fit length on its satellites at ${SAME_ALTITUDES.fromKm} to ${SAME_ALTITUDES.toKm} km (mean geocentric distance less the equatorial radius over the truth's 3 h before each satellite's first scored cutoff), with its own burnSplit.` : ''} The flags cover ${count(flags.size)} window-arcs and are kept outside this repository (the first 12 hex digits of the sha256 of their files in name order, as for the builds: ${flags.sha256.slice(0, 12)}).`;
  // --burns: which lists and which store of refits after a burn the table read (one store per set of lists)
  const listsText = !args.burns ? '' : ` The burn lists read are kept outside this repository (the first 12 hex digits of the sha256 of their relative paths and contents in path order, as for the builds: ${A.listsDigest(args.burns).slice(0, 12)})${afterBurnGroups.size ? `; the numerical arm's refits on the arc after a burn are read from a store folder of their own (burnLists names it), every one of them made on these lists` : ''}.`;
  // the lists' time of becoming known (lib/arms.mjs knownBurns): per row, whether its satellites' lists are made as of each burn's report
  // time (asOf) or over the whole data, where a burn counts as known by the list's own time for it
  const listKinds = !args.burns ? null : (() => {
    const kind = (g) => {
      const d = path.join(args.burns, A.listsGroup(g)), fl = fs.existsSync(d) ? fs.readdirSync(d).filter((f) => f.endsWith('.burns.json')) : [];
      const asOf = fl.filter((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')).asOf).length;
      return !fl.length ? null : asOf === fl.length ? 'asOf' : asOf ? 'mixed' : 'whole';
    };
    const of = (k) => [...new Set(groups.filter((g) => kind(g) === k).map((g) => W.GROUPS[g].label))];
    return { whole: of('whole'), asOf: of('asOf'), mixed: of('mixed') };
  })();
  const known = '(for an entry with the detector\'s pieces, the end of the last piece that found it; for one without, the end of the entry itself)';
  const knownText = !listKinds || !(listKinds.whole.length + listKinds.mixed.length) ? '' : ` ${listKinds.whole.length ? `On ${listKinds.whole.join('; ')} the burn lists are made over the whole data, not as of each cutoff: where a list decides a fit arc, a burn counts as known at a cutoff by the list's own time for it ${known}, not by a list made at that cutoff` : ''}${listKinds.mixed.length ? `${listKinds.whole.length ? '. ' : ''}On ${listKinds.mixed.join('; ')} some lists are made over the whole data (a burn known by the list's own time for it ${known}) and some as of each burn's report time (asOf)` : ''}${listKinds.asOf.length ? `; on ${listKinds.asOf.join('; ')} the lists are made as of each burn's report time (asOf)` : ''}. The later-burn flags (laterBurns, cleanToLead) read every burn of a list, known at the cutoff or not.`;
  // the method line's last sentences: each column's build, and what each scored over the table's window-arcs (a failure or a window
  // without truth is counted, never dropped); the rows whose AP fits state FORCES.ECOM2
  const short = (s) => String(s).slice(0, 12);
  const builds = { AP: `sdn-ap ${version} (modules ${short(commit)}, wasm ${short(wasmSha)})`,
    USSFXP: A.OUTSIDE.USSFXP.builds.map((b) => `${b.module} ${b.version} (modules ${short(b.modulesCommit)}, wasm ${short(b.wasmSha256)})`).join(', '),
    SGP4: A.OUTSIDE.SGP4.builds.map((b) => `${b.module} (modules ${short(b.modulesCommit)}, wasm ${short(b.wasmSha256)})`).join(', ') };
  const tallyOf = (t) => { const c = tally[t] ?? { scored: 0, failed: 0, windowError: 0, none: 0 }; return `scored ${c.scored.toLocaleString('en-US')} of ${windowArcs.toLocaleString('en-US')}, its fit or flight failed on ${c.failed}, no truth or coverage on ${c.windowError}${c.none ? `, not flown on ${c.none}` : ''}`; };
  const carriedAny = carry && rows.some((r) => r.carried.ap.carried || r.carried.xp.carried);
  const columns = `Columns by build: ap and xp come from ${builds.AP}${carriedAny ? `, except on the window-arcs each row's carried counts, which are of sdn-ap ${carry.build.version} (wasm ${short(carry.build.wasmSha256)})` : ''}, xpUssf from ${builds.USSFXP}, sgp4 from ${builds.SGP4}. Over the table's ${windowArcs.toLocaleString('en-US')} window-arcs (one window and one fit arc each), ap ${tallyOf('AP')}; xp ${tallyOf('SGP4XP')}; xpUssf ${tallyOf('USSFXP')}; sgp4 ${tallyOf('SGP4')}; each is counted in its column, none dropped. `
    + (ecom2Rows.length ? `The rows whose AP fits state $PCF FORCES.ECOM2 in this table: ${ecom2Rows.join(', ')}.` : 'No row\'s AP fits state $PCF FORCES.ECOM2 in this table.')
    + (tideRows.length === rows.length && rows.length ? ' Every row\'s AP fits state $PCF FORCES.SOLID_TIDES IERS 2010 in this table.' : tideRows.length ? ` The rows whose AP fits state $PCF FORCES.SOLID_TIDES IERS 2010 in this table: ${tideRows.join(', ')}.` : '');
  // --previous <the previous release table>: the rows that gained windows since it (a second pass coming in), so a moved row is not read
  // as the build's doing
  const previous = args.previous ? JSON.parse(fs.readFileSync(args.previous, 'utf8')) : null;
  const gained = previous ? rows.map((r) => ({ r, p: previous.rows.find((x) => x.regime === r.regime && x.fitHours === r.fitHours) })).filter(({ r, p }) => p && r.windows > p.windows) : [];
  const gainedText = !previous ? '' : gained.length
    ? ` Against the previous release table (sdn-ap ${previous.module.version}), these rows gained windows in this release, so their figures move with the windows added and not only with the build: ${gained.map(({ r, p }) => `${r.regime} (${r.fitHours} h fit), ${count(p.windows)} to ${count(r.windows)} scored windows`).join('; ')}.`
    : ` Against the previous release table (sdn-ap ${previous.module.version}), no row gained windows.`;
  // and the rows scored against a different numerical setting than in the previous table (its configuration sentence's field clause, or
  // the sentence where the field is the same), so a count that moved with the arm is not read as the build's doing either
  const field = (c) => String(c ?? '').split(';')[0].replace(/^Earth gravity to /, '');
  const tolerance = (c) => /at a tolerance of ([^ ]+)/.exec(String(c ?? ''))?.[1] ?? null;
  // the setting a configuration sentence names: the sentence without its spread note (the end of the sentence) and issue references, which
  // are wording, not setting
  const settingOf = (c) => (c == null ? null : String(c).replace(/ Two flights of this same fit .*$/, '').replace(/;? ?\(?stack issue \d+\)?/g, '').trim());
  const armChanged = previous ? rows.map((r) => ({ r, p: previous.rows.find((x) => x.regime === r.regime && x.fitHours === r.fitHours) })).filter(({ r, p }) => p && settingOf(p.ffm?.configuration) !== settingOf(r.ffm?.configuration)) : [];
  const armText = armChanged.length
    ? ` These rows are scored against a different numerical setting than in that table: ${armChanged.map(({ r, p }) => `${r.regime} (${r.fitHours} h fit), ${field(p.ffm?.configuration) !== field(r.ffm?.configuration) ? `${field(p.ffm?.configuration) || 'none'} to ${field(r.ffm?.configuration) || 'none'}` : tolerance(p.ffm?.configuration) !== tolerance(r.ffm?.configuration) ? `the same setting fitted and flown at a tolerance of ${tolerance(r.ffm?.configuration) ?? 'none stated'}, where that table's was ${tolerance(p.ffm?.configuration) ?? 'not stated'}` : 'its configuration sentence changed'}`).join('; ')}.`
    : '';
  const doc = {
    schema: 'sdn-ap-scoreboard/2',
    measured: new Date().toISOString().slice(0, 10),
    statistic: `${STATISTIC} ${columns}${gainedText}${armText}${tightRows.length ? TIGHT_TEXT(tightRows) : ''}${tightHeld.length ? TIGHT_HELD_TEXT(tightHeld) : ''}${rows.some((r) => r.withoutNumericalFigure) ? NO_FIGURE_TEXT : ''}${rows.some((r) => r.perigeeScan) ? PERIGEE_SCAN_TEXT : ''}${carry ? CARRY_TEXT(carry.build) : ''}${listsText}${knownText}${args.burns && A.maneuver72(version) ? LONG_PERIOD_TEXT : ""}${burnText}${rows.some((r) => r.within100mEitherWay) ? EITHER_WAY_TEXT : ''}${rows.some((r) => r.leads.some((l) => l.ap?.cleanToLead)) ? CLEAN_TEXT : ''}`,
    ffmSelection: FFM_SELECTION,
    windows: windowsText,
    module: { version, modulesCommit: commit, wasmSha256: wasmSha },
    // --carry-from: the build the carried rows are of, as a field, where a row carried (the bar reads it)
    ...(carry && rows.some((r) => r.carried.ap.carried || r.carried.xp.carried) ? { carriedFrom: carry.build } : {}),
    // the burn lists read (their digest) and the store folder of the refits after a burn, as fields (bar.mjs reads them)
    ...(args.burns ? { burnLists: { digest: A.listsDigest(args.burns).slice(0, 12), afterBurnStore: afterBurnGroups.size ? afterBurnStore : null } } : {}),
    harness: { repo: 'orbit-accuracy-experiments', commit: harnessCommit, command: ['node', 'experiments/headline-loop/table.mjs', ...repositoryArgs(process.argv.slice(2))].join(' ') },
    frame: 'GCRF, the module\'s own output',
    rows,
  };
  fs.writeFileSync(out, `${JSON.stringify(doc, null, 1)}\n`);
  console.error(`table: wrote ${out} in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  process.exit(0);
}

/** --check, end to end: table.mjs itself, as its own process, on the laser geodetic regime into a temporary store whose numerical rows are the
 *  real store's. The file holds exactly the agreed fields; every number equals the one recomputed here from the rows it read; with one
 *  window's numerical row taken away the row's numerical columns are null ("being measured"); a second run flies nothing. About a minute. */
async function check() {
  const E = await import('./lib/e2e.mjs');
  const { MODULES_ROOT } = await import('./lib/env.mjs');
  const A = await import('./lib/arms.mjs');
  const { check: ok, done } = E.checker('TABLE');
  const dir = E.tmp('table'), real = path.join(A.STORE_ROOT, A.NUMERICAL_STORE);
  // the modules build the check flies: HEADLINE_LOOP_CHECK_MODULES_ROOT and _COMMIT, or this repository's modules checkout at HEAD
  const modulesRoot = process.env.HEADLINE_LOOP_CHECK_MODULES_ROOT ?? MODULES_ROOT;
  const commit = git(modulesRoot, 'rev-parse', '--verify', `${process.env.HEADLINE_LOOP_CHECK_MODULES_COMMIT ?? 'HEAD'}^{commit}`).toString().trim();
  const wasmSha = sha256(git(modulesRoot, 'show', `${commit}:propagator/sdn-ap/dist/isomorphic/module.wasm`));
  const version = JSON.parse(git(modulesRoot, 'show', `${commit}:propagator/sdn-ap/package.json`).toString()).version;
  // the check's jobs (HEADLINE_LOOP_CHECK_JOBS, a positive whole number; 8 unless set: a shared machine runs it on fewer)
  const jobsEnv = process.env.HEADLINE_LOOP_CHECK_JOBS;
  if (jobsEnv !== undefined && !/^[1-9]\d*$/.test(jobsEnv)) throw new Error(`HEADLINE_LOOP_CHECK_JOBS=${jobsEnv}: refused, it is not a positive whole number`);
  const CHECK_JOBS = jobsEnv ?? '8';
  const runIn = (store, out, more = [], groups = 'GD') => E.run('table.mjs', ['--modules-commit', commit, '--modules-root', modulesRoot, '--out', out, '--groups', groups, '--jobs', CHECK_JOBS, ...more], { HEADLINE_LOOP_STORE: store });
  const parse = (l) => { try { return JSON.parse(l); } catch { return null; } };
  const lines = (f) => fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).map(parse).filter(Boolean);
  const gd = fs.readdirSync(real).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => lines(path.join(real, f))).filter((r) => r.group === 'GD' && !r.period);
  // 1. the real numerical rows
  const s1 = path.join(dir, 's1'), out1 = path.join(dir, 'a.json');
  fs.mkdirSync(s1, { recursive: true });
  fs.symlinkSync(real, path.join(s1, A.NUMERICAL_STORE));
  const r1 = runIn(s1, out1);
  ok(r1.code === 0 && fs.existsSync(out1), `the table did not run: ${r1.err.slice(-300)}`);
  const doc = fs.existsSync(out1) ? E.readJson(out1) : {};
  ok(JSON.stringify(Object.keys(doc)) === JSON.stringify(['schema', 'measured', 'statistic', 'ffmSelection', 'windows', 'module', 'harness', 'frame', 'rows']) && doc.windows === 'The table holds 55 windows (one satellite and one cutoff each), cutoffs from 2025-10-11 to 2025-12-20.' && doc.schema === 'sdn-ap-scoreboard/2' && doc.frame === 'GCRF, the module\'s own output', `top-level fields: ${Object.keys(doc)}`);
  ok(doc.module?.modulesCommit === commit && doc.module?.wasmSha256 === wasmSha && /^[0-9a-f]{40}$/.test(doc.harness?.commit ?? ''), `module and harness: ${JSON.stringify(doc.module)} ${doc.harness?.commit}`);
  ok(doc.harness?.command === `node experiments/headline-loop/table.mjs --modules-commit ${commit} --groups GD --jobs ${CHECK_JOBS}` && !doc.harness.command.includes(dir), `the command, repository-relative: ${doc.harness?.command}`);
  const row = doc.rows?.[0];
  ok(doc.rows?.length === 1 && JSON.stringify(Object.keys(row ?? {})) === JSON.stringify(['regime', 'truth', 'fitData', 'fitHours', 'satellites', 'windows', 'apForces', 'ffm', 'within100mOfFfm', 'leads', 'within100mEitherWay']) && row.regime === 'Laser geodetic' && row.truth === 'ILRS' && row.fitHours === 72 && row.satellites === 5, `the row: ${JSON.stringify(row)?.slice(0, 300)}`);
  const gdLabel = A.apPcfFor('GD', version, false, 72).label;
  ok(row?.apForces === A.AP_FORCES_TEXT[gdLabel], `the laser geodetic row's forces: ${row?.apForces}`);
  ok(row?.ffm?.version === '2.2.0' && /^[0-9a-f]{64}$/.test(row.ffm.wasmSha256) && /ocean tides/.test(row.ffm.configuration) && !/Fbest|FFM/.test(row.ffm.configuration), `the numerical arm: ${JSON.stringify(row?.ffm)}`);
  // AP's and our XP's rows under the AP build, the Space Force XP's and SGP4's under their own builds, none in the other's place
  const sha12 = wasmSha.slice(0, 12), moduleRows = lines(path.join(s1, 'table', sha12, 'rows.jsonl'));
  const outsideFile = (store, t) => path.join(store, 'outside', A.OUTSIDE[t].key, 'rows.jsonl');
  const outsideRows = Object.keys(A.OUTSIDE).flatMap((t) => (fs.existsSync(outsideFile(s1, t)) ? lines(outsideFile(s1, t)) : []));
  ok(moduleRows.every((r) => ['AP', 'SGP4XP'].includes(r.theory) && r.ap?.sha256 === wasmSha) && outsideRows.every((r) => A.OUTSIDE[r.theory] && JSON.stringify(r.builds) === JSON.stringify(A.OUTSIDE[r.theory].builds)), 'rows in the wrong store or without their builds');
  const flown = [...moduleRows, ...outsideRows];
  ok(moduleRows.filter((r) => r.theory === 'AP' && (r.days || r.apError)).every((r) => r.pcf === gdLabel), `the laser geodetic AP rows name $PCF ${gdLabel}`);
  const apRows = new Map(flown.filter((r) => (r.theory ?? 'AP') === 'AP').map((r) => [r.key, r])), xpRows = new Map(flown.filter((r) => r.theory === 'SGP4XP').map((r) => [r.key, r]));
  const uRows = new Map(flown.filter((r) => r.theory === 'USSFXP').map((r) => [r.key, r])), sRows = new Map(flown.filter((r) => r.theory === 'SGP4').map((r) => [r.key, r]));
  ok([apRows, xpRows, uRows, sRows].every((m) => m.size === 55) && /propagator\/sgp4-xp/.test(doc.statistic) && /analysis\/gp-error-model/.test(doc.statistic), `rows flown: AP ${apRows.size}, XP ${xpRows.size}, Space Force XP ${uRows.size}, SGP4 ${sRows.size} (55 windows); the fitters named`);
  const med = (v) => round(quantile(v.slice().sort((a, b) => a - b), 0.5)), p95 = (v) => round(quantile(v.slice().sort((a, b) => a - b), 0.95));
  const pairsAt = (day) => gd.map((b) => ({ a: apRows.get(b.key)?.days?.[day]?.e, f: b.arms?.FFMbest?.ok ? b.arms.FFMbest.days?.[day]?.e : undefined, x: xpRows.get(b.key)?.days?.[day]?.e, u: uRows.get(b.key)?.days?.[day]?.e, s: sRows.get(b.key)?.days?.[day]?.e })).filter((p) => Number.isFinite(p.a) && Number.isFinite(p.f));
  ok(JSON.stringify(row?.leads?.map((l) => l.hours)) === '[24,72,120,168]', `leads ${JSON.stringify(row?.leads?.map((l) => l.hours))}`);
  for (const [hours, day] of LEADS) {
    const pairs = pairsAt(day), wx = pairs.filter((p) => Number.isFinite(p.x)), wu = pairs.filter((p) => Number.isFinite(p.u)), ws = pairs.filter((p) => Number.isFinite(p.s));
    const l = row?.leads?.find((x) => x.hours === hours);
    const ranks = (v) => v.map((x) => v.filter((y) => y < x).length + (v.filter((y) => y === x).length + 1) / 2);
    const ra = ranks(pairs.map((p) => p.a * 1000)), rf = ranks(pairs.map((p) => p.f * 1000)), mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
    const cov = (u, v) => u.reduce((s, x, i) => s + (x - mean(u)) * (v[i] - mean(v)), 0), rho = cov(ra, rf) / Math.sqrt(cov(ra, ra) * cov(rf, rf));
    ok(l?.apFfmRank?.windows === pairs.length && l.apFfmRank.rho === round3(rho), `rank correlation at ${hours} h: ${JSON.stringify(l?.apFfmRank)} against ${round3(rho)} recomputed on ${pairs.length} windows`);
    ok(l && l.windows === pairs.length && l.ap.medianM === med(pairs.map((p) => p.a * 1000)) && l.ap.p95M === p95(pairs.map((p) => p.a * 1000)) && l.ffm.medianM === med(pairs.map((p) => p.f * 1000)) && l.ffm.p95M === p95(pairs.map((p) => p.f * 1000)), `lead ${hours} h: ${JSON.stringify(l)} against ${pairs.length} windows recomputed`);
    ok(l && wx.length && l.xp.windows === wx.length && l.xp.failed === 0 && l.xp.medianM === med(wx.map((p) => p.x * 1000)) && l.xp.p95M === p95(wx.map((p) => p.x * 1000)) 
      && l.apBeatsXp.windows === wx.length && l.apBeatsXp.apBetter === wx.filter((p) => p.a < p.x).length && l.apBeatsXp.medianApOverXp === round3(quantile(wx.map((p) => (p.a * 1000) / (p.x * 1000)).sort((a, b) => a - b), 0.5)), `XP at ${hours} h: ${JSON.stringify(l?.xp)} ${JSON.stringify(l?.apBeatsXp)} against ${wx.length} windows recomputed`);
    ok(l && wu.length && ws.length && l.xpUssf.windows === wu.length && l.xpUssf.failed === 0 && l.sgp4.windows === ws.length && l.sgp4.failed === 0 && l.xpUssf.medianM === med(wu.map((p) => p.u * 1000)) && l.xpUssf.p95M === p95(wu.map((p) => p.u * 1000)) && l.sgp4.medianM === med(ws.map((p) => p.s * 1000)) && l.sgp4.p95M === p95(ws.map((p) => p.s * 1000))
      && l.apBeatsXpUssf.windows === wu.length && l.apBeatsXpUssf.apBetter === wu.filter((p) => p.a < p.u).length && l.apBeatsXpUssf.medianApOverXp === round3(quantile(wu.map((p) => (p.a * 1000) / (p.u * 1000)).sort((a, b) => a - b), 0.5)), `Space Force XP and SGP4 at ${hours} h: ${JSON.stringify(l?.xpUssf)} ${JSON.stringify(l?.sgp4)} ${JSON.stringify(l?.apBeatsXpUssf)} against ${wu.length} and ${ws.length} windows recomputed`);
  }
  const pass = pairsAt('5'), met = pass.filter((p) => p.a * 1000 - p.f * 1000 < 100).length;
  ok(row?.within100mOfFfm?.windows === pass.length && row.within100mOfFfm.met === met && row.within100mOfFfm.share === round3(met / pass.length), `pass line: ${JSON.stringify(row?.within100mOfFfm)} against ${met} of ${pass.length} recomputed`);
  // the pass line two-sided: within 100 m of each other either way, on the same windows
  const either = pass.filter((p) => Math.abs(p.a * 1000 - p.f * 1000) <= 100).length;
  ok(row?.within100mEitherWay?.windows === pass.length && row.within100mEitherWay.met === either && row.within100mEitherWay.share === round3(either / pass.length) && either <= met && /within100mEitherWay counts/.test(doc.statistic ?? ''), `the two-sided pass line: ${JSON.stringify(row?.within100mEitherWay)} against ${either} of ${pass.length} recomputed`);
  // 2. one window's numerical row and one Space Force XP row taken away, the Space Force XP not flown: FFM, the pass line and the Space Force
  // XP are "being measured"; the other rows are reused, nothing flown
  const s2 = path.join(dir, 's2'), out2 = path.join(dir, 'b.json');
  fs.mkdirSync(path.join(s2, A.NUMERICAL_STORE), { recursive: true });
  fs.writeFileSync(path.join(s2, A.NUMERICAL_STORE, 'rows-truth-0of1.jsonl'), gd.slice(1).map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.mkdirSync(path.join(s2, 'table', sha12), { recursive: true });
  // and one window's XP and SGP4 rows turned into failures: counted as flown (the columns stand), out of the figures and the pair count
  const dropU = gd[0].key, failK = gd.find((g) => g.key !== dropU && ['1', '3', '5', '7'].every((d) => apRows.get(g.key)?.days?.[d]))?.key;
  const failed = (r) => (r.key === failK && ['SGP4XP', 'SGP4'].includes(r.theory) ? (({ days, ...rest }) => ({ ...rest, apError: 'made-up failure (the check)' }))(r) : r);
  fs.writeFileSync(path.join(s2, 'table', sha12, 'rows.jsonl'), moduleRows.map((r) => JSON.stringify(failed(r))).join('\n') + '\n');
  for (const t of Object.keys(A.OUTSIDE)) { fs.mkdirSync(path.dirname(outsideFile(s2, t)), { recursive: true }); fs.writeFileSync(outsideFile(s2, t), outsideRows.filter((r) => r.theory === t && !(t === 'USSFXP' && r.key === dropU)).map((r) => JSON.stringify(failed(r))).join('\n') + '\n'); }
  const r2 = runIn(s2, out2, ['--theories', 'AP,SGP4XP,SGP4']);
  const b = fs.existsSync(out2) ? E.readJson(out2).rows?.[0] : null;
  ok(r2.code === 0 && /, 0 to fly/.test(r2.err), `the second run flew again: ${r2.err.slice(-200)}`);
  const nAp = (h) => b?.leads?.find((l) => l.hours === h)?.windows;
  ok(b && b.leads.every((l) => l.xp.failed === 1 && l.xp.windows === nAp(l.hours) - 1 && l.apBeatsXp.windows === nAp(l.hours) - 1 && l.sgp4.failed === 1 && l.sgp4.windows === nAp(l.hours) - 1), `failed counts: ${JSON.stringify(b?.leads?.map((l) => [l.hours, l.windows, l.xp?.windows, l.xp?.failed, l.apBeatsXp?.windows, l.sgp4?.windows, l.sgp4?.failed]))}`);
  ok(b && b.ffm === null && b.within100mOfFfm === null && b.leads.every((l) => l.ffm === null && l.apFfmRank === null && l.ap && l.xp && l.sgp4 && l.xpUssf === null && l.apBeatsXpUssf === null) && b.leads[0].ap.medianM === row?.leads?.[0]?.ap?.medianM, `being measured: ${JSON.stringify(b)?.slice(0, 300)}`);
  // 3. the ECOM2 case: one medium Earth orbit window with both fit arcs; from 0.6.15 its 72 h fit names AP_ECOM2 and its 24 h fit AP
  if (A.atLeast(version, A.ECOM2_SINCE)) {
    const gnRows = fs.readdirSync(real).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => lines(path.join(real, f))).filter((r) => r.group === 'GN' && !r.error && r.arms?.FFMq?.ok);
    const key = [...new Set(gnRows.map((r) => r.key))].sort().find((k) => [24, 72].every((a) => gnRows.some((r) => r.key === k && r.arcH === a)));
    const s3 = path.join(dir, 's3'), out3 = path.join(dir, 'c.json'), keys = path.join(dir, 'keys.txt');
    fs.mkdirSync(s3, { recursive: true }); fs.symlinkSync(real, path.join(s3, A.NUMERICAL_STORE)); fs.writeFileSync(keys, `${key}\n`);
    const r3 = runIn(s3, out3, ['--keys-file', keys, '--theories', 'AP,SGP4XP'], 'GN');
    const c = fs.existsSync(out3) ? E.readJson(out3) : { rows: [] }, stored = fs.existsSync(path.join(s3, 'table', sha12, 'rows.jsonl')) ? lines(path.join(s3, 'table', sha12, 'rows.jsonl')).filter((r) => r.theory === 'AP') : [];
    const at = (h) => c.rows.find((x) => x.fitHours === h), pcfAt = (h) => stored.find((x) => x.arcH === h)?.pcf;
    ok(r3.code === 0 && pcfAt(72) === A.apPcfFor('GN', version, false, 72).label && pcfAt(24) === A.apPcfFor('GN', version, false, 24).label && /^AP_ECOM2/.test(pcfAt(72)) && /^AP(_TIDES)?$/.test(pcfAt(24)) && at(72)?.apForces === A.AP_FORCES_TEXT[pcfAt(72)] && at(24)?.apForces === A.AP_FORCES_TEXT[pcfAt(24)], `the ECOM2 case on ${key}: ${r3.err.slice(-200)} 72 h ${pcfAt(72)}, 24 h ${pcfAt(24)}`);
  } else console.log(`TABLE CHECK: the ECOM2 case did not run: the build flown is sdn-ap ${version}, which has no FORCES.ECOM2 term (AP solves it from ${A.ECOM2_SINCE})`);
  // 4. the same on one geostationary 72 h window, from the build that solves Y0 there (ECOM2_GEO_SINCE)
  if (A.atLeast(version, A.ECOM2_GEO_SINCE)) {
    const geRows = fs.readdirSync(real).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => lines(path.join(real, f))).filter((r) => r.group === 'GE' && !r.error && r.arms?.FFMq?.ok);
    const key = geRows.map((r) => r.key).sort()[0];
    const s4 = path.join(dir, 's4'), out4 = path.join(dir, 'd.json'), keys = path.join(dir, 'keys-ge.txt');
    fs.mkdirSync(s4, { recursive: true }); fs.symlinkSync(real, path.join(s4, A.NUMERICAL_STORE)); fs.writeFileSync(keys, `${key}\n`);
    const r4 = runIn(s4, out4, ['--keys-file', keys, '--theories', 'AP,SGP4XP'], 'GE');
    const d = fs.existsSync(out4) ? E.readJson(out4) : { rows: [] }, stored = fs.existsSync(path.join(s4, 'table', sha12, 'rows.jsonl')) ? lines(path.join(s4, 'table', sha12, 'rows.jsonl')).filter((r) => r.theory === 'AP') : [];
    const geLabel = A.apPcfFor('GE', version, false, 72).label;
    ok(r4.code === 0 && /^AP_ECOM2/.test(geLabel) && stored.find((x) => x.arcH === 72)?.pcf === geLabel && d.rows.find((x) => x.fitHours === 72)?.apForces === A.AP_FORCES_TEXT[geLabel], `the geostationary ECOM2 case on ${key}: ${r4.err.slice(-200)} ${stored.find((x) => x.arcH === 72)?.pcf}`);
  } else console.log(`TABLE CHECK: the geostationary ECOM2 case did not run: the build flown is sdn-ap ${version}, before ${A.ECOM2_GEO_SINCE}, which solves Y0 on the geostationary and inclined geosynchronous rows`);
  // 5. made-up burn flags on the laser geodetic windows (--burn-flags), five kinds in turn: the row is the row of the first run and burnSplit,
  // whose four parts add up to the pass line and each equal the one recomputed here; the command does not name the flags; nothing is flown
  const KINDS = ['fit', 'before5', 'neither', 'gap', 'unflagged'], fdir = path.join(dir, 'flags'), out5 = path.join(dir, 'e.json');
  const gdKeys = [...new Set(gd.map((r) => r.key))].sort(), kindOf = (key) => KINDS[gdKeys.indexOf(key) % KINDS.length];
  const madeUp = (key, arcH, k) => ({ key, arcH, detector: k !== 'unflagged', fit: { burn: k === 'fit', uncoveredH: 0 }, before5: { burn: ['fit', 'before5'].includes(k), uncoveredH: k === 'gap' ? 6 : 0 } });
  fs.mkdirSync(fdir, { recursive: true });
  fs.writeFileSync(path.join(fdir, 'flags-GD.json'), JSON.stringify({ windows: gdKeys.map((key) => madeUp(key, 72, kindOf(key))) }));
  const r5 = runIn(s1, out5, ['--burn-flags', fdir]);
  const e = fs.existsSync(out5) ? E.readJson(out5) : {}, er = e.rows?.[0];
  ok(r5.code === 0 && /, 0 to fly/.test(r5.err) && e.harness?.command === `${doc.harness?.command} --burn-flags flags` && !JSON.stringify(e).includes(fdir), `the run with flags: ${r5.err.slice(-200)} ${e.harness?.command}`);
  const plain = Object.keys(row ?? {}).filter((k) => k !== 'within100mEitherWay');
  ok(er && JSON.stringify(Object.keys(er)) === JSON.stringify([...plain, 'burnSplit', 'within100mEitherWay', 'within100mEitherWayBurnSplit']) && Object.keys(row ?? {}).every((k) => JSON.stringify(er[k]) === JSON.stringify(row[k])), 'with flags the row is the same row and burnSplit and the two-sided split, no window moved');
  // the two-sided split: the same four parts, within 100 m either way, adding up to within100mEitherWay
  const ew = (...ks) => { const ps = gd.map((b) => ({ key: b.key, a: apRows.get(b.key)?.days?.['5']?.e, f: b.arms?.FFMbest?.ok ? b.arms.FFMbest.days?.['5']?.e : undefined })).filter((p) => Number.isFinite(p.a) && Number.isFinite(p.f) && ks.includes(kindOf(p.key))); return { windows: ps.length, met: ps.filter((p) => Math.abs(p.a * 1000 - p.f * 1000) <= 100).length }; };
  const wantEw = { burnInFitArc: ew('fit'), burnCutoffToDay5Only: ew('before5'), noBurn: ew('neither', 'gap'), unflagged: ew('unflagged') }, gotEw = er?.within100mEitherWayBurnSplit ?? {};
  ok(JSON.stringify(gotEw) === JSON.stringify(wantEw) && Object.values(gotEw).reduce((s, x) => s + x.met, 0) === row?.within100mEitherWay?.met && Object.values(gotEw).reduce((s, x) => s + x.windows, 0) === row?.within100mEitherWay?.windows, `the two-sided split: ${JSON.stringify(gotEw)} against ${JSON.stringify(wantEw)} recomputed`);
  const pass5 = gd.map((b) => ({ key: b.key, a: apRows.get(b.key)?.days?.['5']?.e, f: b.arms?.FFMbest?.ok ? b.arms.FFMbest.days?.['5']?.e : undefined })).filter((p) => Number.isFinite(p.a) && Number.isFinite(p.f));
  const part = (...ks) => { const ps = pass5.filter((p) => ks.includes(kindOf(p.key))); return { windows: ps.length, met: ps.filter((p) => p.a * 1000 - p.f * 1000 < 100).length }; };
  const want5 = { burnInFitArc: part('fit'), burnCutoffToDay5Only: part('before5'), noBurn: part('neither', 'gap'), unflagged: part('unflagged'), partlyCovered: part('gap').windows };
  const bs5 = er?.burnSplit ?? {}, sum = (f) => ['burnInFitArc', 'burnCutoffToDay5Only', 'noBurn', 'unflagged'].reduce((s, k) => s + (bs5[k]?.[f] ?? NaN), 0);
  ok(JSON.stringify(Object.fromEntries(Object.keys(want5).map((k) => [k, bs5[k]]))) === JSON.stringify(want5) && sum('windows') === row?.within100mOfFfm?.windows && sum('met') === row?.within100mOfFfm?.met && KINDS.every((k) => part(k).windows > 0), `the split: ${JSON.stringify(bs5)} against ${JSON.stringify(want5)} recomputed, the pass line ${JSON.stringify(row?.within100mOfFfm)}`);
  ok(new RegExp(`^Of the ${pass5.length} windows on the pass line, .* fit arc on ${want5.burnInFitArc.windows} \\(.* on ${want5.burnInFitArc.met} of them\\).* alone on ${want5.burnCutoffToDay5Only.windows} \\(on ${want5.burnCutoffToDay5Only.met}\\) and in neither on ${want5.noBurn.windows} \\(on ${want5.noBurn.met}\\); the burn detector did not run on ${want5.unflagged.windows} \\(on ${want5.unflagged.met}\\); on ${want5.partlyCovered} of them .*\\.$`).test(bs5.label ?? '') && /burnSplit/.test(e.statistic) && !/sameAltitudes/.test(e.statistic), `the split's sentence: ${bs5.label}`);
  // the flag files named by the first 12 hex digits of their sha256 (no 64-digit word in the method line)
  const flagSha = sha256(fs.readFileSync(path.join(fdir, 'flags-GD.json')));
  ok(e.statistic?.includes(`: ${flagSha.slice(0, 12)})`) && !e.statistic.includes(flagSha) && !/[0-9a-f]{13,}/.test(e.statistic), `the flags' digest in the method line: ${e.statistic?.slice(-200)}`);
  // 6. the same altitudes: one Near 700 km window and two altimetry windows, one of a satellite at 600 to 850 km (CryoSat-2, about 720 km)
  // and one above (Jason-3, about 1,340 km), flown by AP alone: each Near 700 km row carries the altimetry row's pass line on the first
  // alone, equal to the one recomputed here from the rows flown and the altimetry row's arm, with its own split
  const real6 = fs.readdirSync(real).filter((f) => /^rows-truth-.*\.jsonl$/.test(f)).flatMap((f) => lines(path.join(real, f))).filter((r) => ['S1', 'DO'].includes(r.group) && !r.error && !r.period);
  const both = (k) => [24, 72].every((a) => real6.some((r) => r.key === k && r.arcH === a && PREFER.some((x) => r.arms?.[x]?.ok && Number.isFinite(r.arms[x].days?.['5']?.e))));
  const pick = (pred) => [...new Set(real6.filter(pred).map((r) => r.key))].sort().find(both);
  const k6 = { S1: pick((r) => r.group === 'S1'), in: pick((r) => r.name === 'CRYOSAT 2'), out: pick((r) => r.name === 'JASON 3') };
  const s6 = path.join(dir, 's6'), out6 = path.join(dir, 'f.json'), keys6 = path.join(dir, 'keys-6.txt'), fdir6 = path.join(dir, 'flags-6');
  fs.mkdirSync(s6, { recursive: true }); fs.symlinkSync(real, path.join(s6, A.NUMERICAL_STORE)); fs.mkdirSync(fdir6, { recursive: true });
  fs.writeFileSync(keys6, `${Object.values(k6).join('\n')}\n`);
  fs.writeFileSync(path.join(fdir6, 'flags-S1.json'), JSON.stringify({ windows: [24, 72].map((a) => madeUp(k6.S1, a, 'fit')) }));
  fs.writeFileSync(path.join(fdir6, 'flags-DO.json'), JSON.stringify({ windows: [24, 72].flatMap((a) => [madeUp(k6.in, a, 'before5'), madeUp(k6.out, a, 'neither')]) }));
  const r6 = runIn(s6, out6, ['--keys-file', keys6, '--theories', 'AP', '--burn-flags', fdir6], 'S1,DO');
  const f6 = fs.existsSync(out6) ? E.readJson(out6) : { rows: [] }, ap6 = new Map((fs.existsSync(path.join(s6, 'table', sha12, 'rows.jsonl')) ? lines(path.join(s6, 'table', sha12, 'rows.jsonl')) : []).filter((r) => r.theory === 'AP').map((r) => [`${r.key}|${r.arcH}`, r]));
  for (const a of [24, 72]) {
    const near = f6.rows.find((r) => r.regime === 'Near 700 km' && r.fitHours === a), alt = f6.rows.find((r) => r.regime === 'Low orbit, altimetry' && r.fitHours === a);
    const arm = PREFER.find((x) => [k6.in, k6.out].some((k) => real6.find((r) => r.key === k && r.arcH === a)?.arms?.[x]?.ok));
    const nIn = real6.find((r) => r.key === k6.in && r.arcH === a), apIn = ap6.get(`${k6.in}|${a}`)?.days?.['5']?.e, fIn = nIn?.arms?.[arm]?.ok ? nIn.arms[arm].days?.['5']?.e : undefined;
    const metIn = Number(apIn * 1000 - fIn * 1000 < 100), s = near?.sameAltitudes;
    ok(r6.code === 0 && Number.isFinite(apIn) && Number.isFinite(fIn) && near?.burnSplit?.burnInFitArc?.windows === 1 && alt?.burnSplit && !alt.sameAltitudes
      && s?.label === SAME_ALTITUDES.label && s.regime === 'Low orbit, altimetry' && s.fitHours === a && JSON.stringify(s.satellites.map((x) => x.name)) === '["CRYOSAT 2"]' && s.satellites[0].altitudeKm > 650 && s.satellites[0].altitudeKm < 800
      && s.within100mOfFfm?.windows === 1 && s.within100mOfFfm.met === metIn && JSON.stringify(s.burnSplit && [s.burnSplit.burnCutoffToDay5Only, s.burnSplit.noBurn.windows, s.burnSplit.burnInFitArc.windows, s.burnSplit.unflagged.windows]) === JSON.stringify([{ windows: 1, met: metIn }, 0, 0, 0]) && /sameAltitudes/.test(f6.statistic),
    `the same altitudes at ${a} h on ${Object.values(k6).join(', ')}: ${r6.err.slice(-300)} ${JSON.stringify(s)}`);
  }
  // 7. made-up burn lists for the laser geodetic satellites (--burns): on one satellite a raising burn 12 h after its first
  // cutoff and a lowering one 100 h after its third, on another a raising and an out-of-plane burn 50 and 51 h after its second, on a third
  // a candidate its list rejects. Every lead keeps its figures over all windows and gains cleanToLead for AP, the numerical propagator and
  // SGP4-XP, each equal to the one recomputed here over the windows with no burn from the cutoff to that lead (the rejected candidate not a
  // burn); laterBurns counts each kind on the pass line's windows; no burnFreeScatter (not a strong-drag row). Each burn is reported 8 days
  // after it (reportTime in a list made as of its burns), so none is known at a cutoff within the 7 days the 72 h rule reads: no fit arc
  // moves and nothing is flown. The report time is what keeps this case to the flags alone: a burn known at a cutoff moves AP's 72 h arc
  // (case 11), and its row is flown again
  const bdir = path.join(dir, 'burns-7'), out7 = path.join(dir, 'g.json'), HR = 3600e3;
  const gd7 = [...new Map(gd.map((b) => [b.key, b])).values()], sats = [...new Set(gd7.map((b) => b.name))].sort();
  const cutoffsOf = (n) => [...new Set(gd7.filter((b) => b.name === n).map((b) => Date.parse(b.cutoff)))].sort((x, y) => x - y);
  const mk = (t, dv, consistent = true) => ({ burn: new Date(t).toISOString(), from: new Date(t - 45e3).toISOString(), to: new Date(t + 45e3).toISOString(), reportTime: new Date(t + 8 * 24 * HR).toISOString(), dvRtnMmS: dv.map((x) => -x), refined: { consistent, dvRtnMmS: dv } });
  const plan = { [sats[0]]: [mk(cutoffsOf(sats[0])[0] + 12 * HR, [0, 2, 0]), mk(cutoffsOf(sats[0])[2] + 100 * HR, [0, -3, 0])],
    [sats[1]]: [mk(cutoffsOf(sats[1])[1] + 50 * HR, [0, 1, 0]), mk(cutoffsOf(sats[1])[1] + 51 * HR, [0, 0.1, 5])], [sats[2]]: [mk(cutoffsOf(sats[2])[0] + 30 * HR, [0, 1, 0], false)] };
  fs.mkdirSync(path.join(bdir, 'GD'), { recursive: true });
  for (const n of sats) fs.writeFileSync(path.join(bdir, 'GD', `${n.replace(/[^A-Za-z0-9]+/g, '_')}.burns.json`), JSON.stringify({ asOf: '2026-11-11', lengthH: 6, burns: plan[n] ?? [] }));
  const r7 = runIn(s1, out7, ['--burns', bdir]);
  const g7 = fs.existsSync(out7) ? E.readJson(out7) : {}, gr = g7.rows?.[0];
  ok(r7.code === 0 && /, 0 to fly/.test(r7.err) && g7.harness?.command === `${doc.harness?.command} --burns burns-7` && !JSON.stringify(g7).includes(bdir) && /cleanToLead/.test(g7.statistic ?? ''), `the run with burn lists: ${r7.err.slice(-200)}`);
  ok(gr && JSON.stringify(Object.keys(gr)) === JSON.stringify([...Object.keys(row ?? {}), 'laterBurns']) && Object.keys(row ?? {}).filter((k) => k !== 'leads').every((k) => JSON.stringify(gr[k]) === JSON.stringify(row[k])), `with burn lists the row is the same row and laterBurns: ${JSON.stringify(Object.keys(gr ?? {}))}`);
  const strip = (l) => JSON.parse(JSON.stringify(l, (k, v) => (k === 'cleanToLead' ? undefined : v)));
  ok(gr && JSON.stringify(gr.leads.map(strip)) === JSON.stringify(row?.leads), 'with burn lists every lead keeps its figures over all windows');
  const burnsOf7 = (n) => (plan[n] ?? []).filter((b) => b.refined.consistent).map((b) => ({ t: Date.parse(b.burn), dv: b.refined.dvRtnMmS }));
  const pairs7 = (day) => gd7.map((b) => ({ name: b.name, D0: Date.parse(b.cutoff), a: apRows.get(b.key)?.days?.[day]?.e, f: b.arms?.FFMbest?.ok ? b.arms.FFMbest.days?.[day]?.e : undefined, x: xpRows.get(b.key)?.days?.[day]?.e })).filter((p) => Number.isFinite(p.a) && Number.isFinite(p.f));
  const fig7 = (v) => ({ windows: v.length, medianM: med(v), p95M: p95(v) });
  for (const [hours, day] of LEADS) {
    const l = gr?.leads?.find((x) => x.hours === hours), clean = pairs7(day).filter((p) => !burnsOf7(p.name).some((b) => b.t > p.D0 && b.t <= p.D0 + hours * HR));
    const want = { ap: fig7(clean.map((p) => p.a * 1000)), ffm: fig7(clean.map((p) => p.f * 1000)), xp: fig7(clean.filter((p) => Number.isFinite(p.x)).map((p) => p.x * 1000)) };
    ok(l && ['ap', 'ffm', 'xp'].every((k) => JSON.stringify(l[k]?.cleanToLead) === JSON.stringify(want[k])) && want.ap.windows < l.windows, `cleanToLead at ${hours} h: ${JSON.stringify(['ap', 'ffm', 'xp'].map((k) => l?.[k]?.cleanToLead))} against ${JSON.stringify(want)}`);
  }
  const kind7 = (dv) => (Math.abs(dv[1]) < 0.5 * Math.hypot(...dv) ? 'cross' : dv[1] > 0 ? 'raise' : 'lower');
  const class7 = (p) => { const k = [...new Set(burnsOf7(p.name).filter((b) => b.t > p.D0 && b.t <= p.D0 + 5 * 24 * HR).map((b) => kind7(b.dv)))]; return !k.length ? 'none' : k.length > 1 ? 'mixed' : k[0]; };
  const p5 = pairs7('5'), n7 = (c) => p5.filter((p) => class7(p) === c), below7 = (s) => s.filter((p) => p.a * 1000 < p.f * 1000 - 100).length;
  const [u7, d7, c7, m7, z7] = ['raise', 'lower', 'cross', 'mixed', 'none'].map(n7);
  ok(gr?.laterBurns?.startsWith(`Between the cutoff and day 5 a burn falls in ${p5.length - z7.length} of the ${p5.length} windows on the pass line (in ${u7.length} every such burn raises the orbit, in ${d7.length} every one lowers it, in ${c7.length} every one is mainly out of the orbit's plane, in ${m7.length} a mix).`)
    && gr.laterBurns.includes(`in ${below7(u7)} of the ${u7.length} windows whose later burns all raise the orbit`) && gr.laterBurns.includes(`${below7(z7)} of the ${z7.length} with no later burn`) && u7.length && d7.length && m7.length && !gr.burnFreeScatter, `laterBurns: ${gr?.laterBurns}`);
  // 8. made-up 1e-13 rows (lib/arms.mjs NUMERICAL_TIGHT, stack issue 520) on the store of case 6: the Near 700 km window at both fit arcs,
  // and one of the two altimetry windows. The Near 700 km rows take them (the configuration at 1e-13, the numerical figures the made-up
  // ones); the altimetry rows, with one window of two, stay at 1e-10 with their figures; nothing is flown
  const out8 = path.join(dir, 'h.json'), madeTight = (r) => ({ ...r, tolerance: 1e-13, arms: { FFMq: { ...r.arms.FFMq, arm: A.NUMERICAL_TIGHT.to, days: Object.fromEntries(Object.entries(r.arms.FFMq.days).map(([d, x]) => [d, { ...x, e: x.e * 1.5 }])) } } });
  const tightOf8 = [24, 72].flatMap((a) => [k6.S1, k6.in].map((k) => real6.find((r) => r.key === k && r.arcH === a))).filter(Boolean);
  fs.mkdirSync(path.join(s6, A.NUMERICAL_TIGHT.store), { recursive: true });
  fs.writeFileSync(path.join(s6, A.NUMERICAL_TIGHT.store, 'rows-tight.jsonl'), tightOf8.map((r) => JSON.stringify(madeTight(r))).join('\n') + '\n');
  const r8 = runIn(s6, out8, ['--keys-file', keys6, '--theories', 'AP'], 'S1,DO');
  const h8 = fs.existsSync(out8) ? E.readJson(out8) : { rows: [] };
  for (const a of [24, 72]) {
    const near = h8.rows.find((r) => r.regime === 'Near 700 km' && r.fitHours === a), alt = h8.rows.find((r) => r.regime === 'Low orbit, altimetry' && r.fitHours === a), was = f6.rows.find((r) => r.regime === 'Low orbit, altimetry' && r.fitHours === a);
    const n8 = real6.find((r) => r.key === k6.S1 && r.arcH === a), want8 = LEADS.map(([, d]) => (Number.isFinite(n8?.arms?.FFMq?.days?.[d]?.e) ? round(n8.arms.FFMq.days[d].e * 1.5 * 1000) : null));
    ok(r8.code === 0 && /, 0 to fly/.test(r8.err) && /at a tolerance of 1e-13 /.test(near?.ffm?.configuration ?? '') && JSON.stringify(near.leads.map((l) => l.ffm?.medianM ?? null)) === JSON.stringify(want8)
      && /at a tolerance of 1e-10 /.test(alt?.ffm?.configuration ?? '') && JSON.stringify(alt.leads) === JSON.stringify(was?.leads)
      && h8.statistic.includes('fitted and flown at a tolerance of 1e-13 on these rows: Near 700 km (24 h fit), Near 700 km (72 h fit). On each of them every window with a numerical arm by the rule'), `the 1e-13 rows at ${a} h: ${r8.err.slice(-200)} ${near?.ffm?.configuration} ${JSON.stringify(near?.leads?.map((l) => l.ffm?.medianM))} against ${JSON.stringify(want8)}; ${alt?.ffm?.configuration}`);
  }
  // 9. one laser geodetic window's numerical fit made a failure: the window stays in AP's columns (the row's and each lead's windows, AP's
  // medians over all of them), the numerical column and the pass line are over the others with their own counts, and
  // withoutNumericalFigure counts it as fitFailed; nothing is flown
  const s9 = path.join(dir, 's9'), out9 = path.join(dir, 'i.json'), failF = failK;
  fs.mkdirSync(path.join(s9, A.NUMERICAL_STORE), { recursive: true });
  fs.writeFileSync(path.join(s9, A.NUMERICAL_STORE, 'rows-truth-0of1.jsonl'), gd.map((r) => JSON.stringify(r.key === failF ? { ...r, arms: { ...r.arms, FFMbest: { ok: false, arm: 'Fbest', error: 'made-up failure (the check)' } } } : r)).join('\n') + '\n');
  fs.mkdirSync(path.join(s9, 'table', sha12), { recursive: true });
  fs.writeFileSync(path.join(s9, 'table', sha12, 'rows.jsonl'), moduleRows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  for (const t of Object.keys(A.OUTSIDE)) { fs.mkdirSync(path.dirname(outsideFile(s9, t)), { recursive: true }); fs.writeFileSync(outsideFile(s9, t), outsideRows.filter((r) => r.theory === t).map((r) => JSON.stringify(r)).join('\n') + '\n'); }
  const r9 = runIn(s9, out9);
  const i9 = fs.existsSync(out9) ? E.readJson(out9) : { rows: [] }, row9 = i9.rows?.[0];
  const best9 = (b, day) => (b.key !== failF && b.arms?.FFMbest?.ok ? b.arms.FFMbest.days?.[day]?.e : undefined);
  for (const [hours, day] of LEADS) {
    const l = row9?.leads?.find((x) => x.hours === hours), all9 = gd.map((b) => ({ a: apRows.get(b.key)?.days?.[day]?.e, f: best9(b, day) })).filter((p) => Number.isFinite(p.a)), withF = all9.filter((p) => Number.isFinite(p.f));
    ok(r9.code === 0 && /, 0 to fly/.test(r9.err) && l && l.windows === all9.length && l.ap.medianM === med(all9.map((p) => p.a * 1000)) && l.ffm.windows === withF.length && withF.length === all9.length - 1 && l.ffm.medianM === med(withF.map((p) => p.f * 1000)) && l.apFfmRank.windows === withF.length,
      `a failed numerical fit at ${hours} h: ${r9.err.slice(-200)} ${JSON.stringify(l)?.slice(0, 300)} against ${all9.length} AP windows, ${withF.length} numerical`);
  }
  const pass9 = gd.map((b) => ({ a: apRows.get(b.key)?.days?.['5']?.e, f: best9(b, '5') })).filter((p) => Number.isFinite(p.a) && Number.isFinite(p.f));
  ok(row9?.windows === row?.windows && row9.satellites === row?.satellites && row9.within100mOfFfm?.windows === pass9.length && row9.within100mOfFfm.met === pass9.filter((p) => p.a * 1000 - p.f * 1000 < 100).length
    && JSON.stringify(row9.withoutNumericalFigure) === JSON.stringify({ windows: 1, satellites: 1, ruleLeavesNoArm: 0, fitFailed: 1, noTruthOrCoverage: 0 }) && /withoutNumericalFigure counts/.test(i9.statistic ?? '')
    && row9.within100mEitherWay?.windows === pass9.length && row9.within100mEitherWay.met === pass9.filter((p) => Math.abs(p.a * 1000 - p.f * 1000) <= 100).length,
  `a failed numerical fit, the row: ${JSON.stringify({ windows: row9?.windows, satellites: row9?.satellites, pass: row9?.within100mOfFfm, either: row9?.within100mEitherWay, without: row9?.withoutNumericalFigure })} against ${pass9.length} on the pass line`);
  // 10. the reasons judged at the row's tolerance: the altimetry rows of case 6's store with the first window's 1e-10 fit at 24 h made a
  // failure, and 1e-13 rows for both windows at both arcs, the second window's 24 h one a record of no coverage and its 72 h one a failed
  // fit. Both rows are at 1e-13: at 24 h the first window takes its 1e-13 figure and the second is counted as noTruthOrCoverage; at 72 h
  // the second window's failure is counted as fitFailed; the numerical column and the pass line are over the first alone; nothing is flown
  const s10 = path.join(dir, 's10'), out10 = path.join(dir, 'j.json');
  const do10 = real6.filter((r) => [k6.in, k6.out].includes(r.key) && [24, 72].includes(r.arcH));
  fs.mkdirSync(path.join(s10, A.NUMERICAL_STORE), { recursive: true });
  fs.writeFileSync(path.join(s10, A.NUMERICAL_STORE, 'rows-truth-0of1.jsonl'), real6.filter((r) => r.key === k6.S1).concat(do10.map((r) => (r.key === k6.in && r.arcH === 24 ? { ...r, arms: { ...r.arms, FFMq: { ok: false, arm: r.arms.FFMq.arm, error: 'made-up failure (the check)' } } } : r))).map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.mkdirSync(path.join(s10, A.NUMERICAL_TIGHT.store), { recursive: true });
  fs.writeFileSync(path.join(s10, A.NUMERICAL_TIGHT.store, 'rows-tight-0of1.jsonl'), do10.map((r) => (r.key === k6.out && r.arcH === 72 ? { ...r, tolerance: 1e-13, arms: { FFMq: { ok: false, arm: A.NUMERICAL_TIGHT.to, error: 'made-up failure (the check)' } } }
    : r.key === k6.out && r.arcH === 24 ? { ...r, tolerance: 1e-13, arms: {}, error: 'coverage' } : madeTight(r))).map((r) => JSON.stringify(r)).join('\n') + '\n');
  fs.mkdirSync(path.join(s10, 'table', sha12), { recursive: true });
  fs.copyFileSync(path.join(s6, 'table', sha12, 'rows.jsonl'), path.join(s10, 'table', sha12, 'rows.jsonl'));
  const r10 = runIn(s10, out10, ['--keys-file', keys6, '--theories', 'AP'], 'S1,DO');
  const j10 = fs.existsSync(out10) ? E.readJson(out10) : { rows: [] };
  const alt24 = j10.rows.find((r) => r.regime === 'Low orbit, altimetry' && r.fitHours === 24), alt72 = j10.rows.find((r) => r.regime === 'Low orbit, altimetry' && r.fitHours === 72);
  const t10 = (k, a, d) => { const r = do10.find((x) => x.key === k && x.arcH === a); return Number.isFinite(r?.arms?.FFMq?.days?.[d]?.e) ? r.arms.FFMq.days[d].e * 1.5 * 1000 : null; };
  const want24 = LEADS.map(([, d]) => (t10(k6.in, 24, d) == null ? null : round(t10(k6.in, 24, d))));
  const want72 = LEADS.map(([, d]) => (t10(k6.in, 72, d) == null ? null : round(t10(k6.in, 72, d))));
  ok(r10.code === 0 && /, 0 to fly/.test(r10.err) && /at a tolerance of 1e-13 /.test(alt24?.ffm?.configuration ?? '') && /at a tolerance of 1e-13 /.test(alt72?.ffm?.configuration ?? '')
    && JSON.stringify(alt24.leads.map((l) => l.ffm?.medianM ?? null)) === JSON.stringify(want24)
    && JSON.stringify(alt24.withoutNumericalFigure) === JSON.stringify({ windows: 1, satellites: 1, ruleLeavesNoArm: 0, fitFailed: 0, noTruthOrCoverage: 1 })
    && JSON.stringify(alt72.leads.map((l) => l.ffm?.medianM ?? null)) === JSON.stringify(want72) && alt72.leads.every((l) => l.ffm == null || l.ffm.windows === 1)
    && JSON.stringify(alt72.withoutNumericalFigure) === JSON.stringify({ windows: 1, satellites: 1, ruleLeavesNoArm: 0, fitFailed: 1, noTruthOrCoverage: 0 }) && alt72.within100mOfFfm?.windows === 1 && alt72.within100mEitherWay?.windows === 1,
  `the reasons at 1e-13: ${r10.err.slice(-200)} 24 h ${JSON.stringify(alt24?.leads?.map((l) => l.ffm?.medianM))} against ${JSON.stringify(want24)}, ${JSON.stringify(alt24?.withoutNumericalFigure)}; 72 h ${JSON.stringify(alt72?.leads?.map((l) => [l.ffm?.medianM, l.ffm?.windows]))} against ${JSON.stringify(want72)}, ${JSON.stringify(alt72?.withoutNumericalFigure)}`);
  // 11. the long-period rows (stack #479), on made-up lists, AP flown alone. The 72 h TESS row's first two windows: a firing ending 6 h
  // before the first window's cutoff, a later one 13 h after it and a join 20 h after it. AP's fit of that window takes the 9 h arc with
  // the firing inside (never the 24 h of the other rows, never dropped); the row's sentences give 9 to 70 h and the window with the burn
  // inside; laterBurns has the later firing and no join (the row reads one file per window); cleanToLead at 24 h leaves that window out;
  // the row names its reference (truthNote). Chandra's first two windows: a join 20 h before the first cutoff moves its 72 h arc (to
  // 19.8 h: the join's end plus 10 min) as a burn would, and a join 30 h after it is flagged and leaves that window out of cleanToLead at
  // 72 h; that join is marked as rejected by the delta-v test and is a join still. The child's store holds the window the rule places
  // after the made-up firings (the first midnight at least 9 h after their report). Then the TESS list without the first firing: the
  // first window is flown again on the full arc, the second (its arc the same on both
  // lists) is not. The long arcs: the 336 h TESS windows at the 72 h TESS windows' cutoffs take the arc after the same firings over their
  // own 336 h, at least 9 h and uncapped (the first the 9 h arc with the firing inside, the second 154.8 h where the 72 h fit is capped at
  // 70 h); Chandra's 168 h fits take the arc after its joins (19.8 h and 137.8 h); each such row counts its arcs by length and says its hours
  // are the longest arc allowed; on the list without the first firing the first 336 h window is flown again too
  if (A.atLeast(version, A.MANEUVER72_SINCE)) {
    usePackages();
    const W = await import('./lib/windows.mjs');
    const first2 = (g, f = () => true) => W.windowsOf([g]).windows.filter(f).sort((p, q) => p.cutoffMs - q.cutoffMs).slice(0, 2);
    const he = first2('HE72', (w) => !w.placedAfterFiring), cx = first2('HX', (w) => w.name === 'CHANDRA'), D11 = he[0].cutoffMs, DX = cx[0].cutoffMs, HR11 = 3600e3, iso11 = (t) => new Date(t).toISOString();
    // the 336 h TESS windows at the 72 h TESS windows' cutoffs
    const heL = he.map((w) => W.windowsOf(['HE']).windows.find((x) => x.cutoffMs === w.cutoffMs)), all11 = [...he, ...heL, ...cx];
    const s11 = path.join(dir, 's11'), out11 = path.join(dir, 'k.json'), keys11 = path.join(dir, 'keys-11.txt'), b11 = path.join(dir, 'burns-11');
    fs.mkdirSync(path.join(s11, A.NUMERICAL_STORE), { recursive: true }); fs.writeFileSync(keys11, `${all11.map((w) => w.key).join('\n')}\n`);
    const ev = (t, reportH, consistent = true) => ({ burn: iso11(t), at: iso11(t), from: iso11(t - 600e3), to: iso11(t), extentFrom: iso11(t - 600e3), extentTo: iso11(t), reportTime: iso11(t + reportH * HR11), refined: { consistent, dvRtnMmS: [0, 3, 0] } });
    const added11 = (cutoffs) => fs.writeFileSync(path.join(s11, 'added-windows.json'), JSON.stringify({ HE72: cutoffs.map((c) => ({ cutoff: c })) }));
    added11([iso11(D11 + 24 * HR11).slice(0, 10)]);
    const tessList = path.join(b11, 'HE', 'TESS.burns.json'), shaOf = (f) => sha256(fs.readFileSync(f)).slice(0, 12);
    for (const g of ['HE', 'HX']) fs.mkdirSync(path.join(b11, g), { recursive: true });
    fs.writeFileSync(tessList, JSON.stringify({ asOf: '2026-11-11', lengthH: 6, burns: [ev(D11 - 6 * HR11, 1), ev(D11 + 13 * HR11, 1)], seams: [ev(D11 + 20 * HR11, 2)] }));
    fs.writeFileSync(path.join(b11, 'HX', 'CHANDRA.burns.json'), JSON.stringify({ asOf: '2026-11-11', lengthH: 6, burns: [], seams: [ev(DX - 20 * HR11, 1, false), ev(DX + 30 * HR11, 1)] }));
    // the numerical arm's decision rows on these lists (made up from the stored full-arc fits): a refit on the arc the rule gives, so both
    // arms of a window share one arc; offMin shifts a window's refit arc by that many minutes
    // the case's own numerical store: the stored rows of its windows (every arc), the 72 h TESS ones naming the reference file of fileOf
    const stored11 = fs.readdirSync(real).filter((x) => /^rows-truth-.*\.jsonl$/.test(x)).flatMap((x) => lines(path.join(real, x))).filter((r) => all11.some((w) => w.key === r.key) && !r.error);
    const base11 = new Map(stored11.map((r) => [`${r.key}|${r.arcH}`, r])), fileOf = new Map();
    const numerical11 = () => fs.writeFileSync(path.join(s11, A.NUMERICAL_STORE, 'rows-truth-check.jsonl'), stored11.map((r) => JSON.stringify(fileOf.has(r.key) ? { ...r, truthFile: fileOf.get(r.key) } : r)).join('\n') + '\n');
    numerical11();
    const refits11 = (offMin = {}) => {
      const d = path.join(s11, A.NUMERICAL_AFTER_BURN.store);
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, 'rows-after-burn-0of1.jsonl'), all11.flatMap((w) => w.arcs.map((arc) => {
        const m = A.maneuverArc(A.arcBreaks(b11, w.group, w.name, w.cutoffMs), w.cutoffMs, Infinity, undefined, A.minHoursOf(w.group), arc), b = base11.get(`${w.key}|${arc}`);
        const arm = b?.arms?.FFMq, head = { key: w.key, part: 'after-burn', group: w.group, name: w.name, cutoff: iso11(w.cutoffMs), burnList: A.listSha(b11, w.group, w.name), arcH: arc, burnInArc: !!(m.maneuvering && m.burnInArc), ...(fileOf.has(w.key) ? { truthFile: fileOf.get(w.key) } : {}) };
        const dt = (arc === 72 ? offMin[w.key] ?? 0 : 0) * 60e3, start = m.startMs + dt;
        return JSON.stringify(m.maneuvering ? { ...head, lastBurn: iso11(m.lastBurnMs + dt), fitProcess: 'maneuvering: the arc after its last burn', fitArcHours: Math.round(((w.cutoffMs - start) / HR11) * 10) / 10, fitArcStart: iso11(start), env: b?.env, arms: { FFMq: arm } } : { ...head, fitProcess: 'the full arc: the stored fit' });
      })).join('\n') + '\n');
    };
    refits11();
    // AP's rows name the reference file each 72 h TESS window reads; while the numerical rows name none the run is refused
    const r11pre = runIn(s11, out11, ['--keys-file', keys11, '--theories', 'AP', '--burns', b11], 'HE72,HE,HX');
    for (const w of he) { const r = lines(path.join(s11, 'table', sha12, 'rows.jsonl')).filter((x) => x.key === w.key && x.arcH === 72 && x.theory === 'AP').at(-1); if (r?.truthFile) fileOf.set(w.key, r.truthFile); }
    ok(r11pre.code !== 0 && /do not name the same reference file \(truthFile\)/.test(r11pre.err) && fileOf.size === 2 && [...fileOf.values()].every((x) => /^TESS_EPH_DEF_\d{7}_21\.bsp$/.test(x)),
      `the reference file named: ${r11pre.code} ${r11pre.err.slice(-200)} ${JSON.stringify([...fileOf.values()])}`);
    numerical11(); refits11();
    const r11 = runIn(s11, out11, ['--keys-file', keys11, '--theories', 'AP', '--burns', b11], 'HE72,HE,HX');
    const k11 = fs.existsSync(out11) ? E.readJson(out11) : { rows: [] }, rowOf11 = (g) => k11.rows.find((r) => r.regime === W.GROUPS[g].label && r.fitHours === 72);
    const tess = rowOf11('HE72'), chandra = rowOf11('HX'), clean = (r, h) => r?.leads.find((l) => l.hours === h)?.ap?.cleanToLead?.windows, all = (r, h) => r?.leads.find((l) => l.hours === h)?.windows;
    const rowsNow = () => (fs.existsSync(path.join(s11, 'table', sha12, 'rows.jsonl')) ? lines(path.join(s11, 'table', sha12, 'rows.jsonl')) : []);
    const apOf = (w) => rowsNow().filter((r) => r.key === w.key && r.arcH === 72 && r.theory === 'AP').at(-1);
    const ap11 = apOf(he[0]), apX = apOf(cx[0]);
    ok(r11.code === 0 && ap11?.fitArcHours === 9 && ap11.burnInArc === true && ap11.burnList === shaOf(tessList)
      && /\(9 to 70 h/.test(tess?.fitProcess ?? '') && /1 of them with the burn inside the arc/.test(tess?.fitProcess ?? '') && /a burn falls in 1 of the /.test(tess?.laterBurns ?? '') && !/join/.test(tess?.laterBurns ?? '')
      && clean(tess, 24) === all(tess, 24) - 1 && /TESS_EPH_DEF/.test(tess.truthNote ?? '') && /the arc after a burn is at least 9 h and at most 70 h, on AP and on the numerical arm alike/.test(k11.statistic ?? ''),
    `the 72 h TESS row: ${r11.err.slice(-300)} AP ${JSON.stringify(ap11 && { fitArcHours: ap11.fitArcHours, burnInArc: ap11.burnInArc, burnList: ap11.burnList })}; ${tess?.fitProcess?.slice(-160)}; ${tess?.laterBurns}`);
    ok(apX?.fitArcHours === 19.8 && !apX.burnInArc && /or join of the truth's solutions/.test(chandra?.fitProcess ?? '') && /a join of the truth's solutions .* falls in 1 of the /.test(chandra?.laterBurns ?? '')
      && clean(chandra, 72) === all(chandra, 72) - 1 && /chandra_merged\.bsp/.test(chandra.truthNote ?? ''),
    `the Chandra joins: AP ${JSON.stringify(apX && { fitArcHours: apX.fitArcHours, burnInArc: apX.burnInArc })}; ${chandra?.fitProcess?.slice(-160)}; ${chandra?.laterBurns}; cleanToLead ${clean(chandra, 72)} of ${all(chandra, 72)}`);
    // the long arcs: the rule over each fit's own arc, the rows' arcs counted by length, their hours the longest arc allowed
    const apAt = (w, a) => rowsNow().filter((r) => r.key === w.key && r.arcH === a && r.theory === 'AP').at(-1), rowAt = (g, h) => k11.rows.find((r) => r.regime === W.GROUPS[g].label && r.fitHours === h);
    const L0 = apAt(heL[0], 336), L1 = apAt(heL[1], 336), C0 = apAt(cx[0], 168), C1 = apAt(cx[1], 168), tessL = rowAt('HE', 336), chandraL = rowAt('HX', 168);
    ok(L0?.fitArcHours === 9 && L0.burnInArc === true && L1?.fitArcHours === 154.8 && !L1.burnInArc && apOf(he[1])?.fitArcHours === 70 && C0?.fitArcHours === 19.8 && C1?.fitArcHours === 137.8
      && /The 336 h of this row is the longest arc allowed, not the arc used/.test(tessL?.fitProcess ?? '') && /Arcs fitted: 1 of 154\.8 h, 1 of 9 h \(1 with the firing inside the arc\)/.test(tessL?.fitProcess ?? '')
      && /The 168 h of this row is the longest arc allowed, not the arc used/.test(chandraL?.fitProcess ?? '') && /Arcs fitted: 1 of 137\.8 h, 1 of 19\.8 h\b/.test(chandraL?.fitProcess ?? '')
      && !tessL?.withoutNumericalFigure?.armsOnDifferentArcs && !chandraL?.withoutNumericalFigure?.armsOnDifferentArcs && /so the hours in those rows' names are the longest arc allowed, not the arc used/.test(k11.statistic ?? ''),
    `the long arcs: ${JSON.stringify([L0, L1, C0, C1].map((r) => r && { fitArcHours: r.fitArcHours, burnInArc: r.burnInArc }))} ${tessL?.fitProcess?.slice(0, 400)} | ${chandraL?.fitProcess?.slice(0, 400)} | ${JSON.stringify([tessL?.withoutNumericalFigure, chandraL?.withoutNumericalFigure])}`);
    // the perigee scan: each AP row of both long-period rows holds one, Chandra's (its period under 3 days) a passage or more in 120 h, each
    // passage's largest displacement a finite figure; each row states its windows scanned, passages, largest and median, the method line
    // what the scan is
    const scanOk = (r) => Array.isArray(r?.perigeeScan?.passages) && r.perigeeScan.passages.every((p) => Number.isFinite(p.largestM) && p.largestM >= 0 && p.leadH >= 0 && p.leadH <= 120);
    const sumOf = (row, ws) => row?.perigeeScan && row.perigeeScan.windows === ws.length && row.perigeeScan.passages === ws.reduce((n, w) => n + (apOf(w)?.perigeeScan?.passages.length ?? 0), 0);
    // (printed, so a reader sees what a real record reads: each window's passages and largest, and the two rows' summaries)
    console.log(`TABLE CHECK: case 11's perigee scan, sdn-ap ${version}: ${JSON.stringify([...he, ...cx].map((w) => ({ window: w.key, passages: apOf(w)?.perigeeScan?.passages, largestM: apOf(w)?.perigeeScan?.largestM })))} rows ${JSON.stringify({ tess: tess?.perigeeScan, chandra: chandra?.perigeeScan })}`);
    ok([...he, ...cx].every((w) => scanOk(apOf(w))) && cx.every((w) => apOf(w).perigeeScan.passages.length >= 1) && sumOf(tess, he) && sumOf(chandra, cx) && Number.isFinite(chandra.perigeeScan.largestM)
      && /perigeeScan, on the long-period rows: AP's record flown at 1 s for 2 minutes either side of each perigee passage/.test(k11.statistic ?? ''),
    `the perigee scan: ${JSON.stringify([...he, ...cx].map((w) => apOf(w)?.perigeeScan && { n: apOf(w).perigeeScan.passages.length, largestM: apOf(w).perigeeScan.largestM }))} ${JSON.stringify([tess?.perigeeScan, chandra?.perigeeScan])}`);
    // a window whose numerical refit is on another arc than AP's: it keeps AP's figure and has no numerical one (armsOnDifferentArcs). The
    // shift is the largest of 5 to 1 minutes, either way, that keeps the arc's tenth of an hour, so the two arcs round alike (3 minutes on
    // the first TESS window, whose 9.0 h arc rounds away at 4 and 5)
    const hOf = (w, min) => { const m = A.maneuverArc(A.arcBreaks(b11, w.group, w.name, w.cutoffMs), w.cutoffMs, Infinity, undefined, A.minHoursOf(w.group)); return Math.round(((w.cutoffMs - m.startMs - min * 60e3) / HR11) * 10) / 10; };
    const shiftOf = (w) => { const min = [5, 4, 3, 2, 1].find((x) => hOf(w, x) === hOf(w, 0) || hOf(w, -x) === hOf(w, 0)); return min ? (hOf(w, min) === hOf(w, 0) ? min : -min) : 0; };
    // the windows of a row's numerical sentence (Of the row's N listed windows: ...) add up to N
    const addsUp = (r) => { const m = /Of the row's (\d+) listed windows: (.*)\.$/.exec(r?.ffmFitProcess ?? ''); return !!m && m[2].split(/, (?=\d)/).reduce((s, x) => s + Number(x.match(/^\d+/)?.[0] ?? NaN), 0) === Number(m[1]); };
    const shift = Math.abs(shiftOf(he[0]));
    refits11({ [he[0].key]: shiftOf(he[0]) });
    const r11g = runIn(s11, out11, ['--keys-file', keys11, '--theories', 'AP', '--burns', b11], 'HE72,HE,HX'), doc11g = fs.existsSync(out11) ? E.readJson(out11) : { rows: [] };
    const g11 = doc11g.rows.find((r) => r.regime === W.GROUPS.HE72.label && r.fitHours === 72), gx11 = doc11g.rows.find((r) => r.regime === W.GROUPS.HX.label && r.fitHours === 72);
    ok(r11g.code === 0 && /, 0 to fly/.test(r11g.err) && shift > 0 && g11?.withoutNumericalFigure?.armsOnDifferentArcs === 1 && g11.within100mOfFfm?.windows === (tess?.within100mOfFfm?.windows ?? 0) - 1
      && JSON.stringify(g11.leads.map((l) => [l.windows, l.ap?.medianM])) === JSON.stringify(tess.leads.map((l) => [l.windows, l.ap?.medianM])) && /1 with no numerical figure because its arc starts elsewhere than AP's/.test(g11.ffmFitProcess ?? '')
      && !gx11?.withoutNumericalFigure && JSON.stringify(gx11?.within100mOfFfm) === JSON.stringify(chandra?.within100mOfFfm) && [tess, chandra, g11, gx11].every(addsUp),
      `the arms on arcs ${shift} min apart: ${r11g.err.slice(-200)} ${JSON.stringify(g11?.withoutNumericalFigure)} ${JSON.stringify(g11?.within100mOfFfm)} ${[tess, chandra, g11, gx11].map((r) => r?.ffmFitProcess?.replace(/^.*Of the row's/, 'Of the row\'s')).join(' | ')}`);
    // both TESS windows' refits off AP's arcs: the row has no numerical column (no window with a numerical figure), its two windows are
    // counted armsOnDifferentArcs, AP's figures are the same, the run writes its file, and the sentence's windows add up
    refits11({ [he[0].key]: shiftOf(he[0]), [he[1].key]: shiftOf(he[1]) });
    const r11f = runIn(s11, out11, ['--keys-file', keys11, '--theories', 'AP', '--burns', b11], 'HE72,HE,HX'), doc11f = fs.existsSync(out11) ? E.readJson(out11) : { rows: [] };
    const f11 = doc11f.rows.find((r) => r.regime === W.GROUPS.HE72.label && r.fitHours === 72);
    ok(r11f.code === 0 && shiftOf(he[1]) !== 0 && f11 && f11.ffm === null && f11.within100mOfFfm === null && f11.withoutNumericalFigure?.armsOnDifferentArcs === 2 && f11.withoutNumericalFigure.windows === 2
      && f11.leads.every((l) => l.ffm === null) && JSON.stringify(f11.leads.map((l) => [l.windows, l.ap?.medianM])) === JSON.stringify(tess.leads.map((l) => [l.windows, l.ap?.medianM])) && addsUp(f11)
      && /2 with no numerical figure because its arc starts elsewhere than AP's/.test(f11.ffmFitProcess ?? ''),
      `a row whose every window is on another arc: ${r11f.code} ${r11f.err.slice(-300)} ${JSON.stringify(f11 && { ffm: f11.ffm, w: f11.withoutNumericalFigure })} ${f11?.ffmFitProcess?.replace(/^.*Of the row's/, 'Of the row\'s')}`);
    refits11();
    const before11 = rowsNow().filter((r) => r.key === he[1].key).length;
    fs.writeFileSync(tessList, JSON.stringify({ asOf: '2026-11-11', lengthH: 6, burns: [ev(D11 + 13 * HR11, 1)], seams: [ev(D11 + 20 * HR11, 2)] }));
    // and the Chandra list made over the whole data (no asOf): its joins are known at their own time, so no arc moves, and the method line says so
    fs.writeFileSync(path.join(b11, 'HX', 'CHANDRA.burns.json'), JSON.stringify({ lengthH: 6, burns: [], seams: [ev(DX - 20 * HR11, 1), ev(DX + 30 * HR11, 1)] }));
    refits11();
    const r11b = runIn(s11, out11, ['--keys-file', keys11, '--theories', 'AP', '--burns', b11], 'HE72,HE,HX'), last11 = apOf(he[0]);
    ok(r11b.code === 0 && /, 2 to fly/.test(r11b.err) && rowsNow().filter((r) => r.key === he[1].key).length === before11 && apAt(heL[0], 336)?.fitArcHours === undefined && apAt(heL[1], 336)?.fitArcHours === 154.8 && last11?.fitArcHours === undefined && last11.burnList === shaOf(tessList) && apOf(cx[0])?.fitArcHours === 19.8
      && /On Highly elliptical, THEMIS and Chandra the burn lists are made over the whole data, not as of each cutoff.*; on Highly elliptical the lists are made as of each burn's report time/.test((fs.existsSync(out11) ? E.readJson(out11) : {}).statistic ?? ''),
      `another list flies again the row whose arc it moves, no other: ${r11b.err.slice(-200)} ${JSON.stringify(last11 && { fitArcHours: last11.fitArcHours, burnList: last11.burnList })}`);
    // a store whose windows placed after a firing are not the rule's: refused, naming both
    added11([]);
    const r11c = runIn(s11, out11, ['--keys-file', keys11, '--theories', 'AP', '--burns', b11], 'HE72,HE,HX');
    ok(r11c.code !== 0 && /refused: the windows placed after a firing on Highly elliptical \(HE72\) are at no cutoff, the rule gives \d{4}-\d\d-\d\d/.test(r11c.err), `placed windows not the rule's: ${r11c.code} ${r11c.err.slice(-300)}`);
  } else console.log(`TABLE CHECK: the long-period case did not run: sdn-ap ${version} is before ${A.MANEUVER72_SINCE}, which fits a 72 h arc after a burn`);
  // 12. --carry-from on the laser geodetic windows of two satellites (--keys-file): the first run's AP and SGP4-XP rows stored again as
  // another build's (its own wasm sha256 and version, other timings), and this build's rows on two windows of each satellite. The row
  // carries the other windows of both theories, flies nothing, has the figures of the same keys read from the first run's store, and
  // counts carried, flown and compared per theory. Then, each flying one window and carrying nothing: this build's rows on four windows
  // of one satellite of the two; and on one satellite, four windows whose rows recorded an error on both builds. Last, one compared
  // SGP4-XP row of the other build 1e-9 km off at day 5: SGP4-XP is flown on the row's windows in full (to the same figures), AP carried
  {
    const s12 = path.join(dir, 's12'), out12 = path.join(dir, 'l.json'), other = `0123456789ab${'0'.repeat(52)}`, oldDir = path.join(s12, 'table', other.slice(0, 12)), newDir = path.join(s12, 'table', sha12);
    fs.mkdirSync(oldDir, { recursive: true }); fs.mkdirSync(newDir, { recursive: true });
    fs.symlinkSync(real, path.join(s12, A.NUMERICAL_STORE)); fs.cpSync(path.join(s1, 'outside'), path.join(s12, 'outside'), { recursive: true });
    const flownKeys = [...new Set(moduleRows.filter((r) => r.days).map((r) => r.key))].sort(), countOf12 = (n) => flownKeys.filter((k) => k.split('|')[1] === n).length;
    // the two satellites with the most windows (the error case takes nine windows of the first)
    const satsOf12 = [...new Set(flownKeys.map((k) => k.split('|')[1]))].sort((p, q) => countOf12(q) - countOf12(p) || (p < q ? -1 : 1));
    const of12 = (n) => flownKeys.filter((k) => k.split('|')[1] === n), [satA, satB] = [satsOf12[0], satsOf12[1]], two = [...of12(satA), ...of12(satB)];
    const asOther = (r) => ({ ...r, ap: { version: '0.0.1', sha256: other }, s: (r.s ?? 0) + 1, truthS: (r.truthS ?? 0) + 1 });
    const put = (dirOf, rows) => fs.writeFileSync(path.join(dirOf, 'rows.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const keysOf = (ks) => { const f = path.join(dir, `keys-12-${ks.length}-${ks[0].replace(/[^A-Za-z0-9]+/g, '_')}.txt`); fs.writeFileSync(f, `${ks.join('\n')}\n`); return f; };
    const run12 = (ks) => { const r = runIn(s12, out12, ['--keys-file', keysOf(ks), '--carry-from', other.slice(0, 12)]); return { r, row: (fs.existsSync(out12) ? E.readJson(out12) : { rows: [] }).rows[0], doc: fs.existsSync(out12) ? E.readJson(out12) : {} }; };
    // the expected row: the same keys read from the first run's store, nothing carried
    const want12 = (ks) => { const o = path.join(dir, 'l0.json'); runIn(s1, o, ['--keys-file', keysOf(ks)]); return fs.existsSync(o) ? E.readJson(o).rows[0] : null; };
    const strip12 = (x) => JSON.parse(JSON.stringify(x ?? {}, (k, v) => (k === 'carried' ? undefined : v)));
    const sample = [of12(satA)[0], of12(satA).at(-1), of12(satB)[0], of12(satB).at(-1)], rest = two.length - 4;
    put(oldDir, moduleRows.filter((r) => two.includes(r.key)).map(asOther));
    put(newDir, moduleRows.filter((r) => sample.includes(r.key)));
    const a12 = run12(two), w12 = want12(two);
    ok(a12.r.code === 0 && /, 0 to fly/.test(a12.r.err) && JSON.stringify(strip12(a12.row)) === JSON.stringify(w12) && JSON.stringify(a12.row?.carried) === JSON.stringify({ from: '0.0.1', listed: two.length, ap: { carried: rest, flown: 4, compared: 4 }, xp: { carried: rest, flown: 4, compared: 4 } })
      && /Rows carried from sdn-ap 0\.0\.1 \(wasm 0123456789ab\)/.test(a12.doc.statistic ?? '') && JSON.stringify(a12.doc.carriedFrom) === JSON.stringify({ version: '0.0.1', wasmSha256: other }) && /except on the window-arcs each row's carried counts/.test(a12.doc.statistic ?? ''),
    `carried from another build: ${a12.r.err.slice(-200)} ${JSON.stringify(a12.row?.carried)}`);
    // four compared windows on one satellite of the two: nothing carried, the other satellite's window flown
    const oneSat = [...of12(satA).slice(0, 4), of12(satB)[0]];
    put(newDir, moduleRows.filter((r) => of12(satA).slice(0, 4).includes(r.key)));
    const b12 = run12(oneSat);
    ok(b12.r.code === 0 && /, 1 to fly/.test(b12.r.err) && b12.row?.carried?.ap?.carried === 0 && b12.row.carried.ap.compared === null && b12.row.carried.xp.carried === 0,
      `a sample on one satellite of two carried: ${b12.r.err.slice(-200)} ${JSON.stringify(b12.row?.carried)}`);
    // four windows whose rows recorded an error on both builds: nothing compared, nothing carried, the fifth window flown
    const errs = of12(satA).slice(4, 8), fifth = of12(satA)[8], asError = (r) => { const { days, fitRmsKm, fit, s, ...rest12 } = r; return { ...rest12, error: 'coverage' }; };
    put(oldDir, [...moduleRows.filter((r) => two.includes(r.key) && !errs.includes(r.key)).map(asOther), ...moduleRows.filter((r) => errs.includes(r.key)).map((r) => asOther(asError(r)))]);
    put(newDir, moduleRows.filter((r) => errs.includes(r.key)).map(asError));
    const c12 = run12([...errs, fifth]);
    ok(c12.r.code === 0 && /, 1 to fly/.test(c12.r.err) && c12.row?.carried?.ap?.carried === 0 && c12.row.carried.ap.compared === null,
      `four error rows carried: ${c12.r.err.slice(-200)} ${JSON.stringify(c12.row?.carried)}`);
    // one compared SGP4-XP row of the other build 1e-9 km off: SGP4-XP flown on the row in full, AP carried
    const off = moduleRows.find((r) => r.theory === 'SGP4XP' && r.key === sample[0] && r.days?.['5']);
    put(oldDir, moduleRows.filter((r) => two.includes(r.key)).map((r) => asOther(r === off ? { ...r, days: { ...r.days, 5: { ...r.days['5'], e: r.days['5'].e + 1e-9 } } } : r)));
    put(newDir, moduleRows.filter((r) => sample.includes(r.key)));
    const d12 = run12(two);
    ok(d12.r.code === 0 && new RegExp(`, ${rest} to fly`).test(d12.r.err) && JSON.stringify(strip12(d12.row)) === JSON.stringify(w12) && JSON.stringify(d12.row?.carried) === JSON.stringify({ from: '0.0.1', listed: two.length, ap: { carried: rest, flown: 4, compared: 4 }, xp: { carried: 0, flown: two.length, compared: null } }),
      `one compared row differs: ${d12.r.err.slice(-200)} ${JSON.stringify(d12.row?.carried)}`);
    // --carry-from flies every theory: a subset is refused
    const e12 = runIn(s12, out12, ['--keys-file', keysOf(two), '--carry-from', other.slice(0, 12), '--theories', 'AP']);
    ok(e12.code !== 0 && /refused with --theories/.test(e12.err), `--carry-from with --theories: ${e12.code} ${e12.err.slice(-200)}`);
  }
  // 13. the re-fly rule reads the perigee a row recorded: two strong-drag 2026 windows of GRACE-FO 1 (perigee under the 600 km floor), AP
  // alone, a made-up list with a burn known 20 h before the first cutoff. AP's 72 h rows record their perigee (under the floor) and keep
  // the full arc. With the burn moved to 30 h before (another list, so another burnList), nothing is flown: the recorded perigee tells
  // the arc stays full
  if (A.atLeast(version, A.MANEUVER72_SINCE)) {
    const W = await import('./lib/windows.mjs');
    const p13 = W.windowsOf(['P']).windows.filter((w) => w.name === 'GRACE-FO 1' && w.arcs.includes(72)).sort((x, y) => x.cutoffMs - y.cutoffMs).slice(0, 2);
    const s13 = path.join(dir, 's13'), out13 = path.join(dir, 'm.json'), keys13 = path.join(dir, 'keys-13.txt'), b13 = path.join(dir, 'burns-13'), HR13 = 3600e3, iso13 = (t) => new Date(t).toISOString();
    fs.mkdirSync(s13, { recursive: true }); fs.symlinkSync(real, path.join(s13, A.NUMERICAL_STORE)); fs.writeFileSync(keys13, `${p13.map((w) => w.key).join('\n')}\n`);
    fs.mkdirSync(path.join(b13, 'P'), { recursive: true });
    const list13 = path.join(b13, 'P', `${p13[0].name.replace(/[^A-Za-z0-9]+/g, '_')}.burns.json`);
    const put13 = (h) => { const t = p13[0].cutoffMs - h * HR13; fs.writeFileSync(list13, JSON.stringify({ asOf: '2026-11-11', lengthH: 6, burns: [{ burn: iso13(t), from: iso13(t - 45e3), to: iso13(t + 45e3), reportTime: iso13(t + HR13), dvRtnMmS: [0, -1, 0], refined: { consistent: true, dvRtnMmS: [0, 1, 0] } }] })); };
    put13(20);
    const r13 = runIn(s13, out13, ['--keys-file', keys13, '--theories', 'AP', '--burns', b13], 'P');
    const rows13 = () => (fs.existsSync(path.join(s13, 'table', sha12, 'rows.jsonl')) ? lines(path.join(s13, 'table', sha12, 'rows.jsonl')) : []).filter((r) => r.theory === 'AP' && r.arcH === 72);
    const first13 = rows13().find((r) => r.key === p13[0].key);
    put13(30);
    const r13b = runIn(s13, out13, ['--keys-file', keys13, '--theories', 'AP', '--burns', b13], 'P');
    ok(r13.code === 0 && p13.length === 2 && first13?.perigeeKm > 0 && first13.perigeeKm < A.MANEUVER72.perigeeMinKm && first13.fitArcHours === undefined && r13b.code === 0 && /, 0 to fly/.test(r13b.err),
      `the recorded perigee: ${r13.err.slice(-200)} ${JSON.stringify(first13 && { perigeeKm: first13.perigeeKm, fitArcHours: first13.fitArcHours })} ${r13b.err.slice(-200)}`);
  } else console.log(`TABLE CHECK: the perigee case did not run: sdn-ap ${version} is before ${A.MANEUVER72_SINCE}, which fits a 72 h arc after a burn`);
  // 14. the commercial geostationary row (its numerical fits not configured for its truth): a window whose refit after a burn still holds
  // a known burn has no arm by the rule (ruleLeavesNoArm), never armsOnDifferentArcs, whatever AP's arc. Four of its windows, read from
  // the store with the cut's lists and refits (three such refits, one refit that frees the arc); AP flown again where the re-fly rule asks
  if (A.atLeast(version, A.MANEUVER72_SINCE)) {
    const lists14 = path.join(A.STORE_ROOT, 'lists-9baa9131dcf8'), folder14 = `${A.NUMERICAL_STORE}-after-burn-9baa9131dcf8`, ab14 = path.join(A.STORE_ROOT, folder14);
    if (fs.existsSync(lists14) && fs.existsSync(ab14)) {
      const rows14 = fs.readdirSync(ab14).filter((x) => /^rows-after-burn-.*\.jsonl$/.test(x)).flatMap((x) => lines(path.join(ab14, x))).filter((r) => r.group === 'WA' && r.arcH === 72 && !r.error);
      const held14 = rows14.filter((r) => r.fitProcess === 'maneuvering: the arc after its last burn' && r.burnInArc).slice(0, 3), free14 = rows14.filter((r) => r.fitProcess === 'maneuvering: the arc after its last burn' && !r.burnInArc).slice(0, 1);
      const s14 = path.join(dir, 's14'), out14 = path.join(dir, 'n.json'), keys14 = path.join(dir, 'keys-14.txt');
      fs.mkdirSync(path.join(s14, 'table', sha12), { recursive: true }); fs.symlinkSync(real, path.join(s14, A.NUMERICAL_STORE)); fs.symlinkSync(ab14, path.join(s14, folder14));
      fs.writeFileSync(keys14, `${[...held14, ...free14].map((r) => r.key).join('\n')}\n`);
      const r14 = runIn(s14, out14, ['--keys-file', keys14, '--theories', 'AP,SGP4XP', '--burns', lists14, '--after-burn-store', folder14], 'WA');
      const wa14 = (fs.existsSync(out14) ? E.readJson(out14) : { rows: [] }).rows.find((r) => r.fitHours === 72);
      ok(r14.code === 0 && held14.length === 3 && free14.length === 1 && wa14?.withoutNumericalFigure?.ruleLeavesNoArm === 3 && !wa14.withoutNumericalFigure.armsOnDifferentArcs,
        `the commercial geostationary row's reasons: ${r14.err.slice(-300)} ${JSON.stringify(wa14?.withoutNumericalFigure)}`);
    } else console.log('TABLE CHECK: the commercial geostationary case did not run: the store holds no lists-9baa9131dcf8 or its refit folder');
  }
  // 15. a table cut with --previous names a row as scored against another numerical setting only where its setting changed: the first run's
  // file with the laser geodetic row's configuration sentence carrying a spread note and an issue reference is the same setting; with its
  // gravity field changed, it is not
  {
    const prev15 = path.join(dir, 'prev-15.json'), out15 = path.join(dir, 'o.json');
    const withRow = (cfg) => fs.writeFileSync(prev15, JSON.stringify({ ...doc, rows: [{ ...row, ffm: { ...row.ffm, configuration: cfg } }] }));
    withRow(`${row.ffm.configuration} Two flights of this same fit that differ only in the integrator's step sequence part by up to 0.9 m at 24 h (40 windows; stack issue 396).`);
    const r15 = runIn(s1, out15, ['--previous', prev15]), st15 = (fs.existsSync(out15) ? E.readJson(out15) : {}).statistic ?? '';
    withRow(row.ffm.configuration.replace(/degree and order (\d+)/, (x, n) => `degree and order ${Number(n) - 10}`));
    const r15b = runIn(s1, out15, ['--previous', prev15]), st15b = (fs.existsSync(out15) ? E.readJson(out15) : {}).statistic ?? '';
    ok(r15.code === 0 && !/scored against a different numerical setting/.test(st15) && r15b.code === 0 && /scored against a different numerical setting than in that table: Laser geodetic \(72 h fit\)/.test(st15b),
      `the setting against the previous table: ${r15.err.slice(-200)} ${st15.match(/These rows are scored[^.]*\./)?.[0]} | ${st15b.match(/These rows are scored[^.]*\./)?.[0]}`);
  }
  // 16. the perigee scan's positive control: a made-up orbit (fixtures/perigee-block-e0.5.json, a case of the synthetic set at e 0.5,
  // perigee 2,000 km, as an AP seed record at its cutoff) on which one build held a block of displaced states at each perigee passage.
  // The table's own scan (lib/arms.mjs perigeeScan), on each build the fixture names (by modules commit, as the check reads its own
  // build), reads over 1 km at every passage on the build that held the block (a fraction of the block's displacement, at its edges) and
  // under 1 cm at every passage on the build that fixed it; both find the same passages (each lead within 0.05 h)
  {
    const fx = E.readJson(path.join(path.dirname(SELF), 'fixtures', 'perigee-block-e0.5.json')), rec = fx.record;
    const ocmOf = (gravityModel) => {
      const S = A.S, O = S.OCM, t = new O.OCMT();
      t.HEADER = Object.assign(new O.HeaderT(), { CCSDS_OCM_VERS: '3.0', ORIGINATOR: 'SDN' });
      t.METADATA = Object.assign(new O.MetadataT(), { NORAD_CAT_ID: 99498, OBJECT_NAME: null, TIME_SYSTEM: 'UTC' });
      t.CENTER_NAME = 'EARTH';
      t.TRAJ_REF_FRAME = new O.RFMT(O.RFMUnion.CustomFrameWrapper, new O.CustomFrameWrapperT(O.CustomFrame.TEMEOFEPOCH), 0, 'TEMEOFEPOCH');
      t.TRAJ_FRAME_EPOCH = rec.epoch;
      t.ORB_AVERAGING = 'BROUWER';
      t.MEAN_ELEMENTS = Object.assign(new O.OCMMeanElementsT(), { MEAN_ELEMENT_THEORY: 5, EPOCH: rec.epoch, MEAN_MOTION: rec.meanMotion, ECCENTRICITY: rec.eccentricity, INCLINATION: rec.inclination,
        RA_OF_ASC_NODE: rec.raan, ARG_OF_PERICENTER: rec.argOfPericenter, MEAN_ANOMALY: rec.meanAnomaly, BTERM: rec.bterm, AGOM: rec.agom });
      t.PERTURBATIONS = Object.assign(new O.PerturbationsT(), { ATMOSPHERIC_MODEL: new O.ATMT(O.AtmosphericModelFamily.JXX, 1970), GRAVITY_MODEL: gravityModel,
        MAXIMUM_TESSERAL_DEGREE: rec.maximumTesseralDegree, MAXIMUM_ZONAL_DEGREE: rec.maximumZonalDegree, WEATHER_SOURCE: S.PCF.pcfWeatherSource.THEORY_FLUX_MODEL, SPACE_WEATHER: [] });
      const b = new S.flatbuffers.Builder(8192); O.OCM.finishOCMBuffer(b, t.pack(b));
      return b.asUint8Array().slice();
    };
    const D16 = Date.parse(`${rec.epoch.slice(0, 19)}Z`), scans16 = [];
    for (const b of fx.builds) {
      const wasm16 = path.join(dir, `ap-${b.modulesCommit.slice(0, 12)}.wasm`);
      fs.writeFileSync(wasm16, git(modulesRoot, 'show', `${b.modulesCommit}:propagator/sdn-ap/dist/isomorphic/module.wasm`));
      const arms16 = await A.openArms({ apWasm: wasm16 });
      const s16 = await arms16.perigeeScan(ocmOf(b.gravityModel), D16);
      await arms16.close();
      scans16.push({ version: b.version, holds: b.holds, passages: s16.passages.length, over1km: s16.passages.filter((p) => p.largestM > 1000).length, under1cm: s16.passages.filter((p) => p.largestM < 0.01).length, largestM: s16.largestM, leads: s16.passages.map((p) => p.leadH) });
    }
    console.log(`TABLE CHECK: case 16's perigee scan control: ${JSON.stringify(scans16.map(({ leads, ...x }) => x))}`);
    const [held, fixed] = scans16;
    ok(scans16.length === 2 && held.passages >= 10 && held.over1km === held.passages && fixed.passages === held.passages && fixed.under1cm === fixed.passages && fixed.leads.every((t, k) => Math.abs(t - held.leads[k]) <= 0.05),
      `the perigee scan control: ${JSON.stringify(scans16)}`);
  }
  // 17. the record's degrees on the low-table rows and the recorded command: strong drag (T, P) states tesseral 70 from TESSERAL70_SINCE and
  // tesseral 31 before it; near 700 km, the laser spheres and altimetry keep tesseral 31 on every build from ZONAL70_SINCE; the forces
  // text of each says its degrees; the recorded command keeps the previous table, the burn flags and the burn lists by name, never a directory
  {
    const lab = (g, v) => A.apPcfFor(g, v, false, 24).label;
    const text = (g, v) => A.AP_FORCES_TEXT[A.apPcfFor(g, v, false, 24).label];
    ok(lab('T', '0.6.45') === 'AP_Z70_TIDES' && lab('P', '0.6.45') === 'AP_Z70_TIDES' && lab('T', A.TESSERAL70_SINCE) === 'AP_T70_Z70_TIDES' && lab('P', A.TESSERAL70_SINCE) === 'AP_T70_Z70_TIDES'
      && ['S1', 'LS', 'DO'].every((g) => lab(g, A.TESSERAL70_SINCE) === 'AP_Z70_TIDES' && lab(g, '0.6.45') === 'AP_Z70_TIDES') && lab('GD', A.TESSERAL70_SINCE) !== 'AP_T70_Z70_TIDES',
    `the record's labels by group and build: ${['T', 'S1', 'GD'].map((g) => `${g} ${lab(g, '0.6.45')} ${lab(g, A.TESSERAL70_SINCE)}`).join('; ')}`);
    ok(/70 in the tesseral terms/.test(text('T', A.TESSERAL70_SINCE)) && /31 in the tesseral terms/.test(text('T', '0.6.45')) && /31 in the tesseral terms/.test(text('S1', A.TESSERAL70_SINCE)), `the forces text: ${text('T', A.TESSERAL70_SINCE)?.slice(0, 120)}`);
    const rec = repositoryArgs(['--modules-commit', 'abc', '--modules-root', '/x/y', '--out', '/x/o.json', '--previous', '/a/b/table-0.6.42.json', '--burn-flags', '/a/b/burn-flags-1', '--burns', '/a/b/lists-2', '--jobs', '6']).join(' ');
    ok(rec === '--modules-commit abc --previous table-0.6.42.json --burn-flags burn-flags-1 --burns lists-2 --jobs 6', `the recorded command: ${rec}`);
  }
  // 18. the weight rule, the prior, the break test's events and the Y0 rule of the commercial geostationary row: an object's sigma is the larger of
  // 10 m and its list's median piece closure (the floor with no list, a closure under it, or none recorded); the five-term arms carry the prior on
  // Y0, B0, B1cos and B1sin and D0 free; a break test event beside a list joins its known burns at the end of its first failing arc and not before, from the arcs that end by the cutoff alone, and changes the
  // lists' digest and its object's sha; AP's record on the commercial row names ECOM2 (Y0 solved) on fits of 72 h or more from ECOM2_GEO_SINCE;
  // its 24 h fit names no ECOM2 and carries the 72 h fit's terms, Y0 among them (CARRY24_SINCE, below), as every ECOM2 row's does
  {
    const lists = fs.mkdtempSync(path.join(os.tmpdir(), 'lists-18-')), put = (rel, o) => { fs.mkdirSync(path.dirname(path.join(lists, rel)), { recursive: true }); fs.writeFileSync(path.join(lists, rel), JSON.stringify(o)); };
    // the per-piece closures a list carries (burn-detector/lib/detector.mjs closureFieldsOf writes them): 40 pieces ending 3 h apart from 2026-01-01
    const T0 = Date.parse('2026-01-01T00:00:00Z'), pieces = (m) => Array.from({ length: 40 }, (_, k) => [new Date(T0 + (k + 1) * 3 * 3600e3).toISOString(), k < 20 ? m : 10 * m]);
    put('WA/Noisy.burns.json', { flown: 40, pieceClosures: pieces(100) });
    put('WA/Quiet.burns.json', { flown: 40, pieceClosures: pieces(3) });
    put('WA/Blank.burns.json', { flown: 40, burns: [] });
    const sg = (n, h) => A.objectSigmaM(lists, 'WA', n, T0 + h * 3600e3);
    ok(sg('Noisy', 24) === 10 && sg('Noisy', 48) === 100 && sg('Noisy', 120) === 550 && sg('Noisy', 50) === 100 && sg('Quiet', 48) === 10 && sg('Quiet', 120) === 16.5 && sg('Blank', 120) === 10 && sg('Absent', 120) === 10 && A.objectSigmaM(null, 'WA', 'Noisy', T0 + 120 * 3600e3) === 10,
      `the sigma at a cutoff is the median of the pieces that end by it, the floor below ${A.SIGMA_MIN_PIECES} pieces or with none carried: ${[24, 48, 50, 120].map((h) => sg('Noisy', h)).join(', ')}; ${sg('Quiet', 120)}, ${sg('Blank', 120)}`);
    ok(A.listsLackingClosure(lists).length === 1 && A.listsLackingClosure(lists)[0].group === 'WA', `a list whose pieces were flown and that carries no per-piece closures is named: ${A.listsLackingClosure(lists).length} of 3`);
    const { SETTINGS: ST, ECOM2_PRIOR_SIGMA: PR, FULL_SETTING: FS, CONFIGURED: CF } = await import('./lib/settings.mjs'), n = ST.E5G.apriori.length ** 0.5, sig = (s, i) => Math.sqrt(ST[s].apriori[i * n + i]);
    ok(['D0', 'Y0', 'B0', 'B1_COS', 'B1_SIN'].every((k, j) => Math.abs(sig('E5G', 6 + j) / PR[k] - 1) < 1e-12 && Math.abs(sig('E5GL', 6 + j) / PR[k] - 1) < 1e-12) && PR.D0 === 1e-6 && PR.Y0 === 6.78e-9 && PR.B0 === 4.25e-9 && PR.B1_COS === 3.59e-8 && PR.B1_SIN === 6.98e-9, 'the commercial row\'s five-term arms carry the prior of ECOM2_PRIOR_SIGMA');
    ok(['E5', 'E5F'].every((s) => [7, 8, 9, 10].every((i) => Math.abs(sig(s, i) / 1e-7 - 1) < 1e-12) && Math.abs(sig(s, 6) / 1e-6 - 1) < 1e-12) && FS.WA === 'E5G' && CF.WA === 'E5GL' && ['GN', 'GN_GAL', 'GE', 'IG'].every((g) => FS[g] === 'E5F' && CF[g] === 'E5'), 'the other five-term rows keep E5 and E5F, the terms free');
    const before = A.listsDigest(lists), shaBefore = A.listSha(lists, 'WA', 'Noisy'), shaQuiet = A.listSha(lists, 'WA', 'Quiet'), H0 = Date.parse('2026-01-01T00:00:00Z'), isoH = (h) => new Date(H0 + h * 3600e3).toISOString();
    // the break test's arcs (24 h at a 12 h stride, closing at 1.5): a step in [24, 36] h fails the arcs [12, 36] and [24, 48]
    put('WA/Noisy.breaks.json', { strideH: 12, closeWeightedRms: 1.5, maxRun: 3, arcs: Array.from({ length: 8 }, (_, k) => ({ start: isoH(12 * k), end: isoH(12 * k + 24), wrms: k === 1 || k === 2 ? 20 : 1 })) });
    const at = (h) => A.knownBurns(lists, 'WA', 'Noisy', H0 + h * 3600e3);
    ok(at(35).length === 0 && at(36).length === 1 && at(36)[0].open && A.burnEndMs(at(36)[0]) === H0 + 36 * 3600e3 && at(60).length === 1 && !at(60)[0].open && at(96).length === 1 && A.knownBurns(lists, 'WA', 'Quiet', H0 + 96 * 3600e3).length === 0,
      `a break test event is read from the arcs that end by the cutoff: ${[35, 36, 60, 96].map((h) => at(h).length).join(', ')} events at 35, 36, 60 and 96 h`);
    ok(A.listsDigest(lists) !== before && A.listSha(lists, 'WA', 'Noisy') !== shaBefore && A.listSha(lists, 'WA', 'Quiet') === shaQuiet, 'a breaks file moves the lists\' digest and its object\'s sha, no other object\'s');
    const y0 = (g, v, a) => /ECOM2/.test(A.apPcfFor(g, v, true, a).label);
    ok(y0('WA', A.ECOM2_GEO_SINCE, 72) && !y0('WA', A.ECOM2_GEO_SINCE, 24) && !y0('WA', '0.6.18', 72) && !y0('HE', A.ECOM2_GEO_SINCE, 72) && A.apPcfFor('WA', '0.6.42', true, 72).label === 'AP_VACUUM_ECOM2_TIDES' && /ECOM2 Y0/.test(A.AP_FORCES_TEXT.AP_VACUUM_ECOM2_TIDES),
      `the commercial row's labels: ${A.apPcfFor('WA', '0.6.42', true, 72).label}, ${A.apPcfFor('WA', '0.6.42', true, 24).label}, ${A.apPcfFor('WA', '0.6.18', true, 72).label}`);
    fs.rmSync(lists, { recursive: true, force: true });
  }
  fs.rmSync(dir, { recursive: true, force: true });
  done('table.mjs writes exactly the agreed fields (version 2) for the laser geodetic regime at 24, 72, 120 and 168 h: AP, FFM, our SGP4-XP, the Space Force XP and SGP4 medians and 95th percentiles, AP against both XPs as counts, the rank correlation of AP\'s and FFM\'s errors, and the 100 m pass line at 120 h, one-sided and either way, each equal to the one recomputed from the rows it read; the fitters named; the command line repository-relative; the numerical arm named in plain words on FFM 2.2.0; AP\'s forces per row ($PCF AP on the laser geodetic row; from 0.6.15, AP_ECOM2 on a medium Earth orbit 72 h fit and AP on its 24 h fit; from 0.6.19, AP_ECOM2 on a geostationary 72 h fit); with one numerical row and one Space Force XP row missing those columns are being measured (null) and nothing is flown again; a window where our XP and SGP4 failed is counted as flown, in failed, out of their figures and out of AP\'s pair count; with made-up burn flags the row is the same row with burnSplit and the two-sided split, whose four parts each add up to their pass line and equal the ones recomputed, the flags not named in the file; under each Near 700 km row the altimetry row\'s pass line on its satellite at 600 to 850 km alone, recomputed, with its own split; with made-up burn lists every lead keeps its figures over all windows and gains cleanToLead for AP, the numerical propagator and SGP4-XP, recomputed over the windows with no burn from the cutoff to the lead (a rejected candidate not a burn), and laterBurns counts each kind of later burn; with made-up 1e-13 rows a row whose every window has one is scored on them, its configuration at 1e-13 and named in the method line, and a row with one window of two stays at 1e-10 with its figures; a window whose numerical fit failed stays in AP\'s columns and the row\'s windows, the numerical column and the pass line are over the others with their own counts, and withoutNumericalFigure counts it as fitFailed; on a row at 1e-13 a window whose 1e-10 fit failed takes its 1e-13 figure, a 1e-13 failed fit is counted as fitFailed and a 1e-13 record of no coverage as noTruthOrCoverage; on the 72 h TESS row a firing 6 h before a cutoff leaves AP\'s fit on the 9 h arc with the firing inside, a later firing is flagged and a join is not (one file per window), and the row names its reference; the 336 h TESS fits and Chandra\'s 168 h fits take the arc after the firing or join over their own arc (9 h with the firing inside, 154.8 h uncapped where the 72 h fit is capped at 70 h; 19.8 h and 137.8 h), and those rows count their arcs by length and say their hours are the longest arc allowed; AP\'s rows of both long-period rows hold a perigee scan (Chandra\'s a passage or more in 120 h, each passage\'s largest displacement a finite figure) and each row states its windows scanned, passages, largest and median; the perigee scan\'s control (a made-up orbit at e 0.5 that one build held a block on) reads over 1 km at every passage on that build and under 1 cm at every one on the build that fixed it; AP\'s rows and the numerical rows of a 72 h TESS window name the reference file they read, and while the numerical rows name none the run is refused; on Chandra a join before the cutoff moves the arc (a join the delta-v test rejects too) and a later one is flagged; a store whose windows placed after a firing are not the rule\'s is refused; a window whose numerical refit is on another arc than AP\'s keeps AP\'s figure and has no numerical one (armsOnDifferentArcs); with another list a row is flown again where the arc moves and only there; against a previous table a row is named as on another numerical setting where its setting changed, never for its sentence\'s wording; with --carry-from a row takes another build\'s rows where 4 windows with figures on both, every satellite of the row among them, have the same figures to the bit, flies nothing and counts carried, flown and compared per theory; it carries nothing on a sample of one satellite of two, or on four windows whose rows recorded an error on both builds; with one compared row 1e-9 km off it flies that theory in full; and it refuses --theories; the re-fly rule reads the perigee a row recorded: a strong-drag window under the floor is not flown again for a list whose burn cannot move its arc; on the commercial geostationary row a refit that still holds a known burn is counted ruleLeavesNoArm, never armsOnDifferentArcs');
}

function round(x) { return x == null ? null : Math.round(x * 100) / 100; }
// the command line the file names, in repository-relative form: without the arguments that are local paths (the modules clone, the output file)
// the recorded command: the checkout and the output file are dropped; the previous table, the burn flags and the burn lists, which the
// figures depend on, are kept by their file or folder name (no directory)
function repositoryArgs(argv) { const out = []; for (let i = 0; i < argv.length; i += 1) { if (['--modules-root', '--out'].includes(argv[i])) { i += 1; continue; } if (['--previous', '--burn-flags', '--burns'].includes(argv[i])) { out.push(argv[i], path.basename(argv[i + 1] ?? '')); i += 1; continue; } out.push(argv[i]); } return out; }
/** --burn-flags <dir>: every flags-*.json there ({ windows: [{ key, arcH, detector, fit: { burn, uncoveredH }, before5: { burn, uncoveredH } }] }),
 *  the window-arcs the detector ran on (an entry with both spans and without detector false), by "<key>|<arcH>", and the sha256 of the files in name order; null without the option. Two files
 *  that give one window-arc different verdicts are refused; of two that agree, the one with fewer hours without truth is kept. */
function readBurnFlags(dir) {
  if (!dir) return null;
  const files = fs.readdirSync(dir).filter((f) => /^flags-.*\.json$/.test(f)).sort();
  if (!files.length) throw new Error(`--burn-flags ${dir}: no flags-*.json`);
  const out = new Map(), hash = crypto.createHash('sha256');
  const verdict = (x) => `${!!x.fit?.burn}|${!!x.before5?.burn}`, unseen = (x) => (x.fit?.uncoveredH ?? 0) + (x.before5?.uncoveredH ?? 0);
  for (const f of files) {
    const bytes = fs.readFileSync(path.join(dir, f));
    hash.update(bytes);
    for (const x of JSON.parse(bytes.toString('utf8')).windows ?? []) {
      if (x.detector === false || !x.fit || !x.before5) continue;
      const k = `${x.key}|${x.arcH}`, had = out.get(k);
      if (had && verdict(had) !== verdict(x)) throw new Error(`--burn-flags: the files disagree on ${k} (${f})`);
      if (!had || unseen(x) < unseen(had)) out.set(k, x);
    }
  }
  out.sha256 = hash.digest('hex');
  return out;
}
/** A row's pass line split by the burns flagged on its windows: a partition of its windows and met counts, and a sentence of the counts;
 *  null without flags or where no window of the row is flagged (the row prints nothing new). */
/** The four parts of a pass line's windows by the burn flags, each { windows, met } under the given test. */
function partsByBurns(flags, pass, arc, test) {
  const parts = { burnInFitArc: [], burnCutoffToDay5Only: [], noBurn: [], unflagged: [] };
  for (const p of pass) { const x = flags.get(`${p.w.key}|${arc}`); parts[!x ? 'unflagged' : x.fit?.burn ? 'burnInFitArc' : x.before5?.burn ? 'burnCutoffToDay5Only' : 'noBurn'].push(p); }
  return Object.fromEntries(Object.entries(parts).map(([k, ps]) => [k, { windows: ps.length, met: ps.filter(test).length }]));
}
function splitByBurns(flags, pass, arc) {
  if (!flags || !pass.length) return null;
  let partlyCovered = 0;
  for (const p of pass) {
    const x = flags.get(`${p.w.key}|${arc}`);
    if (x && !x.fit?.burn && (x.fit?.uncoveredH > 0 || (!x.before5?.burn && x.before5?.uncoveredH > 0))) partlyCovered += 1;
  }
  const out = partsByBurns(flags, pass, arc, passes);
  if (out.unflagged.windows === pass.length) return null;
  const { burnInFitArc: a, burnCutoffToDay5Only: b, noBurn: c, unflagged: u } = out;
  out.partlyCovered = partlyCovered;
  out.label = `Of the ${pass.length} windows on the pass line, a burn is found in the truth in the fit arc on ${a.windows} (AP's error at day 5 below the numerical propagator's or less than 100 m above it on ${a.met} of them), between the cutoff and day 5 alone on ${b.windows} (on ${b.met}) and in neither on ${c.windows} (on ${c.met})`
    + (u.windows ? `; the burn detector did not run on ${u.windows} (on ${u.met})` : '')
    + (partlyCovered ? `; on ${partlyCovered} of them a span counted without a burn has hours without truth, which the detector cannot see` : '') + '.';
  return out;
}
function round3(x) { return x == null ? null : Math.round(x * 1000) / 1000; }
/** Spearman's rank correlation: Pearson's correlation of the ranks, tied values given their average rank. */
function spearman(x, y) {
  const rank = (v) => {
    const order = v.map((value, i) => [value, i]).sort((p, q) => p[0] - q[0]), r = new Array(v.length);
    for (let i = 0; i < order.length;) { let j = i; while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j += 1; for (let k = i; k <= j; k += 1) r[order[k][1]] = (i + j) / 2 + 1; i = j + 1; }
    return r;
  };
  const rx = rank(x), ry = rank(y), n = x.length, mx = rx.reduce((s, v) => s + v, 0) / n, my = ry.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i += 1) { const a = rx[i] - mx, b = ry[i] - my; sxy += a * b; sxx += a * a; syy += b * b; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : null;
}

/** A setting in one plain sentence: gravity, drag and its weather, radiation pressure, third bodies, tides, relativity, what is fitted, the integrator. */
function describe(s) {
  const f = s.forces, kinds = s.parameters.map((p) => p.kind), ecom = kinds.filter((k) => k.startsWith('ECOM2_')).map((k) => k.slice(6).replace('_COS', ' cos').replace('_SIN', ' sin'));
  const radiation = ecom.length ? `solar radiation pressure by the ECOM2 model (${ecom.join(', ')})` : f.srp ? `solar radiation pressure on a sphere${kinds.includes('SRP_AREA_OVER_MASS') ? '' : ` (area to mass held at ${s.fixed.agom} m2/kg)`}` : 'no radiation pressure';
  const fitted = ['the initial state', ...(kinds.includes('DRAG_AREA_OVER_MASS') ? ['the drag area to mass'] : []), ...(kinds.includes('SRP_AREA_OVER_MASS') ? ['the radiation area to mass'] : []), ...(ecom.length ? ['the five ECOM2 terms'] : [])];
  const and = (v) => (v.length > 1 ? `${v.slice(0, -1).join(', ')} and ${v.at(-1)}` : v[0]);
  const tides = [...(f.solidTides ? ['solid Earth tides'] : []), ...(f.oceanTides ? ['ocean tides (FES2004 to degree 30)'] : [])];
  return [
    `Earth gravity to degree and order ${f.degree}`,
    f.drag ? 'atmospheric drag by NRLMSISE-00 driven by the space weather known at the cutoff (GFZ observed F10.7 and Ap, then the NOAA SWPC forecast issued before it)' : 'no atmospheric drag',
    radiation,
    ...(f.earthRadiation ? ['Earth radiation pressure (Knocke)'] : []),
    f.thirdBodies?.length ? 'the Sun and Moon' : 'no third bodies',
    tides.length ? and(tides) : 'no tides',
    f.relativity ? 'general relativity (IERS 2010)' : 'no relativity',
    `integrated by RK78 at a tolerance of ${s.integrator.tolerance} with steps up to ${s.integrator.maxStep} s; fitted by batch least squares (analysis/estimation) for ${and(fitted)}.`,
  ].join('; ').replace(/^./, (c) => c.toUpperCase());
}
