// The statistics (PLAN.md sections 6, 7). No orbit computation: every number comes from rows the modules computed. Medians, RMS, ratios and paired percentile intervals over windows.
//   node experiments/ffm-srp-seed-high-beta/score.mjs --control     A0 only: the control rule; no other arm is read
//   node experiments/ffm-srp-seed-high-beta/score.mjs               the control, then, only if it passes, every arm: results/ffm-srp-seed-high-beta/table.json and table.md
import fs from 'node:fs';
import path from 'node:path';
import { config, store, results, args, registered, c3, Opened, sha256, DAY, HOUR, readJsonl } from './common.mjs';

const R = config.rules, CURRENT = config.seeds.glonass.current;
const AXES = { R: 0, T: 1, N: 2 }, COV = { R: 0, T: 2, N: 5 };
const key = (r) => `${r.norad}|${r.E}`;
const sig = (x, n = 5) => (x == null || !Number.isFinite(x) ? null : Number(x.toPrecision(n)));
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rms = (a) => (a.length ? Math.sqrt(a.reduce((t, x) => t + x * x, 0) / a.length) : null);
const mean = (a) => (a.length ? a.reduce((t, x) => t + x, 0) / a.length : null);
const quantile = (s, q) => { const p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (p - i) * ((s[i + 1] ?? s[i]) - s[i]); };

/** Paired percentile interval of stat(indices) over n windows; seed the SHA-256 of the cell's name. */
function interval(n, stat, name) {
  if (n < 2) return null;
  let a = parseInt(sha256(Buffer.from(name)).slice(0, 8), 16) >>> 0;
  const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const idx = new Int32Array(n), out = new Float64Array(config.bootstrap.resamples);
  for (let b = 0; b < out.length; b += 1) { for (let i = 0; i < n; i += 1) idx[i] = Math.floor(rand() * n); out[b] = stat(idx); }
  out.sort();
  const lo = (1 - config.bootstrap.level) / 2;
  return [sig(quantile(out, lo)), sig(quantile(out, 1 - lo))];
}
const medianCI = (v, name) => interval(v.length, (idx) => { const s = Array.from(idx, (i) => v[i]).sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }, name);
const ratioCI = (x, c, name) => interval(x.length, (idx) => { let a = 0, b = 0; for (const i of idx) { a += x[i] * x[i]; b += c[i] * c[i]; } return Math.sqrt(a / b); }, name);

/** Which samples are primary (PLAN.md section 5): notices from the public pages in C3's store, up to the seal; storm days from GFZ Ap, lines to gfzThrough. */
function openPrimary(opened) {
  const P = config.primary;
  const sinex = c3.notices.parseSinex(opened.read(P.sinex, 'IGS SINEX').toString());
  const N = c3.notices.loadNotices(P.noticesDir, sinex, P.noticeSeal, opened), asOf = Date.parse(`${P.noticeSeal}T00:00:00Z`);
  const storms = new Set();
  for (const line of opened.read(P.gfzFile, `GFZ Ap, lines to ${P.gfzThrough}`).toString().split('\n')) {
    if (!line || line.startsWith('#')) continue;
    const date = `${line.slice(0, 4)}-${line.slice(5, 7)}-${line.slice(8, 10)}`;
    if (date < '2025-06-01' || date > P.gfzThrough) continue;
    if (Number(line.trim().split(/\s+/)[23]) >= P.stormAp) storms.add(date);
  }
  const cache = new Map();
  const notice = (r) => { const k = key(r); if (!cache.has(k)) { const t = Date.parse(r.tIn); cache.set(k, N.overlap(r.norad, t - P.noticeBeforeHours * HOUR, t + P.noticeAfterHours * HOUR, asOf).length > 0); } return cache.get(k); };
  const storm = (r, L) => { const t = Date.parse(r.tIn); for (let d = Math.floor((t - 24 * HOUR) / DAY); d * DAY < t + L * HOUR; d += 1) if (storms.has(new Date(d * DAY).toISOString().slice(0, 10))) return true; return false; };
  return { notice, storm };
}

const lead = (r, L) => r.leads?.find((l) => l.L === L && l.errRtnM) ?? null;
const errOf = (r, L, axis, truth = 'esa') => { const l = lead(r, L), v = l && (truth === 'esa' ? l.errRtnM : l.gfzRtnM); return v ? v[AXES[axis]] : null; };
const sN = (r, L, truth = 'esa') => { const e = errOf(r, L, 'N', truth); return e === null ? null : Math.sign(r.betaDeg) * e; };
const sigmaOf = (r, L, axis) => { const l = lead(r, L); return l?.covRtn ? Math.sqrt(l.covRtn[COV[axis]]) : null; };
const absBeta = (r) => Math.abs(r.betaDeg);

const CELLS = { H: (r) => r.norad === 54377 && absBeta(r) >= config.cells.H.minAbsBeta, M1: (r) => config.cells.M1.norads.includes(r.norad) && r.E.slice(0, 10) >= config.cells.M1.from && r.E.slice(0, 10) <= config.cells.M1.to, M2: (r) => r.norad === 54377 && absBeta(r) < config.cells.M2.maxAbsBeta };

/** The rows of one arm by window; primary(r, L) as PLAN.md section 5, all(r, L) every converged fit with truth at L. */
function byArm(rows) { const out = {}; for (const r of rows) (out[r.arm] ??= new Map()).set(key(r), r); return out; }
const paired = (control, arm, cell, L, keep) => [...arm.values()].filter((r) => cell(r)).flatMap((r) => { const c = control.get(key(r)); return r.fit?.ok && c?.fit?.ok && lead(r, L) && lead(c, L) && keep(r, L) ? [[r, c]] : []; });

export function buildControl(A0rows, opened) {
  const P = openPrimary(opened), L = R.primaryLead_h;
  const H = A0rows.filter((r) => CELLS.H(r) && r.fit?.ok && lead(r, L) && !P.notice(r) && !P.storm(r, L));
  const S = median(H.map((r) => sN(r, L)));
  const high = A0rows.filter((r) => r.norad === 54377 && r.fit?.ok && absBeta(r) >= R.control.atAbsBetaAtLeast);
  const ratio = median(high.map((r) => r.fit.agom / CURRENT));
  const [lo, hi] = R.control.sA0;
  return { windows: H.length, S_A0_H_6h_m: sig(S), bandM: R.control.sA0, agomOverCurrentAtAbsBeta80: sig(ratio), below: R.control.agomOverCurrentBelow, windowsAtAbsBeta80: high.length, pass: S >= lo && S <= hi && ratio < R.control.agomOverCurrentBelow };
}

function verdictOf(rowsA, control, name, keep) {
  const L = R.primaryLead_h, p = paired(control, rowsA, CELLS.H, L, keep);
  const x = p.map(([r]) => sN(r, L)), c = p.map(([, q]) => sN(q, L)), d = x.map((v, i) => v - c[i]);
  const S = median(x), S0 = median(c), ci = medianCI(d, `${name}|H|D|6|esa`);
  const below = ci && ci[1] < 0;
  const v = Math.abs(S) <= R.removedAtMost && below ? 'REMOVED' : (Math.abs(S) <= R.reducedFraction * S0 && below ? 'REDUCED' : 'NOT REMOVED');
  return { windows: p.length, S_m: sig(S), S_control_m: sig(S0), D_m: sig(median(d)), D_interval_m: ci, verdict: v };
}

function leadCells(rowsA, control, name, cellName, keep, truth) {
  return config.leads_h.map((L) => {
    const p = paired(control, rowsA, CELLS[cellName], L, keep).filter(([r, c]) => sN(r, L, truth) !== null && sN(c, L, truth) !== null);
    const x = p.map(([r]) => sN(r, L, truth)), c = p.map(([, q]) => sN(q, L, truth)), d = x.map((v, i) => v - c[i]);
    return { L, truth, n: p.length, S_m: sig(median(x)), S_control_m: sig(median(c)), D_m: sig(median(d)), D_interval_m: medianCI(d, `${name}|${cellName}|D|${L}|${truth}`) };
  });
}

function fitLevel(rowsA, cellName, keep, L = R.primaryLead_h) {
  const v = [...rowsA.values()].filter((r) => CELLS[cellName](r) && r.fit?.ok && keep(r, L));
  return { windows: v.length, agomOverCurrent: sig(median(v.map((r) => r.fit.agom / CURRENT))), agomMedian: sig(median(v.map((r) => r.fit.agom))), agomSigmaOverCurrent: sig(median(v.map((r) => r.fit.agomSigma / CURRENT))), sigmaN6h_m: sig(median(v.filter((r) => lead(r, L)).map((r) => sigmaOf(r, L, 'N')))), z2N6h: sig(mean(v.filter((r) => lead(r, L)).map((r) => (errOf(r, L, 'N') / sigmaOf(r, L, 'N')) ** 2))) };
}

function binTable(rowsA, armName, keep, seedOfRow) {
  const L = R.primaryLead_h;
  return config.bins.map(([lo, hi]) => {
    const v = [...rowsA.values()].filter((r) => r.onGrid && r.fit?.ok && lead(r, L) && absBeta(r) >= lo && (absBeta(r) < hi || hi === 90) && keep(r, L));
    const n = v.map((r) => sN(r, L)), g = v.filter((r) => sN(r, L, 'gfz') !== null).map((r) => sN(r, L, 'gfz'));
    return { bin: [lo, hi], n: v.length, S6h_m: sig(median(n)), S6h_interval_m: medianCI(n, `${armName}|bin|${lo}`), S6h_gfz_m: sig(median(g)), rmsN6h_m: sig(rms(n)), medianAbsN6h_m: sig(median(n.map(Math.abs))), agomOverSeed: sig(median(v.map((r) => r.fit.agom / seedOfRow(r)))), agomSigmaOverSeed: sig(median(v.map((r) => r.fit.agomSigma / seedOfRow(r)))), sigmaN6h_m: sig(median(v.map((r) => sigmaOf(r, L, 'N')))), z2N6h: sig(mean(v.map((r) => (errOf(r, L, 'N') / sigmaOf(r, L, 'N')) ** 2))) };
  });
}

function perSatelliteBins(rowsA, keep) {
  const L = R.primaryLead_h, sats = [...new Set([...rowsA.values()].map((r) => r.norad))];
  return Object.fromEntries(sats.map((norad) => [norad, config.bins.map(([lo, hi]) => {
    const v = [...rowsA.values()].filter((r) => r.norad === norad && r.onGrid && r.fit?.ok && lead(r, L) && absBeta(r) >= lo && (absBeta(r) < hi || hi === 90) && keep(r, L));
    return { bin: [lo, hi], n: v.length, S6h_m: sig(median(v.map((r) => sN(r, L)))), agomOverSeed: sig(median(v.map((r) => r.fit.agom / r.seed))) };
  })]));
}

function ratioCells(rowsA, control, name, cellName, axes, leads, keep, truth = 'esa') {
  const out = [];
  for (const axis of axes) for (const L of leads) {
    const p = paired(control, rowsA, CELLS[cellName] ?? cellName, L, keep).filter(([r, c]) => errOf(r, L, axis, truth) !== null && errOf(c, L, axis, truth) !== null);
    const x = p.map(([r]) => errOf(r, L, axis, truth)), c = p.map(([, q]) => errOf(q, L, axis, truth));
    out.push({ axis, L, truth, n: p.length, rms_m: sig(rms(x)), rmsControl_m: sig(rms(c)), medianAbs_m: sig(median(x.map(Math.abs))), medianAbsControl_m: sig(median(c.map(Math.abs))), ratio: sig(rms(x) / rms(c)), ratioInterval: ratioCI(x, c, `${name}|${typeof cellName === 'string' ? cellName : 'set'}|${axis}|${L}|${truth}`) });
  }
  return out;
}
const classify = (cells, [lo, hi]) => (cells.some((c) => c.ratioInterval && c.ratioInterval[0] > hi) ? 'HARM' : cells.some((c) => c.ratioInterval && c.ratioInterval[1] < lo) ? 'HELP' : 'NO CHANGE');

/** Report only (coordinator's request, 2026-10-31; no rule attaches): the fit itself, arm against control, on every window of a set with no sample filter. Residual RMS per axis = 10 m x sqrt(median reduced chi-square). */
function fitQualityCell(rowsA, control, name, cell) {
  const p = [...rowsA.values()].filter(cell).flatMap((r) => { const c = control.get(key(r)); return r.fit?.ok && c?.fit?.ok ? [[r, c]] : []; });
  const ratio = p.map(([r, c]) => r.fit.reducedChiSquare / c.fit.reducedChiSquare);
  const move = p.map(([r, c]) => Math.hypot(r.fit.state[0] - c.fit.state[0], r.fit.state[1] - c.fit.state[1], r.fit.state[2] - c.fit.state[2]));
  const vel = p.map(([r, c]) => Math.hypot(r.fit.state[3] - c.fit.state[3], r.fit.state[4] - c.fit.state[4], r.fit.state[5] - c.fit.state[5]));
  const dA = p.map(([r, c]) => (r.fit.agom - c.fit.agom) / c.seed);
  return { n: p.length, chi2Ratio: sig(median(ratio)), chi2RatioInterval: medianCI(ratio, `${name}|chi2`), residualRmsM: sig(10 * Math.sqrt(median(p.map(([r]) => r.fit.reducedChiSquare)))), residualRmsControlM: sig(10 * Math.sqrt(median(p.map(([, c]) => c.fit.reducedChiSquare)))), stateMoveM: sig(median(move)), stateMoveIntervalM: medianCI(move, `${name}|move`), velocityMoveMS: sig(median(vel)), agomMoveOverControlSeed: sig(median(dA)), agomMoveInterval: medianCI(dA, `${name}|dA`) };
}

const counts = (rows) => {
  const out = {};
  for (const r of rows) {
    const a = (out[r.arm] ??= { rows: 0, converged: 0, excluded: {}, refused: 0, termination: {} });
    a.rows += 1;
    if (r.excluded) a.excluded[r.excluded] = (a.excluded[r.excluded] ?? 0) + 1;
    else if (r.refused) a.refused += 1;
    else { a.termination[r.fit.termination ?? r.fit.error ?? 'none'] = (a.termination[r.fit.termination ?? r.fit.error ?? 'none'] ?? 0) + 1; if (r.fit.ok) a.converged += 1; }
  }
  return out;
};

// PLAN.md section 9, disclosure 8: the one known unlisted event, named wherever it appears among the largest errors.
const KNOWN_UNLISTED = [{ norad: 40001, at: Date.parse('2026-02-16T12:00:00Z'), note: 'R855 event 2026-02-16, no notice lists it (public in C3\'s P2)' }];
const largest = (rowsA, keep, L = 72, topN = R.largestListed) => [...rowsA.values()].filter((r) => r.fit?.ok && lead(r, L)).sort((a, b) => Math.abs(errOf(b, L, 'T')) - Math.abs(errOf(a, L, 'T'))).slice(0, topN)
  .map((r) => ({ norad: r.norad, E: r.E.slice(0, 10), betaDeg: sig(r.betaDeg, 3), t72h_m: sig(errOf(r, L, 'T')), t72h_gfz_m: sig(errOf(r, L, 'T', 'gfz')), primary: keep(r, L), agomOverSeed: sig(r.fit.agom / r.seed, 4), note: KNOWN_UNLISTED.some((k) => k.norad === r.norad && Date.parse(r.tIn) <= k.at && k.at <= Date.parse(r.tIn) + L * HOUR) ? KNOWN_UNLISTED.find((k) => k.norad === r.norad).note : '' }));

/** Everything PLAN.md section 7 asks of a full set of rows. */
export function buildTable(rows, opened) {
  const P = openPrimary(opened), A = byArm(rows);
  const primary = (r, L) => !P.notice(r) && !P.storm(r, L), all = () => true;
  const control = buildControl(rows.filter((r) => r.arm === 'A0'), opened);
  const cellWindows = Object.fromEntries(Object.keys(CELLS).map((c) => [c, { windows: [...A.A0.values()].filter((r) => r.betaDeg != null && CELLS[c](r)).length, registered: config.cells[c].windows }]));
  const high = {};
  for (const X of ['A1', 'A2']) {
    const fH = fitLevel(A[X], 'H', primary), fM = fitLevel(A[X], 'M2', primary);
    high[X] = { ...verdictOf(A[X], A.A0, X, primary), allSamples: verdictOf(A[X], A.A0, `${X}|all`, all), agomH: fH, agomM2: fM, sagRatio: sig(fH.agomMedian / fM.agomMedian), sagGone: fH.agomMedian / fM.agomMedian >= R.sagGoneAtLeast, leads: leadCells(A[X], A.A0, X, 'H', primary, 'esa'), leadsGfz: leadCells(A[X], A.A0, X, 'H', primary, 'gfz') };
  }
  const fH0 = fitLevel(A.A0, 'H', primary), fM0 = fitLevel(A.A0, 'M2', primary);
  const hByDate = [...A.A0.values()].filter(CELLS.H).sort((a, b) => (a.E < b.E ? -1 : 1)).map((r) => ({ E: r.E.slice(0, 10), betaDeg: sig(r.betaDeg, 3), primary: primary(r, 6), ...Object.fromEntries(['A0', 'A1', 'A2'].flatMap((x) => { const q = A[x].get(key(r)); return [[`n6h_${x}`, sig(errOf(q, 6, 'N'), 3)], [`agom_${x}`, sig(q.fit?.agom / CURRENT, 3)]]; })), n6h_gfz_A0: sig(errOf(r, 6, 'N', 'gfz'), 3) }));
  const lowBeta = {};
  for (const X of ['A1', 'A2']) {
    lowBeta[X] = {};
    for (const c of ['M1', 'M2']) { const cells = ratioCells(A[X], A.A0, X, c, ['R', 'T', 'N'], config.leads_h, primary); lowBeta[X][c] = { outcome: classify(cells, R.lowBetaBand), cells, leads: leadCells(A[X], A.A0, X, c, primary, 'esa') }; }
  }
  const seedOfRow = (r) => r.seed;
  const bins = { A0: binTable(A.A0, 'A0', primary, () => CURRENT), A1: binTable(A.A1, 'A1', primary, () => CURRENT), A2: binTable(A.A2, 'A2', primary, () => CURRENT), G0: binTable(A.G0, 'G0', primary, seedOfRow), G2: binTable(A.G2, 'G2', primary, seedOfRow), allSamples: { A0: binTable(A.A0, 'A0|all', all, () => CURRENT), G0: binTable(A.G0, 'G0|all', all, seedOfRow) } };
  const satellites = { A0: perSatelliteBins(A.A0, primary), A1: perSatelliteBins(A.A1, primary), A2: perSatelliteBins(A.A2, primary) };
  const iov = (r) => config.satellites.galileoIov.includes(r.norad), onGrid = (r) => r.onGrid;
  const galileo = {};
  for (const [name, cell] of [['all', onGrid], ['FOC', (r) => onGrid(r) && !iov(r)], ['IOV', (r) => onGrid(r) && iov(r)]]) galileo[name] = ratioCells(A.G2, A.G0, `G2|${name}`, cell, ['T'], R.galileoTLeads_h, primary);
  const galileoGfz = ratioCells(A.G2, A.G0, 'G2|all', onGrid, ['T'], R.galileoTLeads_h, primary, 'gfz');
  const galileoAll = ratioCells(A.G2, A.G0, 'G2|allSamples', onGrid, ['T'], R.galileoTLeads_h, all);
  const inBand = galileo.all.every((c) => c.ratioInterval && c.ratioInterval[0] >= R.galileoBand[0] && c.ratioInterval[1] <= R.galileoBand[1]);
  const falls = galileo.all.some((c) => c.ratioInterval && c.ratioInterval[1] < R.galileoBand[0]), rises = galileo.all.some((c) => c.ratioInterval && c.ratioInterval[0] > R.galileoBand[1]);
  const lowAll = (r) => r.betaDeg != null && absBeta(r) < 30, midAll = (r) => r.betaDeg != null && absBeta(r) >= 30 && absBeta(r) < 75;
  const fitQuality = {};
  for (const X of ['A1', 'A2']) fitQuality[X] = Object.fromEntries([['H', CELLS.H], ['M1', CELLS.M1], ['M2', CELLS.M2], ['|beta| < 30, every GLONASS window', lowAll], ['30 <= |beta| < 75, every GLONASS window', midAll]].map(([c, cell]) => [c, fitQualityCell(A[X], A.A0, `${X}|fit|${c}`, cell)]));
  fitQuality.G2 = { 'every Galileo window': fitQualityCell(A.G2, A.G0, 'G2|fit|all', () => true) };
  const glonassT = { A1: ratioCells(A.A1, A.A0, 'A1|grid', onGrid, ['T'], R.galileoTLeads_h, primary), A2: ratioCells(A.A2, A.A0, 'A2|grid', onGrid, ['T'], R.galileoTLeads_h, primary) };
  return {
    experiment: config.experiment, counts: counts(rows), control, cellWindows,
    cost: { fitSecondsMedian: sig(median(rows.map((r) => r.seconds?.fit).filter(Number.isFinite))), forecastSecondsMedian: sig(median(rows.map((r) => r.seconds?.forecast).filter(Number.isFinite))), ffmRoundsMedian: median(rows.map((r) => r.fit?.ffmCalls).filter(Number.isFinite)), totalCpuHours: sig(rows.reduce((s, r) => s + (r.seconds?.fit ?? 0) + (r.seconds?.forecast ?? 0), 0) / 3600) },
    fitQuality, high, agomControl: { H: fH0, M2: fM0, sagRatio: sig(fH0.agomMedian / fM0.agomMedian) }, hByDate, lowBeta, bins, satellites,
    galileo: { outcome: falls && rises ? 'T CHANGES, both ways' : falls ? 'T CHANGES, falls' : rises ? 'T CHANGES, rises' : 'T NO CHANGE', insideBand: inBand, cells: galileo, gfz: galileoGfz, allSamples: galileoAll, largestG0: largest(A.G0, primary), looks: config.looks.tRms72h },
    glonassT, largestA0: largest(A.A0, primary),
  };
}

const fmtCI = (c) => (c ? `[${c[0]}, ${c[1]}]` : '-');
/** table.json as tables. */
export function renderTable(t) {
  const o = [`# ${t.experiment}: table`, '', 'Generated by score.mjs from the rows. Errors: forecast minus truth in the predicted RTN axes, m. S = median of sign(beta) x N. Primary samples unless stated. FFM: RK78, relative tolerance 1e-10, steps up to 120 s; fit track at 600 s; outputs at the leads.', ''];
  o.push('## Counts', '', '| arm | rows | converged | terminations | excluded | refused |', '| --- | ---: | ---: | --- | --- | ---: |');
  for (const [a, c] of Object.entries(t.counts)) o.push(`| ${a} | ${c.rows} | ${c.converged} | ${JSON.stringify(c.termination).replace(/"/g, '')} | ${JSON.stringify(c.excluded).replace(/"/g, '')} | ${c.refused} |`);
  o.push('', `Cells (windows found / registered): ${Object.entries(t.cellWindows).map(([k, v]) => `${k} ${v.windows}/${v.registered}`).join(', ')}.`, '');
  o.push('## Control', '', `S(A0, H, 6 h) = ${t.control.S_A0_H_6h_m} m on ${t.control.windows} windows (band ${t.control.bandM[0]} to ${t.control.bandM[1]}); A0's AGOM/0.00759375 at |beta| >= 80 = ${t.control.agomOverCurrentAtAbsBeta80} on ${t.control.windowsAtAbsBeta80} windows (below ${t.control.below}): ${t.control.pass ? 'PASS' : 'MISS'}.`, '');
  o.push('## Removal on H (54377, |beta| >= 75 deg), 6 h, ESA', '', '| arm | windows | S, m | S A0, m | D, m | D interval, m | verdict | all samples: S, S A0, verdict | AGOM/0.00759375 H | same M2 | sag ratio | sag gone |', '| --- | ---: | ---: | ---: | ---: | --- | --- | --- | ---: | ---: | ---: | --- |');
  for (const [X, h] of Object.entries(t.high)) o.push(`| ${X} | ${h.windows} | ${h.S_m} | ${h.S_control_m} | ${h.D_m} | ${fmtCI(h.D_interval_m)} | ${h.verdict} | ${h.allSamples.S_m}, ${h.allSamples.S_control_m}, ${h.allSamples.verdict} | ${h.agomH.agomOverCurrent} | ${h.agomM2.agomOverCurrent} | ${h.sagRatio} | ${h.sagGone ? 'yes' : 'no'} |`);
  o.push(`| A0 | | | | | | | | ${t.agomControl.H.agomOverCurrent} | ${t.agomControl.M2.agomOverCurrent} | ${t.agomControl.sagRatio} | |`, '');
  o.push('Formal numbers on H at 6 h (the fit\'s own covariance, not P_C2):', '', '| arm | sigma AGOM/0.00759375 | sigma N, m | mean z^2 N |', '| --- | ---: | ---: | ---: |');
  o.push(`| A0 | ${t.agomControl.H.agomSigmaOverCurrent} | ${t.agomControl.H.sigmaN6h_m} | ${t.agomControl.H.z2N6h} |`);
  for (const [X, h] of Object.entries(t.high)) o.push(`| ${X} | ${h.agomH.agomSigmaOverCurrent} | ${h.agomH.sigmaN6h_m} | ${h.agomH.z2N6h} |`);
  o.push('', 'S on H at every lead, ESA and GFZ:', '', '| arm | L, h | n | S, m | S A0, m | D, m | D interval, m | GFZ: n | S, m | S A0, m | D, m |', '| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: |');
  for (const [X, h] of Object.entries(t.high)) h.leads.forEach((l, i) => { const g = h.leadsGfz[i]; o.push(`| ${X} | ${l.L} | ${l.n} | ${l.S_m} | ${l.S_control_m} | ${l.D_m} | ${fmtCI(l.D_interval_m)} | ${g.n} | ${g.S_m} | ${g.S_control_m} | ${g.D_m} |`); });
  o.push('', 'H per cutoff (N at 6 h, m; AGOM over 0.00759375):', '', '| cutoff | beta | primary | N A0 | N A1 | N A2 | N A0 GFZ | AGOM A0 | AGOM A1 | AGOM A2 |', '| --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const r of t.hByDate) o.push(`| ${r.E} | ${r.betaDeg} | ${r.primary ? 'yes' : 'no'} | ${r.n6h_A0} | ${r.n6h_A1} | ${r.n6h_A2} | ${r.n6h_gfz_A0} | ${r.agom_A0} | ${r.agom_A1} | ${r.agom_A2} |`);
  o.push('', '## Low beta: M1 (same dates, other planes) and M2 (54377 at |beta| < 30)', '', `Outcomes: ${Object.entries(t.lowBeta).map(([X, v]) => `${X}: M1 ${v.M1.outcome}, M2 ${v.M2.outcome}`).join('; ')}.`, '', '| arm | cell | axis | L, h | n | RMS, m | RMS A0, m | ratio | interval |', '| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const [X, v] of Object.entries(t.lowBeta)) for (const c of ['M1', 'M2']) for (const k of v[c].cells) o.push(`| ${X} | ${c} | ${k.axis} | ${k.L} | ${k.n} | ${k.rms_m} | ${k.rmsControl_m} | ${k.ratio} | ${fmtCI(k.ratioInterval)} |`);
  o.push('', '## The fit itself, report only (every window of the set, no sample filter)', '', 'Reduced chi-square of the arm over its control, paired; residual RMS per axis = 10 m x sqrt(median reduced chi-square); the move of the fitted state at the fit epoch; AGOM\'s move in units of the control\'s seed.', '', '| arm | set | n | chi2 ratio | interval | residual RMS, m | control, m | state move, m | interval, m | velocity move, m/s | AGOM move | interval |', '| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | --- | ---: | ---: | --- |');
  for (const [X, cells] of Object.entries(t.fitQuality)) for (const [c, k] of Object.entries(cells)) o.push(`| ${X} | ${c} | ${k.n} | ${k.chi2Ratio} | ${fmtCI(k.chi2RatioInterval)} | ${k.residualRmsM} | ${k.residualRmsControlM} | ${k.stateMoveM} | ${fmtCI(k.stateMoveIntervalM)} | ${k.velocityMoveMS} | ${k.agomMoveOverControlSeed} | ${fmtCI(k.agomMoveInterval)} |`);
  o.push('', '## N per beta bin at 6 h, 3-day grid', '', '| arm | |beta| | n | S, m | interval, m | S GFZ, m | RMS N, m | median abs N, m | AGOM/seed | sigma AGOM/seed | sigma N, m | mean z^2 N |', '| --- | --- | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const a of ['A0', 'A1', 'A2', 'G0', 'G2']) for (const b of t.bins[a]) if (b.n) o.push(`| ${a} | ${b.bin[0]}-${b.bin[1]} | ${b.n} | ${b.S6h_m} | ${fmtCI(b.S6h_interval_m)} | ${b.S6h_gfz_m} | ${b.rmsN6h_m} | ${b.medianAbsN6h_m} | ${b.agomOverSeed} | ${b.agomSigmaOverSeed} | ${b.sigmaN6h_m} | ${b.z2N6h} |`);
  o.push('', 'A0 and G0 with all samples (notices and storms in):', '', '| arm | |beta| | n | S, m | RMS N, m |', '| --- | --- | ---: | ---: | ---: |');
  for (const a of ['A0', 'G0']) for (const b of t.bins.allSamples[a]) if (b.n) o.push(`| ${a} | ${b.bin[0]}-${b.bin[1]} | ${b.n} | ${b.S6h_m} | ${b.rmsN6h_m} |`);
  o.push('', 'GLONASS per satellite, grid, S at 6 h in m (n), AGOM over the arm\'s seed:', '', '| arm | NORAD | |beta| | n | S, m | AGOM/seed |', '| --- | ---: | --- | ---: | ---: | ---: |');
  for (const [a, sats] of Object.entries(t.satellites)) for (const [norad, bs] of Object.entries(sats)) for (const b of bs) if (b.n) o.push(`| ${a} | ${norad} | ${b.bin[0]}-${b.bin[1]} | ${b.n} | ${b.S6h_m} | ${b.agomOverSeed} |`);
  o.push('', '## Along-track at 24-72 h', '', `Galileo, G2 against G0: ${t.galileo.outcome}. The looks: RMS at 72 h ${t.galileo.looks.galileo} m on Galileo, ${t.galileo.looks.glonass.join(' to ')} m on GLONASS.`, '', '| arms | set | L, h | truth | n | RMS, m | RMS control, m | median abs, m | median abs control, m | ratio | interval |', '| --- | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  const row = (arms, set, k) => o.push(`| ${arms} | ${set} | ${k.L} | ${k.truth} | ${k.n} | ${k.rms_m} | ${k.rmsControl_m} | ${k.medianAbs_m} | ${k.medianAbsControl_m} | ${k.ratio} | ${fmtCI(k.ratioInterval)} |`);
  for (const [set, cells] of Object.entries(t.galileo.cells)) for (const k of cells) row('G2/G0', set, k);
  for (const k of t.galileo.gfz) row('G2/G0', 'all', k);
  for (const k of t.galileo.allSamples) row('G2/G0', 'all samples', k);
  for (const [X, cells] of Object.entries(t.glonassT)) for (const k of cells) row(`${X}/A0`, 'GLONASS grid', k);
  for (const [name, list] of [['G0', t.galileo.largestG0], ['A0', t.largestA0]]) {
    o.push('', `Ten largest |T| at 72 h, ${name}:`, '', '| NORAD | cutoff | beta | T, m | T GFZ, m | primary | AGOM/seed | note |', '| ---: | --- | ---: | ---: | ---: | --- | ---: | --- |');
    for (const r of list) o.push(`| ${r.norad} | ${r.E} | ${r.betaDeg} | ${r.t72h_m} | ${r.t72h_gfz_m} | ${r.primary ? 'yes' : 'no'} | ${r.agomOverSeed} | ${r.note} |`);
  }
  return `${o.join('\n')}\n`;
}

export const allRows = () => { const d = path.join(store, 'rows'); return fs.readdirSync(d).filter((f) => f.endsWith('.jsonl')).sort().flatMap((f) => readJsonl(path.join(d, f))); };

if (import.meta.url === `file://${process.argv[1]}`) {
  registered();
  const rows = allRows();
  const a0 = rows.filter((r) => r.arm === 'A0');
  const control = buildControl(a0, new Opened());
  console.log(JSON.stringify({ control }, null, 1));
  if (args.control) process.exit(control.pass ? 0 : 3);
  if (!control.pass) { console.error('the control missed: stop before reading the other arms and ask the coordinator'); process.exit(3); }
  const table = buildTable(rows, new Opened());
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(path.join(results, 'table.json'), `${JSON.stringify(table, null, 1)}\n`);
  fs.writeFileSync(path.join(results, 'table.md'), renderTable(table));
  console.log(`wrote ${path.join(results, 'table.json')} and table.md`);
}
