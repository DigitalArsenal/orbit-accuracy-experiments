// P10 and P12 (PLAN.md section 5), run at the freeze. P10: every path any C3 step logged as opened (<store>/opened/*.json) against what this experiment must never open (common.mjs), E14's directory only for GFZ's products
// under reference/GFZ0MGXRAP_, no state of a reference product dated after the 2026-06-15 allowed before the freeze, and nothing of a scored product, not even an index. P12: the hashes everything rests on, read again: each module's wasm and manifest by git show at its commit,
// the harness files as committed and on disk, XM's snapshot against xm-libraries.json, C2's constants, the installed packages. Records only.
//   node experiments/ffm-covariance-adaptive/precheck-p10-p12.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { config, build, store, root, registered, Opened, writeReceipt, c2Results, sha256 } from './common.mjs';
import { MODULES } from './lib/modules.mjs';
import { xmSnapshot } from './lib/weather-o.mjs';

registered();
// ---- P10
const ALLOWED = Date.UTC(2026, 5, 15);
const productDate = (p) => { const m = /\/ESA0OPSFIN_(\d{4})(\d{3})/.exec(p) ?? /\/GFZ0MGXRAP_(\d{4})(\d{3})/.exec(p); if (m) return Date.UTC(Number(m[1]), 0, Number(m[2])); const n = /\/(?:ilrsa|nsgf)\.orb\.[a-z0-9]+\.(\d{2})(\d{2})(\d{2})\.v\d+\//.exec(p); return n ? Date.UTC(2000 + Number(n[1]), Number(n[2]) - 1, Number(n[3])) : null; };
const logs = fs.readdirSync(path.join(store, 'opened')).filter((f) => f.endsWith('.json')).sort();
const paths = new Map();
for (const f of logs) for (const { path: p, label } of JSON.parse(fs.readFileSync(path.join(store, 'opened', f)))) { if (!paths.has(p)) paths.set(p, { label, logs: [] }); paths.get(p).logs.push(f); }
// the first scored product per family (section 1): nothing at or after these may be opened, not even an index, before scoring
const FRESH = [[/\/ESA0OPSFIN_/, Date.UTC(2026, 8, 24)], [/\/GFZ0(MGX|OPS)RAP_/, Date.UTC(2026, 8, 24)], [/\/ilrsa\.orb\./, Date.UTC(2026, 8, 5)], [/\/nsgf\.orb\./, Date.UTC(2026, 7, 30)]];
const forbidden = [], e14 = [], late = [], indexOnly = [], fresh = [], probe = new Opened(), groups = {};
for (const [p, { label, logs: from }] of paths) {
  try { probe.add(p); } catch { forbidden.push({ path: p, from }); }
  if (p.includes('/e14-covariance-realism/') && !p.includes('/reference/GFZ0MGXRAP_')) e14.push({ path: p, from });
  const d = productDate(p);
  if (d !== null && d > ALLOWED) (p.endsWith('/index.json') ? indexOnly : late).push({ path: p, from });
  if (d !== null && FRESH.some(([re, t]) => re.test(p) && d >= t)) fresh.push({ path: p, from });
  groups[label] = (groups[label] ?? 0) + 1;
}
// An index holds a product's name, its objects' spans and its stated sigma, no state. P4's replay ran C2's own chain, whose arc listing reads the index of every product in C2's range: those are listed apart and disclosed (PLAN.md section 7).
const dateOf = (x) => new Date(productDate(x.path)).toISOString().slice(0, 10), dates = indexOnly.map(dateOf).sort();
const p10 = { plan: 'section 5 P10', logs: logs.length, paths: paths.size, byLabel: groups, forbidden, e14OutsideGfz: e14, statesPastAllowed: late, freshProductsOpened: fresh, indexOnlyPastAllowed: { count: indexOnly.length, firstProductDate: dates[0] ?? null, lastProductDate: dates.at(-1) ?? null, openedBy: [...new Set(indexOnly.flatMap((x) => x.from.map((f) => f.split('.')[0])))], files: indexOnly.map((x) => x.path) }, pass: !forbidden.length && !e14.length && !late.length && !fresh.length };
console.log(writeReceipt('precheck-P10', p10));
// ---- P12
const gitOf = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { maxBuffer: 1 << 28 });
const bad = [], modules = {};
for (const chain of ['pin', 'c2']) for (const [rel, m] of Object.entries(build[chain].modules)) {
  const wasm = sha256(gitOf(MODULES, 'show', `${m.commit}:${rel}/dist/isomorphic/module.wasm`)), manifest = sha256(gitOf(MODULES, 'show', `${m.commit}:${rel}/plugin-manifest.json`));
  const onDisk = fs.existsSync(path.join(store, 'build', chain, rel, 'dist/isomorphic/module.wasm')) ? sha256(fs.readFileSync(path.join(store, 'build', chain, rel, 'dist/isomorphic/module.wasm'))) : null;
  modules[`${chain}:${rel}`] = { commit: m.commit, version: m.version, wasm, manifest, store: onDisk };
  if (wasm !== m.wasmSha256 || manifest !== m.manifestSha256 || (onDisk && onDisk !== m.wasmSha256)) bad.push(`${chain}:${rel}`);
}
const harness = {};
for (const [rel, want] of Object.entries(build.harness.sha256)) {
  const committed = sha256(gitOf(root, 'show', `HEAD:${rel}`)), disk = sha256(fs.readFileSync(path.join(root, rel)));
  harness[rel] = { committed, disk };
  if (committed !== want || disk !== want) bad.push(rel);
}
xmSnapshot(); // throws on a wrong byte
const constants = sha256(fs.readFileSync(path.join(c2Results, 'frozen-constants.json')));
if (constants !== config.c2.constantsSha256) bad.push('C2 constants');
const packages = {};
for (const [name, want] of Object.entries(build.packages)) {
  const got = JSON.parse(fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'))).version;
  packages[name] = got;
  if (got !== want) bad.push(`${name} ${got}`);
}
const registration = Object.fromEntries(['PLAN.md', 'config.json', 'build.json'].map((n) => [n, sha256(fs.readFileSync(path.join(root, 'experiments/ffm-covariance-adaptive', n)))]));
const p12 = { plan: 'section 5 P12', modules, harness, xm: { commit: build.xm.commit, checked: 'against results/ffm-covariance-calibration/xm-libraries.json' }, c2Constants: constants, packages, registration, bad, pass: !bad.length };
console.log(writeReceipt('precheck-P12', p12));
console.log(JSON.stringify({ p10: { logs: p10.logs, paths: p10.paths, forbidden: forbidden.length, e14OutsideGfz: e14.length, statesPastAllowed: late.length, freshProductsOpened: fresh.length, indexOnly: { count: indexOnly.length, first: dates[0], last: dates.at(-1), by: p10.indexOnlyPastAllowed.openedBy }, pass: p10.pass }, p12: { bad, pass: p12.pass } }));
process.exit(0);
