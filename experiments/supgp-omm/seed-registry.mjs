#!/usr/bin/env node
// Add earlier Starlink manifests to the names registry (names only; no ephemeris is involved).
//
//   node seed-registry.mjs --registry DIR --manifest FILE --etag E --last-modified L --fetched UTC   one saved MANIFEST.txt
//   node seed-registry.mjs --registry DIR --e11-state FILE                                           the names E11's capture polled
//
// SpaceX's MANIFEST.txt lists only the newest version of each object. A pass fetches the current one
// itself; the versions it superseded are found only in manifests kept from earlier fetches.
import fs from 'node:fs';
import path from 'node:path';

const v = process.argv.slice(2);
const arg = (k) => { const i = v.indexOf(`--${k}`); return i < 0 ? null : v[i + 1]; };
const registry = arg('registry');
if (!registry) throw new Error('--registry DIR is required');
fs.mkdirSync(registry, { recursive: true });
const stampOf = (iso) => iso.replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');

if (arg('manifest')) {
  const fetched = arg('fetched');
  const file = path.join(registry, `starlink-names-${stampOf(fetched)}.txt`);
  fs.copyFileSync(arg('manifest'), file);
  fs.writeFileSync(file.replace(/\.txt$/, '.json'), JSON.stringify({ requestUtc: fetched, etag: arg('etag'), lastModified: arg('last-modified'), source: 'saved MANIFEST.txt' }, null, 1));
  console.log(file);
}
if (arg('e11-state')) {
  const state = JSON.parse(fs.readFileSync(arg('e11-state'), 'utf8'));
  const names = Object.keys(state.names);
  const file = path.join(registry, 'starlink-names-e11-20261010T135709Z.txt');
  fs.writeFileSync(file, `${names.join('\n')}\n`);
  fs.writeFileSync(file.replace(/\.txt$/, '.json'), JSON.stringify({ source: 'E11 capture-state.json names (hourly manifest polls, first seen 2026-10-10T12:10Z to 13:46Z)', names: names.length }, null, 1));
  console.log(file, names.length);
}
