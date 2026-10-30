#!/usr/bin/env node
// ca-socrates-gp-parity end-to-end check (the task's E2E): the registered inputs, re-derived, and one registered call,
// re-screened by the pinned module, against the committed results.
//   node experiments/ca-socrates-gp-parity/verify.mjs [--modules DIR]
// 1. The SOCRATES report, SATCAT, gp snapshot and gp_history replacement files have their registered SHA-256.
// 2. The catalog's $OMM stream and the ranked primaries rebuild to their registered SHA-256; every SOCRATES object's
//    edition matches the catalog.
// 3. Part 1's unit 0 (block 0, the first 6 h) screened again equals results/ca-socrates-gp-parity/replay.json.
// It needs this machine's archive; without it, it fails rather than skips (a skip is never a pass).
import fs from 'node:fs';
import path from 'node:path';
import { fork, execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { config, repo, id, here, sha256, modulesRoot, pinnedModule, modulePin, readCatalog, readSatcat, readSocrates, editionClasses, ommBytes, importFile } from './common.mjs';

const { values: o } = parseArgs({ options: { modules: { type: 'string' }, amendment: { type: 'string' } } });
// --amendment A2: the same checks for Amendment A2's run (its pinned artifact and replay.a2.json).
const pin = modulePin(o.amendment);
const ok = (m) => console.log(`ok   ${m}`);
const replayFile = o.amendment ? `replay.${o.amendment.toLowerCase()}.json` : 'replay.json';
const replay = JSON.parse(fs.readFileSync(path.join(repo, 'results', id, replayFile), 'utf8'));
fs.mkdirSync(path.join(repo, 'runs', id), { recursive: true });
const work = fs.mkdtempSync(path.join(repo, 'runs', id, 'verify-'));
try {
  // 1-2: inputs.
  const report = readSocrates();
  ok(`SOCRATES report ${config.socrates.sha256.slice(0, 12)}: ${report.length} rows`);
  const satcat = readSatcat();
  ok(`SATCAT ${config.satcat.sha256.slice(0, 12)}: ${satcat.size} objects`);
  const catalog = readCatalog();
  ok(`catalog: snapshot ${config.catalog.snapshotSha256.slice(0, 12)}, ${catalog.replaced.length} editions replaced from gp_history`);
  const ed = editionClasses(report, catalog.rows);
  if (ed.matched.size !== ed.objects || ed.mismatched.size || ed.absent.size) throw new Error(`editions: ${ed.matched.size} of ${ed.objects} matched`);
  ok(`editions: all ${ed.objects} SOCRATES objects match`);
  // The pinned commit's own tree: a private sparse clone of the modules checkout at config.module.commit (its node_modules
  // linked), so later commits or uncommitted work in the shared checkout cannot change what is verified.
  const live = modulesRoot(o.modules);
  const modules = path.join(work, 'modules');
  const git = (...a) => execFileSync('git', a, { stdio: ['ignore', 'pipe', 'pipe'] });
  git('clone', '-q', '--shared', '--no-checkout', live, modules);
  git('-C', modules, 'sparse-checkout', 'set', 'analysis/conjunction-assessment');
  git('-C', modules, '-c', 'advice.detachedHead=false', 'checkout', '-q', pin.commit);
  fs.symlinkSync(path.join(live, 'analysis/conjunction-assessment/node_modules'), path.join(modules, 'analysis/conjunction-assessment/node_modules'));
  const pinned = pinnedModule(modules, work, pin);
  ok(`module ${pin.commit.slice(0, 10)} ${pin.version} ${pinned.wasmSha256.slice(0, 12)}`);
  const cqr = await importFile(path.join(modules, 'analysis/conjunction-assessment/tests/lib/cqr.mjs'));
  const flatc = await cqr.initCqrFlatc();
  const ommSchema = cqr.publishedSchema('OMM');
  const records = catalog.rows.map((g) => ommBytes(flatc, ommSchema, g));
  const stream = Buffer.alloc(records.reduce((n, r) => n + 4 + r.length, 0));
  let at = 0;
  for (const r of records) { stream.writeUInt32LE(r.length, at); stream.set(r, at + 4); at += 4 + r.length; }
  if (sha256(stream) !== config.catalog.ommStreamSha256) throw new Error('catalog stream differs');
  ok(`catalog stream ${config.catalog.ommStreamSha256.slice(0, 12)}: ${records.length} objects`);
  const P = config.primaries;
  const inCatalog = new Map(catalog.rows.map((g, n) => [Number(g.NORAD_CAT_ID), n]));
  const ranked = [...inCatalog.keys()].filter((n) => { const x = satcat.get(n); return x && x.type === P.objectType && P.statusCodes.includes(x.status); })
    .map((n) => [sha256(`${P.seed}:${n}`), n]).sort((x, y) => (x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0)).map(([, n]) => n);
  if (sha256(ranked.join('\n')) !== P.rankedListSha256) throw new Error('ranked primaries differ');
  ok(`primaries ${P.rankedListSha256.slice(0, 12)}: ${ranked.length} ranked`);

  // 3: unit 0 again, through the same worker the run used.
  const rankedSet = new Set(ranked);
  const order = [...ranked.map((n) => inCatalog.get(n)), ...catalog.rows.map((_, i) => i).filter((i) => !rankedSet.has(Number(catalog.rows[i].NORAD_CAT_ID)))];
  const part = P.parts[0];
  const units = [{ part: part.id, block: 0, p0: part.from, p1: Math.min(part.to, part.from + P.blockSize), slice: 0 }];
  const ommStream = path.join(work, 'catalog.omm.u32le.bin');
  fs.writeFileSync(ommStream, stream);
  const outDir = path.join(work, 'slices');
  fs.mkdirSync(outDir);
  const jobFile = path.join(work, 'job.json');
  fs.writeFileSync(jobFile, JSON.stringify({ modules, wasmFile: pinned.file, ommStream, outDir, threads: config.screen.threadsPerProcess, screen: config.screen,
    window: { startJd: config.window.startJd, sliceSeconds: config.screen.sliceSeconds }, order, units, slices: [0] }));
  await new Promise((resolve, reject) => fork(path.join(here, 'worker.mjs'), [jobFile], { stdio: ['ignore', 'inherit', 'inherit', 'ipc'] })
    .on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`worker exited ${code}`)))));
  const unit0 = JSON.parse(fs.readFileSync(path.join(outDir, 'slice-0000.json'), 'utf8'));
  const canon = unit0.events.map((e) => [Math.min(e.a, e.b), Math.max(e.a, e.b), Math.round(e.tcaJd * 1e9), Math.round(e.missM * 1000), Math.round(e.speedMS * 1000)])
    .sort((x, y) => x[0] - y[0] || x[1] - y[1] || x[2] - y[2]);
  const digest = sha256(canon.map((r) => r.join(',')).join('\n'));
  if (canon.length !== replay.events || digest !== replay.digest) throw new Error(`unit 0: ${canon.length} events, digest ${digest}; registered ${replay.events}, ${replay.digest}`);
  ok(`unit 0 re-screened: ${canon.length} events, digest ${digest.slice(0, 12)} equals results/${id}/${replayFile}`);
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}
