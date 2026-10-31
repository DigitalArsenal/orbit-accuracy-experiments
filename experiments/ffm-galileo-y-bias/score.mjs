// The statistics (PLAN.md sections 5-6). No orbit computation: every error comes from rows the modules computed. Medians, RMS, ratios and paired percentile intervals over windows, and K, the least-squares constant in
// T = K g(beta), g(beta) a regressor: the orbit mean of the yaw-steering Y axis's along-track projection, mean over u of sin(beta) / sqrt(1 - cos^2(beta) cos^2(u)).
//   node experiments/ffm-galileo-y-bias/score.mjs --control     base only: the control rule; no arm is read
//   node experiments/ffm-galileo-y-bias/score.mjs               the control, then, only if it passes, every arm: results/ffm-galileo-y-bias/table.json and table.md
import fs from 'node:fs';
import path from 'node:path';
import { config, store, results, args, registered, baseRows, devValues, Opened, readJsonl, sha256 } from './common.mjs';
import { openPrimary } from './lib/primary.mjs';

const R = config.rules, LEADS = config.leads_h, TL = [24, 48, 72];
const AXES = { R: 0, T: 1, N: 2 }, COV = { R: 0, T: 2, N: 5 };
const key = (r) => `${r.norad}|${r.E}`;
const sig = (x, n = 5) => (x == null || !Number.isFinite(x) ? null : Number(x.toPrecision(n)));
const median = (a) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const rms = (a) => (a.length ? Math.sqrt(a.reduce((t, x) => t + x * x, 0) / a.length) : null);
const quantile = (a, q) => { if (!a.length) return null; const s = [...a].sort((x, y) => x - y), p = (s.length - 1) * q, i = Math.floor(p); return s[i] + (p - i) * ((s[i + 1] ?? s[i]) - s[i]); };

function interval(n, stat, name) {
  if (n < 2) return null;
  let a = parseInt(sha256(Buffer.from(name)).slice(0, 8), 16) >>> 0;
  const rand = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const idx = new Int32Array(n), out = new Float64Array(config.bootstrap.resamples);
  for (let b = 0; b < out.length; b += 1) { for (let i = 0; i < n; i += 1) idx[i] = Math.floor(rand() * n); out[b] = stat(idx); }
  out.sort();
  const lo = (1 - config.bootstrap.level) / 2, q = (p) => { const x = (out.length - 1) * p, i = Math.floor(x); return out[i] + (x - i) * ((out[i + 1] ?? out[i]) - out[i]); };
  return [sig(q(lo)), sig(q(1 - lo))];
}
const ratioCI = (x, c, name) => interval(x.length, (idx) => { let a = 0, b = 0; for (const i of idx) { a += x[i] * x[i]; b += c[i] * c[i]; } return Math.sqrt(a / b); }, name);
const medianCI = (v, name) => interval(v.length, (idx) => { const s = Array.from(idx, (i) => v[i]).sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }, name);

const lead = (r, L) => r.leads?.find((l) => l.L === L && l.errRtnM) ?? null;
const errOf = (r, L, axis, truth = 'esa') => { const l = lead(r, L), v = l && (truth === 'esa' ? l.errRtnM : l.gfzRtnM); return v ? v[AXES[axis]] : null; };
const sigmaOf = (r, L, axis) => { const l = lead(r, L); return l?.covRtn ? Math.sqrt(l.covRtn[COV[axis]]) : null; };
const U = Array.from({ length: 3600 }, (_, i) => (2 * Math.PI * i) / 3600);
const gCache = new Map();
const g = (betaDeg) => { if (!gCache.has(betaDeg)) { const b = (betaDeg * Math.PI) / 180, c2 = Math.cos(b) ** 2; gCache.set(betaDeg, U.reduce((s, u) => s + Math.sin(b) / Math.sqrt(1 - c2 * Math.cos(u) ** 2), 0) / U.length); } return gCache.get(betaDeg); };

/** K in T = K g(beta), R^2 and the residual, over rows with truth at L. */
function shape(rows, L) {
  const v = rows.filter((r) => errOf(r, L, 'T') !== null), x = v.map((r) => g(r.betaDeg)), y = v.map((r) => errOf(r, L, 'T'));
  if (v.length < 2) return { L, n: v.length, K_m: null, R2: null, residualRmsM: null, tRmsM: null };
  const k = x.reduce((s, a, i) => s + a * y[i], 0) / x.reduce((s, a) => s + a * a, 0), res = y.map((a, i) => a - k * x[i]);
  const mean = (a) => a.reduce((s, c) => s + c, 0) / a.length, vr = (a) => { const m = mean(a); return a.reduce((s, c) => s + (c - m) ** 2, 0) / a.length; };
  return { L, n: v.length, K_m: sig(k), R2: sig(1 - vr(res) / vr(y)), residualRmsM: sig(rms(res)), tRmsM: sig(rms(y)) };
}

export function buildControl(opened) {
  const P = openPrimary(opened), L = R.control.lead_h;
  const v = [...baseRows(opened).values()].filter((r) => r.block === R.primaryBlock && r.span === R.primarySpan && r.fit?.ok && lead(r, L) && P.primary(r, L));
  const s = shape(v, L), [lo, hi] = R.control.K;
  return { ...s, band: R.control.K, r2AtLeast: R.control.r2AtLeast, pass: s.K_m >= lo && s.K_m <= hi && s.R2 >= R.control.r2AtLeast };
}

const armRows = () => { const d = path.join(store, 'rows'); return fs.readdirSync(d).filter((f) => f.endsWith('.jsonl')).sort().flatMap((f) => readJsonl(path.join(d, f))); };

/** Everything PLAN.md sections 5 and 6 ask of the rows. */
export function buildTable(opened) {
  const P = openPrimary(opened), base = baseRows(opened), control = buildControl(new Opened()), values = devValues();
  const rows = armRows(), A = {};
  for (const r of rows) (A[r.arm] ??= new Map()).set(key(r), r);
  const counts = {};
  for (const r of rows) { const c = (counts[r.arm] ??= { rows: 0, converged: 0, excluded: 0, refused: 0, terminations: {} }); c.rows += 1; if (r.excluded) c.excluded += 1; else if (r.refused) c.refused += 1; else { c.terminations[r.fit.termination ?? 'none'] = (c.terminations[r.fit.termination ?? 'none'] ?? 0) + 1; if (r.fit.ok) c.converged += 1; } }
  const pairs = (arm, block, span, L, keep) => [...A[arm].values()].filter((r) => r.block === block && (!span || r.span === span)).flatMap((r) => { const b = base.get(key(r)); return r.fit?.ok && b?.fit?.ok && lead(r, L) && lead(b, L) && keep(b, L) ? [[r, b]] : []; });
  const cell = (arm, block, span, axis, L, keep, truth = 'esa', tag = '') => {
    const p = pairs(arm, block, span, L, keep).filter(([r, b]) => errOf(r, L, axis, truth) !== null && errOf(b, L, axis, truth) !== null);
    const x = p.map(([r]) => errOf(r, L, axis, truth)), c = p.map(([, b]) => errOf(b, L, axis, truth));
    return { arm, block, span: span ?? 'all', axis, L, truth, n: p.length, rms_m: sig(rms(x)), rmsBase_m: sig(rms(c)), medianAbs_m: sig(median(x.map(Math.abs))), medianAbsBase_m: sig(median(c.map(Math.abs))), ratio: sig(rms(x) / rms(c)), ratioInterval: ratioCI(x, c, `${arm}|${block}|${span}|${axis}|${L}|${truth}|${tag}`) };
  };
  const primary = (b, L) => P.primary(b, L), all = () => true;
  const verdictOf = (arm, truth) => {
    const t = TL.map((L) => cell(arm, R.primaryBlock, R.primarySpan, 'T', L, primary, truth));
    const low = t.every((c) => c.rms_m <= R.removed.rmsAtMost[c.L]), below = t.every((c) => c.ratioInterval && c.ratioInterval[1] < R.removed.ratioIntervalBelow);
    const c72 = t.find((c) => c.L === R.reduced.lead_h);
    return { arm, truth, cells: t, verdict: low && below ? 'REMOVED' : c72.ratioInterval && c72.ratioInterval[1] < R.reduced.ratioIntervalBelow ? 'REDUCED' : 'NOT REMOVED' };
  };
  const grid = {};
  for (const arm of ['Y1', 'Y2', 'Yx']) { grid[arm] = {}; for (const block of config.arms[arm].blocks) for (const span of ['test', 'dev']) grid[arm][`${block}|${span}`] = ['R', 'T', 'N'].flatMap((axis) => LEADS.map((L) => cell(arm, block, span, axis, L, primary))); }
  const harmOf = (arm) => { const H = R.harm, cells = grid[arm][`${R.primaryBlock}|${R.primarySpan}`].filter((c) => (H.axes[c.axis] ?? []).includes(c.L) && c.ratioInterval && c.ratioInterval[0] > H.above); return { harm: cells.length > 0, cells: cells.map((c) => `${c.axis} ${c.L} h: ${c.ratio} [${c.ratioInterval.join(', ')}]`) }; };
  const verdict = Object.fromEntries(['Y1', 'Y2'].map((arm) => [arm, { esa: verdictOf(arm, 'esa'), gfz: verdictOf(arm, 'gfz'), allSamples: (() => { const t = TL.map((L) => cell(arm, R.primaryBlock, R.primarySpan, 'T', L, all, 'esa', 'all')); return { cells: t }; })(), ...harmOf(arm) }]));
  // T at 24 to 72 h against beta, on test: K per arm and block, and median T per signed beta bin at 72 h
  const inSpan = (m, block, span, keep, L) => [...m.values()].filter((r) => r.block === block && r.span === span && r.fit?.ok && lead(r, L) && keep(base.get(key(r)) ?? r, L));
  const tVsBeta = {};
  for (const [arm, m] of [['base', base], ['Y1', A.Y1], ['Y2', A.Y2], ['Yx', A.Yx]]) {
    tVsBeta[arm] = {};
    for (const block of Object.keys(config.blocks)) {
      if (arm === 'Yx' && block === 'FOC') continue;
      tVsBeta[arm][block] = { shape: TL.map((L) => shape(inSpan(m, block, 'test', primary, L), L)), bins: config.bins.map(([lo, hi]) => { const v = inSpan(m, block, 'test', primary, 72).filter((r) => r.betaDeg >= lo && r.betaDeg < hi); return { bin: [lo, hi], n: v.length, t72MedianM: sig(median(v.map((r) => errOf(r, 72, 'T')))), t72RmsM: sig(rms(v.map((r) => errOf(r, 72, 'T')))) }; }) };
    }
  }
  // per satellite on FOC, test, primary
  const perSatellite = config.blocks.FOC.map((norad) => {
    const row = { norad };
    for (const [arm, m] of [['base', base], ['Y1', A.Y1], ['Y2', A.Y2]]) row[arm] = Object.fromEntries(['R', 'T', 'N'].flatMap((axis) => TL.map((L) => [`${axis}${L}`, sig(rms([...m.values()].filter((r) => r.norad === norad && r.span === 'test' && r.fit?.ok && lead(r, L) && primary(base.get(key(r)), L)).map((r) => errOf(r, L, axis))), 4)])));
    row.y1Median = sig(median([...A.Y1.values()].filter((r) => r.norad === norad && r.fit?.ok).map((r) => r.fit.y0 * 1e9)), 3);
    return row;
  });
  // the fit itself, every window of the block, both spans
  const fit = {};
  for (const arm of ['Y1', 'Y2', 'Yx']) {
    fit[arm] = {};
    for (const block of config.arms[arm].blocks) {
      const p = [...A[arm].values()].filter((r) => r.block === block).flatMap((r) => { const b = base.get(key(r)); return r.fit?.ok && b?.fit?.ok ? [[r, b]] : []; });
      const ratio = p.map(([r, b]) => r.fit.reducedChiSquare / b.fit.reducedChiSquare), move = p.map(([r, b]) => Math.hypot(r.fit.state[0] - b.fit.state[0], r.fit.state[1] - b.fit.state[1], r.fit.state[2] - b.fit.state[2]));
      fit[arm][block] = { n: p.length, chi2Ratio: sig(median(ratio)), chi2RatioInterval: medianCI(ratio, `${arm}|${block}|chi2`), residualRmsM: sig(10 * Math.sqrt(median(p.map(([r]) => r.fit.reducedChiSquare)))), residualRmsBaseM: sig(10 * Math.sqrt(median(p.map(([, b]) => b.fit.reducedChiSquare)))), agomOverSeed: sig(median(p.map(([r]) => r.fit.agom / r.seed))), agomOverSeedBase: sig(median(p.map(([, b]) => b.fit.agom / b.seed))), stateMoveM: sig(median(move)), stateMoveIntervalM: medianCI(move, `${arm}|${block}|move`) };
    }
  }
  // Y1's fitted value: per block and |beta| bin, every converged window; its formal sigma and what it carries to T
  const y1 = {};
  for (const block of Object.keys(config.blocks)) {
    const v = [...A.Y1.values()].filter((r) => r.block === block && r.fit?.ok), onTest = v.filter((r) => r.span === 'test' && primary(base.get(key(r)), 72));
    const row = (list) => ({ n: list.length, y0MedianNmS2: sig(median(list.map((r) => r.fit.y0 * 1e9))), y0P5NmS2: sig(quantile(list.map((r) => r.fit.y0 * 1e9), 0.05)), y0P95NmS2: sig(quantile(list.map((r) => r.fit.y0 * 1e9), 0.95)), formalSigmaNmS2: sig(median(list.map((r) => r.fit.y0Sigma * 1e9))), corrY0Agom: sig(median(list.map((r) => r.fit.corrY0Agom)), 3) });
    y1[block] = { all: row(v), test: row(onTest), dev: row(v.filter((r) => r.span === 'dev' && primary(base.get(key(r)), 72))), bins: config.absBins.map(([lo, hi]) => ({ bin: [lo, hi], ...row(v.filter((r) => Math.abs(r.betaDeg) >= lo && Math.abs(r.betaDeg) < hi)) })), formalSigmaT: LEADS.map((L) => { const q = v.filter((r) => lead(r, L)); return { L, y1M: sig(median(q.map((r) => sigmaOf(r, L, 'T')))), baseM: sig(median(q.map((r) => sigmaOf(base.get(key(r)), L, 'T')).filter((x) => x !== null))) }; }) };
  }
  // controls on test
  const controls = Object.fromEntries(['IOV', 'GLONASS'].map((block) => {
    const c = grid.Y2[`${block}|test`].find((k) => k.axis === 'T' && k.L === R.controls.lead_h), [lo, hi] = R.controls.tRatioBand, cap = R.controls.valueAtMostNmS2;
    const y2 = values[block], y1m = y1[block].test.y0MedianNmS2, overlaps = c.ratioInterval && c.ratioInterval[1] >= lo && c.ratioInterval[0] <= hi;
    return [block, { y2ValueNmS2: y2, y1MedianNmS2: y1m, tRatio72: c.ratio, tRatio72Interval: c.ratioInterval, verdict: Math.abs(y2) <= cap && Math.abs(y1m) <= cap && overlaps ? 'DOES LITTLE' : 'LARGE' }];
  }));
  const yxCell = (block) => grid.Yx[`${block}|test`].find((k) => k.axis === 'T' && k.L === R.yx.lead_h);
  const yx = { IOV: yxCell('IOV'), GLONASS: yxCell('GLONASS'), verdict: (yxCell(R.yx.block).ratioInterval?.[0] ?? 0) >= R.yx.lowerBoundAtLeast ? 'BLOCK-SPECIFIC' : 'NOT BLOCK-SPECIFIC' };
  const v1 = verdict.Y1.esa.verdict, v2 = verdict.Y2.esa.verdict, outcomes = [];
  if (v1 === 'REMOVED' && v2 === 'REMOVED' && !verdict.Y1.harm && !verdict.Y2.harm && Object.values(controls).every((c) => c.verdict === 'DOES LITTLE')) outcomes.push(1);
  if (v2 === 'REMOVED' && v1 !== 'REMOVED') outcomes.push(2);
  if (v1 === 'REMOVED' && v2 !== 'REMOVED') outcomes.push(3);
  if (v1 === 'NOT REMOVED' && v2 === 'NOT REMOVED') outcomes.push(4);
  if ((v1 === 'REMOVED' && verdict.Y1.harm) || (v2 === 'REMOVED' && verdict.Y2.harm)) outcomes.push(5);
  if (v1 === 'REDUCED' || v2 === 'REDUCED') outcomes.push(6);
  if (Object.values(controls).some((c) => c.verdict === 'LARGE')) outcomes.push(7);
  if (yx.verdict !== 'BLOCK-SPECIFIC') outcomes.push(8);
  const design = (() => { const a = verdict.Y1.esa.cells.find((c) => c.L === R.design.lead_h).rms_m, b = verdict.Y2.esa.cells.find((c) => c.L === R.design.lead_h).rms_m; return { y1Rms72: a, y2Rms72: b, y1BetterByAtLeast20Percent: a <= (1 - R.design.y1BetterBy) * b }; })();
  const seconds = rows.flatMap((r) => (r.seconds ? [r.seconds] : []));
  const largest = (m, block) => [...m.values()].filter((r) => r.block === block && r.span === 'test' && r.fit?.ok && lead(r, 72)).sort((a, b) => Math.abs(errOf(b, 72, 'T')) - Math.abs(errOf(a, 72, 'T'))).slice(0, 5).map((r) => ({ norad: r.norad, E: r.E.slice(0, 10), betaDeg: sig(r.betaDeg, 3), t72m: sig(errOf(r, 72, 'T')), primary: primary(base.get(key(r)), 72), note: r.norad === 40001 && r.E.startsWith('2026-02-15') ? 'R855 event 2026-02-16, no notice lists it' : '' }));
  return {
    experiment: config.experiment, control, valuesNmS2: values, published: config.published, counts, verdict, design, controls, yx, outcomes, grid, tVsBeta, perSatellite, fit, y1,
    largest: { Y2FOC: largest(A.Y2, 'FOC'), Y1FOC: largest(A.Y1, 'FOC'), baseFOC: largest(base, 'FOC') },
    cost: { fitSecondsMedian: sig(median(seconds.map((s) => s.fit).filter(Number.isFinite))), forecastSecondsMedian: sig(median(seconds.map((s) => s.forecast).filter(Number.isFinite))), ffmRoundsMedian: median(rows.map((r) => r.fit?.ffmCalls).filter(Number.isFinite)), totalCpuHours: sig(seconds.reduce((t, s) => t + (s.fit ?? 0) + (s.forecast ?? 0), 0) / 3600) },
  };
}

const ci = (c) => (c ? `[${c[0]}, ${c[1]}]` : '-');
/** table.json as tables. */
export function renderTable(t) {
  const o = [`# ${t.experiment}: table`, '', 'Generated by score.mjs from the rows. Errors: forecast minus truth in the predicted RTN axes, m. Primary samples unless stated. Base is the stored SRP rows: G0 on Galileo, A1 on GLONASS. FFM: RK78, relative tolerance 1e-10, steps up to 120 s; fit track at 600 s; outputs at the leads.', ''];
  o.push('## Counts', '', '| arm | rows | converged | terminations | excluded | refused |', '| --- | ---: | ---: | --- | ---: | ---: |');
  for (const [a, c] of Object.entries(t.counts)) o.push(`| ${a} | ${c.rows} | ${c.converged} | ${JSON.stringify(c.terminations).replace(/"/g, '')} | ${c.excluded} | ${c.refused} |`);
  o.push('', '## Control, and the frozen values', '', `Base on FOC, test, 72 h: K = ${t.control.K_m} m (band ${t.control.band.join(' to ')}), R^2 ${t.control.R2} (at least ${t.control.r2AtLeast}), ${t.control.n} windows: ${t.control.pass ? 'PASS' : 'MISS'}.`, '', `Y2's values from dev, nm/s^2: ${Object.entries(t.valuesNmS2).map(([k, v]) => `${k} ${v}`).join(', ')}. Published, FOC: ${t.published.valueNmS2} +/- ${t.published.sigmaNmS2} in CODE's axis; the sign against FFM's is open.`, '');
  o.push('## Verdict on FOC, test span', '', '| arm | truth | L, h | n | RMS T, m | RMS base, m | median abs T, m | median abs base, m | ratio | interval | verdict |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |');
  for (const [a, v] of Object.entries(t.verdict)) for (const tr of ['esa', 'gfz']) for (const c of v[tr].cells) o.push(`| ${a} | ${tr} | ${c.L} | ${c.n} | ${c.rms_m} | ${c.rmsBase_m} | ${c.medianAbs_m} | ${c.medianAbsBase_m} | ${c.ratio} | ${ci(c.ratioInterval)} | ${v[tr].verdict} |`);
  o.push('', `HARM: ${Object.entries(t.verdict).map(([a, v]) => `${a} ${v.harm ? v.cells.join('; ') : 'none'}`).join('; ')}.`, `Fixed against fitted at 72 h: Y1 ${t.design.y1Rms72} m, Y2 ${t.design.y2Rms72} m; Y1 at least 20 % better: ${t.design.y1BetterByAtLeast20Percent ? 'yes' : 'no'}.`, '', `Plan's outcomes: ${t.outcomes.join(', ') || 'none'}.`, '');
  o.push('## Controls, test span', '', '| block | Y2 value, nm/s^2 | Y1 median, nm/s^2 | Y2 T ratio at 72 h | interval | verdict |', '| --- | ---: | ---: | ---: | --- | --- |');
  for (const [b, c] of Object.entries(t.controls)) o.push(`| ${b} | ${c.y2ValueNmS2} | ${c.y1MedianNmS2} | ${c.tRatio72} | ${ci(c.tRatio72Interval)} | ${c.verdict} |`);
  o.push('', `Yx, FOC's value where it does not belong: IOV T RMS at 72 h ${t.yx.IOV.rms_m} m against ${t.yx.IOV.rmsBase_m} m, ratio ${t.yx.IOV.ratio} ${ci(t.yx.IOV.ratioInterval)}; GLONASS ${t.yx.GLONASS.rms_m} m against ${t.yx.GLONASS.rmsBase_m} m, ratio ${t.yx.GLONASS.ratio} ${ci(t.yx.GLONASS.ratioInterval)}: ${t.yx.verdict}.`, '');
  o.push('## Every axis and lead', '', '| arm | block | span | axis | L, h | n | RMS, m | RMS base, m | ratio | interval |', '| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const [a, g2] of Object.entries(t.grid)) for (const [k, cells] of Object.entries(g2)) { const [b, s] = k.split('|'); for (const c of cells) o.push(`| ${a} | ${b} | ${s} | ${c.axis} | ${c.L} | ${c.n} | ${c.rms_m} | ${c.rmsBase_m} | ${c.ratio} | ${ci(c.ratioInterval)} |`); }
  o.push('', '## T against beta, test span', '', '| arm | block | L, h | n | K, m | R^2 | residual RMS, m | T RMS, m |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [a, bs] of Object.entries(t.tVsBeta)) for (const [b, v] of Object.entries(bs)) for (const s of v.shape) o.push(`| ${a} | ${b} | ${s.L} | ${s.n} | ${s.K_m} | ${s.R2} | ${s.residualRmsM} | ${s.tRmsM} |`);
  o.push('', 'Median T at 72 h per signed beta bin (n):', '', `| arm | block | ${t.tVsBeta.base.FOC.bins.map((b) => `${b.bin[0]} to ${b.bin[1]}`).join(' | ')} |`, `| --- | --- | ${t.tVsBeta.base.FOC.bins.map(() => '---:').join(' | ')} |`);
  for (const [a, bs] of Object.entries(t.tVsBeta)) for (const [b, v] of Object.entries(bs)) o.push(`| ${a} | ${b} | ${v.bins.map((x) => (x.n ? `${x.t72MedianM} (${x.n})` : '-')).join(' | ')} |`);
  o.push('', '## FOC per satellite, test span, RMS in m', '', '| NORAD | Y1 median Y0, nm/s^2 | T72 base, Y1, Y2 | T24 base, Y1, Y2 | R72 base, Y1, Y2 | N72 base, Y1, Y2 |', '| ---: | ---: | --- | --- | --- | --- |');
  for (const s of t.perSatellite) o.push(`| ${s.norad} | ${s.y1Median} | ${s.base.T72}, ${s.Y1.T72}, ${s.Y2.T72} | ${s.base.T24}, ${s.Y1.T24}, ${s.Y2.T24} | ${s.base.R72}, ${s.Y1.R72}, ${s.Y2.R72} | ${s.base.N72}, ${s.Y1.N72}, ${s.Y2.N72} |`);
  o.push('', '## The fit itself, every window of the block', '', '| arm | block | n | chi2 ratio | interval | residual, base to arm, m | AGOM/seed, base to arm | state move, m | interval, m |', '| --- | --- | ---: | ---: | --- | --- | --- | ---: | --- |');
  for (const [a, bs] of Object.entries(t.fit)) for (const [b, k] of Object.entries(bs)) o.push(`| ${a} | ${b} | ${k.n} | ${k.chi2Ratio} | ${ci(k.chi2RatioInterval)} | ${k.residualRmsBaseM} to ${k.residualRmsM} | ${k.agomOverSeedBase} to ${k.agomOverSeed} | ${k.stateMoveM} | ${ci(k.stateMoveIntervalM)} |`);
  o.push('', '## Y1\'s fitted value', '', '| block | set | n | median, nm/s^2 | p5 to p95, nm/s^2 | formal sigma, nm/s^2 | corr with AGOM |', '| --- | --- | ---: | ---: | --- | ---: | ---: |');
  for (const [b, v] of Object.entries(t.y1)) for (const [name, r] of [['test', v.test], ['dev', v.dev], ['all', v.all], ...v.bins.map((x) => [`|beta| ${x.bin[0]}-${x.bin[1]}`, x])]) if (r.n) o.push(`| ${b} | ${name} | ${r.n} | ${r.y0MedianNmS2} | ${r.y0P5NmS2} to ${r.y0P95NmS2} | ${r.formalSigmaNmS2} | ${r.corrY0Agom} |`);
  o.push('', 'Formal T sigma carried to each lead, median, Y1 against base, m:', '', '| block | 1 h | 6 h | 12 h | 24 h | 48 h | 72 h |', '| --- | --- | --- | --- | --- | --- | --- |');
  for (const [b, v] of Object.entries(t.y1)) o.push(`| ${b} | ${v.formalSigmaT.map((s) => `${s.y1M} / ${s.baseM}`).join(' | ')} |`);
  o.push('', '## Five largest |T| at 72 h, test span', '', '| set | NORAD | cutoff | beta | T, m | primary | note |', '| --- | ---: | --- | ---: | ---: | --- | --- |');
  for (const [name, list] of Object.entries(t.largest)) for (const r of list) o.push(`| ${name} | ${r.norad} | ${r.E} | ${r.betaDeg} | ${r.t72m} | ${r.primary ? 'yes' : 'no'} | ${r.note} |`);
  return `${o.join('\n')}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  registered();
  const control = buildControl(new Opened());
  console.log(JSON.stringify({ control }, null, 1));
  if (args.control) process.exit(control.pass ? 0 : 3);
  if (!control.pass) { console.error('the control missed: stop before reading anything else and ask the coordinator'); process.exit(3); }
  const table = buildTable(new Opened());
  fs.mkdirSync(results, { recursive: true });
  fs.writeFileSync(path.join(results, 'table.json'), `${JSON.stringify(table, null, 1)}\n`);
  fs.writeFileSync(path.join(results, 'table.md'), renderTable(table));
  console.log(`wrote ${path.join(results, 'table.json')} and table.md`);
}
