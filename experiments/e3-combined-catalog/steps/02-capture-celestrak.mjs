#!/usr/bin/env node
// E3 step 02: capture CelesTrak's current GP (and the supplemental-GP index)
// for E3's truth objects, once, for the lineage check (PLAN.md section 3).
// Bytes are kept as served, outside every repository, with their SHA-256.
//
// CelesTrak fetch policy: space-data-network-modules
// analysis/conjunction-assessment/scripts/CELESTRAK_FETCH_POLICY.md, enforced
// with its FetchPolicy helper: serial requests at least 2.5 s apart, no key
// fetched twice within 3 h (this capture's own ledger, and the shared ledger
// is consulted too), 60 s back-off and one retry on 429/503, halt after 30
// consecutive failures.
//
//   node experiments/e3-combined-catalog/steps/02-capture-celestrak.mjs [--out DIR] [--modules DIR]
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { modulesRoot, sha256 } from '../../../harness/modules.mjs';
import { repoRoot } from '../../../harness/provenance.mjs';
import { config } from '../common.mjs';

const { values } = parseArgs({ options: { out: { type: 'string' }, modules: { type: 'string' } } });
const modules = modulesRoot({ flag: values.modules, configured: config.inputs.modules, repoRoot });
const policyDir = path.join(modules, 'analysis/conjunction-assessment');
const { FetchPolicy, sleep, MIN_INTERVAL_MS } = await import(pathToFileURL(path.join(policyDir, 'scripts/lib/celestrakFetchPolicy.mjs')));
const outRoot = path.resolve(values.out ?? config.inputs.celestrakCaptures);
const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
const dir = path.join(outRoot, stamp);
fs.mkdirSync(dir, { recursive: true });
const own = new FetchPolicy(path.join(outRoot, '.celestrak-fetch-ledger'));
const shared = new FetchPolicy(path.join(policyDir, 'tests/data/.celestrak-fetch-ledger'));  // read only

const base = 'https://celestrak.org/NORAD/elements';
const requests = [
  ...config.celestrak.groups.map((g) => ({ name: `gp-group-${g}.json`, url: `${base}/gp.php?GROUP=${g}&FORMAT=json` })),
  ...config.celestrak.catalogNumbers.map((n) => ({ name: `gp-catnr-${n}.json`, url: `${base}/gp.php?CATNR=${n}&FORMAT=json` })),
  { name: 'supplemental-index.html', url: `${base}/supplemental/` },
];
const manifest = { captured: stamp, policy: 'space-data-network-modules analysis/conjunction-assessment/scripts/CELESTRAK_FETCH_POLICY.md', files: [] };
let last = 0;
for (const r of requests) {
  if (!own.allowed(r.url) || !shared.allowed(r.url)) { manifest.files.push({ ...r, skipped: 'fetched within 3 h' }); continue; }
  for (let attempt = 1; attempt <= 2; ++attempt) {
    const wait = last + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const response = await fetch(r.url).catch((error) => ({ ok: false, status: error.message }));
    if (response.ok) {
      const bytes = Buffer.from(await response.arrayBuffer());
      fs.writeFileSync(path.join(dir, r.name), bytes);
      own.record(r.url);
      own.noteSuccess();
      manifest.files.push({ ...r, retrievedAt: new Date().toISOString(), bytes: bytes.length, sha256: sha256(bytes) });
      break;
    }
    own.noteFailure(r.url);
    manifest.files.push({ ...r, attempt, status: response.status });
    if (![429, 503].includes(response.status) || attempt === 2) break;
    await sleep(60000);
  }
}
fs.writeFileSync(path.join(dir, 'capture.json'), `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`${dir}: ${manifest.files.filter((f) => f.sha256).length}/${requests.length} captured`);
