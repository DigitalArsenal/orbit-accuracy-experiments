// Step 90: E12's report (PLAN.md section 10), generated from run outputs:
// the synthetic acceptance (A1-A3), the classifiers, the reference-engine
// cases, the SPICE validation, and per operator the identified configuration,
// default against matched closure and the attribution. Writes
// results/e12/<id>/REPORT.md and metrics.json, and copies each run's manifest.
//   node steps/90-report.mjs --train <runs> --model <file> --validate <runs> --reference <runs>
//        --spice <file> --dev <runs> --consensus <file> --heldout <runs>
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { repoRoot } from '../../../harness/provenance.mjs';
import { median, quantile } from '../../../harness/stats.mjs';
import { ORDER } from '../gauntlet.mjs';
import { applies } from './20-train.mjs';

const { values } = parseArgs({ options: Object.fromEntries(['train', 'model', 'validate', 'reference', 'spice', 'dev', 'consensus', 'heldout', 'id'].map((k) => [k, { type: 'string' }])) });
const rowsOf = (ids) => (ids ? ids.split(',').flatMap((id) => fs.readFileSync(path.join(repoRoot, 'runs', id, 'cases.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))) : []);
const runIds = (ids) => (ids ? ids.split(',') : []);
const cm = (m) => (m == null ? '–' : m < 0.01 ? `${(m * 1000).toFixed(2)} mm` : m < 10 ? `${(m * 100).toFixed(1)} cm` : m < 1e4 ? `${m.toFixed(1)} m` : `${(m / 1000).toFixed(1)} km`);
const md = [], metrics = {};
const id = values.id ?? `e12-physics-match-90-report-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
const outDir = path.join(repoRoot, 'results', 'e12', id);
fs.mkdirSync(outDir, { recursive: true });
for (const r of ['train', 'validate', 'reference', 'dev', 'heldout'].flatMap((k) => runIds(values[k]))) {
  const f = path.join(repoRoot, 'runs', r, 'manifest.json');
  if (fs.existsSync(f)) { fs.mkdirSync(path.join(outDir, 'manifests'), { recursive: true }); fs.copyFileSync(f, path.join(outDir, 'manifests', `${r}.json`)); }
}

// ── A1: the generating hypothesis closes within 1 cm ──
const train = rowsOf(values.train).filter((r) => !r.error);
if (train.length) {
  const errors = rowsOf(values.train).filter((r) => r.error);
  const byRegime = {};
  for (const r of train) (byRegime[r.regime] ??= []).push(r);
  md.push('## A1 — the generating hypothesis reproduces the second half', '', `${train.length} synthetic segments (${errors.length} failed to run). Closure RMS and max over every second-half point, fit to the first half with the hypothesis that generated the file.`, '',
    '| Regime | n | ≤ 1 cm (RMS) | median RMS | 95th pct RMS | worst max | default hypothesis median RMS |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |');
  for (const [regime, rows] of Object.entries(byRegime).sort()) {
    const rms = rows.map((r) => r.oracle.closureRms), mx = rows.map((r) => r.oracle.closureMax);
    md.push(`| ${regime} | ${rows.length} | ${rows.filter((r) => r.oracle.closureRms <= 0.01).length} | ${cm(median(rms))} | ${cm(quantile(rms, 0.95))} | ${cm(Math.max(...mx))} | ${cm(median(rows.map((r) => r.default.closureRms)))} |`);
  }
  const fails = train.filter((r) => r.oracle.closureRms > 0.01);
  metrics.A1 = { n: train.length, pass: train.length - fails.length, errors: errors.length, fails: fails.map((r) => ({ id: r.id, regime: r.regime, truth: r.truthLabel, closureRms: r.oracle.closureRms, closureMax: r.oracle.closureMax, publish: r.publish })) };
  if (fails.length) md.push('', 'Above 1 cm:', '', ...fails.map((r) => `- ${r.id} (${r.regime}) \`${r.truthLabel}\`: ${cm(r.oracle.closureRms)} RMS, ${cm(r.oracle.closureMax)} max`));
  md.push('');
}

// ── Classifiers ──
if (values.model) {
  const m = JSON.parse(fs.readFileSync(path.resolve(repoRoot, values.model), 'utf8'));
  md.push('## Classifiers (5-fold cross-validation on the training set)', '', '| Axis | n | levels | CV accuracy | majority rate | top features |', '| --- | ---: | ---: | ---: | ---: | --- |');
  metrics.classifiers = {};
  for (const [axis, a] of Object.entries(m.axes)) {
    if (!a.model) continue;
    md.push(`| ${axis} | ${a.n} | ${a.classes.length} | ${a.cvAccuracy.toFixed(2)} | ${a.majorityRate.toFixed(2)} | ${a.topFeatures.slice(0, 3).map(([f]) => f).join(', ')} |`);
    metrics.classifiers[axis] = { n: a.n, classes: a.classes, cvAccuracy: a.cvAccuracy, majorityRate: a.majorityRate, confusion: a.confusion };
  }
  md.push('');
}

// ── A2/A3: the tournament on held-out synthetic segments ──
const validate = rowsOf(values.validate).filter((r) => !r.error);
const axisOf = (h, axis) => (axis === 'DRAG' ? `${h.atmosphere}${['NRLMSISE00', 'JB2008', 'JACCHIA_ROBERTS'].includes(h.atmosphere) ? `:${h.spaceWeather}` : ''}` : String(h[axis]));
if (validate.length) {
  md.push('## A2 — recovery of the generating configuration (tournament, validation set)', '', `${validate.length} segments. Correct / wrong / unresolved per axis, counted where the axis acts; "unresolved" = the wrong level also closes at the 2 mm floor.`, '',
    '| Axis | correct | wrong | of which unresolved | accuracy (resolved) |', '| --- | ---: | ---: | ---: | ---: |');
  metrics.A2 = {};
  for (const axis of ORDER) {
    const rows = validate.filter((r) => (axis === 'DRAG' ? applies('atmosphere', r) : axis === 'earthRadiation' ? r.truth.srp === 'CANNONBALL' : true));
    let ok = 0, bad = 0, unresolved = 0;
    const confusion = {};
    for (const r of rows) {
      const t = axisOf(r.truth, axis), i = axisOf(r.identified, axis);
      ((confusion[t] ??= {})[i] ??= 0); ++confusion[t][i];
      if (t === i) ++ok; else { ++bad; if (r.confidence?.[axis] === 'unresolved' || r.score.closureRms <= 0.002) ++unresolved; }
    }
    const resolved = ok + bad - unresolved;
    md.push(`| ${axis} | ${ok} | ${bad} | ${unresolved} | ${resolved ? (ok / resolved).toFixed(2) : '–'} |`);
    metrics.A2[axis] = { correct: ok, wrong: bad, unresolved, confusion };
  }
  const closes = validate.filter((r) => r.score.closureRms <= 0.01);
  md.push('', `**A3.** The identified hypothesis closes within 1 cm (RMS) on ${closes.length} of ${validate.length} segments (median ${cm(median(validate.map((r) => r.score.closureRms)))}; the generating hypothesis: median ${cm(median(validate.filter((r) => r.oracle).map((r) => r.oracle.closureRms)))}; the default: median ${cm(median(validate.map((r) => r.default.closureRms)))}). Median tournament size ${median(validate.map((r) => r.evaluations))} fits.`, '');
  md.push('Confusion matrices (truth → identified) per axis are in metrics.json `A2`.', '');
  metrics.A3 = { n: validate.length, within1cm: closes.length, rows: validate.map((r) => ({ id: r.id, regime: r.regime, truth: r.truthLabel, identified: r.identifiedLabel, closureRms: r.score.closureRms, oracleRms: r.oracle?.closureRms ?? null, defaultRms: r.default.closureRms, evaluations: r.evaluations })) };
}

// ── Reference engines ──
const reference = rowsOf(values.reference);
if (reference.length) {
  md.push('## Reference-engine truths (Orekit, GMAT)', '', '| Case | Truth | Default closure | Identified | Identified closure | Same physics in HPOP: closure |', '| --- | --- | ---: | --- | ---: | ---: |');
  for (const r of reference) {
    if (r.error) { md.push(`| ${r.id} | error: ${r.error.split('\n')[0].slice(0, 120)} | | | | |`); continue; }
    md.push(`| ${r.id} | ${r.truth.inHpop === false ? r.truth.description : r.truthLabel} | ${cm(r.default.closureRms)} | \`${r.identifiedLabel}\` | ${cm(r.score.closureRms)} | ${r.oracle ? cm(r.oracle.closureRms) : 'not in HPOP'} |`);
  }
  metrics.reference = reference.map((r) => ({ id: r.id, error: r.error ?? null, truth: r.truthLabel, defaultRms: r.default?.closureRms, identified: r.identifiedLabel, closureRms: r.score?.closureRms, oracleRms: r.oracle?.closureRms ?? null }));
  md.push('');
}

// ── SPICE ──
if (values.spice) {
  const s = JSON.parse(fs.readFileSync(path.resolve(repoRoot, values.spice), 'utf8'));
  metrics.spice = s;
  md.push('## SPICE validation of HPOP\'s frames, time and ephemerides', '', 'See metrics.json `spice` for every number; summary in the README.', '');
}

// ── Operators ──
const dev = rowsOf(values.dev), held = rowsOf(values.heldout);
if (dev.length || held.length) {
  const consensus = values.consensus ? JSON.parse(fs.readFileSync(path.resolve(repoRoot, values.consensus), 'utf8')) : { groups: {} };
  const groups = [...new Set([...dev, ...held].map((r) => r.group))].sort();
  metrics.operators = {};
  md.push('## Operators', '');
  for (const g of groups) {
    const d = dev.filter((r) => r.group === g), h = held.filter((r) => r.group === g);
    const dc = d.flatMap((r) => (r.chunks ?? []).map((c) => ({ ...c, key: r.id, source: r.source }))), hc = h.flatMap((r) => (r.chunks ?? []).map((c) => ({ ...c, key: r.id, source: r.source })));
    md.push(`### ${g}`, '', `Consensus: \`${JSON.stringify(consensus.groups[g]?.hypothesis ?? {})}\` (overrides of the default; ${consensus.groups[g]?.segments ?? 0} dev segments).`, '');
    if (dc.length) {
      md.push('| Dev segment | Chunk | Default closure (RMS / max) | Identified | Closure (RMS / max) | Confidence (strong axes) | Remaining: dominant |', '| --- | --- | --- | --- | --- | --- | --- |');
      for (const c of dc) md.push(`| ${c.key} | ${c.chunk[0].slice(0, 16)} +${((Date.parse(c.chunk[1]) - Date.parse(c.chunk[0])) / 3600000).toFixed(0)} h | ${cm(c.default.closureRms)} / ${cm(c.default.closureMax)} | \`${c.identifiedLabel}\` | ${cm(c.score.closureRms)} / ${cm(c.score.closureMax)} | ${Object.entries(c.confidence).filter(([, v]) => v === 'strong').map(([k]) => k).join(', ') || '–'} | ${c.attribution.dominant} |`);
      md.push('');
    }
    if (hc.length) {
      md.push('| Held-out segment | Default closure (RMS / max) | Matched closure (RMS / max) | Ratio | Remaining: dominant |', '| --- | --- | --- | ---: | --- |');
      for (const c of hc) md.push(`| ${c.key} ${c.chunk[0].slice(0, 16)} | ${cm(c.default.closureRms)} / ${cm(c.default.closureMax)} | ${cm(c.matched.closureRms)} / ${cm(c.matched.closureMax)} | ${(c.matched.closureRms / c.default.closureRms).toFixed(3)} | ${c.attribution.dominant} |`);
      md.push('', `Median: default ${cm(median(hc.map((c) => c.default.closureRms)))}, matched ${cm(median(hc.map((c) => c.matched.closureRms)))}.`, '');
    }
    const failed = [...d, ...h].filter((r) => r.error);
    if (failed.length) md.push(`Not scored: ${failed.map((r) => `${r.id} (${r.error.split('\n')[0].slice(0, 100)})`).join('; ')}.`, '');
    metrics.operators[g] = { consensus: consensus.groups[g] ?? null, dev: dc.map((c) => ({ key: c.key, url: c.source?.url, sha256: c.source?.sha256, chunk: c.chunk, default: c.default, identified: c.identifiedLabel, hypothesis: c.identified, score: c.score, confidence: c.confidence, presets: c.presets, attribution: c.attribution })),
      heldout: hc.map((c) => ({ key: c.key, url: c.source?.url, sha256: c.source?.sha256, chunk: c.chunk, default: c.default, matched: c.matched, attribution: c.attribution })), failed: failed.map((r) => ({ id: r.id, error: r.error.slice(0, 300) })) };
  }
}

fs.writeFileSync(path.join(outDir, 'REPORT.md'), `# E12 report ${id}\n\nGenerated by \`steps/90-report.mjs\` from the runs whose manifests are in \`manifests/\`.\n\n${md.join('\n')}\n`);
fs.writeFileSync(path.join(outDir, 'metrics.json'), `${JSON.stringify(metrics, null, 1)}\n`);
console.log(outDir);
