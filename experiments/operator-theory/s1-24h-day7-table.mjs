// S1-24H-DAY7.md's table: from the stored rows of s1-24h-day7.mjs, each window's measures and class, and FFM against AP per hypothesis; the registration search.
// Statistics on stored rows only (revolution means, along-track errors, day errors, weather rows); lib/steps.mjs lowSteps for the 4 m truth steps.
//   node experiments/operator-theory/s1-24h-day7-table.mjs [--rows <store>] --out results/operator-theory/s1-24h-day7
import fs from 'node:fs';
import path from 'node:path';
import { LOW, lowSteps } from './lib/steps.mjs';
import { pct } from './lib/compare.mjs';
import { BUILD_NOTE, FFM_220, ORBITS_010 } from './lib/build.mjs';
import { STORES, EXCLUDE, SAMPLE, FIT_HOURS, LEAD_HOURS, windowsOf } from './lib/day7.mjs';

const argOf = (name) => { const at = process.argv.indexOf(name); return at > 0 ? process.argv[at + 1] : null; };
const ROWS = argOf('--rows') ?? STORES.out, OUT = argOf('--out');
if (!OUT) throw new Error('--out');
export const RULES = { matchMs: 600000, offsetRevolutions: 3, jumpM: 1, maxGapPeriods: 7, truthStepM: 4, flagM: LOW.minM, quadraticAtHour: 168, holdDays: 30, minHistory: 5 };
const HOUR = 3600000, DAY = 86400000, ARMS = ['F24', 'AP24', 'F48', 'Fhist', 'Fdef', 'APdef'];
const read = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => /^rows-\d+\.jsonl$/.test(f)).sort().flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const median = (v) => pct([...v].sort((a, b) => a - b), 0.5);
const round = (x, k = 3) => (x === null || x === undefined || !Number.isFinite(x) ? null : Number(x.toFixed(k)));
const fig = (x) => (x === null || x === undefined ? null : Number(x >= 100 ? x.toFixed(1) : x >= 1 ? x.toFixed(3) : x.toFixed(4)));
const slope = (pts) => { if (pts.length < 3) return null; const mx = pts.reduce((s, p) => s + p[0], 0) / pts.length, my = pts.reduce((s, p) => s + p[1], 0) / pts.length; let sxx = 0, sxy = 0; for (const [x, y] of pts) { sxx += (x - mx) ** 2; sxy += (x - mx) * (y - my); } return sxy / sxx; };
const e = (a, day) => a?.ok ? a.days?.[day]?.e : undefined;

const sets = {};
for (const set of ['2025', '2026']) {
  const { pool, windows } = windowsOf(set), rows = new Map(read(path.join(ROWS, `windows-${set}`)).map((r) => [r.key, r]));
  const missing = windows.filter((w) => !rows.has(w.key)).length, extra = [...rows.keys()].filter((k) => !windows.some((w) => w.key === k)).length;
  if (missing || extra) throw new Error(`windows-${set}: ${missing} missing, ${extra} extra`);
  sets[set] = { pool, windows, rows, history: read(path.join(ROWS, `history-${set}`)) };
}

/** An arm's revolution means less the truth's, revolution by revolution: [[hours from the cutoff, m]]. */
function differences(arm, truth, D0) {
  const out = [];
  let j = 0;
  for (const [t, a] of arm) {
    while (j + 1 < truth.length && Math.abs(truth[j + 1][0] - t) <= Math.abs(truth[j][0] - t)) j += 1;
    if (Math.abs(truth[j][0] - t) <= RULES.matchMs) out.push([(t - D0) / HOUR, a - truth[j][1]]);
  }
  return out;
}
/** Offset (first revolutions after the cutoff), decay error (slope over the forecast, m/day) and the largest drift-free change between consecutive revolutions. */
function measures(diff, period) {
  const after = diff.filter(([h]) => h > 0), fore = after.filter(([h]) => h <= LEAD_HOURS);
  const span = diff.filter(([h]) => h >= -FIT_HOURS && h <= LEAD_HOURS), steps = [];
  for (let i = 1; i < span.length; i += 1) { const k = Math.round(((span[i][0] - span[i - 1][0]) * HOUR) / period); if (k >= 1 && k <= RULES.maxGapPeriods) steps.push({ k, d: span[i][1] - span[i - 1][1], h: span[i][0] }); }
  const drift = median(steps.filter((s) => s.k === 1).map((s) => s.d)) ?? 0;
  const jump = steps.map((s) => ({ hours: round(s.h, 1), sizeM: round(s.d - drift * s.k, 2), periods: s.k })).reduce((b, s) => (!b || Math.abs(s.sizeM) > Math.abs(b.sizeM) ? s : b), null);
  return { offsetM: round(after.slice(0, RULES.offsetRevolutions).reduce((s, p) => s + p[1], 0) / Math.min(RULES.offsetRevolutions, after.length), 2), decayErrorMPerDay: round(slope(fore.map(([h, y]) => [h / 24, y])), 3), jump };
}
/** t(h) = c1 h + c2 h^2 by least squares; the quadratic share at RULES.quadraticAtHour. */
function growth(hours, along) {
  let s2 = 0, s3 = 0, s4 = 0, y1 = 0, y2 = 0;
  hours.forEach((h, i) => { const y = along[i]; s2 += h * h; s3 += h ** 3; s4 += h ** 4; y1 += h * y; y2 += h * h * y; });
  const det = s2 * s4 - s3 * s3, c1 = (y1 * s4 - y2 * s3) / det, c2 = (s2 * y2 - s3 * y1) / det, H = RULES.quadraticAtHour;
  const share = Math.abs(c2) * H * H / (Math.abs(c1) * H + Math.abs(c2) * H * H);
  return { c1MPerHour: round(c1, 3), c2MPerHour2: round(c2, 5), quadraticShare: round(share, 3), shape: share > 0.5 ? 'quadratic' : 'linear' };
}
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;

const perWindow = [];
for (const [set, S] of Object.entries(sets)) for (const w of S.windows) {
  const r = S.rows.get(w.key), D0 = Date.parse(r.cutoff), T = r.truth.fine;
  const gaps = T.slice(1).map((x, i) => x[0] - T[i][0]).sort((a, b) => a - b), period = gaps[gaps.length >> 1];
  const truthDecay = round(slope(T.filter(([t]) => t > D0 && t <= D0 + LEAD_HOURS * HOUR).map(([t, a]) => [(t - D0) / DAY, a])), 3);
  const truthArc = round(slope(T.filter(([t]) => t > D0 - FIT_HOURS * HOUR && t <= D0).map(([t, a]) => [(t - D0) / DAY, a])), 3);
  const det = lowSteps(r.truth.revolutions.map(([t, aM]) => ({ t, aM })), { ...LOW, minM: RULES.truthStepM });
  const inSpan = (s) => s.t >= D0 - FIT_HOURS * HOUR && s.t <= D0 + LEAD_HOURS * HOUR;
  const truthSteps = det.steps.filter(inSpan).map((s) => ({ hours: round((s.t - D0) / HOUR, 1), sizeM: round(s.sizeM, 1) }));
  const arms = {};
  for (const name of ARMS) {
    const a = r.arms[name];
    if (!a?.ok) { arms[name] = { ok: false, error: a?.error ?? 'not run' }; continue; }
    arms[name] = { ok: true, days: Object.fromEntries(Object.entries(a.days).map(([d, x]) => [d, round(x.e, 4)])), ...measures(differences(a.revolutions, T, D0), period), growth: growth(r.hours, a.alongM),
      ...(name.startsWith('AP') ? { bterm: round(a.bterm, 6), sigmaLnB: round(a.sigmaLnB, 3), fitRmsKm: round(a.rms, 4) } : { b: round(a.b ?? a.heldB, 6), ...(a.heldB ? { heldB: true, historyFits: a.historyFits } : { sigmaB: round(a.sigmaB, 6) }) }) };
  }
  const days = r.weather.days, wx = { f107: [mean(days.map((d) => d.f107[0])), mean(days.map((d) => d.f107[1]))], ap: [mean(days.map((d) => d.ap[0])), mean(days.map((d) => d.ap[1]))], c81: [mean(days.map((d) => d.c81[0])), mean(days.map((d) => d.c81[1]))] };
  const F = arms.F24, A = arms.AP24, D = arms.Fdef;
  const lossAt7 = F.ok && A.ok && F.days['7'] > A.days['7'];
  let cls = null, detail = null;
  if (lossAt7) {
    const subStep = truthSteps.find((s) => Math.abs(s.sizeM) < RULES.flagM);
    if ((F.jump && Math.abs(F.jump.sizeM) >= RULES.jumpM) || subStep) { cls = 'maneuver under the flag'; detail = { truthStepM: F.jump && Math.abs(F.jump.sizeM) >= RULES.jumpM ? round(-F.jump.sizeM, 2) : null, atHours: F.jump?.hours ?? null, truth4m: subStep ?? null }; }
    else if (D.ok && Math.abs(F.decayErrorMPerDay - D.decayErrorMPerDay) >= Math.abs(D.decayErrorMPerDay)) cls = 'density';
    else if (D.ok && F.growth.shape === 'quadratic') { const dFdef = truthDecay + D.decayErrorMPerDay; cls = 'fitted B'; detail = { sign: D.decayErrorMPerDay < 0 ? 'B too high' : 'B too low', shareOfB: round(D.decayErrorMPerDay / dFdef, 3) }; }
    else cls = 'something else';
  }
  perWindow.push({ key: w.key, set, stored: { F24: round(w.stored.F24, 4), AP24: round(w.stored.AP24, 4) }, truth: { decayMPerDay: truthDecay, arcMPerDay: truthArc, steps4m: truthSteps }, weather: { f107: wx.f107.map((x) => round(x, 1)), ap: wx.ap.map((x) => round(x, 1)), c81: wx.c81.map((x) => round(x, 1)), rsga: r.weather.rsga.name }, arms, loss: lossAt7, class: cls, classDetail: detail });
}

// FFM against AP per hypothesis, day 1, 2, 3 and 7, beside the baseline on the same windows.
function compare(list, arm, ref, day) {
  const p = list.map((w) => ({ h: w.arms[arm]?.ok ? w.arms[arm].days[day] : undefined, b: w.arms.F24?.ok ? w.arms.F24.days[day] : undefined, a: w.arms[ref]?.ok ? w.arms[ref].days[day] : undefined })).filter((x) => Number.isFinite(x.h) && Number.isFinite(x.b) && Number.isFinite(x.a));
  if (!p.length) return { n: 0 };
  return { n: p.length, ffmWorse: round(p.filter((x) => x.h > x.a).length / p.length), medianRatio: round(median(p.map((x) => x.h / x.a))), ffmMedianKm: fig(median(p.map((x) => x.h))), apMedianKm: fig(median(p.map((x) => x.a))),
    baseline: { ffmWorse: round(p.filter((x) => x.b > x.a).length / p.length), medianRatio: round(median(p.map((x) => x.b / x.a))), ffmMedianKm: fig(median(p.map((x) => x.b))) } };
}
const HYP = [['baseline', 'F24', 'AP24'], ['a: 48 h fit', 'F48', 'AP24'], ['b: B held at the object\'s history', 'Fhist', 'AP24'], ['c: definitive weather', 'Fdef', 'AP24'], ['c: both arms on definitive weather', 'Fdef', 'APdef']];
const groups = { 2025: perWindow.filter((w) => w.set === '2025'), 2026: perWindow.filter((w) => w.set === '2026') };
groups.both = [...groups['2025'], ...groups['2026']];
const burnFree = (w) => !(w.arms.F24.jump && Math.abs(w.arms.F24.jump.sizeM) >= RULES.jumpM) && !w.truth.steps4m.some((s) => Math.abs(s.sizeM) < RULES.flagM);
const hypotheses = [];
for (const [label, arm, ref] of HYP) for (const g of ['2025', '2026', 'both']) for (const subset of ['all', 'no step under the flag']) {
  const list = groups[g].filter((w) => subset === 'all' || burnFree(w));
  hypotheses.push({ hypothesis: label, arm, against: ref, set: g, windows: subset, days: Object.fromEntries(['1', '2', '3', '7'].map((d) => [d, compare(list, arm, ref, d)])) });
}
const classes = {};
for (const g of ['2025', '2026', 'both']) {
  const losses = groups[g].filter((w) => w.loss), count = (c) => losses.filter((w) => w.class === c).length;
  classes[g] = { windows: groups[g].length, losses: losses.length, 'maneuver under the flag': count('maneuver under the flag'), density: count('density'), 'fitted B': count('fitted B'), 'something else': count('something else'),
    fittedBTooHigh: losses.filter((w) => w.class === 'fitted B' && w.classDetail.sign === 'B too high').length, burnFreeWindows: groups[g].filter(burnFree).length };
}
// The decay against the fitted B, on the windows with no step under the flag: the truth's slope, FFM24's and AP24's (truth + their decay errors), FFM24's B and the B the truth's decay implies.
const decay = {};
for (const g of ['2025', '2026', 'both']) {
  const list = groups[g].filter(burnFree).filter((w) => w.arms.F24.ok && w.arms.AP24.ok);
  const v = (f) => fig(median(list.map(f).filter(Number.isFinite)));
  decay[g] = { n: list.length, truthMPerDay: round(median(list.map((w) => w.truth.decayMPerDay)), 3), ffmErrorMPerDay: round(median(list.map((w) => w.arms.F24.decayErrorMPerDay)), 3), apErrorMPerDay: round(median(list.map((w) => w.arms.AP24.decayErrorMPerDay)), 3),
    ffmDefErrorMPerDay: round(median(list.filter((w) => w.arms.Fdef.ok).map((w) => w.arms.Fdef.decayErrorMPerDay)), 3), ffmB: v((w) => w.arms.F24.b), apBterm: v((w) => w.arms.AP24.bterm),
    ffmOffsetM: round(median(list.map((w) => w.arms.F24.offsetM)), 2), apOffsetM: round(median(list.map((w) => w.arms.AP24.offsetM)), 2), ffmQuadratic: list.filter((w) => w.arms.F24.growth.shape === 'quadratic').length, apQuadratic: list.filter((w) => w.arms.AP24.growth.shape === 'quadratic').length };
}
// Reproduction: the re-flown FFM24 and AP24 against the stored rows.
const same = (a, b) => Number.isFinite(a) && a === b;
const reproduction = Object.fromEntries(Object.entries(sets).map(([set, S]) => [set, { windows: S.windows.length,
  F24: S.windows.filter((w) => same(S.rows.get(w.key).arms.F24?.days?.['7']?.e, w.stored.F24)).length, AP24: S.windows.filter((w) => same(S.rows.get(w.key).arms.AP24?.days?.['7']?.e, w.stored.AP24)).length,
  F24Median: { stored: fig(median(S.windows.map((w) => w.stored.F24))), reflown: fig(median(S.windows.map((w) => S.rows.get(w.key).arms.F24?.days?.['7']?.e).filter(Number.isFinite))) } }]));

// The registration search (step 4): Sentinel-1A and 1C cutoffs with truth over [cutoff - 24 h, cutoff + 7 d] outside the hold, less every registration's cutoffs.
const REF = '/opt/data/sdn-archive/reference-states/reference', stamp = (s) => Date.UTC(+s.slice(0, 4), +s.slice(4, 6) - 1, +s.slice(6, 8), +s.slice(9, 11), +s.slice(11, 13), +s.slice(13, 15));
const SPENT = [
  { by: 'experiments/ffm-short-arc (registered 2026-11-01; S1-STEP-FREE.md amendment 1)', from: '2025-10-05', to: '2025-12-21', every: 1 },
  { by: 'experiments/ap-short-arc-priors-confirm (S1-STEP-FREE.md amendment 1)', from: '2025-10-04', to: '2025-12-18', every: 3 },
  { by: 'experiments/operator-theory/S1-STEP-FREE.md (2026-11-04)', from: '2025-10-05', to: '2025-12-28', every: 1 },
  { by: 'experiments/operator-theory/AP5.md (xp-atmosphere-merit period; maneuver-flags, ffm-losses-to-ap)', from: '2026-01-01', to: '2026-05-31', every: 1 },
];
const spentBy = (date) => SPENT.filter((s) => date >= s.from && date <= s.to && Math.round((Date.parse(date) - Date.parse(s.from)) / DAY) % s.every === 0).map((s) => s.by);
const candidates = [];
for (const [norad, product] of [[39634, 'S1A_OPER_AUX_POEORB_OPOD_'], [62261, 'S1C_OPER_AUX_POEORB_OPOD_']]) {
  const files = fs.readdirSync(REF).filter((d) => d.startsWith(product)).map((d) => /_V(\d{8}T\d{6})_(\d{8}T\d{6})$/.exec(d)).filter(Boolean).map((m) => [stamp(m[1]), stamp(m[2])]).sort((a, b) => a[0] - b[0]);
  const covered = (from, to) => { let at = from; for (const [a, b] of files) { if (a <= at && b > at) at = b; } return at >= to; };
  for (let t = Date.UTC(2025, 9, 1); t < Date.parse(`${EXCLUDE.s1CutoffBefore}T00:00:00Z`); t += DAY) {
    const date = new Date(t).toISOString().slice(0, 10);
    if (!covered(t - FIT_HOURS * HOUR, t + LEAD_HOURS * HOUR)) continue;
    if (!spentBy(date).length) candidates.push({ key: `S1|${norad}|${date}` });
  }
}
const historyArcs = new Set(Object.values(sets).flatMap((S) => S.history.filter((h) => h.ok).map((h) => h.key)));
for (const c of candidates) c.thisLaneHistoryArc = historyArcs.has(c.key);
const registration = { run: false, needed: 30, candidates: candidates.length, candidateKeys: candidates, spent: SPENT, hold: `every Sentinel-1 cutoff from ${EXCLUDE.s1CutoffBefore} (C2), Sentinel-1D; the archive's Sentinel-1A truth runs to 2026-07-01 and 1C's to 2026-10-15, all under the hold past 2026-06-08` };

const doc = { design: 'experiments/operator-theory/S1-24H-DAY7.md', reading: 'exploratory: every window was read before (S1-STEP-FREE.md amendment 1, AP5.md)', rules: RULES, sample: SAMPLE,
  builds: { ffm: FFM_220, estimation: 'analysis/estimation 0.7.0 (7a555ca5b3ed)', ap: BUILD_NOTE, orbits: ORBITS_010 }, holds: { norads: [...EXCLUDE.norads].sort((a, b) => a - b), names: String(EXCLUDE.names), s1CutoffBefore: EXCLUDE.s1CutoffBefore, s1TruthTo: EXCLUDE.s1TruthTo },
  windows: Object.fromEntries(Object.entries(sets).map(([set, S]) => [set, { pool: S.pool, chosen: S.windows.length, historyFits: S.history.length, historyConverged: S.history.filter((h) => h.ok).length }])),
  reproduction, classes, decay, hypotheses, registration, perWindow };
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, 'table.json'), `${JSON.stringify(doc, null, 1)}\n`);

// README: every figure from `doc`.
const P = (x) => `${Math.round(x * 1000) / 10} %`, all = groups.both, burned = all.filter((w) => !burnFree(w)), clean = all.filter(burnFree);
const jumps = burned.map((w) => -w.arms.F24.jump.sizeM).sort((a, b) => a - b), quiet = clean.map((w) => Math.abs(w.arms.F24.jump.sizeM)).sort((a, b) => a - b);
const H = (label, g, sub) => hypotheses.find((h) => h.hypothesis === label && h.set === g && h.windows === sub).days;
// Where a loss's step falls: the later revolution of its pair in the arc (at or before the cutoff), in the first 4 h (the pair straddles the cutoff), or later.
const where = (w) => (w.arms.F24.jump.hours <= 0 ? 'arc' : w.arms.F24.jump.hours <= 4 ? 'cutoff' : 'forecast');
const losses = all.filter((w) => w.loss), at = (k) => losses.filter((w) => where(w) === k);
// The truth's own 4 m step nearest each flight-differenced step (within 13 h): how much smaller it sizes the step.
const under = burned.map((w) => { const s = w.truth.steps4m.reduce((b, x) => (!b || Math.abs(x.hours - w.arms.F24.jump.hours) < Math.abs(b.hours - w.arms.F24.jump.hours) ? x : b), null); return s && Math.abs(s.hours - w.arms.F24.jump.hours) <= 13 ? -w.arms.F24.jump.sizeM - s.sizeM : null; }).filter((x) => x !== null).sort((a, b) => a - b);
const truthOnly = under.length, dc = decay.both, apSigma = median(clean.map((w) => w.arms.AP24.sigmaLnB));
const cell = (key) => key.replaceAll('|', '\\|');
const quad = (arm, list) => list.filter((w) => w.arms[arm].ok && w.arms[arm].growth.shape === 'quadratic').length;
const wxm = (s, k, i) => round(median(groups[s].map((w) => w.weather[k][i])), 1);
const row = (label, g, sub) => { const d = H(label, g, sub), x = d['7'], y = d['1']; return x.n ? `| ${label} | ${g} | ${sub === 'all' ? 'all' : 'no step'} | ${x.n} | ${P(x.ffmWorse)} | ${x.medianRatio} | ${x.ffmMedianKm} / ${x.apMedianKm} | ${P(x.baseline.ffmWorse)} | ${x.baseline.medianRatio} | ${P(y.ffmWorse)}, ${y.medianRatio} (${P(y.baseline.ffmWorse)}, ${y.baseline.medianRatio}) |` : null; };
const r2 = (x) => (x === null ? '-' : x.toFixed(2));
const md = [
  '# FFM from 24 h fits against AP at day 7 on step-free Sentinel-1 windows: the cause', '',
  `Exploratory, \`experiments/operator-theory/S1-24H-DAY7.md\` (and its two amendments): every window here was read before, so nothing passes or fails. \`table.json\` holds every window's measures and every figure below; the rows are in \`${STORES.out}\`.`, '',
  `Windows: 2025, all ${sets['2025'].pool} step-free day-7 windows of \`results/operator-theory/s1-step-free\`; 2026, ${sets['2026'].windows.length} of the ${sets['2026'].pool} of \`results/operator-theory/maneuver-flags\` (the first by SHA-256 of \`${SAMPLE.salt}<key>\`). Flown again: FFM24 and AP24 equal the stored day-7 rows on ${reproduction['2025'].F24} and ${reproduction['2025'].AP24} of 26 windows of 2025, AP24 on ${reproduction['2026'].AP24} of 26 of 2026; 2026's FFM24 flies on 2.2.0 here (median ${reproduction['2026'].F24Median.reflown} km against 2.0.4's stored ${reproduction['2026'].F24Median.stored}).`, '',
  '## The cause: burns under the flag', '',
  `${burned.length} of the ${all.length} windows hold a step of the truth's mean semimajor axis that the 8 m flag missed: FFM24's flight less the truth, revolution by revolution, changes by ${r2(jumps[0])} to ${r2(jumps.at(-1))} m (median ${r2(median(jumps))}) between consecutive revolutions, the truth rising. On the other ${clean.length} the largest change is ${r2(quiet[0])} to ${r2(quiet.at(-1))} m, though each spans eight daily product joins. The same steps recur from consecutive cutoffs. The truth's own revolution means (\`lib/steps.mjs\` at 4 m) find ${truthOnly} of the ${burned.length} within 13 h, at most ${r2(Math.max(...burned.flatMap((w) => w.truth.steps4m.map((s) => s.sizeM))))} m, sizing them from ${r2(under.at(-1))} m smaller to ${r2(-under[0])} m larger than the flight-differenced step (median ${r2(median(under))} m smaller). The flight difference sees them cleanly because the truth's single revolution means carry meter-level daily signals that FFM's flight shares.`, '',
  `Every FFM loss at day 7 is such a window: ${classes.both.losses} losses (${classes['2025'].losses} of 26 in 2025, ${classes['2026'].losses} of 26 in 2026), classed maneuver under the flag ${classes.both['maneuver under the flag']}, density ${classes.both.density}, fitted B ${classes.both['fitted B']}, something else ${classes.both['something else']}. The step falls in the fit arc in ${at('arc').length}, across the cutoff in ${at('cutoff').length} (FFM24 starts ${r2(Math.max(...at('cutoff').map((w) => w.arms.F24.offsetM)))} to ${r2(Math.min(...at('cutoff').map((w) => w.arms.F24.offsetM)))} m low, its along-track growth linear in ${at('cutoff').filter((w) => w.arms.F24.growth.shape === 'linear').length} of ${at('cutoff').length}) and in the forecast in ${at('forecast').length}.`, '',
  `FFM's fitted B against the truth's decay, on the ${dc.n} windows with no step: the truth decays ${dc.truthMPerDay} m/day (median); FFM24's decay error is ${dc.ffmErrorMPerDay} m/day at B ${dc.ffmB} m²/kg, AP24's ${dc.apErrorMPerDay} m/day at BTERM ${dc.apBterm} (the median of its 600 to 800 km band prior, posterior sigma of ln B ${r2(apSigma)}). AP flies about a quarter of the truth's drag; FFM's decay is within ${round(Math.max(...clean.map((w) => Math.abs(w.arms.F24.decayErrorMPerDay / w.truth.decayMPerDay))) * 100, 1)} % of the truth's on each. FFM wins all ${dc.n} at day 7 (median FFM/AP ${H('baseline', 'both', 'no step under the flag')['7'].medianRatio}: ${H('baseline', 'both', 'no step under the flag')['7'].ffmMedianKm} against ${H('baseline', 'both', 'no step under the flag')['7'].apMedianKm} km), with quadratic along-track growth on ${dc.ffmQuadratic} and ${dc.apQuadratic} of ${dc.n} for FFM and AP. Where a burn raises the orbit, AP's light drag has already held it up: its two errors cancel in part, and that is its day-7 win.`, '',
  `Weather over the forecast days, as-issued against definitive (median of the window means): F10.7 ${wxm('2025', 'f107', 0)} against ${wxm('2025', 'f107', 1)} (2025), ${wxm('2026', 'f107', 0)} against ${wxm('2026', 'f107', 1)} (2026); Ap ${wxm('2025', 'ap', 0)} against ${wxm('2025', 'ap', 1)}, ${wxm('2026', 'ap', 0)} against ${wxm('2026', 'ap', 1)}.`, '',
  '## Hypotheses, day 7 (day 1 last), FFM against AP24 unless named', '',
  '| Hypothesis | Set | Windows | n | FFM worse | Median FFM/AP | FFM / AP median km | Baseline FFM worse | Baseline median | Day 1: FFM worse, median (baseline) |', '| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |',
  ...HYP.flatMap(([label]) => ['2025', '2026', 'both'].flatMap((g) => [row(label, g, 'all'), row(label, g, 'no step under the flag')])).filter(Boolean),
  '', `(a) 48 h fits leave the day-7 loss (${P(H('a: 48 h fit', 'both', 'all')['7'].ffmWorse)}) and lose day 1's margin (median ${H('a: 48 h fit', 'both', 'all')['1'].medianRatio} against ${H('a: 48 h fit', 'both', 'all')['1'].baseline.medianRatio}). (b) B held at the median of the object's own fits of the 30 days before (${RULES.minHistory} fits or more; none on S1|39634|2025-10-06 and 10-07) is worse (${P(H('b: B held at the object\'s history', 'both', 'all')['7'].ffmWorse)}, median ${H('b: B held at the object\'s history', 'both', 'all')['7'].medianRatio}). (c) the definitive weather moves FFM's median day-7 error from ${H('c: definitive weather', 'both', 'all')['7'].baseline.ffmMedianKm} to ${H('c: definitive weather', 'both', 'all')['7'].ffmMedianKm} km and leaves it worse in ${P(H('c: definitive weather', 'both', 'all')['7'].ffmWorse)}: density is not the cause. No arm loses a window with no step; the 2026 sample holds none.`, '',
  '## The fix proposal', '',
  `No change to \`propagator/ffm\` or \`analysis/estimation\`: FFM's 24 h B reproduces the truth's decay where nothing thrusts, and neither a longer arc (a), a history B (b) nor the definitive weather (c) removes a loss. The losses are station keeping the 8 m time-mean flag cannot see, the owner's exemption. The change is the harness's flag (\`experiments/operator-theory/lib/steps.mjs\`, used by \`maneuver-flags.mjs\` and the step-free registrations): flag a window where the FFM24 flight less the truth changes by ${RULES.jumpM} m or more between consecutive revolutions (holes up to ${RULES.maxGapPeriods} periods, the drift removed) in [cutoff - 24 h, cutoff + the lead], and test FFM against AP only on the windows it leaves step-free. Supported by the per-window classes (${classes.both['maneuver under the flag']} of ${classes.both.losses} losses) and by the step-free row of every hypothesis (FFM worse on 0 of ${clean.length}). The 8 m rule stays for the burns that move a forecast by tens of km.`, '',
  '## Registration', '',
  `None was run: fewer than 30 unread windows exist. Sentinel-1A and 1C cutoffs with truth over [cutoff - 24 h, cutoff + 7 d] before the hold: every one from 2025-10-04 to 12-28 and from 2026-01-01 to 05-31 is spent (${SPENT.map((s) => `${s.by}: ${s.from} to ${s.to}${s.every > 1 ? `, every ${s.every}rd day` : ''}`).join('; ')}); 2025-10-02 lacks its arc (the truth starts on 10-01) and 12-29 to 12-31 lack the 2026-01-01 file. ${registration.candidates} remain (${candidates.map((c) => c.key).join(', ')}), their forecast spans read by S1-STEP-FREE.md's windows${candidates.some((c) => c.thisLaneHistoryArc) ? `, and ${candidates.filter((c) => c.thisLaneHistoryArc).map((c) => c.key).join(', ')}'s arc fitted here for (b)'s history` : ''}. Held: ${registration.hold}. Thirty windows step-free under the proposed flag, at this sample's rate (${clean.length} of ${all.length}), take about ${Math.ceil((30 * all.length) / clean.length / 2)} days of both satellites' truth outside every read span: the release of the C2 hold, or Sentinel-1A and 1C precise orbits from before 2025-10-01, which the archive does not hold.`, '',
  '## Builds', '',
  `FFM: \`propagator/ffm\` ${FFM_220.version} (dist ${FFM_220.wasmSha256.slice(0, 8)}, modules ${FFM_220.modulesCommit.slice(0, 8)}) by \`analysis/estimation\` 0.7.0 (7a555ca5) at CHEAPER.md's settings, solar pressure held at 0.02 m²/kg. AP on ${BUILD_NOTE}, AP24 as S1-STEP-FREE.md. Mean semimajor axis: \`foundation/orbits\` ${ORBITS_010.version} (dist ${ORBITS_010.wasmSha256.slice(0, 8)}). Weather: as-issued as S1-STEP-FREE.md; definitive XM's \`rowsM\` (GFZ). Holds: no held object, no Sentinel-1 cutoff from ${EXCLUDE.s1CutoffBefore}, no truth after ${EXCLUDE.s1TruthTo.slice(0, 10)}.`, '',
  '## Windows', '',
  '| Window | FFM24 / AP24 day 7 km | Class | Step: hours from cutoff, m (truth rising) | FFM24 / AP24 decay error m/day | FFM24 B / AP24 BTERM m²/kg |', '| --- | --- | --- | --- | --- | --- |',
  ...all.map((w) => { const F = w.arms.F24, A = w.arms.AP24, j = F.jump; return `| ${cell(w.key)} | ${F.days['7']} / ${A.days['7']} | ${w.class ?? (w.loss ? '-' : 'FFM wins')} | ${Math.abs(j.sizeM) >= RULES.jumpM ? `${j.hours}, ${r2(-j.sizeM)}` : `none (${r2(j.sizeM)})`} | ${F.decayErrorMPerDay} / ${A.decayErrorMPerDay} | ${F.b} / ${A.bterm} |`; }),
];
fs.writeFileSync(path.join(OUT, 'README.md'), `${md.join('\n')}\n`);
console.log(md.slice(0, 40).join('\n'));
process.exit(0);
