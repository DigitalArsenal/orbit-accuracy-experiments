#!/usr/bin/env node
// E2E (experiments-satnogs-optical-ap-registered-20261104): the registration and its results.
//   1. sha256(PLAN.md) equals PLAN.sha256, and PLAN.sha256 is the one committed with the registration;
//   2. the arc list recomputed from the captured tracks.parquet files (and the registered DORIS product names) equals the
//      registered list: 15 arcs, 14 scorable;
//   3. no EXCLUDE NORAD (Swarm, GRACE-FO, the six Galileo) and no Starlink name in any result row;
//   4. every result row has a lead day, the build hash and the input class observations/CC-BY-SA-4.0;
//   5. the number of cells equals the registered number: 42 AP and 42 B, one row per (arc, arm, lead day).
//   node experiments/satnogs-optical-ap/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { recomputeArcs, HELD } from './arcs.mjs';

const here = path.dirname(new URL(import.meta.url).pathname);
const root = path.resolve(here, '../..');
const M = process.env.SDN_MODULES_ROOT ?? '/Users/tj/software/private/coordinator-d9/space-data-network-modules-c';
const { readParquet } = await import(pathToFileURL(path.join(M, 'data-source/satnogs-optical-source/tests/parquet.mjs')).href);
const reg = JSON.parse(fs.readFileSync(path.join(here, 'registered.json'), 'utf8'));
const table = JSON.parse(fs.readFileSync(path.join(root, 'results/satnogs-optical-ap/table.json'), 'utf8'));
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };

// 1. the plan hash
const planHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(here, 'PLAN.md'))).digest('hex');
const recorded = fs.readFileSync(path.join(here, 'PLAN.sha256'), 'utf8').trim();
const committed = execFileSync('git', ['-C', root, 'log', '--diff-filter=A', '--format=%H', '--', 'experiments/satnogs-optical-ap/PLAN.sha256']).toString().trim().split('\n').at(-1);
const atRegistration = committed ? execFileSync('git', ['-C', root, 'show', `${committed}:experiments/satnogs-optical-ap/PLAN.sha256`]).toString().trim() : '';
check(planHash === recorded && recorded === atRegistration, `PLAN.md sha256 ${planHash.slice(0, 12)} = PLAN.sha256 ${recorded.slice(0, 12)} = registration ${committed.slice(0, 8)}'s ${atRegistration.slice(0, 12)}`);
check(table.planSha256 === planHash, `results carry the plan hash ${String(table.planSha256).slice(0, 12)}`);

// 2. the arcs
const arcs = await recomputeArcs({ readParquet, dorisNames: reg.dorisProductNames });
const key = (a) => `${a.id}|${a.nights}|${a.hours}|${a.scorable}`;
check(arcs.length === 15 && arcs.filter((a) => a.scorable).length === 14, `recomputed ${arcs.length} arcs, ${arcs.filter((a) => a.scorable).length} scorable`);
check(JSON.stringify(arcs.map(key)) === JSON.stringify(reg.arcs.map(key)), 'recomputed arc list equals the registered list');

// 3. EXCLUDE lists
const held = new Set([...HELD.galileo, ...HELD.swarmGraceFo]);
const text = JSON.stringify(table);
check(!table.rows.some((r) => held.has(r.norad)) && !table.stationNights.some((r) => held.has(Number(String(r.arc).split('-')[0]))), 'no EXCLUDE NORAD in any result row');
check(![...held].some((n) => new RegExp(`\\b${n}\\b`).test(text)), 'no EXCLUDE NORAD anywhere in table.json');
check(!/starlink/i.test(text), 'no Starlink name in table.json');

// 4. row fields
check(table.rows.every((r) => [1, 2, 3].includes(r.leadDay) && r.build === reg.build.hash && r.inputClass === 'observations/CC-BY-SA-4.0'),
  `every row: lead day, build ${reg.build.hash.slice(0, 12)}, observations/CC-BY-SA-4.0`);

// 5. cells
const scorable = reg.arcs.filter((a) => a.scorable).map((a) => a.id);
const cells = (arm) => new Set(table.rows.filter((r) => r.arm === arm && scorable.includes(r.arc)).map((r) => `${r.arc}|${r.leadDay}`));
const ap = cells('AP'), b = cells('B');
check(ap.size === reg.cells.ap && reg.cells.ap === 42 && table.rows.filter((r) => r.arm === 'AP').length === 42, `AP cells ${ap.size} of the registered ${reg.cells.ap}`);
check(b.size === reg.cells.b && reg.cells.b === 42 && table.rows.filter((r) => r.arm === 'B').length === 42, `B cells ${b.size} of the registered ${reg.cells.b}`);
const scored = table.rows.filter((r) => r.status === 'scored');
console.log(`  AP scored ${scored.filter((r) => r.arm === 'AP').length}, failures ${table.rows.filter((r) => r.arm === 'AP' && r.status.startsWith('failure')).length}; B scored ${scored.filter((r) => r.arm === 'B').length}`);
check(scored.every((r) => Number.isFinite(r.median3dKm) && Number.isFinite(r.p95_3dKm)), 'every scored cell has a median and a 95th');

if (failures.length) { console.log(`\nFAIL ${failures.length}: ${failures.join('; ')}`); process.exit(1); }
console.log(`\nPASS satnogs-optical-ap: plan ${planHash.slice(0, 12)}; 15 arcs, 14 scorable; 42 AP and 42 B cells; EXCLUDE clean`);
