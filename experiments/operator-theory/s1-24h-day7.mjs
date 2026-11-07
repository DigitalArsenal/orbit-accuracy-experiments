// S1-24H-DAY7.md: FFM's 24 h fits against AP on the step-free day-7 Sentinel-1 windows (lib/day7.mjs), with the measures and hypotheses (a) to (c). FFM on
// propagator/ffm 2.2.0 (lib/build.mjs FFM_220) by analysis/estimation 0.7.0 at CHEAPER.md's settings (s1-step-free.mjs's F24); AP on sdn-ap 0.5.1 (PIN) as AP24;
// mean semimajor axes by foundation/orbits 0.1.0 (ORBITS_010) through lib/steps.mjs. S1-STEP-FREE.md's truth, thinning, coverage, as-issued weather, grid and
// scoring; the definitive weather is XM's condition M (lib/weather.mjs rowsM). Module calls only: this file reads, routes and rounds.
//   SDN_MODULES_ROOT=<modules> SDN_MODULES_GIT=<modules> [XP2F_CONTROL=1 with --set 2026] node experiments/operator-theory/s1-24h-day7.mjs --set 2025|2026 --phase history|windows --out <store> --shard k/n
// history: FFM24's fitted B at every cutoff (b) needs (lib/day7.mjs historyOf), rows to <store>/history-<set>; windows: every arm of every window, to <store>/windows-<set>.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config, root, HOUR, DAY, iso, ms, rms, XM } from './lib/xp2.mjs';
import { driverRows } from './lib/xm3.mjs';
import { apForces, openAp, fitPcf, fitWeather, horizonOf, readOcm } from './lib/ap.mjs';
import { openFfmHost, apriori } from './lib/host.mjs';
import { BUILD_NOTE, FFM_220, ORBITS_010 } from './lib/build.mjs';
import { openElements, revolutions } from './lib/steps.mjs';
import { EXCLUDE, FIT_HOURS, LEAD_HOURS, windowsOf, historyOf } from './lib/day7.mjs';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']] : acc), []));
const [SHARD, SHARDS] = (args.shard ?? '0/1').split('/').map(Number);
const SET = args.set, PHASE = args.phase, OUT = args.out;
if (!OUT || !['history', 'windows'].includes(PHASE)) throw new Error('--out and --phase history|windows');
// The as-issued weather each set's rows flew: 2025 xp2-fit-design's store (S1-STEP-FREE.md), 2026 XM's own (AP5.md, XP2F_CONTROL=1).
if ((SET === '2026') !== (process.env.XP2F_CONTROL === '1')) throw new Error('--set 2026 runs with XP2F_CONTROL=1 and --set 2025 without it');
export const HOLD_DAYS = 30, MIN_HISTORY = 5, SRP_AGOM = 0.02, THIN_S = 30, STEP_MARGIN_DAYS = 4.5;
const runner = crypto.createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
const T = await import(path.join(root, config.xm.dir, 'lib/truth.mjs'));
const W = await import(path.join(root, config.xm.dir, 'lib/weather.mjs'));
const S = await import(path.join(root, config.xm.dir, 'lib/sds.mjs'));
const { openModules } = await import(path.join(root, config.xm.dir, 'lib/modules.mjs'));
const LEADS = XM.config.scoring.leadDays, GRID = XM.config.scoring.gridSeconds * 1000, MIN_BIN = XM.config.scoring.binMinimumEpochs, MIN_COV = XM.config.fit.minimumCoverage;
const CAP = Date.parse(EXCLUDE.s1TruthTo);
const objectOf = (norad) => XM.config.groups.S1.objects.find((o) => o.norad === Number(norad));
/** The truth of [from, to], never past the hold. */
const truth = (o, from, to) => { if (to > CAP) throw new Error(`truth to ${iso(to)} is past the hold ${EXCLUDE.s1TruthTo}`); return T.series(o, from, to).lines; };
/** S1-STEP-FREE.md's arc: the `hours` before the cutoff thinned to 300 s when its coverage reaches 0.9, else null. */
const arcOf = (o, D0, hours) => { const raw = truth(o, D0 - hours * HOUR, D0); const coverage = raw.length > 1 ? raw.length / ((hours * 3600) / ((ms(raw[1].epoch) - ms(raw[0].epoch)) / 1000)) : 0; return coverage >= MIN_COV ? T.thinned(raw).chosen : null; };
const spwOf = (rows, D0) => driverRows(rows, D0).rows.map((r) => ({ DATE: r.date, F107_OBS: r.f107, F107_OBS_CENTER81: r.c81, AP_AVG: r.ap }));
// CHEAPER.md's settings, as truth-compare.mjs and s1-step-free.mjs fly them; (b) holds B instead of fitting it.
const FORCES = { gravity: 'SPHERICAL_HARMONICS', degree: 40, order: 40, thirdBodies: [10, 301], srp: true, drag: true, atmosphere: 'NRLMSISE00', solidTides: true, relativity: undefined };
const ffmLow = () => ({ forces: FORCES, integrator: { tolerance: 1e-8, maxStep: 120, minStep: 1e-3 }, sigmaM: 10, sigmaEditThreshold: 0, maximumIterations: 40, correctionTolerance: 0.01,
  parameters: [{ kind: 'DRAG_AREA_OVER_MASS', value: 0.01 }], fixed: { agom: SRP_AGOM }, apriori: apriori([0.1]) });
const ffmHeld = (b) => ({ ...ffmLow(), parameters: [], fixed: { agom: SRP_AGOM, b }, apriori: apriori([]) });
const PCF_AP = fitPcf({ forces: apForces({ tesseral: 31, zonal: 20 }), fit: null });
const r3 = (x) => Math.round(x * 1000) / 1000, r1 = (x) => Math.round(x * 10) / 10;
const inShard = (key) => parseInt(crypto.createHash('sha256').update(key).digest('hex').slice(0, 8), 16) % SHARDS === SHARD;
const dir = path.join(OUT, `${PHASE}-${SET}`);
fs.mkdirSync(dir, { recursive: true });
const outFile = path.join(dir, `rows-${SHARD}.jsonl`);
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).key) : []);
const { windows } = windowsOf(SET);
const list = (PHASE === 'history' ? historyOf(windows) : windows).filter((w) => inShard(w.key) && !done.has(w.key));
const F = await openFfmHost({ ffm: FFM_220 });
const fitInfo = (f) => ({ fitOk: !!f.ok, termination: f.termination, b: f.parameters?.[0]?.value ?? null, sigmaB: f.parameters?.length ? Math.sqrt(f.covariance[6 * 7 + 6]) : null, reducedChiSquare: f.reducedChiSquare, measurements: f.measurements, iterations: f.iterations });

if (PHASE === 'history') {
  for (const { key, norad, cutoff } of list) {
    const o = objectOf(norad), D0 = Date.parse(`${cutoff}T00:00:00Z`), row = { key, phase: 'history', set: SET, norad, cutoff, createdUtc: new Date().toISOString(), runner, ffm: F.provenance.ffm };
    try {
      const thin = arcOf(o, D0, FIT_HOURS);
      if (!thin) throw new Error('coverage');
      const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
      if (O.excluded) throw new Error(O.excluded);
      const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], ffmLow(), spwOf(O.rows, D0), D0);
      if (!f.state) throw new Error(f.error ?? f.termination);
      Object.assign(row, fitInfo(f), { ok: !!f.ok });
    } catch (error) { row.ok = false; row.error = String(error?.message ?? error).slice(0, 180); }
    fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
  }
  console.error(`history ${SET} shard ${SHARD}/${SHARDS}: ${list.length} cutoffs`);
  await F.close();
  process.exit(0);
}

// (b)'s held B: the median of the object's converged history fits from HOLD_DAYS to 1 day before the cutoff.
const historyRows = fs.existsSync(path.join(OUT, `history-${SET}`)) ? fs.readdirSync(path.join(OUT, `history-${SET}`)).filter((f) => /^rows-\d+\.jsonl$/.test(f))
  .flatMap((f) => fs.readFileSync(path.join(OUT, `history-${SET}`, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : [];
const median = (v) => { const s = [...v].sort((a, b) => a - b), k = s.length >> 1; return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2; };
const heldB = (norad, D0) => {
  const from = iso(D0 - HOLD_DAYS * DAY).slice(0, 10), to = iso(D0 - DAY).slice(0, 10);
  const fits = historyRows.filter((r) => r.norad === norad && r.ok && r.cutoff >= from && r.cutoff <= to && Number.isFinite(r.b));
  return { n: fits.length, b: fits.length >= MIN_HISTORY ? median(fits.map((r) => r.b)) : null, from, to };
};
const m = await openModules(), A = await openAp(), el = await openElements({ build: ORBITS_010 });
const revs = async (lines) => (await revolutions(lines, el)).map((x) => [x.t, r3(x.aM)]);

for (const w of list) {
  const o = objectOf(w.norad), D0 = Date.parse(`${w.cutoff}T00:00:00Z`), key = w.key;
  const row = { key, phase: 'windows', set: SET, norad: w.norad, name: o.name, cutoff: iso(D0), createdUtc: new Date().toISOString(), runner, build: BUILD_NOTE, ffm: F.provenance.ffm, stored: w.stored, arms: {} };
  try {
    // S1-STEP-FREE.md's scored grid and bins.
    const after = truth(o, D0 + 1, D0 + 7 * DAY);
    const first = after.length ? ms(after[0].epoch) : 0;
    const grid = after.filter((l) => (ms(l.epoch) - first) % GRID === 0);
    const bins = Object.fromEntries(LEADS.map((k) => [k, grid.filter((l) => { const t = ms(l.epoch); return t > D0 + (k - 1) * DAY && t <= D0 + k * DAY; })]));
    const entered = LEADS.filter((k) => bins[k].length >= MIN_BIN);
    if (!entered.length) throw new Error('no lead bin');
    const scored = entered.flatMap((k) => bins[k]);
    const epochs = scored.map((l) => l.epoch), truthScored = scored.map((l) => ({ r: l.r, v: l.v })), sizes = entered.map((k) => bins[k].length);
    const score = (e) => { const days = {}; let i = 0; entered.forEach((k, j) => { const s = e.slice(i, i + sizes[j]); i += sizes[j]; const ric = [0, 1, 2].map((c) => rms(s.map((q) => q[c]))); days[k] = { e: Math.hypot(...ric), r: ric[0], t: ric[1], n: ric[2] }; }); return days; };
    // The arc and the forecast at 30 s for the mean semimajor axis (amendment 1), and the forecast's whole hours for the along-track growth.
    const span = truth(o, D0 - FIT_HOURS * HOUR, D0 + 7 * DAY), start = ms(span[0].epoch);
    const fine = span.filter((l) => (ms(l.epoch) - start) % (THIN_S * 1000) === 0), fineEpochs = fine.map((l) => l.epoch), fineTruth = fine.map((l) => ({ r: l.r, v: l.v }));
    const firstAfter = fine.find((l) => ms(l.epoch) > D0), hourly = fine.map((l, i) => [i, ms(l.epoch) - ms(firstAfter.epoch)]).filter(([, dt]) => dt >= 0 && dt % HOUR === 0).map(([i]) => i);
    row.hours = hourly.map((i) => r3((ms(fineEpochs[i]) - D0) / HOUR));
    row.truth = { fine: await revs(fine) };
    // The truth's revolution means around the window (10 s, as the flag), for the steps under the flag and the fit arc's slope.
    const lines = [];
    for (let t = D0 - FIT_HOURS * HOUR - STEP_MARGIN_DAYS * DAY; t < Math.min(D0 + LEAD_HOURS * HOUR + STEP_MARGIN_DAYS * DAY, CAP); t += DAY) lines.push(...truth(o, t, Math.min(t + DAY, CAP) - 1));
    row.truth.revolutions = await revs(lines);
    // The weather: as-issued (S1-STEP-FREE.md) and definitive (condition M), over the forecast's days.
    const O = W.rowsO(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0);
    if (O.excluded) throw new Error(O.excluded);
    const M = W.rowsM(D0 - 72 * HOUR - XM.config.conditions.rowsMarginDays * DAY, D0 + 8 * DAY);
    const issued = driverRows(O.rows, D0), definitive = driverRows(M.rows, D0);
    const day = (rows, date) => rows.find((r) => r.date === date);
    row.weather = { rsga: O.rsga, definitiveFilled: definitive.filled, definitiveHeld: definitive.held, days: [...Array(7).keys()].map((k) => { const date = iso(D0 + k * DAY).slice(0, 10), a = day(issued.rows, date), b = day(definitive.rows, date); return { date, f107: [a.f107, b.f107], c81: [r1(a.c81), r1(b.c81)], ap: [a.ap, b.ap] }; }) };
    const spw = { O: spwOf(O.rows, D0), M: spwOf(M.rows, D0) }, ex = { O: { spw: fitWeather(O.rows, horizonOf(D0)) }, M: { spw: fitWeather(M.rows, horizonOf(D0)) } };
    const along = async (states) => (await m.rtn(hourly.map((i) => states[i]), hourly.map((i) => fineTruth[i]))).map((q) => r1(q[1] * 1000));
    const lineOf = (states) => states.map((s, i) => ({ epoch: fineEpochs[i], r: s.r, v: s.v }));
    const thin24 = arcOf(o, D0, FIT_HOURS), thin48 = arcOf(o, D0, 48);
    const run = async (name, fn) => { const a = { ok: false }; try { Object.assign(a, await fn()); a.ok = true; } catch (error) { a.error = String(error?.message ?? error).slice(0, 180); } row.arms[name] = a; };
    const ffmArm = (thin, settings, rows, extra = {}) => async () => {
      if (!thin) throw new Error('coverage');
      const f = await F.fit(thin, [...thin[0].r, ...thin[0].v], settings, rows, D0);
      if (!f.state) throw new Error(f.error ?? f.termination);
      const product = { epoch: f.epoch, state: f.state, parameters: f.parameters };
      const days = score(await m.rtn(await F.forecast(product, epochs, settings, rows), truthScored));
      const st = [];
      for (let i = 0; i < fineEpochs.length; i += 9000) st.push(...(await F.forecast(product, fineEpochs.slice(i, i + 9000), settings, rows)));
      return { ...fitInfo(f), ...extra, days, alongM: await along(st), revolutions: await revs(lineOf(st)) };
    };
    const apArm = (exw) => async () => {
      if (!thin24) throw new Error('coverage');
      const oem = S.oemBytes({ frame: 'GCRF', object: { name: o.name, id: o.objectId ?? '', norad: o.norad }, lines: thin24, useableStart: thin24[0].epoch, useableStop: iso(D0) });
      const f = await A.fit(oem, PCF_AP, exw);
      if (!f.ok) throw new Error(f.error);
      const info = readOcm(f.ocm);
      const days = score(await m.rtn(await m.toAxes(await A.propagate(f.ocm, epochs, epochs.length), epochs, 'GCRF'), truthScored));
      const st = await m.toAxes(await A.propagate(f.ocm, fineEpochs, fineEpochs.length), fineEpochs, 'GCRF');
      return { bterm: info.bterm, agom: info.agom, sigmaLnB: info.sigmaLnB, rms: info.fitRmsKm, days, alongM: await along(st), revolutions: await revs(lineOf(st)) };
    };
    await run('F24', ffmArm(thin24, ffmLow(), spw.O));
    await run('AP24', apArm(ex.O));
    await run('F48', ffmArm(thin48, ffmLow(), spw.O));
    const h = heldB(w.norad, D0);
    await run('Fhist', async () => { if (h.b === null) throw new Error(`history: ${h.n} fits from ${h.from} to ${h.to}`); return ffmArm(thin24, ffmHeld(h.b), spw.O, { heldB: h.b, historyFits: h.n })(); });
    await run('Fdef', ffmArm(thin24, ffmLow(), spw.M));
    await run('APdef', apArm(ex.M));
  } catch (error) { row.error = String(error?.message ?? error).slice(0, 180); }
  fs.appendFileSync(outFile, `${JSON.stringify(row)}\n`);
}
console.error(`windows ${SET} shard ${SHARD}/${SHARDS}: ${list.length} windows`);
await F.close(); await el.close(); await A.close();
process.exit(0);
