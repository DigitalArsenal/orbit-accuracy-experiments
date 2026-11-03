#!/usr/bin/env node
// Step 70: the dev rows for part 2, one file per object under AR/gp-covariance-strata/dev-rows/, with a SHA-256 manifest.
// Row: {norad, setEpoch, sampleEpoch, ageDays, bin, half, regime, cluster, block, e: [R, T, N] km (unrounded), z: [3], d2}
// z and d2 are under the frozen P_strat through the interpolation lookup. HEO rows (no frozen cell) carry z and d2 null.
//   node steps/70-dev-rows.mjs <candidates.json> <strata.json> <out dir> <manifest json> <rows dir>...
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { regimeTables } from '../lib/tab.mjs';
import { evalRow } from '../lib/fit.mjs';
import { REGIMES, BINS } from '../lib/bins.mjs';

const [candFile, strataFile, outDir, manifestFile, ...dirs] = process.argv.slice(2);
const cand = JSON.parse(fs.readFileSync(candFile, 'utf8')), strata = JSON.parse(fs.readFileSync(strataFile, 'utf8')).strata;
const tabs = await regimeTables(dirs);
const T0 = Date.UTC(2024, 0, 1), DAY = 86400000, iso = (ms) => new Date(ms).toISOString();
const byObject = new Map();
for (const regime of REGIMES) {
  const tab = tabs[regime]; if (!tab) continue;
  const rc = cand[regime];
  for (let i = 0; i < tab.n; i++) {
    const b = tab.b[i], L = strata[`${regime}|${b}`]?.blockDays ?? null;
    const r = rc?.cells?.[b] ? evalRow(tab, i, { cells: rc.cells }) : null;
    const row = { norad: tab.norad[i], setEpoch: iso(tab.setMs[i]), sampleEpoch: iso(tab.t[i]), ageDays: tab.age[i], bin: b, half: tab.half[i], regime, cluster: tab.clusterNames[tab.cluster[i]],
      block: L ? Math.floor((tab.t[i] - T0) / DAY / L) : null, e: [tab.e[3 * i], tab.e[3 * i + 1], tab.e[3 * i + 2]], z: r ? r.z : null, d2: r ? r.d2 : null };
    (byObject.get(row.norad) ?? byObject.set(row.norad, []).get(row.norad)).push(row);
  }
}
fs.mkdirSync(outDir, { recursive: true });
const manifest = { format: 'one gzip JSON-lines file per NORAD: {norad, setEpoch, sampleEpoch, ageDays, bin, half, regime, cluster, block, e:[R,T,N] km unrounded, z:[3], d2}; z and d2 under the frozen P_strat (interpolation lookup); block = floor(days since 2024-01-01 / stratum block length)', files: {} };
for (const [norad, rows] of [...byObject].sort((a, b) => a[0] - b[0])) {
  rows.sort((a, b) => Date.parse(a.sampleEpoch) - Date.parse(b.sampleEpoch) || a.bin - b.bin);
  const bytes = zlib.gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n', { level: 9 });
  const f = path.join(outDir, `${norad}.jsonl.gz`);
  fs.writeFileSync(f, bytes);
  manifest.files[`${norad}.jsonl.gz`] = { sha256: createHash('sha256').update(bytes).digest('hex'), rows: rows.length };
}
fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 1)}\n`);
fs.copyFileSync(manifestFile, path.join(outDir, 'manifest.json'));
console.log(Object.keys(manifest.files).length, 'files');
