#!/usr/bin/env node
// E7v2 step 40 (PLAN.md sections 8 and 9): statistics of one step-20 batch.
//  - Primary, per class: at 72 h the ratio of median 3D errors of each family
//    member over S (failures unbounded), object-blocked bootstrap CI and
//    p-value, Holm within the class, Bonferroni bound for "meaningfully".
//  - Secondary: every horizon; against S-debiased and H-epoch; increments;
//    E7's two-way bootstrap; median of per-sample ratios; ratio of 95th
//    percentiles; object classes and subclasses; maneuver classes.
//  - Operational acceptance per class, product and horizon.
//  - Pseudo-truth on truth-rich classes: its own error, its along-track
//    correlation with S's error, and the bias factor (V/S under pseudo-truth
//    over V/S under truth) with an object-blocked CI.
//  - Covariance realism (truth-rich, H-arc-v2): mean d^2/3 and the fraction
//    within chi^2_3's 95th percentile.
// Writes metrics.json and REPORT.md (aggregates only).
//
//   node experiments/e7v2-omm-history-handoff/steps/40-evaluate.mjs --window W --batch ID
import path from 'node:path';
import { parseArgs } from 'node:util';
import { startRun, repoRoot } from '../../../harness/provenance.mjs';
import { readGnssMetadata } from '../../e7-full-force-handoff/gnss.mjs';
import { bootstrap } from '../../e7-full-force-handoff/analysis.mjs';
import { assertWindowReadable, config, configPath } from '../common.mjs';
import { acceptance, answerOf, holm, loadBatch, norm, paired, ratio, scoring } from '../analysis.mjs';

const { values } = parseArgs({ options: { window: { type: 'string' }, batch: { type: 'string' }, modules: { type: 'string' } } });
const freezeCommit = assertWindowReadable(values.window);
const run = startRun({ experiment: config.experiment, step: `40-evaluate-${values.window}-${values.batch}`, configPath, modulesDir: values.modules ?? repoRoot, args: values });
run.manifest.freezeCommit = freezeCommit;
const { rows, runs } = loadBatch(values.window, values.batch);
const st = config.statistics, d = config.decision, H = d.primaryHorizonHours;
const gnss = readGnssMetadata(config.inputs.gnssMetadata);
const median = (xs) => { const s = xs.filter((x) => !Number.isNaN(x)).sort((a, b) => a - b); return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2 : null; };
const variantsOf = (rs) => [...new Set(rs.flatMap((r) => [...Object.keys(r.errors), ...Object.keys(r.failures).filter((k) => k !== 'maneuvers')]))];
const maneuverClass = (r) => (r.maneuvers?.inSpan?.length ? 'maneuver in the prediction span' : r.maneuvers?.beforeCutoff?.length ? 'maneuver before the cutoff' : r.failures?.maneuvers ? 'detection failed' : 'no maneuver detected');
const systemOf = (r) => ({ G: 'GPS', R: 'GLONASS', E: 'Galileo', C: 'BeiDou', J: 'QZSS' }[gnss.at(r.norad, Date.parse(`${r.epoch.slice(0, 19)}Z`))?.svn?.[0]] ?? 'other');
const subclassOf = (r) => (r.kind === 'omm' ? r.subclass : config.classes[r.cls].select ? systemOf(r) : 'all');

// One comparison (variant over comparator) at horizon h for a set of rows.
function compare(rs, variant, comparator, kind, h, extra = {}) {
  const samples = paired(rs, () => true, [comparator, variant], kind, h);
  if (samples.length < 3 || new Set(samples.map((s) => s.norad)).size < 2) return { n: samples.length, objects: new Set(samples.map((s) => s.norad)).size, insufficient: true };
  const r = ratio(samples, 1, 0, extra);
  const perSample = median(samples.map((s) => (s.errors[1] ? norm(s.errors[1]) : Infinity) / norm(s.errors[0])));
  const q95 = (j) => { const v = samples.map((s) => (s.errors[j] ? norm(s.errors[j]) : Infinity)).sort((a, b) => a - b); return v[Math.min(v.length - 1, Math.floor(0.95 * (v.length - 1) + 0.5))]; };
  return { ...r, medianPerSampleRatio: perSample, ratio95: q95(1) / q95(0) };
}

const metrics = { window: values.window, batch: values.batch, runs, freezeCommit, statistics: st, decision: d, classes: {} };
const report = [];
for (const [cls, c] of Object.entries(config.classes)) {
  const rs = rows.filter((r) => r.cls === cls);
  if (!rs.length) continue;
  const kind = c.kind === 'truth' ? 'truth' : 'pseudo';
  const hours = kind === 'truth' ? config.horizonsHours : config.pseudoTruth.horizonsHours;
  const variants = variantsOf(rs);
  const m = { kind, confirmatory: c.confirmatory?.[values.window] ?? null, samples: rs.length, objects: new Set(rs.map((r) => r.norad)).size, family: {}, secondary: {}, acceptance: {}, subclasses: {}, maneuvers: {} };
  // Primary family.
  const members = d.family.filter((v) => variants.includes(v));
  const results = members.map((v) => ({ v, r: compare(rs, v, 'S', kind, H) }));
  const eligible = results.filter(({ v, r }) => !r.insufficient && (v !== 'H-arc-v2-DCA' || r.n >= st.dcaMinimumSamples));
  const adjusted = holm(eligible.map(({ r }) => r.p));
  eligible.forEach(({ v, r }, i) => {
    const bonf = compare(rs, v, 'S', kind, H, { confidence: 1 - st.alpha / eligible.length });
    m.family[v] = { ...r, holmP: adjusted[i], bonferroni: { lower: bonf.lower, upper: bonf.upper, confidence: 1 - st.alpha / eligible.length }, answer: answerOf(r, adjusted[i], bonf) };
  });
  for (const { v, r } of results.filter((x) => !eligible.includes(x))) m.family[v] = { ...r, answer: 'not tested (too few samples)' };
  // Two-way sensitivity at 72 h.
  for (const v of Object.keys(m.family)) if (!m.family[v].insufficient) {
    const tw = compare(rs, v, 'S', kind, H, { days: true });
    m.family[v].twoWay = { lower: tw.lower, upper: tw.upper, p: tw.p, changesAnswer: (tw.upper < 1) !== (m.family[v].upper < 1) || (tw.lower > 1) !== (m.family[v].lower > 1) };
  }
  // Secondary comparisons at every horizon.
  const pairs = [...variants.filter((v) => v !== 'S').map((v) => [v, 'S']), ...['H-arc-v2', 'H-arc-v2-debiased', 'H-arc-v2-DCA'].filter((v) => variants.includes(v)).flatMap((v) => [[v, 'S-debiased'], [v, 'H-epoch']]),
    ['H-arc-v2-debiased', 'H-arc-v2'], ['H-arc-v2-DCA', 'H-arc-v2-debiased']].filter(([a, b]) => variants.includes(a) && variants.includes(b));
  for (const [a, b] of pairs) m.secondary[`${a} / ${b}`] = Object.fromEntries(hours.map((h) => [h, compare(rs, a, b, kind, h)]));
  // Subclasses and maneuver classes at 72 h.
  for (const [label, keyOf, into] of [['subclass', subclassOf, m.subclasses], ['maneuvers', maneuverClass, m.maneuvers]]) {
    const groups = new Map();
    for (const r of rs) { const k = keyOf(r); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); }
    for (const [k, g] of groups) into[k] = { samples: g.length, objects: new Set(g.map((r) => r.norad)).size, ...Object.fromEntries(members.map((v) => [v, compare(g, v, 'S', kind, H)])) };
  }
  // Operational acceptance.
  for (const v of variants) {
    m.acceptance[v] = Object.fromEntries(hours.map((h) => {
      const vals = [];
      for (const r of rs) {
        const s = scoring(r, kind), k = s.hours.indexOf(h);
        if (k < 0 || !r[s.list].S?.[k] || r.skips?.[v]) continue;
        if (r.failures?.[v]) vals.push(Infinity);
        else if (r[s.list][v]?.[k]) vals.push(norm(r[s.list][v][k]));
      }
      return [h, acceptance(vals)];
    }));
  }
  // Pseudo-truth on truth-rich classes.
  if (c.kind === 'truth') {
    const ph = config.pseudoTruth.horizonsHours;
    m.pseudoTruth = { horizons: {} };
    ph.forEach((h, k) => {
      const own = rs.map((r) => r.floor?.pseudoTruthError?.[k]).filter(Boolean);
      const both = rs.filter((r) => r.floor?.pseudoTruthError?.[k] && r.floor?.sAtPseudoTruthEpoch?.[k]);
      const corr = (a) => {
        const x = both.map((r) => r.floor.sAtPseudoTruthEpoch[k][a]), y = both.map((r) => r.floor.pseudoTruthError[k][a]);
        const mx = x.reduce((s, v) => s + v, 0) / x.length, my = y.reduce((s, v) => s + v, 0) / y.length;
        let sxy = 0, sxx = 0, syy = 0;
        for (let i = 0; i < x.length; ++i) { sxy += (x[i] - mx) * (y[i] - my); sxx += (x[i] - mx) ** 2; syy += (y[i] - my) ** 2; }
        return x.length > 2 ? sxy / Math.sqrt(sxx * syy) : null;
      };
      m.pseudoTruth.horizons[h] = {
        n: own.length, medianOwnError: median(own.map(norm)), rmsOwnError: own.length ? Math.sqrt(own.reduce((s, e) => s + norm(e) ** 2, 0) / own.length) : null,
        meanOwnErrorRtn: [0, 1, 2].map((a) => (own.length ? own.reduce((s, e) => s + e[a], 0) / own.length : null)),
        correlationWithS: { R: corr(0), T: corr(1), N: corr(2), n: both.length },
        medianSAgainstTruth: median(both.map((r) => norm(r.floor.sAtPseudoTruthEpoch[k]))),
      };
    });
    // Bias factor at 72 h: (V/S under pseudo-truth) / (V/S under truth), same samples.
    m.pseudoTruth.biasFactor = {};
    const kt = config.horizonsHours.indexOf(H), kp = ph.indexOf(H);
    for (const v of members) {
      const samples = rs.filter((r) => r.errors.S?.[kt] && r.pseudoErrors?.S?.[kp] && r.errors[v]?.[kt] && r.pseudoErrors?.[v]?.[kp])
        .map((r) => ({ norad: r.norad, day: r.epoch.slice(0, 10), errors: [r.errors[v][kt], r.errors.S[kt], r.pseudoErrors[v][kp], r.pseudoErrors.S[kp]] }));
      if (samples.length < 3) { m.pseudoTruth.biasFactor[v] = { n: samples.length, insufficient: true }; continue; }
      const wq = (vals, order, w, q) => { let t = 0; for (const i of order) t += w[i]; let acc = 0; for (const i of order) { acc += w[i]; if (acc >= q * t) return vals[i]; } return vals[order.at(-1)]; };
      const med = (j) => (vals, orders, w) => wq(vals[j], orders[j], w, 0.5);
      const b = bootstrap(samples, { factor: (vals, orders, w) => (med(2)(vals, orders, w) / med(3)(vals, orders, w)) / (med(0)(vals, orders, w) / med(1)(vals, orders, w)),
        truth: (vals, orders, w) => med(0)(vals, orders, w) / med(1)(vals, orders, w), pseudo: (vals, orders, w) => med(2)(vals, orders, w) / med(3)(vals, orders, w) },
      { resamples: st.bootstrapResamples, seed: st.bootstrapSeed, confidence: st.confidence, days: false });
      m.pseudoTruth.biasFactor[v] = { n: samples.length, objects: new Set(samples.map((s) => s.norad)).size, factor: b.factor, ratioTruth: b.truth, ratioPseudo: b.pseudo };
    }
    // Covariance realism.
    const d2 = rs.map((r) => r.d2?.['H-arc-v2']).filter(Boolean);
    m.covariance = Object.fromEntries(config.horizonsHours.map((h, k) => {
      const xs = d2.map((x) => x[k]).filter((x) => Number.isFinite(x));
      return [h, { n: xs.length, meanD2over3: xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length / 3 : null, within95: xs.length ? xs.filter((x) => x <= 7.8147).length / xs.length : null }];
    }));
  }
  metrics.classes[cls] = m;
}

// REPORT.md: the 72 h answer per class, then the tables.
const f = (x, p = 3) => (x === null || x === undefined || Number.isNaN(x) ? '–' : !Number.isFinite(x) ? '∞' : Math.abs(x) >= 100 ? x.toFixed(0) : x.toPrecision(p));
report.push(`# E7v2 — ${values.window} window, batch ${values.batch}`, '', `Runs: ${runs.length} shards. Freeze commit: ${freezeCommit ?? 'not frozen (validation)'}.`, '');
report.push('## The 72 h answer', '', '| Class | Cell | Product | n (objects) | Ratio to S | 95 % CI | Holm p | Answer |', '| --- | --- | --- | --- | --- | --- | --- | --- |');
for (const [cls, m] of Object.entries(metrics.classes)) {
  for (const [v, r] of Object.entries(m.family)) report.push(`| ${cls} | ${m.confirmatory === null ? '' : m.confirmatory ? 'confirmatory' : 'read (reported)'} | ${v} | ${r.n} (${r.objects}) | ${f(r.estimate)} | ${f(r.lower)}–${f(r.upper)} | ${f(r.holmP, 2)} | ${r.answer} |`);
}
report.push('');
for (const [cls, m] of Object.entries(metrics.classes)) {
  report.push(`## ${cls}`, '', `${m.samples} samples, ${m.objects} objects; scored against ${m.kind === 'truth' ? 'precise orbits' : 'later OMMs'}.`, '');
  report.push('| Comparison | ' + (m.kind === 'truth' ? config.horizonsHours : config.pseudoTruth.horizonsHours).map((h) => `${h} h`).join(' | ') + ' |');
  report.push('| --- |' + (m.kind === 'truth' ? config.horizonsHours : config.pseudoTruth.horizonsHours).map(() => ' --- |').join(''));
  for (const [k, byH] of Object.entries(m.secondary)) report.push(`| ${k} | ${Object.values(byH).map((r) => (r.insufficient ? '–' : `${f(r.estimate)} [${f(r.lower)}, ${f(r.upper)}]`)).join(' | ')} |`);
  report.push('', '| Product | ' + Object.keys(Object.values(m.acceptance)[0] ?? {}).map((h) => `${h} h median / 95th / unbounded`).join(' | ') + ' |');
  report.push('| --- |' + Object.keys(Object.values(m.acceptance)[0] ?? {}).map(() => ' --- |').join(''));
  for (const [v, byH] of Object.entries(m.acceptance)) report.push(`| ${v} | ${Object.values(byH).map((a) => `${f(a.median)} / ${f(a.p95)} / ${a.unbounded} of ${a.attempted}`).join(' | ')} |`);
  if (m.pseudoTruth) {
    report.push('', 'Pseudo-truth (later OMMs) against truth:', '', '| h | n | its median error (m) | corr. with S along-track | S against truth (median, m) |', '| --- | --- | --- | --- | --- |');
    for (const [h, p] of Object.entries(m.pseudoTruth.horizons)) report.push(`| ${h} | ${p.n} | ${f(p.medianOwnError)} | ${f(p.correlationWithS.T, 2)} | ${f(p.medianSAgainstTruth)} |`);
    report.push('', '| Product | bias factor at 72 h (pseudo / truth) | ratio under truth | ratio under pseudo-truth |', '| --- | --- | --- | --- |');
    for (const [v, b] of Object.entries(m.pseudoTruth.biasFactor)) if (!b.insufficient) report.push(`| ${v} | ${f(b.factor.estimate)} [${f(b.factor.lower)}, ${f(b.factor.upper)}] | ${f(b.ratioTruth.estimate)} | ${f(b.ratioPseudo.estimate)} |`);
  }
  report.push('');
}
run.write('metrics.json', metrics);
run.write('REPORT.md', `${report.join('\n')}\n`);
run.finish({ classes: Object.keys(metrics.classes).length });
console.log(`[${run.id}] ${Object.keys(metrics.classes).length} classes -> ${path.relative(process.cwd(), run.dir)}`);
