// README, metrics, manifest summary, MODEL record and the reader table (table.json) of a finished run.
import fs from 'node:fs';
import path from 'node:path';
import { summarizeInputs } from '../v1c4-console-covariance-calibration/report.mjs';
import { EXTREME_D2_OVER_3 } from './test.mjs';

export { summarizeInputs };
// Report-only (AMENDMENTS.md B1): a cell is statistically compatible with the rule when its bootstrap intervals overlap the rule's bands and it has enough samples.
export const compatible = x => x.n >= 30 && x.objects >= 3 && Boolean(x.mean && x.coverage) && x.mean[2] >= 0.8 && x.mean[1] <= 1.25 && x.coverage[2] >= 0.93 && x.coverage[1] <= 0.97;
const f5 = n => Number.isFinite(n) ? n.toPrecision(5) : '—';
const safe = name => name.replace(/[/|]/g, '_');
const HOURS = [1, 6, 12, 24, 48, 72];

// The table the mixed-scenario experiment and the paper read: the selected candidate's cells by class and horizon on its claimed population, with the unflagged and flagged views.
export function readerTable(metrics, sel, spec) {
  const c = metrics.candidates[metrics.selected];
  const cell = x => ({ n: x.n, objects: x.objects, meanD2Over3: x.mean?.[0] ?? null, meanD2Over3Ci95: x.mean ? [x.mean[1], x.mean[2]] : null, coverage95: x.coverage?.[0] ?? null, coverage95Ci95: x.coverage ? [x.coverage[1], x.coverage[2]] : null, medianD2Over3: x.medianD2 === null || x.medianD2 === undefined ? null : x.medianD2 / 3, decision: x.decision, compatible: compatible(x) });
  const byClass = view => Object.fromEntries([...new Set(c.cells[view].map(x => x.group))].map(g => [g, Object.fromEntries(c.cells[view].filter(x => x.group === g).map(x => [x.hours, cell(x)]))]));
  return { schema: 'v1c5/1', experiment: 'v1c5', registration: metrics.registration, rule: { meanD2Over3: [0.8, 1.25], coverage95: [0.93, 0.97], minimumSamples: 30, minimumObjects: 3 },
    window: metrics.window, selected: { name: metrics.selected, base: spec.candidates.find(x => x.name === metrics.selected).base, claim: c.claim, model: `${safe(metrics.selected)}.erm` },
    realisticCells: c.realistic, hours: HOURS, claimed: byClass(c.claimedView), allSamples: byClass('all'), unflaggedSamples: byClass('unflagged'),
    compatibleCells: c.cells[c.claimedView].filter(compatible).length, flaggedPooled: Object.fromEntries(c.cells.flaggedPooled.map(x => [x.hours, cell(x)])), flagShare: metrics.flags.flagged / metrics.flags.pairs };
}

export function render(metrics, manifest, sel, spec, config) {
  const lines = [], pick = metrics.candidates[metrics.selected], count = c => `${c.realistic.claimed}/24`;
  lines.push('# V1c5 — realistic SGP4/GP uncertainty for mixed-catalog screening', '',
    `Selected on training weeks only: **${metrics.selected}: ${count(pick)} cells realistic on the fresh test** (claimed population: ${pick.claimedView} samples). Training issues ${config.windows.folds[0].from} to ${config.windows.folds.at(-1).to} in eight weekly folds (every target precedes ${config.windows.trainingTargetBefore.slice(0, 10)}); selection by purged rolling-origin cross-validation (folds ${sel.evaluationFolds.join(', ')}) on the worst-fold realistic count. Test: issue days ${config.windows.test[0]} to ${config.windows.test[1]}, never read before the selection was pushed. Rule: mean d²/3 in [0.8, 1.25], 95 % coverage in [0.93, 0.97], at least 30 samples from 3 objects.`, '',
    '[Frozen plan A](../../experiments/v1c5/PLAN.md) · [Plan B](../../experiments/v1c5/PLAN-B.md) · [Metrics](metrics.json) · [Reader table](table.json) · [Manifest](manifest.json) · [Selection](selection.json)', '');
  lines.push('## Candidates', '', '| Candidate | Cross-validation realistic /24 by fold | Mean | Min | Test claimed /24 | Test all | Test unflagged | Test flagged (pooled /6) |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  const ranked = new Map(sel.ranking.map(r => [r.name, r]));
  for (const [name, c] of Object.entries(metrics.candidates)) {
    const r = ranked.get(name);
    lines.push(`| ${name}${name === metrics.selected ? ' (selected)' : ''} | ${r ? Object.entries(r.realisticByFold).map(([id, n]) => `${id} ${n}`).join(', ') : 'ineligible'} | ${r ? r.meanRealistic.toFixed(2) : '—'} | ${r ? r.minRealistic : '—'} | ${count(c)} | ${c.realistic.all} | ${c.realistic.unflagged} | ${c.realistic.flaggedPooled} |`);
  }
  const cells = pick.cells[pick.claimedView];
  lines.push('', `## Selected: ${pick.name} (${pick.claimedView} samples)`, '', '| Class | h | n / objects | Mean d²/3 [95% CI] | Median d²/3 | 95% coverage [CI] | Non-PD / unavailable | Verdict | Compatible |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | :---: |');
  for (const x of cells) lines.push(`| ${x.group} | ${x.hours} | ${x.n} / ${x.objects} | ${f5(x.mean?.[0])} [${f5(x.mean?.[1])}, ${f5(x.mean?.[2])}] | ${f5(x.medianD2 / 3)} | ${f5(x.coverage?.[0])} [${f5(x.coverage?.[1])}, ${f5(x.coverage?.[2])}] | ${x.notPositiveDefinite} / ${x.available - x.n} | ${x.decision} | ${compatible(x) ? 'yes' : '—'} |`);
  lines.push('', `${cells.filter(compatible).length}/24 cells are statistically compatible with the rule (both bootstrap intervals overlap its bands, at least 30 samples from 3 objects): a report-only reading, since a cell of about 70 samples misses the coverage band of 0.93 to 0.97 by chance more often than not even when its covariance is right.`, '', `Split for ${pick.name}: ${pick.realistic.all}/24 cells over all samples, ${pick.realistic.unflagged}/24 over unflagged samples, ${pick.realistic.flaggedPooled}/6 horizons over flagged samples (pooled over classes).`, '',
    '| Flagged samples, pooled | n / objects | Mean d²/3 | 95% coverage | Verdict |', '| --- | ---: | ---: | ---: | --- |');
  for (const x of pick.cells.flaggedPooled) lines.push(`| h ${x.hours} | ${x.n} / ${x.objects} | ${f5(x.mean?.[0])} | ${f5(x.coverage?.[0])} | ${x.decision} |`);
  lines.push('', '## Realistic by class and lead time', '', `Cells REALISTIC on the test for ${pick.name} on its claimed population; nothing else may be labelled realistic.`, '', `| Class | ${HOURS.map(h => `${h} h`).join(' | ')} |`, `| --- | ${HOURS.map(() => ':---:').join(' | ')} |`);
  for (const g of [...new Set(cells.map(x => x.group))]) lines.push(`| ${g} | ${HOURS.map(h => { const x = cells.find(y => y.group === g && y.hours === h); return x.decision === 'REALISTIC' ? 'yes' : x.decision === 'INSUFFICIENT' ? 'n/a' : '—'; }).join(' | ')} |`);
  lines.push('', '## Event rule', '', `Custody gap or a maneuver-detection event within 7 days (computed from each object's own element sets before the issue time). Test: ${metrics.flags.flagged} of ${metrics.flags.pairs} pairs flagged.`, '',
    '| Class | Pairs | Flagged | By custody gap | By detector | Detector refusals |', '| --- | ---: | ---: | ---: | ---: | ---: |');
  for (const [g, x] of Object.entries(metrics.flags.byClass)) lines.push(`| ${g} | ${x.pairs} | ${x.flagged} | ${x.custody} | ${x.detector} | ${x.detectorErrors} |`);
  for (const [group, g] of Object.entries(metrics.concentration)) {
    lines.push('', `### ${group} d² concentration under ${pick.name} (all arcs)`, '', '| Object | n | Fraction of total d² | Mean d²/3 | Median d²/3 | Maximum d²/3 |', '| --- | ---: | ---: | ---: | ---: | ---: |');
    for (const o of g.objects.slice(0, 5)) lines.push(`| ${o.object} | ${o.n} | ${f5(o.contribution)} | ${f5(o.meanD2Over3)} | ${f5(o.medianD2Over3)} | ${f5(o.maxD2Over3)} |`);
  }
  lines.push('', '## Extreme samples', '', `Samples with d²/3 above ${EXTREME_D2_OVER_3} (all arcs, no exclusions, object aggregates only).`, '', '| Class | Object | Samples | In flagged arcs | Truth epochs | Max d²/3 | Max position error (km) |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const x of metrics.extremes) lines.push(`| ${x.group} | ${x.object} | ${x.samples} | ${x.flagged} | ${x.truthEpochs} | ${f5(x.maxD2Over3)} | ${f5(x.maxErrorKm)} |`);
  // What the window could test: classes whose cells lack 30 samples from 3 objects (a property of the truth available for the window, not of the calibration).
  const thin = [...new Set(cells.map(x => x.group))].map(g => { const xs = cells.filter(x => x.group === g), n = xs.map(x => x.n); return { g, insufficient: xs.filter(x => x.decision === 'INSUFFICIENT').length, min: Math.min(...n), max: Math.max(...n), objects: Math.max(...xs.map(x => x.objects)) }; }).filter(x => x.insufficient);
  lines.push('', '## What the window could test', '', thin.length ? `Cells that cannot reach 30 samples from 3 objects are INSUFFICIENT and count as not realistic; that is the truth available in the window, not the calibration: ${thin.map(x => `${x.g} ${x.insufficient}/6 cells (${x.min}-${x.max} samples, at most ${x.objects} objects)`).join('; ')}.` : 'Every cell reached 30 samples from 3 objects.');
  const cs = metrics.counts;
  lines.push('', '## Integrity and limits', '', `Run ${manifest.run}; ${manifest.workers} bounded single-threaded workers. Test arcs ${cs.arcs} (${cs.skipped} skipped, ${cs.samples} samples, ${cs.missingHorizons} absent horizons). Cell success does not certify an object; the models are aggregate MODELs per class and horizon (and tier), fitted on training weeks only. The truth for the test window was refreshed on 2026-10-26 (download cache kept in the durable run directory). Sources: Space-Track / USSPACECOM / 18th Space Defense Squadron; ILRS; IGS (Johnston et al. 2017); © ESA/ESOC 2026; modified Copernicus Sentinel data 2026; ESA Swarm precise orbits; UCAR COSMIC Program, 2019: COSMIC-2 Data Products, doi:10.5065/T353-C093 (CC BY 4.0). GFZ weather CC BY 4.0.`,
    'E2E: `node experiments/v1c5/run.mjs --check`.', '');
  return lines.join('\n');
}

export function modelRecord({ metrics, sel, spec, manifest, config }) {
  const c = metrics.candidates[metrics.selected], claims = {};
  for (const x of c.cells[c.claimedView]) if (x.decision === 'REALISTIC') (claims[x.group] ??= []).push(x.hours);
  const cand = spec.candidates.find(x => x.name === metrics.selected);
  return { kind: 'v1c5-sgp4-calibration-application', registration: metrics.registration,
    population: { source: 'analysis/gp-error-model/data/e14-s3-kc.erm', sha256: config.runtime.files['analysis/gp-error-model/data/e14-s3-kc.erm'] },
    SGP4: { candidate: cand.name, base: cand.base, method: cand.method, tiering: cand.tiering, claim: cand.claim, factors: sel.models[cand.name].model ? `${safe(cand.name)}.erm` : null },
    tiers: spec.risk ? { risk: spec.risk } : null, eventRule: { ...config.events },
    claims, application: 'Construct N (object_covariance), F (N plus the age-zero population floor when EMPIRICAL) or P (population at actual age); choose the group of the object (its class, FLAGGED when the causal event rule flags it, the risk tier where registered) and apply the MODEL via calibrate_covariance. Only the cells listed in claims are realistic.',
    selectedOn: 'August to early-October training weeks only; see selectionFreeze in manifest.json' };
}

export function publish({ ctx, metrics, sel }) {
  const { run, output, config, spec } = ctx, manifest = run.manifest;
  const committed = { ...manifest, inputs: summarizeInputs(manifest.inputs, { root: manifest.repositoryRoot, runDir: manifest.runDirectory }), repositoryRoot: undefined, runDirectory: undefined };
  fs.writeFileSync(path.join(output, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(committed, null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'MODEL.json'), JSON.stringify(modelRecord({ metrics, sel, spec, manifest, config }), null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'table.json'), JSON.stringify(readerTable(metrics, sel, spec), null, 2) + '\n');
  fs.writeFileSync(path.join(output, 'README.md'), render(metrics, manifest, sel, spec, config));
}
