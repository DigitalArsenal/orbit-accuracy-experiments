#!/usr/bin/env node
// The per-group table of a finished run, from its summary.json files; and pairs.tsv, one line per fitted pair.
//   node table.mjs <run directory>
import fs from 'node:fs';
import path from 'node:path';
import { summarize } from './lib/summary.mjs';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node table.mjs <run directory>');
const run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
// The statistics are recomputed from the rows the pass wrote (lib/summary.mjs as it stands now), so that one definition serves every run.
for (const [g, s] of Object.entries(run.groups)) {
  const file = path.join(dir, g, 'rows.jsonl');
  if (!fs.existsSync(file)) continue;
  const fresh = summarize(g, null, fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(JSON.parse));
  delete fresh.snapshot;
  run.groups[g] = { ...s, ...fresh };
}
const m = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const reasons = (u) => Object.entries(u ?? {}).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
const lines = ['| group | objects | paired (gate pass) | whole window | within 2 % | fitted | ours lower | lower by > 1 cm | lower by > 1 m | median diff (m) | max diff (m) | median / max, whole window (m) | unpaired |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |'];
for (const [g, s] of Object.entries(run.groups)) {
  lines.push(`| ${g} | ${s.objects} | ${s.paired ?? 0} | ${s.completeWindow?.pairs ?? 0} | ${s.cleanPairs?.pairs ?? 0} | ${s.fitted ?? 0} | ${s.oursLower ?? 0} | ${s.oursLowerBy?.cm1 ?? 0} | ${s.oursLowerBy?.m1 ?? 0} | ${m(s.diffM?.median, 2)} | ${m(s.diffM?.max, 1)} | ${m(s.completeWindow?.diffM?.median, 2)} / ${m(s.completeWindow?.diffM?.max, 1)} | ${s.reason ? s.reason.code : reasons(s.unpaired)} |`);
}
console.log(lines.join('\n'));

// The window each group was scored on, and the evidence. CelesTrak's set is scored on every version that holds the whole
// window over the chosen window and over windows 0.5, 0.75, 1.5 and 2 times as long (same start). Each cell: the share of
// those versions on which the published RMS is reproduced within the gate (max(5 m, 10 %)) on the alternative window, then
// on the chosen window over the same versions, and the number of versions (a window cut by the end of the file is no test).
const pct = (x) => (Number.isFinite(x) ? `${(100 * x).toFixed(0)} %` : '-');
const factors = ['0.5', '0.75', '1.5', '2'];
const proof = ['| group | window (h) | versions | chosen window: reproduced | x0.5 | x0.75 | x1.5 | x2 |', '| --- | --- | ---: | ---: | --- | --- | --- | --- |'];
const ratios = ['| group | chosen | x0.5 | x0.75 | x1.5 | x2 | ours (fitted) / published, within-2 % sets: p10, median, p90 (n) |', '| --- | ---: | ---: | ---: | ---: | ---: | --- |'];
for (const [g, s] of Object.entries(run.groups)) {
  const w = s.windowProof;
  if (!w) continue;
  const cell = (f) => { const b = w.byFactor[f]; return b ? `${pct(b.alternative.withinGate)} vs ${pct(b.chosen.withinGate)} (${b.versions})` : 'not tested'; };
  proof.push(`| ${g} | ${s.window?.hours ?? '-'} | ${w.versions} | ${pct(w.chosen.withinGate)} (${pct(w.chosen.within2pct)} within 2 %) | ${factors.map(cell).join(' | ')} |`);
  const ratio = (f) => { const b = w.byFactor[f]; return b ? `${m(b.alternative.medianRatio, 3)} (${m(b.chosen.medianRatio, 3)})` : '-'; };
  const o = s.oursOverPublished?.clean;
  ratios.push(`| ${g} | ${m(w.chosen.medianRatio, 3)} | ${factors.map(ratio).join(' | ')} | ${o?.n ? `${m(o.p10, 3)}, ${m(o.median, 3)}, ${m(o.p90, 3)} (${o.n})` : '-'} |`);
}
console.log(`\n${proof.join('\n')}\n\nmedian of recomputed / published RMS on the alternative window (on the chosen window, same versions in brackets)\n\n${ratios.join('\n')}`);

// The evidence that does not depend on the version: our fitted minimum over each window against the published RMS, on the
// sampled sets whose version holds the whole window and reproduces the published RMS within 2 %. Each cell: median of
// fitted minimum / published, and the share of sets within 2 % of the published RMS.
const fits = ['| group | window (h) | sets | chosen window | x0.5 | x0.75 | x1.5 | x2 |', '| --- | --- | ---: | --- | --- | --- | --- | --- |'];
for (const [g, s] of Object.entries(run.groups)) {
  const w = s.windowFits;
  if (!w) continue;
  const cell = (f) => (w[f] ? `${m(w[f].medianRatio, 3)} (${pct(w[f].within2pct)}; n ${w[f].sets})` : 'not tested');
  fits.push(`| ${g} | ${s.window?.hours ?? '-'} | ${w.sets} | ${cell('1')} | ${factors.map(cell).join(' | ')} |`);
}
console.log(`\nfitted minimum RMS over each window / published RMS\n\n${fits.join('\n')}`);
const t = run.timing;
console.log(`\nwall ${(t.wallSeconds / 60).toFixed(1)} min; fetch ${(t.fetchMs / 1000).toFixed(0)} s over ${t.fetchRequests} requests (${(t.fetchBytes / 2 ** 20).toFixed(0)} MiB); workers busy ${(t.workerMs / 1000).toFixed(0)} s (read ${(t.readMs / 1000).toFixed(0)}, score ${(t.scoreMs / 1000).toFixed(0)}, fit ${(t.fitMs / 1000).toFixed(0)}, fits on the other windows ${((t.windowFitMs ?? 0) / 1000).toFixed(0)}); ${t.workers} workers`);

// pairs.tsv, and E11's pairing rule (the version starting last at or before the EPOCH) against the candidate test.
const tsv = ['group\tnorad\tname\tset epoch\tversion\twindow\twhole window\tcausal\tpublished RMS km\tCelesTrak RMS km\tours RMS km\tCelesTrak minus ours m\tours lower'];
for (const g of Object.keys(run.groups)) {
  const file = path.join(dir, g, 'rows.jsonl');
  if (!fs.existsSync(file)) continue;
  let rule = 0, ruleN = 0, paired = 0, total = 0;
  for (const line of fs.readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
    const r = JSON.parse(line);
    ++total;
    if (r.status === 'paired') ++paired;
    const prior = (r.candidates ?? []).filter((c) => c.startUtc && Date.parse(c.startUtc) <= Date.parse(`${r.setEpoch}Z`)).sort((a, b) => Date.parse(b.startUtc) - Date.parse(a.startUtc))[0];
    if (prior) { ++ruleN; if (prior.pass) ++rule; }
    if (r.status === 'paired' && r.comparison) tsv.push([g, r.norad, r.name, r.setEpoch, r.version.id, `${r.window.from}..${r.window.to}`, r.window.complete, r.causal, r.publishedRmsKm, r.supgp.rmsPerCoordinateKm, r.ours.rms.rmsPerCoordinateKm, r.comparison.supgpMinusOursM.toFixed(3), r.comparison.oursLower].join('\t'));
  }
  if (g === 'starlink') console.log(`\nstarlink pairing: E11's rule (latest start at or before the EPOCH) passes the gate on ${rule} of ${ruleN} sets (${m(100 * rule / ruleN)} %); trying the candidate versions pairs ${paired} of ${total} (${m(100 * paired / total)} %)`);
}
fs.writeFileSync(path.join(dir, 'pairs.tsv'), `${tsv.join('\n')}\n`);
console.log(`\n${tsv.length - 1} fitted pairs in ${path.join(dir, 'pairs.tsv')}`);
