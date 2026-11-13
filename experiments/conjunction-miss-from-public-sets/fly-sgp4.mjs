// Arm S: for each chosen row (an event, a lead bin, a message), the two sets of the objects chosen by creation time are flown on the module's SGP4 and
// the closest approach is found. Writes rows-sgp4.jsonl to the store (first line: header with the module's SHA-256).
//   node fly-sgp4.mjs [--config config.json] [--shard i/n]
// Row fields: ev, bin, id, c (message creation, unix s), tcaMsg, missMsg, gpA, gpB, epA, epB, crA, crB, setTie, miss, tca, wid, edge, conv, skipped;
// or noset ([first object lacks a set, second]) or error.
import fs from 'node:fs';
import path from 'node:path';
import { readConfig, loadHost, header, tleOf, secOfIso, closestApproach, sgp4Source } from './lib/module.mjs';

const argv = process.argv.slice(2);
const config = readConfig(argv);
const [si, sn] = (argv.includes('--shard') ? argv[argv.indexOf('--shard') + 1] : '0/1').split('/').map(Number);
const events = JSON.parse(fs.readFileSync(path.join(config.storeDir, 'events.json'), 'utf8'));
const index = JSON.parse(fs.readFileSync(path.join(config.storeDir, 'sets_index.json'), 'utf8'));
for (const L of Object.values(index)) for (const s of L) { s.crS = secOfIso(s.cr); s.epS = secOfIso(s.ep); }

/** The set with the greatest creation time not after c; sets equal in creation time go to the later epoch. */
function causalSet(norad, c) {
  const L = index[String(norad)];
  if (!L) return { set: null };
  let lo = 0, hi = L.length - 1, ans = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (L[m].crS <= c) { ans = m; lo = m + 1; } else hi = m - 1; }
  if (ans < 0) return { set: null };
  return { set: L[ans], tie: ans > 0 && L[ans - 1].crS === L[ans].crS };
}

const host = await loadHost(config);
fs.mkdirSync(config.storeDir, { recursive: true });
const out = fs.createWriteStream(path.join(config.storeDir, sn > 1 ? `rows-sgp4-${si}of${sn}.jsonl` : 'rows-sgp4.jsonl'));
out.write(JSON.stringify(header(config, 'rows-sgp4')) + '\n');
let k = 0;
for (const e of events) {
  if (e.idx % sn !== si) continue;
  for (const [bin, id] of Object.entries(e.picks)) {
    const m = e.msgs.find((x) => x.id === id);
    const row = { ev: e.idx, bin, id, c: m.c, tcaMsg: m.tca, missMsg: m.miss };
    const a = causalSet(e.primary, m.c), b = causalSet(e.secondary, m.c);
    if (!a.set || !b.set) { row.noset = [!a.set, !b.set]; out.write(JSON.stringify(row) + '\n'); continue; }
    Object.assign(row, { gpA: a.set.gp, gpB: b.set.gp, epA: a.set.epS, epB: b.set.epS, crA: a.set.crS, crB: b.set.crS, setTie: Boolean(a.tie || b.tie) });
    Object.assign(row, await closestApproach(sgp4Source(host, tleOf(a.set, e.primary)), sgp4Source(host, tleOf(b.set, e.secondary)), m.tca));
    out.write(JSON.stringify(row) + '\n');
    k += 1;
  }
}
await new Promise((r) => out.end(r));
console.log(`arm S: ${k} rows flown`);
