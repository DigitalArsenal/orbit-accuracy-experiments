#!/usr/bin/env node
// E14 step 05: more independent truth before the selection (PLAN.md, changes before the freeze), fetched politely by
// truth-fetch.mjs into the experiment's store (archive/): never committed, secrets read at run time only.
//
//   node experiments/e14-covariance-realism/steps/05-truth-fetch.mjs list cddis <archive dir>
//   node experiments/e14-covariance-realism/steps/05-truth-fetch.mjs mgex --from 2025-10-01 --to 2026-09-30 --product WUM0MGXFIN_ --sample 05M
//   node experiments/e14-covariance-realism/steps/05-truth-fetch.mjs search copernicus <name fragment> --from 2026-08-25 --to 2026-10-01
//   node experiments/e14-covariance-realism/steps/05-truth-fetch.mjs copernicus <name fragment> --from 2026-08-25 --to 2026-10-01 --subdir s1-poeorb
import path from 'node:path';
import { parseArgs } from 'node:util';
import { config } from '../common.mjs';
import { cddis, copernicus } from '../truth-fetch.mjs';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { from: { type: 'string' }, to: { type: 'string' }, product: { type: 'string' },
  sample: { type: 'string', default: '05M' }, subdir: { type: 'string' } } });
const root = path.join(config.inputs.store, 'archive');
const DAY = 86400000;
const [command, ...rest] = positionals;

if (command === 'list' && rest[0] === 'cddis') {
  const r = await cddis({ root }).list(rest[1]);
  console.log(`status ${r.status}, ${r.names.length} names`);
  console.log(r.names.join('\n'));
} else if (command === 'mgex') {
  // One analysis centre's MGEX final orbits, one file a day: archive/gnss/products/<week>/<PRODUCT><yyyyddd>0000_01D_<sample>_ORB.SP3.gz
  const c = cddis({ root });
  const counts = { fetched: 0, 'not-modified': 0, missing: 0 };
  const listed = new Map();
  for (let day = Date.parse(`${values.from}T00:00:00Z`); day <= Date.parse(`${values.to}T00:00:00Z`); day += DAY) {
    const d = new Date(day), doy = Math.round((day - Date.UTC(d.getUTCFullYear(), 0, 1)) / DAY) + 1;
    const week = Math.floor((day - Date.UTC(1980, 0, 6)) / (7 * DAY));
    if (!listed.has(week)) listed.set(week, new Set((await c.list(`gnss/products/${week}`)).names));
    const name = `${values.product}${d.getUTCFullYear()}${String(doy).padStart(3, '0')}0000_01D_${values.sample}_ORB.SP3.gz`;
    if (!listed.get(week).has(name)) { ++counts.missing; console.warn(`missing ${week}/${name}`); continue; }
    const r = await c.fetch(`gnss/products/${week}/${name}`);
    if (!r) { ++counts.missing; console.warn(`refused ${week}/${name}`); continue; }
    ++counts[r.status];
    if ((counts.fetched + counts['not-modified']) % 25 === 0) console.log(`${d.toISOString().slice(0, 10)}: ${JSON.stringify(counts)}`);
  }
  console.log(`done: ${JSON.stringify(counts)}`);
} else if (command === 'search' && rest[0] === 'copernicus') {
  const list = await copernicus({ root }).search({ contains: rest[1], from: `${values.from}T00:00:00.000Z`, to: `${values.to}T00:00:00.000Z` });
  for (const p of list) console.log(p.name, p.start, p.end, p.size, p.online);
  console.log(`${list.length} products`);
} else if (command === 'copernicus') {
  const c = copernicus({ root });
  const list = await c.search({ contains: rest[0], from: `${values.from}T00:00:00.000Z`, to: `${values.to}T00:00:00.000Z` });
  const counts = { fetched: 0, 'not-modified': 0, missing: 0 };
  for (const p of list) {
    const r = await c.fetch(p, values.subdir);
    if (!r) { ++counts.missing; console.warn(`refused ${p.name}`); continue; }
    ++counts[r.status];
  }
  console.log(`done: ${list.length} products ${JSON.stringify(counts)}`);
} else {
  throw new Error('usage: see the header');
}
