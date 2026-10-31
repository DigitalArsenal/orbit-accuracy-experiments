#!/usr/bin/env node
// ca-screen-recall A2: what moved between builds, event by event: this run's screen events against the 0.9.0 run's, per arm.
// Events pair one to one by NORAD pair and TCA within the registered 60 s tolerance, nearest first. Counting only.
//   node experiments/ca-screen-recall/diff-builds.mjs --run <A2 run directory> --baseline <0.9.0 run directory>
// Writes <run>/moved.json. A row names the pair, TCA, miss and speed, as the report's defect rows do; no element set.
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, a2, repo, sha256, DAY_S } from './common.mjs';
import { matchEvents, distribution } from './compare.mjs';

const { values: o } = parseArgs({ options: { run: { type: 'string' }, baseline: { type: 'string' } } });
if (!o.run || !o.baseline) throw new Error('usage: diff-builds.mjs --run DIR --baseline DIR');
const baselineManifest = JSON.parse(fs.readFileSync(path.join(repo, a2.baseline.manifest), 'utf8'));
const iso = (jd) => new Date((jd - 2440587.5) * DAY_S * 1000).toISOString();
const row = (e) => ({ pair: [Math.min(e.primary, e.secondary), Math.max(e.primary, e.secondary)], tcaUtc: iso(e.tcaJd), missM: e.missM, speedMS: e.relSpeedMS });

const referenceSha = sha256(fs.readFileSync(path.join(o.run, 'reference-events.json')));
const out = {
  baselineVersion: a2.baseline.version, baselineRun: path.basename(o.baseline),
  // The SGP4 artifact and the snapshot are the registered ones, so the reference must not move at all.
  reference: { sha256: referenceSha, baselineSha256: baselineManifest.outputs['reference-events.json'], identical: referenceSha === baselineManifest.outputs['reference-events.json'] },
  arms: {},
};
for (const arm of config.screen.arms) {
  const file = `screen-events.${arm.id}.json`;
  const before = fs.readFileSync(path.join(o.baseline, file)), now = fs.readFileSync(path.join(o.run, file));
  const A = JSON.parse(before), B = JSON.parse(now);
  const { refTo, screenTo } = matchEvents(A.map((e) => ({ a: e.primary, b: e.secondary, tcaJd: e.tcaJd })), B, config.comparison.tcaToleranceSeconds);
  const paired = A.flatMap((e, n) => (refTo[n] < 0 ? [] : [{ e, x: B[refTo[n]] }]));
  const diffs = paired.map(({ e, x }) => ({ pair: row(e).pair, baselineTcaUtc: iso(e.tcaJd), dtSeconds: (x.tcaJd - e.tcaJd) * DAY_S, dMissM: x.missM - e.missM, dSpeedMS: x.relSpeedMS - e.relSpeedMS }));
  const largest = (k) => [...diffs].sort((p, q) => Math.abs(q[k]) - Math.abs(p[k])).slice(0, 10);
  out.arms[arm.id] = {
    baselineEvents: A.length, events: B.length, baselineSha256: sha256(before), sha256: sha256(now), paired: paired.length,
    identicalValues: diffs.filter((d) => d.dtSeconds === 0 && d.dMissM === 0 && d.dSpeedMS === 0).length,
    onlyBaseline: A.filter((_, n) => refTo[n] < 0).map(row), onlyThisBuild: B.filter((_, n) => screenTo[n] < 0).map(row),
    tcaSeconds: distribution(diffs.map((d) => Math.abs(d.dtSeconds))), missM: distribution(diffs.map((d) => Math.abs(d.dMissM))), speedMS: distribution(diffs.map((d) => Math.abs(d.dSpeedMS))),
    largestMiss: largest('dMissM'), largestTca: largest('dtSeconds'),
  };
}
fs.writeFileSync(path.join(o.run, 'moved.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(JSON.stringify({ reference: out.reference.identical, arms: Object.fromEntries(Object.entries(out.arms).map(([k, v]) => [k, { baseline: v.baselineEvents, events: v.events, paired: v.paired, onlyBaseline: v.onlyBaseline.length, onlyThisBuild: v.onlyThisBuild.length }])) }));
