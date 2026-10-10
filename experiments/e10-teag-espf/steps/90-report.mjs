// E10 report: metrics.json and REPORT.md under results/e10/test from the test
// runs, by PLAN.md sections 4 and 5 (and amendment 1). Statistics only; no
// element set and no per-sample table derived from one is written.
//   node steps/90-report.mjs --partb <run>[,<run>] [--partc <run>] [--parta <run>] [--enclosure <run>] [--partd <run>]
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../common.mjs';
import { arg } from '../jobs.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { quantile } from '../report.mjs';
import { readJobs, scoredRows } from '../score.mjs';
import { boot, wmedian, wratio, holm, regionSummary, detection, runSummary } from '../report.mjs';

const ids = (name) => (arg(name) ?? '').split(',').filter(Boolean);
const selection = JSON.parse(fs.readFileSync(path.join(repoRoot, 'results/e10/selection.json'), 'utf8'));
const E26 = selection.chosen.pcrbTriggerVariant, E25T = selection.chosen.decayRateVariant;
const label = (v) => (v === E26 ? 'E26' : v === E25T ? 'E25T' : v);
const ORDER = ['E26', 'E25', 'E25T', 'EKF', 'UKF', 'BLS', 'SMF'];
const outDir = path.join(repoRoot, 'results/e10/test');
fs.mkdirSync(path.join(repoRoot, 'results/e10/manifests'), { recursive: true });
fs.mkdirSync(outDir, { recursive: true });
const manifests = {};
const readManifest = (id) => { const m = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', id, 'manifest.json'), 'utf8')); if (m.config.frozen !== true) throw new Error(`${id} ran with an unfrozen config`); manifests[id] = m; return m; };
const metrics = { selection: selection.chosen, thresholds: selection.thresholds, runs: {} };
const finite = (x) => (Number.isFinite(x) ? x : null);
const infIfFailed = (s) => (s.failed ? Infinity : s.rmsPos);

// ── Part B ──
const partbIds = ids('partb');
partbIds.forEach(readManifest);
metrics.runs.partB = partbIds;
const testSeeds = new Set(config.partB.testSeeds.map((s) => s.id));
const B = readJobs(partbIds).filter((j) => testSeeds.has(j.seed)).map((j) => ({ ...j, id: label(j.variant) }));
const CASES = Object.keys(config.partB.cases);
const byKey = new Map(B.map((j) => [`${j.id}|${j.case}|${j.seed}`, j]));
metrics.partB = { variants: {} };
for (const v of ORDER) {
  const perCase = {};
  for (const c of CASES) {
    const jobs = B.filter((j) => j.id === v && j.case === c);
    if (!jobs.length) continue;
    const runs = jobs.map((j) => ({ s: runSummary(j), r: regionSummary(scoredRows(j)), rows: scoredRows(j) }));
    const cells = runs.map((x) => ({ row: x.s.seed, col: 0, value: infIfFailed(x.s) }));
    const contain = (key) => {
      const cs = runs.map((x) => { const v2 = x.rows.filter((r) => r[key] !== undefined); return { row: x.s.seed, col: 0, a: v2.filter((r) => r[key]).length, b: v2.length }; }).filter((c2) => c2.b > 0);
      return cs.length ? boot(cs, wratio) : null;
    };
    perCase[c] = {
      runs: runs.length, failures: runs.filter((x) => x.s.failed).length,
      rmsPosM: boot(cells, wmedian), p95PosM: quantile(runs.map((x) => x.s.p95Pos).filter(Number.isFinite), 0.5), maxPosM: Math.max(...runs.map((x) => x.s.maxPos).filter(Number.isFinite)),
      rmsVelMps: quantile(runs.map((x) => x.s.rmsVel).filter(Number.isFinite), 0.5),
      containment: { set: contain('inSet'), alpha005: contain('inAlpha0.05'), alpha05: contain('inAlpha0.5'), p95: contain('in95'), p997: contain('in997') },
      size: { medianLogDet: quantile(runs.map((x) => x.r.medianLogDet).filter(Number.isFinite), 0.5), medianExtentsM: [0, 1, 2].map((i) => quantile(runs.map((x) => x.r.medianExtentsM[i]).filter(Number.isFinite), 0.5)) },
      cost: { hpopCalls: quantile(runs.map((x) => x.s.hpop), 0.5), seconds: quantile(runs.map((x) => x.s.seconds), 0.5) },
    };
  }
  metrics.partB.variants[v] = perCase;
}
// Ratios to the UKF (H1, H2 and the descriptive ones).
const ratioCells = (v, cases) => {
  const cells = [];
  for (const c of cases) for (const seed of testSeeds) {
    const a = byKey.get(`${v}|${c}|${seed}`), u = byKey.get(`UKF|${c}|${seed}`);
    if (!a || !u) continue;
    const sa = runSummary(a), su = runSummary(u);
    cells.push({ row: seed, col: 0, value: infIfFailed(sa) / infIfFailed(su) });
  }
  return cells;
};
metrics.partB.ratioToUkf = {};
for (const v of ORDER.filter((x) => x !== 'UKF')) metrics.partB.ratioToUkf[v] = { B1: boot(ratioCells(v, ['B1-nominal']), wmedian), 'B2-B8': boot(ratioCells(v, CASES.slice(1)), wmedian) };
// Detection (B4, B5; false alarms on B1 and before the events).
const statistics = { 'E26 q_min': ['E26', 'qMin', 'E26.qMin'], 'E26 Choquet surprisal': ['E26', 'choquet', 'E26.choquet'], 'UKF NIS': ['UKF', 'nis', 'UKF.nis'], 'EKF NIS': ['EKF', 'nis', 'EKF.nis'], 'E25 inconsistency': ['E25', 'inconsistent', null], 'E25T inconsistency': ['E25T', 'inconsistent', null], 'SMF inconsistency': ['SMF', 'inconsistent', null] };
metrics.partB.detection = {};
for (const [name, [v, field, key]] of Object.entries(statistics)) {
  const threshold = key ? selection.thresholds[key].p99 : null;
  const entry = { threshold };
  for (const c of ['B4-manoeuvre', 'B5-area-change']) {
    const eventHours = config.partB.cases[c].eventHours;
    const d = B.filter((j) => j.id === v && j.case === c).map((j) => detection(j, field, threshold, j.epochMs + eventHours * 3600e3));
    entry[c] = { runs: d.length, detected: d.filter((x) => x.detected).length, medianDelaySeconds: d.some((x) => x.detected) ? quantile(d.filter((x) => x.detected).map((x) => x.delaySeconds), 0.5) : null, falseAlarmsBefore: d.reduce((a, x) => a + x.falseAlarms, 0), epochsBefore: d.reduce((a, x) => a + x.epochsBefore, 0) };
  }
  const nominal = B.filter((j) => j.id === v && j.case === 'B1-nominal').map((j) => detection(j, field, threshold, null));
  entry['B1-nominal'] = { falseAlarms: nominal.reduce((a, x) => a + x.falseAlarms, 0), epochs: nominal.reduce((a, x) => a + x.epochsBefore, 0) };
  metrics.partB.detection[name] = entry;
}

// ── Part C ──
const partcIds = ids('partc');
partcIds.forEach(readManifest);
metrics.runs.partC = partcIds;
const C = readJobs(partcIds).map((j) => ({ ...j, id: label(j.variant) }));
metrics.partC = { variants: {} };
const arcKey = (j) => `${j.norad}|${j.start}`;
for (const sensitivity of ['primary', 'corr']) {
  for (const v of ORDER) {
    const jobs = C.filter((j) => j.id === v && j.sensitivity === sensitivity);
    if (!jobs.length) continue;
    const s = jobs.map((j) => ({ j, s: runSummary(j, { warmupHours: 0, failureKm: config.partC.failureKm }) }));
    const finalRatio = s.map(({ j, s: x }) => ({ row: j.norad, col: j.start, value: x.failed ? Infinity : j.rows.at(-1).pos / j.setErrors.at(-1) }));
    const contain = (key) => { const cs = s.map(({ j }) => { const v2 = j.rows.filter((r) => r[key] !== undefined); return { row: j.norad, col: j.start, a: v2.filter((r) => r[key]).length, b: v2.length }; }).filter((c2) => c2.b > 0); return cs.length ? boot(cs, wratio) : null; };
    metrics.partC.variants[`${v}|${sensitivity}`] = {
      arcs: jobs.length, satellites: new Set(jobs.map((j) => j.norad)).size, failures: s.filter((x) => x.s.failed).length,
      finalErrorM: quantile(s.map(({ j }) => j.rows.at(-1)?.pos).filter(Number.isFinite), 0.5), finalSetErrorM: quantile(jobs.map((j) => j.setErrors.at(-1)), 0.5),
      finalRatioToSet: boot(finalRatio, wmedian, { nullValue: 1, side: 'less' }),
      containment: { set: contain('inSet'), alpha005: contain('inAlpha0.05'), alpha05: contain('inAlpha0.5'), p95: contain('in95'), p997: contain('in997') },
      medianExtentsM: [0, 1, 2].map((i) => quantile(jobs.flatMap((j) => j.rows.map((r) => r.extents?.[i])).filter(Number.isFinite), 0.5)),
      cost: { hpopCalls: quantile(s.map((x) => x.s.hpop), 0.5), seconds: quantile(s.map((x) => x.s.seconds), 0.5) },
    };
  }
}

// ── Hypotheses ──
const H = {};
H.H1 = boot(ratioCells('E26', ['B1-nominal']), wmedian, { nullValue: 1, side: 'less' });
H.H2 = boot(ratioCells('E26', CASES.slice(1)), wmedian, { nullValue: 1, side: 'less' });
{
  const cells = B.filter((j) => j.id === 'E26' && j.case === 'B1-nominal').map((j) => { const r = scoredRows(j).filter((x) => x.inSet !== undefined); return { row: j.seed, col: 0, a: r.filter((x) => x.inSet).length, b: r.length }; });
  H.H3 = boot(cells, wratio, { nullValue: 0.95, side: 'greater' });
}
{
  const jobs = C.filter((j) => j.id === 'E26' && j.sensitivity === 'primary');
  H.H4 = jobs.length ? boot(jobs.map((j) => ({ row: j.norad, col: j.start, value: runSummary(j, { warmupHours: 0, failureKm: config.partC.failureKm }).failed ? Infinity : j.rows.at(-1).pos / j.setErrors.at(-1) })), wmedian, { nullValue: 1, side: 'less' }) : null;
  H.H5 = jobs.length ? boot(jobs.map((j) => ({ row: j.norad, col: j.start, a: j.rows.filter((r) => r.inSet).length, b: j.rows.length })), wratio, { nullValue: 0.95, side: 'greater' }) : null;
}
const family = holm(Object.entries(H).filter(([, h]) => h).map(([id, h]) => ({ id, p: h.p })));
metrics.hypotheses = Object.fromEntries(Object.entries(H).map(([id, h]) => [id, { statistic: h, holm: family.find((t) => t.id === id) ?? null, supported: !!family.find((t) => t.id === id)?.reject }]));

// ── Part A ──
const partaIds = ids('parta');
partaIds.forEach(readManifest);
metrics.runs.partA = partaIds;
const A = readJobs(partaIds).map((j) => ({ ...j, id: label(j.variant) }));
metrics.partA = {};
for (const j of A) {
  const tail = j.case.startsWith('A3') ? 3600e3 : 86400e3, end = j.rows.at(-1)?.ms ?? 0;
  const rms = (rows) => (rows.length ? Math.sqrt(rows.reduce((a, r) => a + r.pos * r.pos, 0) / rows.length) : null);
  (metrics.partA[j.case] ??= {})[j.id] = { epochs: j.rows.length, observations: j.observations, failure: j.failure, rmsArcM: rms(j.rows), rmsFinalM: rms(j.rows.filter((r) => r.ms >= end - tail)), finalM: j.rows.at(-1)?.pos ?? null, hpopCalls: j.calls?.hpop, seconds: j.seconds };
}

// ── Enclosure ──
const encIds = ids('enclosure');
encIds.forEach(readManifest);
metrics.runs.enclosure = encIds;
const EN = readJobs(encIds);
metrics.enclosure = {};
for (const v of [...new Set(EN.map((j) => j.variant))]) {
  const steps = EN.filter((j) => j.variant === v).flatMap((j) => j.steps.map((s) => ({ ...s, seed: j.seed })));
  const e1Out = steps.reduce((a, s) => a + s.e1.outside, 0), e2Out = steps.reduce((a, s) => a + (s.e2?.outside ?? 0), 0);
  metrics.enclosure[label(v)] = {
    steps: steps.length, e1: { outside: e1Out, points: steps.reduce((a, s) => a + s.points, 0), maxRadius: Math.max(...steps.map((s) => s.e1.maxRadius)), stepsWithOutside: steps.filter((s) => s.e1.outside > 0).length },
    e2: steps.some((s) => s.e2) ? { outside: e2Out, survivors: steps.reduce((a, s) => a + (s.e2?.survivors ?? 0), 0), maxRadius: Math.max(...steps.map((s) => s.e2?.maxRadius ?? 0)), medianLogVolumeRatio: quantile(steps.map((s) => s.e2?.logVolumeRatio).filter(Number.isFinite), 0.5) } : null,
    byKind: Object.fromEntries(['gap', 'within'].map((k) => [k, { steps: steps.filter((s) => s.kind === k).length, outside: steps.filter((s) => s.kind === k).reduce((a, s) => a + s.e1.outside, 0), maxRadius: Math.max(...steps.filter((s) => s.kind === k).map((s) => s.e1.maxRadius)) }])),
    verdict: steps.length ? (e1Out === 0 && e2Out === 0 ? 'encloses (at every tested step)' : 'summarizes the sampled support') : 'not run',
  };
}

// ── Part D ──
const partdIds = ids('partd');
partdIds.forEach(readManifest);
metrics.runs.partD = partdIds;
if (partdIds.length) metrics.partD = JSON.parse(fs.readFileSync(path.join(repoRoot, 'runs', partdIds[0], 'summary.json'), 'utf8'));

fs.writeFileSync(path.join(outDir, 'metrics.json'), `${JSON.stringify(metrics, (k, x) => (x === Infinity ? 'Infinity' : x), 1)}\n`);
for (const [id, m] of Object.entries(manifests)) fs.writeFileSync(path.join(repoRoot, 'results/e10/manifests', `${id}.manifest.json`), `${JSON.stringify(m, null, 1)}\n`);

// ── REPORT.md ──
const f = (x, d = 3) => (x === Infinity ? '∞' : Number.isFinite(x) ? x.toFixed(d) : '—');
const ci = (b, d = 3) => (b ? `${f(b.estimate, d)} [${f(b.lower, d)}, ${f(b.upper, d)}]` : '—');
const pct = (b) => (b ? `${f(100 * b.estimate, 1)} % [${f(100 * b.lower, 1)}, ${f(100 * b.upper, 1)}]` : '—');
const m = (x) => (x === Infinity ? '∞' : Number.isFinite(x) ? (Math.abs(x) >= 1e4 ? `${(x / 1000).toFixed(1)} km` : `${x.toFixed(x < 10 ? 2 : 0)} m`) : '—');
const lines = [`# E10 test results`, '', `Generated by \`experiments/e10-teag-espf/steps/90-report.mjs\` from the runs listed in \`metrics.json\`. Do not edit by hand. Plan: [PLAN.md](../../../experiments/e10-teag-espf/PLAN.md) (frozen; amendments at its end).`, '',
  `Selection (dev, before any E26 or E25T test run): E26 κ = ${selection.chosen.pcrbTrigger}; E25T λ_t = ${selection.chosen.decayRate} (ζ = √6).`, '',
  '## Hypotheses (Holm, α = 0.05)', '', '| ID | Statistic | Estimate [95 % CI] | One-sided p | Holm | Supported |', '| --- | --- | --- | ---: | --- | --- |'];
const hDesc = { H1: 'median RMS(E26)/RMS(UKF), B1', H2: 'median RMS(E26)/RMS(UKF), B2–B8', H3: 'E26 set holds truth, B1 epochs', H4: 'median e(E26)/e(element set), final update, Part C', H5: 'E26 set holds truth, Part C updates' };
for (const [id, h] of Object.entries(metrics.hypotheses)) {
  if (!h.statistic) { lines.push(`| ${id} | ${hDesc[id]} | — | — | — | not run |`); continue; }
  lines.push(`| ${id} | ${hDesc[id]} | ${id === 'H3' || id === 'H5' ? pct(h.statistic) : ci(h.statistic)} | ${f(h.statistic.p, 4)} | ${h.holm?.reject ? 'reject null' : 'retain null'} | ${h.supported ? 'yes' : 'no'} |`);
}
lines.push('', '## Part B — synthetic cases (6 test seeds per case)', '', 'Per-run RMS 3D position error after the first 2 hours: median over seeds [95 % cluster-bootstrap CI]; failures: run stopped or final error > 10 km.', '');
for (const c of CASES) {
  lines.push(`### ${c}`, '', '| Variant | Runs | Failures | RMS pos [95 % CI] | p95 (median run) | Max | Set / α 0.05 / α 0.5 | Cov 95 % / 99.7 % | RTN extents (median) | HPOP calls | Seconds |', '| --- | ---: | ---: | --- | ---: | ---: | --- | --- | --- | ---: | ---: |');
  for (const v of ORDER) {
    const e = metrics.partB.variants[v]?.[c];
    if (!e) continue;
    const cont = e.containment;
    lines.push(`| ${v} | ${e.runs} | ${e.failures} | ${m(e.rmsPosM.estimate)} [${m(e.rmsPosM.lower)}, ${m(e.rmsPosM.upper)}] | ${m(e.p95PosM)} | ${m(e.maxPosM)} | ${cont.set ? `${f(100 * cont.set.estimate, 0)} / ${cont.alpha005 ? f(100 * cont.alpha005.estimate, 0) : '—'} / ${cont.alpha05 ? f(100 * cont.alpha05.estimate, 0) : '—'} %` : '—'} | ${cont.p95 ? `${f(100 * cont.p95.estimate, 0)} / ${f(100 * cont.p997.estimate, 0)} %` : '—'} | ${e.size.medianExtentsM.map((x) => m(x)).join(' / ')} | ${f(e.cost.hpopCalls, 0)} | ${f(e.cost.seconds, 0)} |`);
  }
  lines.push('');
}
lines.push('### Ratio to the UKF (median over runs of per-run RMS ratios)', '', '| Variant | B1 [95 % CI] | B2–B8 [95 % CI] |', '| --- | --- | --- |');
for (const [v, r] of Object.entries(metrics.partB.ratioToUkf)) lines.push(`| ${v} | ${ci(r.B1)} | ${ci(r['B2-B8'])} |`);
lines.push('', '### Mismatch detection', '', 'Threshold: the 99th percentile of the statistic over B1 dev epochs after 2 hours (flags: set). Delay from the event; false alarms on B1 test runs and before the events.', '', '| Statistic | Threshold | B4 detected | B4 median delay | B5 detected | B5 median delay | False alarms B1 | Before events |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const [name, e] of Object.entries(metrics.partB.detection)) {
  const b4 = e['B4-manoeuvre'], b5 = e['B5-area-change'], b1 = e['B1-nominal'];
  lines.push(`| ${name} | ${f(e.threshold, 3)} | ${b4.detected}/${b4.runs} | ${b4.medianDelaySeconds === null ? '—' : `${f(b4.medianDelaySeconds / 60, 0)} min`} | ${b5.detected}/${b5.runs} | ${b5.medianDelaySeconds === null ? '—' : `${f(b5.medianDelaySeconds / 60, 0)} min`} | ${b1.falseAlarms}/${b1.epochs} | ${b4.falseAlarmsBefore + b5.falseAlarmsBefore}/${b4.epochsBefore + b5.epochsBefore} |`);
}
if (Object.keys(metrics.partC.variants).length) {
  lines.push('', '## Part C — OMM-seeded GPS arcs against ESA final orbits', '', 'Final update: the filter error and its ratio to the element set\'s own error at that epoch (median over arcs [95 % pigeonhole CI over satellites × start days]). *corr*: update sigmas inflated for E2b\'s consecutive-set correlation (amendment 1).', '',
    '| Variant | Analysis | Arcs (satellites) | Failures | Final error | Element set | Ratio to set [95 % CI] | Set / α 0.05 / α 0.5 | Cov 95 % / 99.7 % | RTN extents |', '| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |');
  for (const [key, e] of Object.entries(metrics.partC.variants)) {
    const [v, s] = key.split('|'), cont = e.containment;
    lines.push(`| ${v} | ${s} | ${e.arcs} (${e.satellites}) | ${e.failures} | ${m(e.finalErrorM)} | ${m(e.finalSetErrorM)} | ${ci(e.finalRatioToSet)} | ${cont.set ? `${f(100 * cont.set.estimate, 0)} / ${cont.alpha005 ? f(100 * cont.alpha005.estimate, 0) : '—'} / ${cont.alpha05 ? f(100 * cont.alpha05.estimate, 0) : '—'} %` : '—'} | ${cont.p95 ? `${f(100 * cont.p95.estimate, 0)} / ${f(100 * cont.p997.estimate, 0)} %` : '—'} | ${e.medianExtentsM.map((x) => m(x)).join(' / ')} |`);
  }
}
if (Object.keys(metrics.partA).length) {
  const paper = { 'A1-leo-nominal': 'UKF 1.05 km, ESPF 0.97 km', 'A2-leo-error-bias': 'UKF 1.44 km, ESPF 0.73 km', 'A3-geo-area-change': 'UKF 4.30 km, ESPF 1.09 km' };
  lines.push('', '## Part A — the 2025 paper\'s cases (descriptive)', '', 'RMS 3D position error over the arc and over its final day (LEO) or hour (GEO); the paper\'s "final RMS" for comparison only (its noise, settings and scoring are not stated).', '');
  for (const [c, byV] of Object.entries(metrics.partA)) {
    lines.push(`### ${c} (paper: ${paper[c]})`, '', '| Variant | Epochs | RMS arc | RMS final | Final | HPOP calls | Seconds |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
    for (const v of ORDER) { const e = byV[v]; if (e) lines.push(`| ${v} | ${e.epochs}/${e.observations} | ${m(e.rmsArcM)} | ${m(e.rmsFinalM)} | ${m(e.finalM)} | ${f(e.hpopCalls, 0)} | ${f(e.seconds, 0)} |`); }
    lines.push('');
  }
}
if (Object.keys(metrics.enclosure).length) {
  lines.push('', '## Enclosure', '', 'E1: dense points of the carried region propagated by HPOP, outside the published predicted bound; E2 (E26): the dense support\'s survivors outside the reference posterior set. Radii in units of the bound.', '', '| Variant | Steps | E1 outside / points | E1 max radius | Steps with points outside | E2 outside / survivors | E2 max radius | Verdict |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
  for (const [v, e] of Object.entries(metrics.enclosure)) lines.push(`| ${v} | ${e.steps} | ${e.e1.outside}/${e.e1.points} | ${f(e.e1.maxRadius, 3)} | ${e.e1.stepsWithOutside} | ${e.e2 ? `${e.e2.outside}/${e.e2.survivors}` : '—'} | ${e.e2 ? f(e.e2.maxRadius, 3) : '—'} | ${e.verdict} |`);
}
if (metrics.partD) lines.push('', '## Part D — screening', '', ...metrics.partD.reportLines);
fs.writeFileSync(path.join(outDir, 'README.md'), `${lines.join('\n')}\n`);
console.log(lines.slice(0, 14).join('\n'));
