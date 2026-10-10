#!/usr/bin/env node
// Release bundles: one tar per source family, for upload as a GitHub release
// asset. A bundle holds the provider's files byte for byte, a MANIFEST.json
// (each member's SHA-256, size, URL and retrieval time, checked against the
// archive before packing) and a README.md with the source's licence and
// attribution from data/licenses.json. A source whose terms do not allow
// public redistribution (registry "reproduce": "no") is refused.
//
// Members come from an experiment's committed data/<id>/MANIFEST.json:
//   e7: the members of release asset e7-<family>.tar.gz
//   e5: the files of <family> whose location is a release asset
//   e6: the waterfall images listed in --list (data/e6/MANIFEST.json holds
//       the list's SHA-256)
//
//   node harness/release-bundle.mjs --experiment e7 --family sentinel1-poeorb --out DIR
//   node harness/release-bundle.mjs --experiment e6 --family satnogs-iss-waterfalls --list FILE --out DIR
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { repoRoot, source, bundleReadme } from './data-licenses.mjs';

const PRODUCTS = '/opt/data/sdn-archive/reference-states/products';
const SATNOGS_WATERFALLS = '/opt/data/sdn-archive/hac/satnogs/waterfalls/25544';
const hashFile = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const manifestOf = (id) => JSON.parse(fs.readFileSync(path.join(repoRoot, id === 'e2' ? 'results/e2/data' : `data/${id}`, 'MANIFEST.json'), 'utf8'));

// Each family: the registry source, the asset name, compression, and its members
// as { file, dir, sha256, bytes, url, retrieved }.
const FAMILIES = {
  e7: {
    'sentinel1-poeorb': 'copernicus-sentinel', 'slr-nsgf': 'ilrs-nsgf', 'slr-ilrs': 'ilrs',
    'gnss-final': 'esa-navigation-office', 'swarm-sp3': 'esa-earth-observation',
  },
  e5: { 'sentinel1-poeorb': 'copernicus-sentinel', 'swarm-sp3': 'esa-earth-observation', 'swarm-dns': 'esa-earth-observation', 'gracefo-dns': 'esa-earth-observation' },
  e6: { 'satnogs-iss-waterfalls': 'satnogs' },
};

export function members(experiment, family, list) {
  const m = manifestOf(experiment);
  if (experiment === 'e7') {
    const asset = m.releaseAssets.find((a) => a.asset === `e7-${family}.tar.gz`);
    if (!asset) throw new Error(`data/e7/MANIFEST.json has no asset e7-${family}.tar.gz`);
    return { asset: `e7-${family}.tar.gz`, members: asset.members.map((x) => ({ file: x.product, dir: PRODUCTS, sha256: x.sha256, url: x.url, retrieved: x.retrieved })) };
  }
  if (experiment === 'e5') {
    const rows = m.files.filter((r) => r.family === family && /^release asset/.test(r.location));
    if (!rows.length) throw new Error(`data/e5/MANIFEST.json has no release-asset family ${family}`);
    return { asset: `e5-${family}.tar`, members: rows.map((r) => ({ file: r.name, dir: PRODUCTS, sha256: r.sha256, url: r.url, retrieved: r.retrieved })) };
  }
  if (experiment === 'e6') {
    const entry = m.releaseAssets.find((a) => a.asset === `e6-${family}.tar`);
    if (!entry || !list) throw new Error(`e6 needs --list and a data/e6/MANIFEST.json asset e6-${family}.tar`);
    const body = fs.readFileSync(list);
    const h = crypto.createHash('sha256').update(body).digest('hex');
    if (h !== entry.listSha256) throw new Error(`${list}: SHA-256 ${h} is not the listSha256 data/e6/MANIFEST.json records`);
    // CC BY-SA 4.0 asks for the creator of each image: the observation, its
    // ground station and observer, from the committed observation metadata.
    const observations = new Map(JSON.parse(zlib.gunzipSync(fs.readFileSync(path.join(repoRoot, 'data/e6/satnogs-iss-observations.json.gz')))).map((o) => [o.id, o]));
    return { asset: `e6-${family}.tar`, members: JSON.parse(body).map((x) => {
      const id = Number(x.file.split('_')[1]), o = observations.get(id);
      if (!o) throw new Error(`${x.file}: observation ${id} is not in data/e6/satnogs-iss-observations.json.gz`);
      return { file: x.file, dir: SATNOGS_WATERFALLS, sha256: x.sha256, url: x.url, retrieved: null,
        credit: `SatNOGS Network observation ${id}, ground station ${o.ground_station} (${o.station_name}), observer ${o.observer}, https://network.satnogs.org/observations/${id}/, CC BY-SA 4.0, unmodified` };
    }) };
  }
  throw new Error(`no bundle recipe for ${experiment}`);
}

export function bundle({ experiment, family, list, out }) {
  const id = FAMILIES[experiment]?.[family];
  if (!id) throw new Error(`no bundle family ${experiment}/${family}`);
  const src = source(id);
  if (src.reproduce === 'no') throw new Error(`${src.name}: the terms do not allow public redistribution (data/licenses.json); list it, do not bundle it`);
  const { asset, members: rows } = members(experiment, family, list);
  for (const r of rows) {
    const file = path.join(r.dir, r.file);
    if (!fs.existsSync(file)) throw new Error(`missing in the archive: ${file}`);
    const h = hashFile(file);
    if (h !== r.sha256) throw new Error(`${r.file}: SHA-256 ${h} differs from the manifest's ${r.sha256}`);
    r.bytes = fs.statSync(file).size;
  }
  rows.sort((a, b) => a.file.localeCompare(b.file));
  fs.mkdirSync(out, { recursive: true });
  const staging = fs.mkdtempSync(path.join(out, '.staging-'));
  const manifest = {
    asset, experiment, family, source: id, licence: src.licence, terms: src.terms.map((t) => t.url), attribution: src.credit,
    builtFrom: `${experiment === 'e2' ? 'results/e2/data' : `data/${experiment}`}/MANIFEST.json`, builtBy: 'harness/release-bundle.mjs',
    members: rows.map(({ file, sha256, bytes, url, retrieved, credit }) => ({ file, sha256, bytes, url, retrieved, ...(credit ? { credit } : {}) })),
  };
  fs.writeFileSync(path.join(staging, 'MANIFEST.json'), `${JSON.stringify(manifest, null, 1)}\n`);
  fs.writeFileSync(path.join(staging, 'README.md'), bundleReadme(id, { asset, experiment, count: rows.length, bytes: rows.reduce((a, r) => a + r.bytes, 0), credits: rows.some((r) => r.credit) }));
  const fixed = new Date('2026-10-10T00:00:00Z');
  for (const f of ['MANIFEST.json', 'README.md']) fs.utimesSync(path.join(staging, f), fixed, fixed);
  const target = path.join(out, asset);
  const dirs = [...new Set(rows.map((r) => r.dir))];
  const args = ['-c', '-f', target, '--no-mac-metadata', '--no-xattrs', '--no-acls', '--no-fflags', '--uid', '0', '--gid', '0', '--uname', 'root', '--gname', 'root'];
  if (asset.endsWith('.gz')) args.push('-z', '--options', 'gzip:!timestamp');
  args.push('-C', staging, 'README.md', 'MANIFEST.json');
  for (const d of dirs) args.push('-C', d, ...rows.filter((r) => r.dir === d).map((r) => r.file));
  execFileSync('tar', args, { env: { ...process.env, COPYFILE_DISABLE: '1' }, maxBuffer: 1 << 26 });
  fs.rmSync(staging, { recursive: true });
  const listed = execFileSync('tar', ['-tf', target], { maxBuffer: 1 << 26 }).toString().split('\n').filter(Boolean);
  if (listed.length !== rows.length + 2) throw new Error(`${asset}: ${listed.length} entries, expected ${rows.length + 2}`);
  const result = { asset, bytes: fs.statSync(target).size, sha256: hashFile(target), members: rows.length, memberBytes: manifest.members.reduce((a, r) => a + r.bytes, 0), source: id };
  fs.writeFileSync(path.join(out, `${asset}.json`), `${JSON.stringify(result, null, 1)}\n`);
  return result;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  const { values } = parseArgs({ options: { experiment: { type: 'string' }, family: { type: 'string' }, list: { type: 'string' }, out: { type: 'string' } } });
  console.log(JSON.stringify(bundle({ ...values, out: path.resolve(values.out) })));
}
