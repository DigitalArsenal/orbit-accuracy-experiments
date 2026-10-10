#!/usr/bin/env node
// The per-group table of a finished run, from its summary.json files.
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
