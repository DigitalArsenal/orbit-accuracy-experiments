#!/usr/bin/env node
// Downloads the public thermosphere density products E5 reads, from the ESA
// Swarm dissemination server (anonymous, no login), into the stack's HAC
// archive layout, one provenance JSON beside each file. A file already on
// disk is never fetched again. Serial, one request at a time.
//
//   node experiments/e5-density-calibration/fetch/fetch-densities.mjs --from 2026-01-01 --to 2026-07-31 \
//        [--products swarm-pod,gracefo] [--out /opt/data/sdn-archive/hac]
//
// Products:
//   swarm-pod  Swarm A, B and C thermosphere densities from precise orbits
//              (DNSxPOD, Level 2 daily, 30 s; van den IJssel et al. 2020).
//   swarm-acc  Swarm C accelerometer densities (DNSCACC, 10 s).
//   gracefo    GRACE-FO 1 accelerometer densities (TOLEOS DNS1ACC, 10 s;
//              Siemes et al. 2023), from the Swarm server's Multimission tree.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  from: { type: 'string' }, to: { type: 'string' },
  products: { type: 'string', default: 'swarm-pod,gracefo' },
  out: { type: 'string', default: '/opt/data/sdn-archive/hac' },
} });
if (!values.from || !values.to) throw new Error('--from and --to (YYYY-MM-DD) are required');
const SERVER = 'https://swarm-diss.eo.esa.int/';
const TERMS = {
  swarm: 'ESA Swarm data, free and open under the ESA Earth Observation data terms (https://earth.esa.int/eogateway/documents/20142/1560778/ESA-Data-Terms-and-Conditions.pdf); cite ESA and the product authors.',
  gracefo: 'GRACE-FO TOLEOS thermosphere densities (TU Delft for ESA), distributed by ESA under the ESA Earth Observation data terms (https://earth.esa.int/eogateway/documents/20142/1560778/ESA-Data-Terms-and-Conditions.pdf); cite Siemes et al. (2023).',
};
const SOURCES = {
  'swarm-pod': ['A', 'B', 'C'].map((s) => ({ dir: `swarm/Level2daily/Latest_baselines/DNS/POD/Sat_${s}`, local: `esa-swarm-dns/POD/Sat_${s}`, terms: TERMS.swarm, byYear: false })),
  'swarm-acc': [{ dir: 'swarm/Level2daily/Latest_baselines/DNS/ACC/Sat_C', local: 'esa-swarm-dns/ACC/Sat_C', terms: TERMS.swarm, byYear: false }],
  gracefo: [{ dir: 'Multimission/GRACE-FO/DNS/Sat_1', local: 'esa-gracefo-dns/Sat_1', terms: TERMS.gracefo, byYear: true }],
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function list(dir) {
  const url = `${SERVER}?do=list&maxfiles=100000&pos=0&file=${encodeURIComponent(dir)}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return (await response.json()).results.filter((x) => !x.is_dir);
}
const day = (name) => /_(\d{4})(\d\d)(\d\d)T\d{6}_/.exec(name)?.slice(1, 4).join('-');
const years = [];
for (let y = Number(values.from.slice(0, 4)); y <= Number(values.to.slice(0, 4)); ++y) years.push(y);

let fetched = 0, kept = 0;
for (const product of values.products.split(',')) {
  for (const source of SOURCES[product] ?? (() => { throw new Error(`unknown product ${product}`); })()) {
    const entries = [];
    for (const dir of source.byYear ? years.map((y) => `${source.dir}/${y}`) : [source.dir]) entries.push(...(await list(dir)).map((e) => ({ ...e, dir })));
    const wanted = entries.filter((e) => day(e.name) && day(e.name) >= values.from && day(e.name) <= values.to);
    const localDir = path.join(values.out, source.local);
    fs.mkdirSync(localDir, { recursive: true });
    for (const e of wanted) {
      const file = path.join(localDir, e.name);
      if (fs.existsSync(file) && fs.existsSync(`${file}.provenance.json`)) { ++kept; continue; }
      const url = `${SERVER}?do=download&file=${encodeURIComponent(`${e.dir}/${e.name}`)}`;
      let bytes;
      for (let attempt = 1; ; ++attempt) {
        const response = await fetch(url).catch((error) => ({ ok: false, status: error.message }));
        if (response.ok) { bytes = Buffer.from(await response.arrayBuffer()); if (bytes.length === e.size) break; }
        if (attempt === 4) throw new Error(`${url}: ${response.status ?? 'size mismatch'}`);
        await sleep(5000 * attempt);
      }
      fs.writeFileSync(file, bytes);
      fs.writeFileSync(`${file}.provenance.json`, `${JSON.stringify({
        url, retrieved_utc: new Date().toISOString(), sha256: crypto.createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length,
        server_mtime_utc: new Date(e.mtime * 1000).toISOString(), terms_url: 'https://earth.esa.int/eogateway/documents/20142/1560778/ESA-Data-Terms-and-Conditions.pdf',
        terms: source.terms, retrieved_by: 'e5-density-calibration-20261009 (anonymous, no login)',
      }, null, 1)}\n`);
      ++fetched;
      await sleep(250);
    }
    console.log(`${source.local}: ${wanted.length} files in range`);
  }
}
console.log(`fetched ${fetched}, already present ${kept}`);
