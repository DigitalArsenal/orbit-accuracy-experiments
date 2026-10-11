#!/usr/bin/env node
// Runs analysis/maneuver-detection's default detector (C) on the ISS's public
// element sets for one month, as the modules repository's study runs it
// (analysis/maneuver-detection/study, SGP4 answering the detector's
// propagation queries), and records the events in
// site/generated/iss-detection.json. build.mjs publishes the events; the
// element sets stay on this machine (Space-Track, not reproduced).
//
//   node site/run-maneuver.mjs [--modules DIR] [--archive DIR] [--from 2026-09-01] [--to 2026-10-01]
//
// The study's host code needs `npm ci` in the modules checkout's
// analysis/maneuver-detection.
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { modulesRoot, gitState } from '../harness/modules.mjs';
import { dayList, epochMs, shiftDay } from '../harness/gp-archive.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const { values } = parseArgs({ options: { modules: { type: 'string' }, archive: { type: 'string' }, from: { type: 'string' }, to: { type: 'string' } } });
const v1Config = JSON.parse(fs.readFileSync(path.join(repo, 'experiments/v1-hpop-physical-truth/config.json'), 'utf8'));
const modules = modulesRoot({ flag: values.modules, configured: v1Config.inputs.modules, repoRoot: repo });
const archive = path.resolve(values.archive ?? process.env.SDN_GP_HISTORY ?? '/opt/data/sdn-archive/spacetrack/gp_history/by-creation');
const from = values.from ?? '2026-09-01', to = values.to ?? '2026-10-01';
const NORAD = 25544, MARGIN_DAYS = 10;
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// The ISS's element sets created in the window and its margins: one per
// EPOCH, the latest CREATION_DATE (as the study's gp_history.py selects).
const latest = new Map(), files = {};
for (const day of dayList(shiftDay(from, -MARGIN_DAYS), shiftDay(to, MARGIN_DAYS))) {
  const dir = path.join(archive, day.slice(0, 4));
  if (!fs.existsSync(dir)) continue;
  for (const name of fs.readdirSync(dir).filter((n) => n.startsWith(day) && n.endsWith('.json.gz')).sort()) {
    const raw = fs.readFileSync(path.join(dir, name));
    files[`${day.slice(0, 4)}/${name}`] = sha256(raw);
    for (const g of JSON.parse(gunzipSync(raw))) {
      if (Number(g.NORAD_CAT_ID) !== NORAD || g.MEAN_ELEMENT_THEORY !== 'SGP4') continue;
      const seen = latest.get(g.EPOCH);
      if (!seen || String(g.CREATION_DATE) >= String(seen.CREATION_DATE)) latest.set(g.EPOCH, g);
    }
  }
}
const rows = [...latest.values()].sort((a, b) => epochMs(a.EPOCH) - epochMs(b.EPOCH));
const history = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'iss-gp-')), `${NORAD}.json`);
fs.writeFileSync(history, JSON.stringify(rows));
const variants = [{ name: 'C', options: {} }];
let result;
try {
  const study = await import(pathToFileURL(path.join(modules, 'analysis/maneuver-detection/study/lib/run.mjs')));
  result = await study.detectHistories([{ history, from, to }], variants, { provider: 'sgp4', workers: 1 });
} finally {
  fs.rmSync(path.dirname(history), { recursive: true, force: true });
}
const binary = (relative) => {
  const wasm = fs.readFileSync(path.join(modules, relative, 'dist/isomorphic/module.wasm'));
  const m = JSON.parse(fs.readFileSync(path.join(modules, relative, 'plugin-manifest.json'), 'utf8'));
  return { path: relative, version: m.version, wasmSha256: sha256(wasm) };
};
const out = {
  object: { norad: NORAD, name: 'ISS (ZARYA)', objectId: '1998-067A' },
  window: [from, to], variant: 'C (the default: D1 and D2 combined)', provider: 'propagator/sgp4, as the study answers the query port',
  generated: new Date().toISOString(), runtime: `Node ${process.version}`,
  modulesRepository: gitState(modules), modules: [binary('analysis/maneuver-detection'), binary('propagator/sgp4')],
  // The archive files read, by one SHA-256 over their sorted "name sha256" lines.
  elementSets: { count: rows.length, first: rows[0]?.EPOCH, last: rows.at(-1)?.EPOCH, source: 'Space-Track gp_history, the SDN archive (not reproduced)',
    files: Object.keys(files).length, filesSha256: sha256(Object.entries(files).sort().map(([n, h]) => `${n} ${h}`).join('\n')) },
  events: result.events.C,
};
fs.mkdirSync(path.join(here, 'generated'), { recursive: true });
fs.writeFileSync(path.join(here, 'generated/iss-detection.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`${rows.length} element sets; ${out.events.length} event(s): ${out.events.map((e) => `${e.EVENT_START_TIME} ${(e.DELTA_VEL * 1000).toFixed(3)} m/s`).join(', ')}`);
