// Arm W or X: for each chosen row whose two sets have records, the records are flown by the module over the same windows as arm S and the closest
// approach is found by the same search.
//   node fly-records.mjs --arm W|X [--config config.json] [--shard i/n]
// Input: rows-sgp4*.jsonl (the chosen rows and their sets) and fits-<arm>*.jsonl with ocm/ of the store. Output: rows-<arm>*.jsonl (first line: header).
// Row fields: ev, bin, id, miss, tca, wid, edge, conv, skipped, outA and outB (days the closest approach lies outside the fitted span of each record, 0 inside),
// or nofit (a record of a set is missing: the fit was refused or not run) or error (the module refused a flight).
import fs from 'node:fs';
import path from 'node:path';
import { readConfig, loadHost, header, closestApproach, recordSource } from './lib/module.mjs';
import { loadBindings } from './lib/records.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const config = readConfig(argv);
const ARM = arg('--arm');
if (!config.arms[ARM]) throw new Error(`--arm ${ARM}: not an arm of this configuration`);
const [si, sn] = arg('--shard', '0/1').split('/').map(Number);
const lib = await loadBindings();
const host = await loadHost(config);

const fits = new Map();
for (const f of fs.readdirSync(config.storeDir).filter((x) => new RegExp(`^fits-${ARM}(-\\d+of\\d+)?\\.jsonl$`).test(x))) {
  for (const line of fs.readFileSync(path.join(config.storeDir, f), 'utf8').split('\n')) if (line) { const r = JSON.parse(line); if (r.key) fits.set(r.key, r); }
}
const ocm = new Map();
const ocmOf = (key) => { if (!ocm.has(key)) { if (ocm.size > 400) ocm.delete(ocm.keys().next().value); ocm.set(key, new Uint8Array(fs.readFileSync(path.join(config.storeDir, 'ocm', `${key}.bin`)))); } return ocm.get(key); };
const source = (gp) => {
  const f = fits.get(`${ARM}-${gp}`);
  if (!f?.ok) return null;
  return { span: [f.spanFrom / 1000, f.spanTo / 1000], src: recordSource(host, lib, ocmOf(f.key)) };
};
const outside = (sp, t) => (t > sp[1] ? (t - sp[1]) / 86400 : t < sp[0] ? (t - sp[0]) / 86400 : 0);

const rows = [];
for (const f of fs.readdirSync(config.storeDir).filter((x) => /^rows-sgp4(-\d+of\d+)?\.jsonl$/.test(x))) {
  for (const line of fs.readFileSync(path.join(config.storeDir, f), 'utf8').split('\n')) if (line) { const r = JSON.parse(line); if (r.id) rows.push(r); }
}
rows.sort((a, b) => a.ev - b.ev || (a.id < b.id ? -1 : 1));
const out = fs.createWriteStream(path.join(config.storeDir, sn > 1 ? `rows-${ARM}-${si}of${sn}.jsonl` : `rows-${ARM}.jsonl`));
out.write(JSON.stringify(header(config, `rows-${ARM}`)) + '\n');
let k = 0;
for (const r of rows) {
  if (r.ev % sn !== si || !r.gpA) continue;
  const row = { ev: r.ev, bin: r.bin, id: r.id };
  const A = source(r.gpA), B = source(r.gpB);
  if (!A || !B) { row.nofit = [!A, !B]; out.write(JSON.stringify(row) + '\n'); continue; }
  const res = await closestApproach(A.src, B.src, r.tcaMsg);
  Object.assign(row, res);
  if (!res.error) { row.outA = outside(A.span, res.tca); row.outB = outside(B.span, res.tca); }
  out.write(JSON.stringify(row) + '\n');
  k += 1;
}
await new Promise((r) => out.end(r));
console.log(`arm ${ARM}: ${k} rows flown`);
process.exit(0);
