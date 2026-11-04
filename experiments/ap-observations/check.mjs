#!/usr/bin/env node
// E2E (experiments-ap-observations-laser-20261104): the registered AP-from-normal-points measurement holds together.
//   1. the plan-freeze commit (PLAN.md and config.json, unchanged since) precedes the commit that first carries table.json;
//   2. every one of the 206 cutoffs has exactly one row, and its AP arm is exactly one stored AP $OCM (MEAN_ELEMENT_THEORY
//      AP, the row's SHA-256) flown alone, or a named refusal (a module's code, or an input gap such as no NSGF state at the
//      first-guess epoch) counted as a failure;
//   3. table.json's medians and 95ths for days 1 / 2 / 3 re-score equal: the stored AP $OCMs (both AP arms) flown again by
//      propagator/sdn-ap and scored again by analysis/reference-states compare_to_reference; the other arms from the rows;
//   4. the EXCLUDE lists hold (no held NORAD, no Starlink, no capture path among the inputs or the store).
//   node experiments/ap-observations/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { Worker } from 'node:worker_threads';
import * as L from './lib.mjs';
import { readRows, summarize, ARMS } from './table.mjs';

const { config, DAY, iso } = L;
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };
const git = (...a) => execFileSync('git', a, { cwd: L.root }).toString().trim();

console.log('1. registration before the run');
L.frozen();
const planCommits = git('log', '--format=%H %cI', '--', 'experiments/ap-observations/PLAN.md', 'experiments/ap-observations/config.json').split('\n');
const tableCommit = git('log', '--reverse', '--format=%H %cI', '--', 'results/ap-observations/table.json').split('\n')[0];
const [planSha, planAt] = planCommits.at(-1).split(' '), [tableSha, tableAt] = (tableCommit || ' ').split(' ');
check(planCommits.length === 1, `PLAN.md and config.json: one commit (${planSha.slice(0, 7)}), unchanged since`);
check(Boolean(tableSha) && Date.parse(planAt) < Date.parse(tableAt) && git('merge-base', '--is-ancestor', planSha, tableSha) === '',
  `plan ${planSha.slice(0, 7)} at ${planAt} precedes results ${tableSha?.slice(0, 7)} at ${tableAt}`);

console.log('2. one AP $OCM per cutoff, flown alone, or a named refusal');
const rows = readRows();
const keys = rows.map(L.keyOf);
check(rows.length === config.cutoffs.length && new Set(keys).size === rows.length && config.cutoffs.every((c) => keys.includes(L.keyOf(c))),
  `${rows.length} rows, ${new Set(keys).size} distinct, of ${config.cutoffs.length} cutoffs`);
let stored = 0, refusedNamed = 0, bad = [];
for (const r of rows) {
  const dir = path.join(L.store, 'products', L.stampOf(r));
  const ocms = fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f === 'ap.ocm') : [];
  if (r.arms.ap.ok) {
    const bytes = ocms.length === 1 ? fs.readFileSync(path.join(dir, 'ap.ocm')) : null;
    const ocm = bytes && L.OCMm.OCM.getRootAsOCM(new L.flatbuffers.ByteBuffer(new Uint8Array(bytes)));
    const theory = ocm && L.OCMm.meanElementSource[ocm.unpack().MEAN_ELEMENTS?.MEAN_ELEMENT_THEORY];
    if (bytes && L.sha256(bytes) === r.apOcm.sha256 && theory === 'AP') stored += 1; else bad.push(`${r.target} ${r.cutoff}`);
  } else if (/^[a-z][a-z-]*:/.test(String(r.arms.ap.refused ?? '')) || (r.arms.ap.stage === 'inputs' && String(r.arms.ap.refused ?? '').length > 0)) refusedNamed += 1; // a module's code, or a named input gap else bad.push(`${r.target} ${r.cutoff} unnamed`);
}
check(bad.length === 0 && stored + refusedNamed === rows.length, `${stored} stored AP $OCMs (theory AP, SHA-256 as recorded) + ${refusedNamed} named refusals = ${stored + refusedNamed}${bad.length ? `; bad ${bad.slice(0, 5).join('; ')}` : ''}`);

console.log('3. table.json re-scores from the stored products');
const table = JSON.parse(fs.readFileSync(path.join(L.results, 'table.json')));
// The re-flight in 8 worker threads (each its own sdn-ap and reference-states hosts), rows dealt round robin.
const shards = 8;
const parts = await Promise.all(Array.from({ length: shards }, (_, k) => new Promise((resolve, reject) => {
  const w = new Worker(new URL('./rescore.mjs', import.meta.url), { workerData: { rows: rows.filter((_, i) => i % shards === k) } });
  w.on('message', resolve); w.on('error', reject); w.on('exit', (code) => code && reject(new Error(`rescore worker ${k} exited ${code}`)));
})));
const rescored = new Map(parts.flat());
const fresh = summarize(rows, (row, arm) => (arm in rescored.get(L.keyOf(row)) ? rescored.get(L.keyOf(row))[arm] : row.arms[arm]));
for (const arm of Object.keys(ARMS)) for (const d of config.leadDays) {
  const a = table.arms[arm].days[d], b = fresh[arm].days[d];
  check(a.medianKm === b.medianKm && a.p95Km === b.p95Km && a.n === b.n, `${arm} day ${d}: median ${a.medianKm?.toFixed(4)} km, 95th ${a.p95Km?.toFixed(4)} km, n ${a.n} (re-scored ${b.medianKm?.toFixed(4)}, ${b.p95Km?.toFixed(4)}, ${b.n})`);
}

console.log('4. EXCLUDE lists');
const held = rows.filter((r) => config.EXCLUDE_NORADS.includes(Number(r.norad)) || new RegExp(config.EXCLUDE_NAME_PATTERN, 'i').test(r.target));
check(held.length === 0, `${held.length} rows of held objects (Swarm, GRACE-FO, six Galileo, Starlink)`);
const paths = [...Object.keys(config.inputs), config.store, ...rows.map((r) => r.inputs?.sinex ?? '')];
const capture = paths.filter((p) => config.EXCLUDE_PATHS.some((x) => p.toLowerCase().includes(x)));
check(capture.length === 0, `${capture.length} input or store paths under a held or capture location`);

if (failures.length) { console.log(`\nFAIL ${failures.length}: ${failures.join('; ')}`); process.exit(1); }
const ap = table.arms.ap.days;
console.log(`\nPASS ap-observations: AP from normal points ${table.arms.ap.scored}/${table.arms.ap.attempted}, median ${config.leadDays.map((d) => ap[d].medianKm?.toFixed(3)).join('/')} km ` +
  `(95th ${config.leadDays.map((d) => ap[d].p95Km?.toFixed(3)).join('/')}) at days 1/2/3; B2 ${config.b2.medianKm.sdnap.join('/')}`);
process.exit(0);
