// Step 70, the test evaluation (PLAN.md 7): H1 to H6 with their rules, Holm over H2–H6, the no-harm rule, every tier
// by group and regime class, each family's best, ages 1 and 3 days, the variance components, and Q2's products against
// SGP4 and against each other. Writes results/e16/test/metrics.json and REPORT.md (generated), results/e16/README.md.
//
//   node experiments/e16-cross-regime-epoch/steps/70-evaluate.mjs --window test
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { startRun } from '../../../harness/provenance.mjs';
import { clipMask } from '../../e1-gps-epoch/inference.mjs';
import { SELECTION_FILE, cli, config, configPath, modulesRoot, readJson, repoRoot, resultsDir, sha256 } from '../common.mjs';
import { Fleet, clipKept, fleetSample, loadSamples } from '../q1lib.mjs';
import { holm, medianRatio, noHarm, pairedQ2, realism, reduction, reductionDifference, varianceShares } from '../evaluate.mjs';

const { window, locks } = cli();
if (window !== 'test') throw new Error('step 70 evaluates the test window');
const run = startRun({ experiment: config.experiment, step: '70-evaluate', configPath, modulesDir: modulesRoot(), args: { window } });
run.manifest.locks = locks;
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);
const RUNS = path.join(repoRoot, 'runs');
const latestRun = (prefix, ok = () => true) => fs.readdirSync(RUNS).filter((n) => n.startsWith(prefix)).sort().filter((id) => { const mf = path.join(RUNS, id, 'manifest.json'); if (!fs.existsSync(mf)) return false; const m = JSON.parse(fs.readFileSync(mf, 'utf8')); return m.finished && ok(m); });
const gz = (file) => zlib.gunzipSync(fs.readFileSync(file)).toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);
const D = config.decisions;

const selection = readJson(path.join(repoRoot, SELECTION_FILE));
const inventory = readJson(path.join(resultsDir, 'inventory.json'));
const meta = new Map(inventory.objects.filter((o) => !o.excluded).map((o) => [o.norad, o]));
const nameOf = (n) => meta.get(n)?.name ?? String(n);

// ── Q1 ──
const q1Run = latestRun(`${config.experiment}-60-q1-test`).at(-1);
if (!q1Run) throw new Error('no finished step-60 run');
const q1rows = gz(path.join(RUNS, q1Run, 'q1-test.jsonl.gz'));
run.manifest.inputsRuns = { q1: q1Run };
// C0's clip per regime class at each age (E1 amendment 2, the window being scored).
const keptAt = {};
for (const age of ['0', '1', '3']) {
  keptAt[age] = new Set();
  const byCls = new Map();
  for (const r of q1rows) { if (!r.c0[age]) continue; if (!byCls.has(r.cls)) byCls.set(r.cls, []); byCls.get(r.cls).push({ ageDays: Number(age), gpId: r.gpId, error: r.c0[age].slice(0, 3) }); }
  for (const list of byCls.values()) for (const id of clipMask(list, config.clip).mask.get(Number(age))) keptAt[age].add(id);
}
const rowsFor = (group, key, age = '0', cls = null) => q1rows.filter((r) => r.group === group && (!cls || r.cls === cls) && keptAt[age].has(r.gpId) && r.c0[age] && r.corrected[key]?.[age])
  .map((r) => ({ norad: r.norad, day: dayOf(r.epochMs), cls: r.cls, a: r.c0[age].slice(0, 3), b: r.corrected[key][age].slice(0, 3) }));
const classesOf = { LEO: ['LEO-PL', 'LEO-POD', 'SLR-LEO'], 'MEO/GEO': ['GNSS', 'IGSO/GEO', 'SLR-MEO'] };
const tiersOf = { LEO: ['T', 'O', 'P', 'Sband', 'Sincl', 'N'], 'MEO/GEO': ['T', 'O', 'P', 'Splane', 'N', 'M'] };
const q1 = { run: q1Run, chosen: { LEO: selection.q1.LEO.chosen, 'MEO/GEO': selection.q1['MEO/GEO'].chosen }, tiers: {}, familyBest: {} };
for (const group of ['LEO', 'MEO/GEO']) {
  q1.tiers[group] = {};
  for (const tier of tiersOf[group]) {
    const key = `M*|${tier}`;
    const all = rowsFor(group, key);
    if (!all.length) continue;
    q1.tiers[group][tier] = {
      pooled: reduction(all),
      byClass: Object.fromEntries(classesOf[group].map((c) => [c, reduction(rowsFor(group, key, '0', c))]).filter(([, v]) => v)),
      ages: Object.fromEntries(['1', '3'].map((a) => [a, reduction(rowsFor(group, key, a))])),
      noHarm: noHarm(all),
    };
    log(`${group} tier ${tier}: R ${q1.tiers[group][tier].pooled.R.estimate.toFixed(3)} [${q1.tiers[group][tier].pooled.R.lower.toFixed(3)}, ${q1.tiers[group][tier].pooled.R.upper.toFixed(3)}] (${all.length} samples)`);
  }
  q1.familyBest[group] = Object.fromEntries(Object.keys(selection.q1[group].familyBest).map((fam) => [`${fam} (${selection.q1[group].familyBest[fam]})`, reduction(rowsFor(group, `${fam}|O`))]));
}

// H6: M4 at epoch for LEO tier O (and the published OMM's covariance made the same way, descriptive).
const h6Rows = (key, which) => q1rows.filter((r) => r.group === 'LEO' && keptAt['0'].has(r.gpId) && r.c0['0'] && (which === 'published' || r.corrected[key]?.['0']))
  .map((r) => ({ norad: r.norad, day: dayOf(r.epochMs), e: (which === 'published' ? r.c0['0'] : r.corrected[key]['0']).slice(0, 3), sigma2: selection.q1.LEO.covariance[r.cls][which].slice(0, 3) }));
const h6 = realism(h6Rows('M*|O', 'corrected'));
const h6Published = realism(h6Rows('M*|O', 'published'));
const h6ByClass = Object.fromEntries(classesOf.LEO.map((c) => { const rows = h6Rows('M*|O', 'corrected').filter((x) => meta.get(x.norad)?.regimeClass === c); return [c, rows.length ? realism(rows) : null]; }));

// The mechanism (descriptive, train window): per-object share of the along-track variance and what M*'s covariates explain.
const trainRows = loadSamples('train', Object.keys(config.regimes)).rows;
const trainKept = clipKept(trainRows).kept;
const models = readJson(path.join(resultsDir, 'selection', 'q1-models.json'));
const mechanism = {};
for (const [group, classes] of Object.entries(classesOf)) {
  const spec = models[group].spec;
  const usable = trainRows.filter((r) => classes.includes(r.cls) && r.errors[0] && trainKept.has(r.gpId) && (group !== 'LEO' || r.W));
  const fleet = group === 'LEO' && (spec.family === 'C2' || spec.family === 'C3') ? new Fleet(usable.map(fleetSample)) : null;
  for (const cls of classes) {
    const rows = usable.filter((r) => r.cls === cls).map((r) => ({ ...r, fleet: fleet ? fleet.value(r, spec.L, spec.dn, config.q1.groups.LEO.families.C2.minimumContributors) : null }));
    if (rows.length > 30) mechanism[cls] = varianceShares(rows, spec, models[group].scales);
  }
}

// ── Q2 ──
const q2Runs = latestRun(`${config.experiment}-55-q2-run-test-s`, (m) => !m.args.limit);
const byShard = new Map();
for (const id of q2Runs) byShard.set(JSON.parse(fs.readFileSync(path.join(RUNS, id, 'manifest.json'), 'utf8')).shard, id);
const q2rows = [...byShard.values()].flatMap((id) => gz(path.join(RUNS, id, 'q2.jsonl.gz')));
run.manifest.inputsRuns.q2 = [...byShard.values()];
const H = config.q2.horizonsHours;
const products = ['S-corr', 'A', 'A-GLS', 'A-GLS-E2b', 'A-corr', 'A-JB', 'A-JB-E13'];
const ratioTable = (rows, num, den) => Object.fromEntries(H.map((h, k) => [h, medianRatio(pairedQ2(rows, [num, den], k))]));
const q2 = { samples: q2rows.length, objects: new Set(q2rows.map((r) => r.norad)).size, vsS: {}, byClass: {}, comparisons: {}, operational: {}, realism: {}, fits: {} };
for (const p of products) q2.vsS[p] = ratioTable(q2rows, p, 'S');
for (const cls of ['LEO-PL', 'LEO-POD', 'SLR-LEO']) q2.byClass[cls] = Object.fromEntries(['A', 'A-JB-E13', 'S-corr', 'A-corr'].map((p) => [p, ratioTable(q2rows.filter((r) => r.cls === cls), p, 'S')]));
for (const [num, den] of [['A-GLS', 'A'], ['A-GLS-E2b', 'A'], ['A-corr', 'A'], ['A-JB-E13', 'A-JB'], ['A-JB', 'A'], ['S-corr', 'S']]) q2.comparisons[`${num}/${den}`] = ratioTable(q2rows, num, den);
for (const p of ['S', ...products]) {
  const tried = q2rows.filter((r) => r.products[p]);
  const failed = tried.filter((r) => r.products[p].failure);
  const reasons = {};
  for (const r of failed) { const k = r.products[p].failure.replace(/\(.*\)|[0-9.e+-]+/g, '').slice(0, 60); reasons[k] = (reasons[k] ?? 0) + 1; }
  const info = tried.map((r) => r.products[p].info?.fit).filter(Boolean);
  q2.operational[p] = { attempted: tried.length, failed: failed.length, reasons, converged: info.filter((f) => f.converged).length,
    bAtBound: info.filter((f) => f.boundStatus?.[0]).length, regularizedBlocks: info.reduce((a, f) => a + (f.regularizations ?? 0), 0),
    bdotHeld: tried.filter((r) => r.products[p].info?.bdotHeld !== undefined).length, splits: tried.filter((r) => r.products[p].info?.arc?.split).length };
  if (p.startsWith('A')) {
    q2.realism[p] = Object.fromEntries(H.map((h, k) => {
      const d2 = q2rows.map((r) => r.products[p]?.d2?.[k]).filter((x) => Number.isFinite(x));
      if (!d2.length) return [h, null];
      const mean = d2.reduce((a, b) => a + b, 0) / d2.length / 3, cov = d2.filter((x) => x <= config.covarianceModel.realism.chi2_3_95).length / d2.length;
      return [h, { n: d2.length, meanD2Over3: mean, coverage95: cov }];
    }));
  }
}
// Q2 no-harm (descriptive count): objects whose median 3D ratio A/S at 72 h exceeds 1.10.
const k72 = H.indexOf(72), k24 = H.indexOf(24);
const perObject = [...new Set(q2rows.map((r) => r.norad))].map((n) => ({ norad: n, name: nameOf(n), r: medianRatio(pairedQ2(q2rows.filter((x) => x.norad === n), ['A', 'S'], k72)) })).filter((x) => x.r);
q2.noHarm = { objects: perObject.length, worseThan110: perObject.filter((x) => x.r.ratio > D.noHarm.q2RatioAbove).map((x) => ({ norad: x.norad, name: x.name, ratio: x.r.ratio, n: x.r.n })) };

// ── Hypotheses ──
const h = {};
const R1 = q1.tiers.LEO.O.pooled.R;
h.H1 = { statistic: 'R, LEO tier O', ...R1, supported: R1.estimate >= D.H1.reductionAtLeast && R1.lower > D.H1.lowerBoundAbove && R1.pValue <= config.statistics.alpha };
const diff = reductionDifference(rowsFor('LEO', 'M*|O'), rowsFor('MEO/GEO', 'M*|O'));
h.H2 = { statistic: 'R(LEO, O) - R(MEO/GEO, O)', ...diff, ruleHolds: diff.estimate >= D.H2.differenceAtLeast && diff.lower > D.H2.lowerBoundAbove };
const R3 = q1.tiers.LEO.P.pooled.R;
h.H3 = { statistic: 'R, LEO tier P', ...R3, ruleHolds: R3.estimate >= D.H3.reductionAtLeast && R3.lower > D.H3.lowerBoundAbove };
const a24 = q2.vsS.A[24], a72 = q2.vsS.A[72];
h.H4 = { statistic: 'median 3D ratio A/S at 24 h and 72 h', at24h: a24, at72h: a72, pValue: Math.max(a24?.pGe1 ?? 1, a72?.pGe1 ?? 1), ruleHolds: !!a24 && !!a72 && a24.upper < D.H4.upperBoundBelow && a72.upper < D.H4.upperBoundBelow };
const e24 = q2.comparisons['A-JB-E13/A-JB'][24], e72 = q2.comparisons['A-JB-E13/A-JB'][72];
h.H5 = { statistic: 'median 3D ratio A-JB-E13/A-JB at 24 h and 72 h', at24h: e24, at72h: e72, pValue: Math.max(e24?.pGe1 ?? 1, e72?.pGe1 ?? 1), ruleHolds: !!e24 && !!e72 && e24.upper < D.H5.upperBoundBelow && e72.upper < D.H5.upperBoundBelow };
h.H6 = { statistic: "M4 at epoch, LEO tier O, E14's rule", ...h6, ruleHolds: h6.realistic };
const family = holm({ H2: h.H2.pValue, H3: h.H3.pValue, H4: h.H4.pValue, H5: h.H5.pValue, H6: h6.pValue }, config.statistics.alpha);
for (const k of ['H2', 'H3', 'H4', 'H5', 'H6']) { h[k].holm = family[k]; h[k].supported = h[k].ruleHolds && family[k].rejected; }

const metrics = { experiment: config.experiment, run: run.id, freezeCommit: locks.freezeCommit, selectionCommit: locks.selectionCommit, hypotheses: h, q1: { ...q1, h6Published, h6ByClass, mechanism }, q2 };
fs.mkdirSync(path.join(resultsDir, 'test'), { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'test', 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
run.write('metrics.json', metrics);

// ── Reports, generated from the metrics ──
const f = (x, d = 3) => (x === null || x === undefined || !Number.isFinite(x) ? '—' : x.toFixed(d));
const ci = (r, d = 3) => (r ? `${f(r.estimate ?? r.ratio, d)} [${f(r.lower, d)}, ${f(r.upper, d)}]` : '—');
const yes = (b) => (b ? '**supported**' : '**not supported**');
const lines = [];
lines.push('# E16 results: test window', '', `Generated by \`experiments/e16-cross-regime-epoch/steps/70-evaluate.mjs\` from \`metrics.json\` (run \`${run.id}\`). Do not edit by hand.`, '');
lines.push(`Plan frozen at \`${locks.freezeCommit}\`; selection committed at \`${locks.selectionCommit}\`. Test window ${config.windows.test.join(' .. ')} (OMM epochs), read once. Intervals: 95 % percentile, two-way (object × UTC day) pigeonhole bootstrap, ${config.statistics.bootstrapResamples} resamples, seed ${config.statistics.bootstrapSeed}.`, '');
const harmLeo = q1.tiers.LEO.O.noHarm, harmMeo = q1.tiers['MEO/GEO'].O.noHarm;
lines.push('## Hypotheses', '', '| ID | Statement | Statistic | p | Holm | Result |', '| --- | --- | --- | ---: | --- | --- |');
lines.push(`| H1 (primary) | LEO corrections transfer to unseen objects (R ≥ 0.20, lower bound > 0) | R = ${ci(h.H1)} (${q1.tiers.LEO.O.pooled.n} samples, ${q1.tiers.LEO.O.pooled.objects} objects) | ${f(h.H1.pValue, 4)} | alone | ${yes(h.H1.supported)} |`);
lines.push(`| H2 | LEO transfers better than MEO/GEO (difference ≥ 0.10, lower bound > 0) | ΔR = ${ci(h.H2)} | ${f(h.H2.pValue, 4)} | ${h.H2.holm.rejected ? 'rejects' : 'does not reject'} | ${yes(h.H2.supported)} |`);
lines.push(`| H3 | LEO corrections transfer to unseen operators (R ≥ 0.10, lower bound > 0) | R = ${ci(h.H3)} | ${f(h.H3.pValue, 4)} | ${h.H3.holm.rejected ? 'rejects' : 'does not reject'} | ${yes(h.H3.supported)} |`);
lines.push(`| H4 | LEO arc fits beat SGP4 at 24 h and 72 h (upper bounds < 1) | A/S ${ci(a24)} at 24 h, ${ci(a72)} at 72 h | ${f(h.H4.pValue, 4)} | ${h.H4.holm.rejected ? 'rejects' : 'does not reject'} | ${yes(h.H4.supported)} |`);
lines.push(`| H5 | E13's correction improves the arc fits (upper bounds < 1) | A-JB-E13/A-JB ${ci(e24)} at 24 h, ${ci(e72)} at 72 h | ${f(h.H5.pValue, 4)} | ${h.H5.holm.rejected ? 'rejects' : 'does not reject'} | ${yes(h.H5.supported)} |`);
lines.push(`| H6 | The corrected product's covariance is realistic for unseen LEO objects | mean d²/3 ${ci(h6.meanD2Over3)}, 95 % coverage ${ci(h6.coverage95)}: ${h6.verdict} | ${f(h6.pValue, 4)} | ${h.H6.holm.rejected ? 'rejects' : 'does not reject'} | ${yes(h.H6.supported)} |`);
lines.push('', `**No-harm rule** (PLAN.md 7), tier O: LEO ${harmLeo.harmed} of ${harmLeo.objects} held-out objects worse by more than 10 % (${harmLeo.pass ? 'passes' : '**fails**'}); MEO/GEO ${harmMeo.harmed} of ${harmMeo.objects} (${harmMeo.pass ? 'passes' : '**fails**'}).`, '');
lines.push('## Q1: the correction at epoch, by tier', '', `M* — LEO: \`${q1.chosen.LEO}\`; MEO/GEO: \`${q1.chosen['MEO/GEO']}\` (chosen on validation, tier O). R = 1 − RMS₃ᴅ(M*) / RMS₃ᴅ(C0) inside C0's clip.`, '');
const tierName = { T: 'T seen objects, future time', O: 'O unseen objects', P: 'P unseen operators / constellations', Sband: 'S unseen mean-motion band', Sincl: 'S unseen inclination class', Splane: 'S unseen orbital plane', N: 'N unseen generation / family', M: 'M unseen orbit class (MEO → IGSO/GEO)' };
for (const group of ['LEO', 'MEO/GEO']) {
  lines.push(`### ${group}`, '', `| Tier | R at epoch | RMS C0 → M* (km) | n (objects) | ${classesOf[group].join(' | ')} | R at 1 d | R at 3 d | Harmed |`, `| --- | --- | --- | --- | ${classesOf[group].map(() => '---').join(' | ')} | --- | --- | --- |`);
  for (const [tier, t] of Object.entries(q1.tiers[group])) {
    lines.push(`| ${tierName[tier]} | ${ci(t.pooled.R)} | ${f(t.pooled.rmsC0Km)} → ${f(t.pooled.rmsKm)} | ${t.pooled.n} (${t.pooled.objects}) | ${classesOf[group].map((c) => (t.byClass[c] ? ci(t.byClass[c].R) : '—')).join(' | ')} | ${ci(t.ages['1']?.R)} | ${ci(t.ages['3']?.R)} | ${t.noHarm.harmed}/${t.noHarm.objects}${t.noHarm.pass ? '' : ' (fails)'} |`);
  }
  lines.push('', `Each family's best, tier O: ${Object.entries(q1.familyBest[group]).map(([k, v]) => `${k} ${ci(v?.R)}`).join('; ')}.`, '');
}
lines.push('### The corrected product\'s covariance (H6) and the variance components', '', `M4 (diagonal RTN, validation second moments of M*'s held-out errors) on LEO tier O at epoch: ${h6.verdict}, mean d²/3 ${ci(h6.meanD2Over3)}, coverage ${ci(h6.coverage95)} (${h6.n} samples, ${h6.objects} objects). The published OMM's covariance made the same way: ${h6Published.verdict}, mean d²/3 ${ci(h6Published.meanD2Over3)}. By class: ${Object.entries(h6ByClass).filter(([, v]) => v).map(([c, v]) => `${c} ${v.verdict} (${f(v.meanD2Over3.estimate)})`).join('; ')}.`, '');
lines.push('| Class (train) | Samples | Objects | Per-object share of along-track variance | Within-object variance M*\'s covariates explain |', '| --- | ---: | ---: | ---: | ---: |');
for (const [cls, m] of Object.entries(mechanism)) lines.push(`| ${cls} | ${m.n} | ${m.objects} | ${f(m.perObjectShare)} | ${f(m.withCovariates?.sigma2Reduction)} |`);
lines.push('', '## Q2: LEO arc fits against SGP4', '', `${q2.samples} samples of ${q2.objects} objects; choices (validation): ${Object.entries(selection.q2.chosen).map(([c, v]) => `${c} ${v.spanDays} d${v.bdot ? ' with B-dot' : ''}`).join('; ')}; test stride ${selection.q2.testStrideDays} days. Cells: median 3D ratio [95 % interval] and class (meaningfully better: upper bound < 0.8).`, '');
lines.push(`| Product / S | ${H.map((x) => `${x} h`).join(' | ')} |`, `| --- | ${H.map(() => '---').join(' | ')} |`);
for (const p of products) lines.push(`| ${p} | ${H.map((x) => (q2.vsS[p][x] ? `${ci(q2.vsS[p][x], 2)} ${q2.vsS[p][x].class} (${q2.vsS[p][x].n})` : '—')).join(' | ')} |`);
lines.push('', `| Comparison | ${H.map((x) => `${x} h`).join(' | ')} |`, `| --- | ${H.map(() => '---').join(' | ')} |`);
for (const [k, t] of Object.entries(q2.comparisons)) lines.push(`| ${k} | ${H.map((x) => (t[x] ? `${ci(t[x], 2)} (${t[x].n})` : '—')).join(' | ')} |`);
lines.push('', '| Class: A / S | 24 h | 72 h | A-JB-E13 / S at 72 h |', '| --- | --- | --- | --- |');
for (const [cls, t] of Object.entries(q2.byClass)) lines.push(`| ${cls} | ${ci(t.A[24], 2)} | ${ci(t.A[72], 2)} | ${ci(t['A-JB-E13'][72], 2)} |`);
lines.push('', '| Product | Attempted | Failed | Converged | B at its bound | B-dot held | Arcs split | Regularized blocks |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |');
for (const [p, o] of Object.entries(q2.operational)) lines.push(`| ${p} | ${o.attempted} | ${o.failed} | ${o.converged} | ${o.bAtBound} | ${o.bdotHeld} | ${o.splits} | ${o.regularizedBlocks} |`);
lines.push('', `Covariance realism of the A family (the fit's covariance × max(1, reduced χ²), propagated): ${Object.entries(q2.realism).map(([p, t]) => `${p}: ${H.filter((x) => t[x]).map((x) => `${x} h ${f(t[x].meanD2Over3, 2)}/${f(t[x].coverage95, 2)}`).join(', ')}`).join('; ')} (mean d²/3 / 95 % coverage).`, '');
lines.push(`Objects whose median ratio A/S at 72 h exceeds 1.10: ${q2.noHarm.worseThan110.length} of ${q2.noHarm.objects}${q2.noHarm.worseThan110.length ? ` (${q2.noHarm.worseThan110.map((o) => `${o.name} ${f(o.ratio, 2)}`).join(', ')})` : ''}.`, '');
fs.writeFileSync(path.join(resultsDir, 'test', 'REPORT.md'), `${lines.join('\n')}\n`);
const m = run.finish({ hypotheses: Object.fromEntries(Object.entries(h).map(([k, v]) => [k, v.supported])) });
fs.mkdirSync(path.join(resultsDir, 'manifests'), { recursive: true });
fs.writeFileSync(path.join(resultsDir, 'manifests', `${m.run}.json`), `${JSON.stringify(m, null, 1)}\n`);
log(`hypotheses: ${Object.entries(h).map(([k, v]) => `${k} ${v.supported ? 'supported' : 'not supported'}`).join(', ')}`);
