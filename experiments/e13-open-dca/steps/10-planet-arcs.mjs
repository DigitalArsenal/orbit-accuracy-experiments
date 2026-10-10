// E13 step 10: the drag of every Planet satellite-day of a split, through the orbital energy (arcs.mjs). One arc is two consecutive
// daily states of one Dove; the result is a derived record per arc (Cd*A/m, its stated sigma, the energy mismatch left), written to
// the derived store, never the states.
//
//   node steps/10-planet-arcs.mjs --split dev|testA|testB [--profile g24lean] [--group calibration,heldOut] [--limit N] [--shard k/n]
//
// The test splits stay locked until PLAN.md and config.json are frozen by a commit (common.mjs assertWindowReadable).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config, experimentDir, paths, appendJsonl, isoZ, readJson, sleep } from '../common.mjs';
import { arcsOf, readPlanetSeries } from '../planet-history.mjs';
import { openArcEnv } from '../arcs.mjs';
import { assertWindowReadable } from '../windows.mjs';

const { values } = parseArgs({ options: { split: { type: 'string' }, profile: { type: 'string' }, group: { type: 'string', default: 'calibration,heldOut' }, limit: { type: 'string' }, shard: { type: 'string', default: '0/1' }, out: { type: 'string' } } });
const P = config.planet;
const profile = values.profile ?? P.arc.profile;
const [from, to] = P.split[values.split] ?? (() => { throw new Error(`unknown split ${values.split}`); })();
assertWindowReadable(values.split);
const sample = readJson(path.join(experimentDir, 'planet-sample.json'));
const hwids = values.group.split(',').flatMap((g) => sample[g] ?? (() => { throw new Error(`unknown group ${g}`); })());
const [shard, shards] = values.shard.split('/').map(Number);
const outFile = values.out ?? path.join(paths.planetArcs, `${values.split}-${profile}.jsonl`);
fs.mkdirSync(path.dirname(outFile), { recursive: true });
const done = new Set(fs.existsSync(outFile) ? fs.readFileSync(outFile, 'utf8').split('\n').filter(Boolean).map((l) => { const r = JSON.parse(l); return `${r.hwid}|${r.ttA}`; }) : []);
const log = (m) => console.log(`${new Date().toISOString().slice(11, 19)} ${m}`);

// All arcs of the split for the chosen Doves, by start time then hardware id.
const series = readPlanetSeries({ fromDay: new Date(Date.parse(`${from}T00:00:00Z`) - 3 * 86400e3).toISOString().slice(0, 10), toDay: new Date(Date.parse(`${to}T00:00:00Z`) + 3 * 86400e3).toISOString().slice(0, 10) });
const jobs = [];
for (const hwid of hwids) {
  const states = series.get(hwid) ?? [];
  for (const arc of arcsOf(states, { minHours: P.arc.minHours, maxHours: P.arc.maxHours })) {
    const day = arc.a.epochTt.slice(0, 10);
    if (day >= from && day <= to) jobs.push({ hwid, ...arc });
  }
}
jobs.sort((x, y) => x.a.ttMs - y.a.ttMs || x.hwid.localeCompare(y.hwid));
const mine = jobs.filter((_, i) => i % shards === shard).slice(0, values.limit ? Number(values.limit) : Infinity);
log(`split ${values.split} ${from}..${to}: ${hwids.length} Doves, ${jobs.length} arcs, ${mine.length} in shard ${shard}/${shards}, ${mine.filter((j) => !done.has(`${j.hwid}|${j.a.ttMs}`)).length} left; profile ${profile}`);

const env = await openArcEnv({ profile });
const last = new Map();                // hwid -> the previous arc's Cd*A/m, the next arc's starting value
for (const j of mine) if (done.has(`${j.hwid}|${j.a.ttMs}`)) { /* the starting value of a resumed run is Planet's own */ }
let n = 0, t0 = performance.now();
for (const j of mine) {
  const key = `${j.hwid}|${j.a.ttMs}`;
  if (done.has(key)) continue;
  while (os.loadavg()[0] > config.compute.pauseAboveLoad1m) await sleep(60e3);
  try {
    const A = await env.toUtcGcrf(j.a), B = await env.toUtcGcrf(j.b);
    const b0 = last.get(j.hwid) ?? (j.a.ballisticKgPerM2 > 0 ? 1 / j.a.ballisticKgPerM2 : P.arc.cdAreaOverMass0);
    const r = await env.energyArc(A, B, { b0, cr: P.arc.crAreaOverMass, sigma: P.arc.sigma });
    if (r.B > 0) last.set(j.hwid, r.B);
    appendJsonl(outFile, { hwid: j.hwid, ttA: j.a.ttMs, ttB: j.b.ttMs, utcA: isoZ(A.ms), utcB: isoZ(B.ms), hours: j.hours, cdAreaOverMass: r.B, sigmaB: r.sigmaB, energyMismatchJkg: r.energyMismatchJkg,
      energySensitivity: r.energySensitivity, iterations: r.iterations, hpopCalls: r.hpopCalls, seconds: r.seconds, steps: r.steps, altitudeKm: r.altitudeKm, nonPositive: !!r.nonPositive,
      planetBallistic: { a: j.a.ballisticKgPerM2, b: j.b.ballisticKgPerM2 }, profile, crAreaOverMass: P.arc.crAreaOverMass, startedFrom: b0 });
  } catch (error) {
    appendJsonl(outFile, { hwid: j.hwid, ttA: j.a.ttMs, ttB: j.b.ttMs, error: String(error.message ?? error).slice(0, 300), profile });
  }
  if (++n % 25 === 0) log(`${n} arcs in ${((performance.now() - t0) / 1000).toFixed(0)} s (${((performance.now() - t0) / 1000 / n).toFixed(1)} s each); at ${isoZ(j.a.ttMs).slice(0, 10)}`);
}
log(`done: ${n} arcs`);
await env.destroy();
