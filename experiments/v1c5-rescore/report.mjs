// README, reader table (table.json), metrics and manifest summary of a finished rescore.
import fs from 'node:fs';
import path from 'node:path';
import { summarizeInputs } from '../v1c4-console-covariance-calibration/report.mjs';
import { compatible } from '../v1c5/report.mjs';
import { config, base, HOURS, frozenName } from './common.mjs';
import { CLASSES, POOLED, levelsAll } from './criterion.mjs';

export { summarizeInputs };
const f3 = n => Number.isFinite(n) ? n.toFixed(3) : '—';
const f5 = n => Number.isFinite(n) ? n.toPrecision(5) : '—';
const f2 = n => Number.isFinite(n) ? n.toFixed(2) : '—';
const LETTER = { CALIBRATED: 'ok', OVERCONFIDENT: 'over', PESSIMISTIC: 'wide', INSUFFICIENT: '' };
const level = (x, p) => { const l = x.levels[p]; return !l || l.status === 'INSUFFICIENT' ? '—' : `${f3(l.covered)} [${f3(l.lower)}, ${f3(l.upper)}] ${LETTER[l.status]}`; };
const bigNumber = n => Math.abs(n) >= 1e7 ? n.toExponential(2) : n.toFixed(0);
const verdict = x => `${x.verdict}${x.reach === null ? '' : ` (${x.reach})`}`;

// The table the mixed-scenario experiment reads: per class, the Gaussian rule and the screening criterion by horizon, the recommendation, T's parameters and the level multipliers.
export function readerTable(metrics, fits) {
  const C = metrics.criterion, rule = metrics.gaussianRule.cells.unflagged;
  const screen = (view, variant, key, match) => { const pool = C[view][variant][key], x = Array.isArray(pool) ? pool.find(match) : pool; return { n: x.n, objects: x.objects, verdict: x.verdict, reach: x.reach, levels: Object.fromEntries(levelsAll.map(p => [p, x.levels[p].status === 'INSUFFICIENT' ? null : { covered: x.levels[p].covered, ci95: [x.levels[p].lower, x.levels[p].upper], status: x.levels[p].status }])), tailRatio: x.tail }; };
  const cellRule = x => ({ n: x.n, objects: x.objects, meanD2Over3: x.mean?.[0] ?? null, meanD2Over3Ci95: x.mean ? [x.mean[1], x.mean[2]] : null, coverage95: x.coverage?.[0] ?? null, coverage95Ci95: x.coverage ? [x.coverage[1], x.coverage[2]] : null, decision: x.decision, compatible: compatible(x) });
  const classes = Object.fromEntries(CLASSES.map(group => {
    const t = fits.T[group], rec = C.recommendation[group];
    return [group, {
      recommendation: rec,
      studentT: t.fitted ? { nu: t.nu, pooledC: t.pooledC, cells: Object.fromEntries(t.cells.map(c => [c.hours, { c: c.c, source: c.source }])) } : null,
      levelMultipliers: { T: fits.levelMultipliers.T[group], Q: fits.levelMultipliers.Q[group] },
      hours: Object.fromEntries(HOURS.map(h => [h, { rule: cellRule(rule.find(x => x.group === group && x.hours === h)),
        screening: Object.fromEntries(['G', 'T', 'Q'].map(v => [v, screen('unflagged', v, 'cells', x => x.group === group && x.hours === h)])) }])),
      pooledHorizons: Object.fromEntries(['G', 'T', 'Q'].map(v => [v, screen('unflagged', v, 'classes', x => x.group === group)])),
      logScore: C.logScore.unflagged.classes[group],
    }];
  }));
  return { schema: 'v1c5-rescore/1', experiment: 'v1c5-rescore', registration: metrics.registration, window: metrics.window,
    frozenModel: { candidate: frozenName, file: 'results/v1c5/P-axes-mle_risk_UNFLAGGED.erm', sha256: config.frozenModel.erm.sha256 },
    criterion: { levels: config.criterion.levels, deepLevel: config.criterion.deepLevel, evaluableAt: config.criterion.evaluableAt, hours: HOURS, population: 'unflagged samples' },
    gaussianRuleRealisticCells: metrics.gaussianRule.realistic.unflagged, gaussianRuleCompatibleCells: rule.filter(compatible).length,
    classes, allClasses: Object.fromEntries(['G', 'T', 'Q'].map(v => [v, screen('unflagged', v, 'all', () => true)])),
    flaggedPooled: Object.fromEntries(CLASSES.map(group => [group, screen('flaggedPooled', 'G', 'classes', x => x.group === group)])),
    allSamples: Object.fromEntries(['G', 'T', 'Q'].map(v => [v, Object.fromEntries(CLASSES.map(group => [group, screen('all', v, 'classes', x => x.group === group)]))])) };
}

export function render(metrics, manifest, fits) {
  const C = metrics.criterion, rule = metrics.gaussianRule, cells = rule.cells.unflagged, L = [];
  const classIn = (view, v, g) => C[view][v].classes.find(x => x.group === g);
  const tally = v => { const t = {}; for (const x of C.unflagged[v].cells) t[x.verdict] = (t[x.verdict] ?? 0) + 1; return t; };
  const tallyText = v => ['CALIBRATED', 'PESSIMISTIC', 'OVERCONFIDENT', 'INSUFFICIENT'].map(k => `${tally(v)[k] ?? 0} ${k.toLowerCase()}`).join(', ');
  L.push('# V1c5 rescore: the frozen SGP4/GP covariance on a screening criterion', '',
    `The model is V1c5's \`${frozenName}\`, unchanged. Truth is extended with COSMIC-2 near-real-time orbits (LEO 400-800 km: ${metrics.controls.leo400to800.unflagged.map(x => x.n).join('/')} samples per horizon from ${Math.max(...metrics.controls.leo400to800.unflagged.map(x => x.objects))} objects, was ${Math.min(...metrics.controls.leo400to800.unflagged.map(x => x.before.n))} to ${Math.max(...metrics.controls.leo400to800.unflagged.map(x => x.before.n))} from ${Math.max(...metrics.controls.leo400to800.unflagged.map(x => x.before.objects))}). On the unflagged samples of issue days ${metrics.window[0]} to ${metrics.window[1]}: **${rule.realistic.unflagged} of 24 cells are REALISTIC under the Gaussian rule** (${[...new Set(cells.filter(x => x.decision === 'REALISTIC').map(x => x.group))].join(', ') || 'none'}), ${cells.filter(compatible).length} of 24 statistically compatible; under the screening criterion the 24 cells are ${tallyText('G')}.`, '',
    '[Frozen plan](../../experiments/v1c5-rescore/PLAN.md) · [Config](../../experiments/v1c5-rescore/config.json) · [Fits](fits.json) · [Metrics](metrics.json) · [Reader table](table.json) · [Manifest](manifest.json)', '');
  L.push('## Result by class (unflagged samples, all horizons)', '',
    'A level is covered when the share of samples with F(d²) at most p is p within the 95 % object-cluster bootstrap interval ("ok"); "over" means fewer samples inside the p-ellipsoid than p (the covariance is too small), "wide" more (too large). — marks a level the sample cannot reach. A verdict is OVERCONFIDENT if any evaluable level from 0.90 is "over", else PESSIMISTIC if any evaluable level is "wide"; the number in brackets is the highest evaluable level.', '',
    '| Class | Predictor | n / objects | 0.50 | 0.90 | 0.95 | 0.99 | Verdict (reach) |', '| --- | --- | ---: | --- | --- | --- | --- | --- |');
  for (const g of [...CLASSES, POOLED]) for (const v of ['G', 'T', 'Q']) {
    const x = g === POOLED ? { ...C.unflagged[v].all } : classIn('unflagged', v, g);
    L.push(`| ${g} | ${v} | ${x.n} / ${x.objects} | ${[0.5, 0.9, 0.95, 0.99].map(p => level(x, p)).join(' | ')} | ${verdict(x)} |`);
  }
  L.push('', 'G is the frozen model read as Gaussian; T is Student-t scale mixture on the same covariance and Q is empirical level multipliers, both fitted on the training out-of-fold population only (`fits.json`).', '');
  L.push('## Recommendation', '', '| Class | Choice | Log score T - G per sample [95 % CI] | Overconfident levels G / T | Verdict G / T |', '| --- | --- | --- | --- | --- |');
  for (const g of CLASSES) { const r = C.recommendation[g]; L.push(`| ${g} | **${r.choice}** | ${r.logScoreDifference ? `${f3(r.logScoreDifference[0])} [${f3(r.logScoreDifference[1])}, ${f3(r.logScoreDifference[2])}]` : '—'} | ${r.overconfidentLevels.G} / ${r.overconfidentLevels.T} | ${r.verdict.G} / ${r.verdict.T} |`); }
  L.push('', 'The rule (PLAN section 6): T when its log-score gain over G has an interval above 0 and it has no more overconfident levels; otherwise G.', '');
  L.push('## Pc-like tail ratios (unflagged, all horizons)', '', 'Observed share outside the (1 - α) ellipsoid divided by α [95 % CI]. A Gaussian-covariance screen under-warns by that factor at that Mahalanobis radius when the ratio is above 1.', '',
    '| Class | Predictor | α = 0.10 | α = 0.05 | α = 0.01 |', '| --- | --- | --- | --- | --- |');
  for (const g of CLASSES) for (const v of ['G', 'T', 'Q']) { const x = classIn('unflagged', v, g); L.push(`| ${g} | ${v} | ${[0.1, 0.05, 0.01].map(a => x.tail[a] ? `${f2(x.tail[a].ratio)} [${f2(x.tail[a].lower)}, ${f2(x.tail[a].upper)}]` : '—').join(' | ')} |`); }
  L.push('', '## Cells (unflagged samples)', '', `Gaussian rule (mean d²/3 in [0.8, 1.25], 95 % coverage in [0.93, 0.97], 30 samples from 3 objects) beside the screening criterion. Screening: G ${tallyText('G')}; T ${tallyText('T')}; Q ${tallyText('Q')}.`, '',
    '| Class | h | n / objects | Mean d²/3 [95 % CI] | 95 % coverage [CI] | Rule | Compatible | G | T | Q |', '| --- | ---: | ---: | --- | --- | --- | :---: | --- | --- | --- |');
  for (const x of cells) {
    const s = v => { const y = C.unflagged[v].cells.find(c => c.group === x.group && c.hours === x.hours); return verdict(y); };
    L.push(`| ${x.group} | ${x.hours} | ${x.n} / ${x.objects} | ${f5(x.mean?.[0])} [${f5(x.mean?.[1])}, ${f5(x.mean?.[2])}] | ${f5(x.coverage?.[0])} [${f5(x.coverage?.[1])}, ${f5(x.coverage?.[2])}] | ${x.decision} | ${compatible(x) ? 'yes' : '—'} | ${s('G')} | ${s('T')} | ${s('Q')} |`);
  }
  L.push('', '## Student-t fit and level multipliers', '', 'Fitted on the training out-of-fold population (folds F3 to F8, unflagged): ν per class, c per class and horizon. A ν of 2.5 is the lowest value of the registered grid (heavier tails than any finite-variance Student-t). Multipliers scale the frozen covariance so the p-ellipsoid covers p under the fit.', '',
    '| Class | ν | Pooled c | Log-lik T / Gaussian | Multiplier T (p = 0.90 / 0.95 / 0.99) at 1 h | at 72 h | Q (p = 0.90 / 0.95 / 0.99) |', '| --- | ---: | ---: | --- | --- | --- | --- |');
  for (const g of CLASSES) {
    const t = fits.T[g], m = fits.levelMultipliers, k = (h, p) => f3(m.T[g][h][p]);
    L.push(`| ${g} | ${t.fitted ? t.nu : '—'} | ${t.fitted ? f3(t.pooledC) : '—'} | ${t.fitted ? `${bigNumber(t.logLikelihood)} / ${bigNumber(t.gaussianLogLikelihood)}` : '—'} | ${[0.9, 0.95, 0.99].map(p => k(1, p)).join(' / ')} | ${[0.9, 0.95, 0.99].map(p => k(72, p)).join(' / ')} | ${m.Q[g] ? [0.9, 0.95, 0.99].map(p => f3(m.Q[g][p])).join(' / ') : '—'} |`);
  }
  L.push('', '## Log score of d² on the test (unflagged)', '', '| Class | n | Gaussian | Student-t | T - G [95 % CI] |', '| --- | ---: | ---: | ---: | --- |');
  for (const g of CLASSES) { const s = C.logScore.unflagged.classes[g]; L.push(`| ${g} | ${s.n} | ${f3(s.gaussian)} | ${f3(s.studentT)} | ${f3(s.difference)} [${f3(s.lower)}, ${f3(s.upper)}] |`); }
  L.push('', '## Other views (G, T, Q; classes, all horizons)', '', 'All samples (unflagged and flagged) and flagged samples pooled; report-only, the frozen model claims unflagged samples only.', '',
    '| View | Class | Predictor | n / objects | 0.50 | 0.90 | 0.95 | 0.99 | Verdict (reach) |', '| --- | --- | --- | ---: | --- | --- | --- | --- | --- |');
  for (const view of ['all', 'flaggedPooled']) for (const g of CLASSES) for (const v of Object.keys(C[view])) { const x = classIn(view, v, g); if (!x.n) continue; L.push(`| ${view} | ${g} | ${v} | ${x.n} / ${x.objects} | ${[0.5, 0.9, 0.95, 0.99].map(p => level(x, p)).join(' | ')} | ${verdict(x)} |`); }
  L.push('', '## d² concentration', '');
  for (const [group, g] of Object.entries(metrics.concentration)) {
    if (!g.objects.length) continue;
    L.push(`### ${group} under ${frozenName} (all arcs)`, '', '| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |', '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const o of g.objects.slice(0, 5)) L.push(`| ${o.object} | ${o.n} | ${f5(o.contribution)} | ${f5(o.meanD2Over3)} | ${f5(o.medianD2Over3)} | ${f5(o.maxD2Over3)} |`);
    L.push('');
  }
  const c = metrics.controls;
  L.push('## Truth and controls', '',
    `Truth added for the rescore: COSMIC-2 near-real-time orbits (UCAR/CDAAC, doy 280 to 292 converted; later days have no Earth orientation). ILRS combined arcs end at 261010, Swarm is not published, Sentinel-1 POE ends before the window: SLR MEO stays at ${C.unflagged.G.classes.find(x => x.group === 'SLR MEO').n} unflagged samples and is INSUFFICIENT. The LEO 400-800 km truth is five COSMIC-2 satellites (NORAD ${Object.keys(base.extraObjects['LEO 400-800 km']).join(', ')}, one orbital shell) and one other object; the class result rests on that shell. LEO 400-800 km unflagged samples per horizon (1, 6, 12, 24, 48, 72 h): ${c.leo400to800.unflagged.map(x => `${x.n} (was ${x.before.n})`).join(', ')}.`, '',
    `Reproduction control: the cells of ${c.unchangedClasses.join(', ')} (all and unflagged views) and the flagged-pooled cells equal V1c5's \`metrics.json\` ${c.reproduced ? 'exactly' : `except ${c.differences.join(', ')}`}.`, '',
    '## Integrity and limits', '',
    `Run ${manifest.run}; ${manifest.workers} bounded single-threaded workers. Test arcs ${metrics.counts.arcs} (${metrics.counts.skipped} skipped, ${metrics.counts.samples} samples, ${metrics.counts.missingHorizons} absent horizons); ${metrics.flags.flagged} of ${metrics.flags.pairs} pairs flagged by V1c5's causal event rule. The fits were pushed before the test was read (\`fitsFreeze\` in the manifest).`, '',
    'The test window was already scored by V1c5, so it is not unseen for the form of T and Q; they are fitted on training folds only. One object is scored against truth: a conjunction also needs the other object. A CALIBRATED level means the bootstrap interval contains p, which with 5 or 6 objects is weak evidence; read it with the interval. About one level in twenty misses by chance, uncorrected.', '',
    'E2E: `node experiments/v1c5-rescore/run.mjs --check`.', '');
  return L.join('\n');
}

export function publish({ ctx, metrics }) {
  const { run, output, fits } = ctx, manifest = run.manifest;
  const committed = { ...manifest, inputs: summarizeInputs(manifest.inputs, { root: manifest.repositoryRoot, runDir: manifest.runDirectory }), repositoryRoot: undefined, runDirectory: undefined };
  fs.mkdirSync(output, { recursive: true });
  fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(committed, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'table.json'), JSON.stringify(readerTable(metrics, fits), null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), render(metrics, manifest, fits));
}
