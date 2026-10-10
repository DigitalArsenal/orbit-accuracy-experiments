#!/usr/bin/env node
// The per-group table of a finished run, from its summary.json files; and pairs.tsv, one line per fitted pair.
//   node table.mjs <run directory>
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
if (!dir) throw new Error('usage: node table.mjs <run directory>');
const run = JSON.parse(fs.readFileSync(path.join(dir, 'run.json'), 'utf8'));
const m = (x, d = 1) => (Number.isFinite(x) ? x.toFixed(d) : '-');
const reasons = (u) => Object.entries(u ?? {}).map(([k, v]) => `${k} ${v}`).join(', ') || '-';
const lines = ['| group | objects | paired | whole window | within 2 % | fitted | ours lower | median diff (m) | max diff (m) | median / max, whole window (m) | unpaired |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |'];
for (const [g, s] of Object.entries(run.groups)) {
  lines.push(`| ${g} | ${s.objects} | ${s.paired ?? 0} | ${s.completeWindow?.pairs ?? 0} | ${s.cleanPairs?.pairs ?? 0} | ${s.fitted ?? 0} | ${s.oursLower ?? 0} | ${m(s.diffM?.median, 2)} | ${m(s.diffM?.max, 1)} | ${m(s.completeWindow?.diffM?.median, 2)} / ${m(s.completeWindow?.diffM?.max, 1)} | ${s.reason ? s.reason.code : reasons(s.unpaired)} |`);
}
console.log(lines.join('\n'));
const t = run.timing;
console.log(`\nwall ${(t.wallSeconds / 60).toFixed(1)} min; fetch ${(t.fetchMs / 1000).toFixed(0)} s over ${t.fetchRequests} requests (${(t.fetchBytes / 2 ** 20).toFixed(0)} MiB); workers busy ${(t.workerMs / 1000).toFixed(0)} s (read ${(t.readMs / 1000).toFixed(0)}, score ${(t.scoreMs / 1000).toFixed(0)}, fit ${(t.fitMs / 1000).toFixed(0)}); ${t.workers} workers`);

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
