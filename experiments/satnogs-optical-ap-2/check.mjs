#!/usr/bin/env node
// E2E (experiments-satnogs-optical-ap-registered-2-20261104): the second registration and its results.
//   1. sha256(PLAN.md) equals PLAN.sha256 as committed; the registration files are unchanged since the plan commit and
//      PLAN.md names registered.json's and arcs.mjs's hashes; the plan commit precedes the run commit (an ancestor of the
//      commit that added table.json, its author date before every fit's start);
//   2. the arc list recomputed from the captured tracks.parquet files (and the registered DORIS product names) equals the
//      registered list: 15 arcs, 14 scorable;
//   3. every scorable arc has one AP $OCM flown alone (re-flown from ap.ocm alone by sdn-ap propagate, byte-equal to the
//      stored flight) or a registered failure name; every fit ran the registered build and protocol (iteration cap 30);
//   4. every scored cell re-scores equal from the stored products (score.mjs --arc per arc), and so do the pooled tables;
//   5. no EXCLUDE NORAD (Swarm, GRACE-FO, the six Galileo) and no Starlink name in any row, table.json or README.md;
//   6. every row has a lead day, the build hash and the input class observations/CC-BY-SA-4.0;
//   7. 42 AP and 42 B cells, one row per (arc, arm, lead day);
//   8. comparator B's 42 cells equal the first registration's to the digit (same sets, same truth);
//   9. README.md carries the credit line verbatim; no captured or derived SatNOGS batch is committed.
//   node experiments/satnogs-optical-ap-2/check.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import * as L from './lib.mjs';
import { recomputeArcs, HELD } from './arcs.mjs';
import { scoreAll, aggregate } from './score.mjs';

const here = L.HERE, root = L.ROOT, reg = L.REG;
const rel = (p) => path.relative(root, path.join(here, p));
const RES = 'results/satnogs-optical-ap-2';
const table = JSON.parse(fs.readFileSync(path.join(root, RES, 'table.json'), 'utf8'));
const readme = fs.readFileSync(path.join(root, RES, 'README.md'), 'utf8');
const first = JSON.parse(fs.readFileSync(path.join(root, reg.firstRegistration.table), 'utf8'));
const git = (...a) => execFileSync('git', ['-C', root, ...a]).toString();
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };
const scorable = reg.arcs.filter((a) => a.scorable);

// 1. the plan hash, the registration files, the order of the commits
const planHash = L.sha256(fs.readFileSync(path.join(here, 'PLAN.md')));
const recorded = fs.readFileSync(path.join(here, 'PLAN.sha256'), 'utf8').trim();
const added = (p) => git('log', '--diff-filter=A', '--format=%H', '--', p).trim().split('\n').filter(Boolean).at(-1) ?? '';
const planCommit = added(rel('PLAN.sha256')), runCommit = added(`${RES}/table.json`);
const atRegistration = planCommit ? git('show', `${planCommit}:${rel('PLAN.sha256')}`).trim() : '';
check(planHash === recorded && recorded === atRegistration, `PLAN.md sha256 ${planHash.slice(0, 12)} = PLAN.sha256 ${recorded.slice(0, 12)} = registration ${planCommit.slice(0, 8)}'s ${atRegistration.slice(0, 12)}`);
const frozen = ['PLAN.md', 'PLAN.sha256', 'registered.json', 'arcs.mjs'];
check(planCommit && frozen.every((f) => L.sha256(execFileSync('git', ['-C', root, 'show', `${planCommit}:${rel(f)}`])) === L.sha256(fs.readFileSync(path.join(here, f)))),
  `the registration files are as committed at ${planCommit.slice(0, 8)} (${frozen.join(', ')})`);
const plan = fs.readFileSync(path.join(here, 'PLAN.md'), 'utf8');
check(plan.includes(L.sha256(fs.readFileSync(path.join(here, 'registered.json')))) && plan.includes(L.sha256(fs.readFileSync(path.join(here, 'arcs.mjs')))), 'PLAN.md names the sha256 of registered.json and arcs.mjs');
check(table.planSha256 === planHash, `results carry the plan hash ${String(table.planSha256).slice(0, 12)}`);
const fits = scorable.map((a) => JSON.parse(fs.readFileSync(path.join(L.OUT, a.id, 'fit.json'), 'utf8')));
const planAuthor = planCommit ? Date.parse(git('log', '-1', '--format=%aI', planCommit).trim()) : NaN;
const firstStart = Math.min(...fits.map((f) => Date.parse(f.started)));
let ancestor = false;
try { execFileSync('git', ['-C', root, 'merge-base', '--is-ancestor', planCommit, runCommit]); ancestor = Boolean(runCommit) && planCommit !== runCommit; } catch { ancestor = false; }
check(ancestor && planAuthor < firstStart, `the plan commit ${planCommit.slice(0, 8)} precedes the run commit ${runCommit.slice(0, 8)} (ancestor; authored ${new Date(planAuthor).toISOString()}, before the first fit's start ${new Date(firstStart).toISOString()})`);

// 2. the arcs
const arcs = await recomputeArcs({ readParquet: L.readParquet, dorisNames: reg.dorisProductNames });
const key = (a) => `${a.id}|${a.nights}|${a.hours}|${a.scorable}`;
check(arcs.length === 15 && arcs.filter((a) => a.scorable).length === 14, `recomputed ${arcs.length} arcs, ${arcs.filter((a) => a.scorable).length} scorable`);
check(JSON.stringify(arcs.map(key)) === JSON.stringify(reg.arcs.map(key)), 'recomputed arc list equals the registered list');

// 3. one AP $OCM flown alone, or a registered failure name; the registered build and protocol
const names = [...reg.failureNames.initialOrbit, ...reg.failureNames.flow, ...reg.failureNames.after, ...reg.failureNames.harness].map((n) => n.split(' ')[0]);
const registeredName = (s) => names.some((n) => new RegExp(`^${n.replace('<hours>', '[0-9]+\\.[0-9]{2}').replace('<iterations>', '[0-9]+')}$`).test(s));
const sdnAp = await L.host('propagator/sdn-ap');
let flown = 0, named = 0;
for (const f of fits) {
  const dir = path.join(L.OUT, f.arc);
  if (f.status === 'fitted') {
    const ocm = new Uint8Array(fs.readFileSync(path.join(dir, 'ap.ocm')));
    const ap = L.OCM.getRootAsOCM(new L.flatbuffers.ByteBuffer(ocm)).unpack();
    const cfg = L.flightConfig(L.nsOf(f.fitEnd));
    const r = await L.invoke(sdnAp, 'propagate', [L.frame('ocm', L.TY.OCM, ocm), L.frame('configuration', L.TY.PCF, cfg.pcf)]);
    const again = r.error ? null : Buffer.from(L.outputs(r, 'ephemeris')[0]);
    const ok = Boolean(ap.MEAN_ELEMENTS) && again !== null && again.equals(fs.readFileSync(path.join(dir, 'flight.oem'))) && cfg.start === f.flight.start && cfg.stop === f.flight.stop;
    if (ok) ++flown; else check(false, `${f.arc}: the stored flight is not ap.ocm flown alone`);
  } else if (f.status.startsWith('failure:') && registeredName(f.status.slice(8)) && f.refusal) ++named;
  else check(false, `${f.arc}: status ${f.status} is neither fitted nor a registered failure name`);
}
await sdnAp.destroy?.();
check(flown + named === 14, `14 arcs: ${flown} AP $OCMs flown alone (re-flown byte-equal), ${named} registered failure names`);
const builtAs = fits.every((f) => f.build === reg.build.hash && Object.entries(f.wasm).every(([m, h]) => reg.build.artifacts[m]?.wasmSha256 === h) && JSON.stringify(f.protocol) === JSON.stringify(reg.protocol));
check(builtAs && reg.protocol.step.config.maximumIterations === 30, `every fit ran build ${reg.build.hash.slice(0, 12)} (each loaded artifact's sha256 as registered) and the registered protocol (iteration cap ${reg.protocol.step.config.maximumIterations})`);

// 4. every scored cell re-scores equal from the stored products
const again = aggregate(await scoreAll());
const rowsEqual = again.rows.length === table.rows.length && again.rows.every((r, i) => JSON.stringify(r) === JSON.stringify(table.rows[i]));
const scored = table.rows.filter((r) => r.status === 'scored');
check(rowsEqual, `every row re-scores equal from the stored products (${scored.length} scored cells: AP ${scored.filter((r) => r.arm === 'AP').length}, B ${scored.filter((r) => r.arm === 'B').length})`);
check(JSON.stringify(again.pooled) === JSON.stringify(table.pooled) && JSON.stringify(again.common) === JSON.stringify(table.common), 'the pooled and common-cell tables re-score equal');
check(scored.every((r) => Number.isFinite(r.median3dKm) && Number.isFinite(r.p95_3dKm)), 'every scored cell has a median and a 95th');

// 5. EXCLUDE lists
const held = new Set([...HELD.galileo, ...HELD.swarmGraceFo]);
const text = JSON.stringify(table);
check(!table.rows.some((r) => held.has(r.norad)) && !table.stationNights.some((r) => held.has(Number(String(r.arc).split('-')[0]))), 'no EXCLUDE NORAD in any result row');
check(![...held].some((n) => new RegExp(`\\b${n}\\b`).test(text) || new RegExp(`\\b${n}\\b`).test(readme)), 'no EXCLUDE NORAD anywhere in table.json or README.md');
check(!/starlink/i.test(text) && !/starlink/i.test(readme), 'no Starlink name in table.json or README.md');

// 6. row fields
check(table.rows.every((r) => [1, 2, 3].includes(r.leadDay) && r.build === reg.build.hash && r.inputClass === 'observations/CC-BY-SA-4.0'),
  `every row: lead day, build ${reg.build.hash.slice(0, 12)}, observations/CC-BY-SA-4.0`);

// 7. cells
const ids = scorable.map((a) => a.id);
const cells = (arm) => new Set(table.rows.filter((r) => r.arm === arm && ids.includes(r.arc)).map((r) => `${r.arc}|${r.leadDay}`));
check(cells('AP').size === 42 && reg.cells.ap === 42 && table.rows.filter((r) => r.arm === 'AP').length === 42, `AP cells ${cells('AP').size} of the registered ${reg.cells.ap}`);
check(cells('B').size === 42 && reg.cells.b === 42 && table.rows.filter((r) => r.arm === 'B').length === 42, `B cells ${cells('B').size} of the registered ${reg.cells.b}`);

// 8. comparator B equals the first registration's to the digit
const bKeys = ['status', 'samples', 'median3dKm', 'p95_3dKm', 'setAgeHours', 'gpFiles'];
const bSame = table.rows.filter((r) => r.arm === 'B').filter((r) => {
  const o = first.rows.find((x) => x.arm === 'B' && x.arc === r.arc && x.leadDay === r.leadDay);
  return o && bKeys.every((k) => r[k] === o[k]) && JSON.stringify(r.medianAbsKm) === JSON.stringify(o.medianAbsKm);
}).length;
check(bSame === 42, `comparator B: ${bSame} of 42 cells equal the first registration's to the digit`);

// 9. the credit line; nothing captured or derived committed
check(readme.includes(L.CREDIT) && table.credit === L.CREDIT, `README.md and table.json carry "${L.CREDIT}"`);
const tracked = git('ls-files', '--', rel('.'), RES).trim().split('\n').sort();
const allowed = [...['PLAN.md', 'PLAN.sha256', 'arcs.mjs', 'check.mjs', 'fit.mjs', 'lib.mjs', 'readme.mjs', 'registered.json', 'run.mjs', 'score.mjs'].map(rel), `${RES}/README.md`, `${RES}/table.json`].sort();
check(tracked.every((f) => allowed.includes(f)), `committed files: ${tracked.length}, none a captured or derived SatNOGS batch`);

const c = table.common;
console.log(`  AP scored ${scored.filter((r) => r.arm === 'AP').length} of 42; AP/B on the common cells day 1/2/3: ${[1, 2, 3].map((d) => (c[d].ratio == null ? '-' : c[d].ratio.toFixed(2))).join(' / ')}`);
if (failures.length) { console.log(`\nFAIL ${failures.length}: ${failures.join('; ')}`); process.exit(1); }
console.log(`\nPASS satnogs-optical-ap-2: plan ${planHash.slice(0, 12)}; 15 arcs, 14 scorable; ${flown} flown alone, ${named} named failures; ${scored.length} scored cells re-score equal; B 42 of 42 equal to the first registration; EXCLUDE clean`);
